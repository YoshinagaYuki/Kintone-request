-- 申請内容の管理者編集を「申請更新 + 編集履歴挿入」を1トランザクションで原子的に行う RPC。
--
-- 【目的】
--   ① 履歴保存の保証: UPDATE と request_histories の INSERT を同一関数(=同一トランザクション)で実行。
--      どちらかが失敗すれば両方ロールバック(申請だけ更新された状態を残さない)。
--   ② 同時編集の競合防止: 編集開始時に読み込んだ updated_at を渡し、現在値と一致しなければ
--      conflict を返す(後勝ちの無警告上書きを防ぐ)。行は FOR UPDATE でロックする。
--   ③ 履歴の信頼性: 変更前(before)は API から渡された値を信用せず、RPC 内でロックした
--      更新前の実データ(requests 現在値)から差分を生成する。
--
-- 【安全性】
--   ・requests は status='pending' かつ kintone_record_id IS NULL のときのみ更新(承認済みは不可)。
--     承認処理(status を変更)とは FOR UPDATE で直列化され、承認後は not_editable で拒否する。
--   ・編集可能カラムのみ更新。管理番号・kintoneレコードID・承認情報・作成日時等は触れない。
--   ・sns / rental 列は呼び出し側のフラグが true のときだけ更新(事業で使い分け)。
--   ・SECURITY DEFINER + search_path 固定。実行権限は service_role のみ
--     (PUBLIC/anon/authenticated の EXECUTE は明示 REVOKE)。
--   ・本ファイルは作成のみ。本番適用は内容確認後、SQL Editor で手動実行(supabase db push はしない)。
--   ・action='edited' は 20261017140000 で許可済みであること(先に適用)。

begin;

-- updated_at を「必ず直前より新しい値」にする(楽観ロックのトークンが保存ごとに必ず変化する)。
-- 既存の set_updated_at() は new.updated_at = now() で、now() はトランザクション開始時刻のため、
-- 極めて稀に直前値と同一マイクロ秒になり得る。monotonic 化して厳密に増加させる。
-- この関数は requests と form_types の BEFORE UPDATE トリガが共用するが、挙動は
-- 「更新時刻を入れる(常に増加)」のままで、既存機能に影響しない(順序も保たれる)。
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = greatest(now(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace function public.edit_request_atomic(
  p_id                         uuid,
  p_expected_updated_at        timestamptz,
  p_raw_text                   text,
  p_parsed_data                jsonb,
  p_applicant_name             text,
  p_applicant_phone            text,
  p_applicant_email            text,
  p_company_staff_name_input   text,
  p_customer_requests          text,
  p_is_structured              boolean,
  p_set_sns                    boolean,
  p_sns_promotion_requested    boolean,
  p_set_rental                 boolean,
  p_rental_status              text,
  p_requested_rental_plan_id   uuid,
  p_actor                      text,
  p_editor                     text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status     text;
  v_kintone    text;
  v_updated    timestamptz;
  v_new        timestamptz;
  -- 更新前(ロック後に取得する実データ)
  v_old_parsed jsonb;
  v_old_name   text;
  v_old_phone  text;
  v_old_email  text;
  v_old_staff  text;
  v_old_cust   text;
  v_old_sns    boolean;
  v_old_rental text;
  v_old_plan   uuid;
  -- 新値(フラグで列を更新するかを反映)
  v_new_sns    boolean;
  v_new_rental text;
  v_new_plan   uuid;
  v_changes    jsonb;
begin
  -- 対象行をロックし、更新前の実データを取得(同時編集・同時承認との競合を直列化)
  select status, kintone_record_id, updated_at, parsed_data,
         applicant_name, applicant_phone, applicant_email, company_staff_name_input,
         customer_requests, sns_promotion_requested, rental_status, requested_rental_plan_id
    into v_status, v_kintone, v_updated, v_old_parsed,
         v_old_name, v_old_phone, v_old_email, v_old_staff,
         v_old_cust, v_old_sns, v_old_rental, v_old_plan
  from public.requests
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- 未承認かつ kintone未登録のみ編集可(承認後はここで拒否=承認内容を上書きしない)
  -- ※ 削除済み(ゴミ箱)の拒否は編集APIで実施(deleted_at 列は後続migrationで追加のため)
  if v_status <> 'pending' or v_kintone is not null then
    return jsonb_build_object('ok', false, 'code', 'not_editable');
  end if;

  -- 楽観ロック: 編集開始時の updated_at と現在値を「完全精度で」厳密一致比較する
  -- (date_trunc で丸めない)。PostgREST は timestamptz をマイクロ秒精度で返し、文字列を
  -- そのまま timestamptz へキャストすれば同一値は厳密一致する。不一致なら競合。
  if p_expected_updated_at is null or v_updated <> p_expected_updated_at then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'current_updated_at', v_updated);
  end if;

  -- 実際に適用される新値(フラグ false の列は現状維持)
  v_new_sns    := case when p_set_sns    then p_sns_promotion_requested  else v_old_sns    end;
  v_new_rental := case when p_set_rental then p_rental_status            else v_old_rental end;
  v_new_plan   := case when p_set_rental then p_requested_rental_plan_id else v_old_plan   end;

  -- 変更差分を「更新前の実データ(v_old_*) vs 新値」から生成(API提供の before は使わない)
  select coalesce(
           jsonb_agg(
             jsonb_build_object('field', field, 'before', nullif(before, ''), 'after', nullif(after, ''))
             order by field
           ),
           '[]'::jsonb
         )
    into v_changes
  from (
    select '氏名' as field, v_old_name as before, p_applicant_name as after
    union all select '電話番号', v_old_phone, p_applicant_phone
    union all select 'メールアドレス', v_old_email, p_applicant_email
    union all select '弊社担当者(入力)', v_old_staff, p_company_staff_name_input
    union all select 'お客様からの要望', v_old_cust, p_customer_requests
    union all select 'SNS宣伝', v_old_sns::text, v_new_sns::text
    union all select 'レンタル状況', v_old_rental, v_new_rental
    union all select '申請プランID', v_old_plan::text, v_new_plan::text
    union all
      select k,
             v_old_parsed ->> k,
             p_parsed_data ->> k
      from (
        select jsonb_object_keys(coalesce(v_old_parsed, '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(p_parsed_data, '{}'::jsonb)) as k
      ) ks
  ) d
  where coalesce(before, '') is distinct from coalesce(after, '');

  -- 申請内容の更新(編集可能カラムのみ)
  update public.requests set
    raw_text                 = p_raw_text,
    parsed_data              = p_parsed_data,
    applicant_name           = p_applicant_name,
    applicant_phone          = p_applicant_phone,
    applicant_email          = p_applicant_email,
    company_staff_name_input = p_company_staff_name_input,
    customer_requests        = p_customer_requests,
    is_structured            = p_is_structured,
    sns_promotion_requested  = v_new_sns,
    rental_status            = v_new_rental,
    requested_rental_plan_id = v_new_plan
    -- updated_at は set_updated_at() トリガが monotonic に更新する(明示設定しない)
  where id = p_id
  returning updated_at into v_new;

  -- 編集履歴(同一トランザクション。失敗すれば UPDATE ごとロールバック=原子性)
  --   編集者・編集日時・変更項目・変更前・変更後を保存。
  insert into public.request_histories (request_id, action, actor, detail)
  values (
    p_id,
    'edited',
    p_actor,
    jsonb_build_object('editor', p_editor, 'edited_at', v_new, 'changes', v_changes)
  );

  return jsonb_build_object('ok', true, 'updated_at', v_new, 'changed', jsonb_array_length(v_changes));
end
$$;

-- 実行権限は service_role のみ(関数作成時に付与される PUBLIC の EXECUTE を明示的に剥奪)
revoke all on function public.edit_request_atomic(
  uuid, timestamptz, text, jsonb, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text, uuid, text, text
) from public;
revoke all on function public.edit_request_atomic(
  uuid, timestamptz, text, jsonb, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text, uuid, text, text
) from anon;
revoke all on function public.edit_request_atomic(
  uuid, timestamptz, text, jsonb, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text, uuid, text, text
) from authenticated;
grant execute on function public.edit_request_atomic(
  uuid, timestamptz, text, jsonb, text, text, text, text, text,
  boolean, boolean, boolean, boolean, text, uuid, text, text
) to service_role;

commit;
