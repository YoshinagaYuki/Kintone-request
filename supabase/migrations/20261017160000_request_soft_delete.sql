-- 申請のゴミ箱・復元(論理削除)。物理削除を廃止し、deleted_at による論理削除に切り替える。
--
-- 【内容】
--   ・requests に deleted_at / deleted_by を追加(NULL=有効、非NULL=削除済み)。
--   ・request_histories.action に 'deleted' / 'restored' を追加(既存の安全方式)。
--   ・soft_delete_request / restore_request RPC(削除・復元 + 履歴を同一トランザクションで原子的に実行)。
--
-- 【安全性】
--   ・列は NULL 許容の追加のみ。既存データ・既存クエリに影響しない(既存行は deleted_at=NULL=有効)。
--   ・復元は deleted_at を NULL に戻すだけ。kintone_record_id / management_no は保持し、
--     kintone 再登録・配送再連携・メール再送は一切行わない(それらの処理をRPCで呼ばない)。
--   ・権限・担当事業チェックは API 側で実施。RPC は原子性と重複防止(既削除/未削除の判定)を担う。
--   ・RPC は SECURITY DEFINER + search_path 固定、実行権限は service_role のみ。
--   ・本ファイルは作成のみ。本番適用は内容確認後、SQL Editor で手動実行(supabase db push はしない)。

begin;

-- 1) 論理削除カラム
alter table public.requests
  add column if not exists deleted_at timestamptz;
alter table public.requests
  add column if not exists deleted_by uuid references auth.users(id);

-- 有効申請の一覧表示を高速化(削除済みを除外する部分インデックス)
create index if not exists requests_active_created_idx
  on public.requests (created_at desc)
  where deleted_at is null;

-- 2) request_histories.action に 'deleted' / 'restored' を追加(名前指定・形式検証・既存値保持)
do $$
declare
  v_def        text;
  v_existing   text[];
  v_confirmed  text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed',
    'edited'
  ];
  v_universe   text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed',
    'edited', 'deleted', 'restored'
  ];
  v_additions  text[] := array['deleted', 'restored'];
  v_shape_any  text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*=\s*ANY\s*\(\s*ARRAY\[\s*''[^'']*''(::text)?(\s*,\s*''[^'']*''(::text)?)*\s*\]\s*\)\s*\)+\s*$';
  v_shape_in   text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*IN\s*\(\s*''[^'']*''(\s*,\s*''[^'']*'')*\s*\)\s*\)+\s*$';
  v_unexpected text[];
  v_final      text[];
  v_list       text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.request_histories'::regclass
    and contype = 'c'
    and conname = 'request_histories_action_check';

  if v_def is null then
    raise exception 'request_histories_action_check が見つかりません。想定外のため中止します。';
  end if;
  if not (v_def ~ v_shape_any or v_def ~ v_shape_in) then
    raise exception 'request_histories_action_check が想定した単純な許可値リスト形式ではありません。現定義: %。中止します。', v_def;
  end if;

  v_existing := array(select m[1] from regexp_matches(v_def, '''([^'']+)''', 'g') as m);

  if not (v_confirmed <@ v_existing) then
    raise exception 'request_histories_action_check が確認済み許可値を満たしません(先に 140000 を適用してください)。現定義: %。中止します。', v_def;
  end if;

  select array_agg(e) into v_unexpected
  from unnest(v_existing) as e where e <> all (v_universe);
  if v_unexpected is not null then
    raise exception 'request_histories_action_check に想定外の許可値 % が含まれます。中止します。', v_unexpected;
  end if;

  select array_agg(distinct v order by v) into v_final
  from unnest(v_existing || v_additions) as v;
  select string_agg(quote_literal(v), ', ') into v_list
  from unnest(v_final) as v;

  alter table public.request_histories drop constraint request_histories_action_check;
  execute format(
    'alter table public.request_histories add constraint request_histories_action_check check (action in (%s))',
    v_list
  );
end $$;

-- 3) 編集RPCの更新:削除済み(deleted_at)の編集も RPC 内で拒否する。
--    deleted_at 列はこの migration で追加済みのため、ここで CREATE OR REPLACE すれば
--    check_function_bodies(作成時の列検証)も通る(150000 の定義を上書き)。
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
  v_deleted    timestamptz;
  v_updated    timestamptz;
  v_new        timestamptz;
  v_old_parsed jsonb;
  v_old_name   text;
  v_old_phone  text;
  v_old_email  text;
  v_old_staff  text;
  v_old_cust   text;
  v_old_sns    boolean;
  v_old_rental text;
  v_old_plan   uuid;
  v_new_sns    boolean;
  v_new_rental text;
  v_new_plan   uuid;
  v_changes    jsonb;
begin
  select status, kintone_record_id, deleted_at, updated_at, parsed_data,
         applicant_name, applicant_phone, applicant_email, company_staff_name_input,
         customer_requests, sns_promotion_requested, rental_status, requested_rental_plan_id
    into v_status, v_kintone, v_deleted, v_updated, v_old_parsed,
         v_old_name, v_old_phone, v_old_email, v_old_staff,
         v_old_cust, v_old_sns, v_old_rental, v_old_plan
  from public.requests
  where id = p_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- 削除済み(ゴミ箱)は編集不可
  if v_deleted is not null then
    return jsonb_build_object('ok', false, 'code', 'not_editable');
  end if;

  -- 未承認かつ kintone未登録のみ編集可
  if v_status <> 'pending' or v_kintone is not null then
    return jsonb_build_object('ok', false, 'code', 'not_editable');
  end if;

  if p_expected_updated_at is null or v_updated <> p_expected_updated_at then
    return jsonb_build_object('ok', false, 'code', 'conflict', 'current_updated_at', v_updated);
  end if;

  v_new_sns    := case when p_set_sns    then p_sns_promotion_requested  else v_old_sns    end;
  v_new_rental := case when p_set_rental then p_rental_status            else v_old_rental end;
  v_new_plan   := case when p_set_rental then p_requested_rental_plan_id else v_old_plan   end;

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
      select k, v_old_parsed ->> k, p_parsed_data ->> k
      from (
        select jsonb_object_keys(coalesce(v_old_parsed, '{}'::jsonb)) as k
        union
        select jsonb_object_keys(coalesce(p_parsed_data, '{}'::jsonb)) as k
      ) ks
  ) d
  where coalesce(before, '') is distinct from coalesce(after, '');

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
  where id = p_id
  returning updated_at into v_new;

  insert into public.request_histories (request_id, action, actor, detail)
  values (p_id, 'edited', p_actor,
          jsonb_build_object('editor', p_editor, 'edited_at', v_new, 'changes', v_changes));

  return jsonb_build_object('ok', true, 'updated_at', v_new, 'changed', jsonb_array_length(v_changes));
end
$$;

-- 3) 論理削除 RPC(削除 + 履歴を原子的に)
create or replace function public.soft_delete_request(
  p_id        uuid,
  p_actor     text,   -- 履歴 actor(管理者 auth_user_id の文字列)
  p_deleted_by uuid,  -- requests.deleted_by(auth.users.id)
  p_editor    text    -- 履歴 detail に残す編集者 email
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted timestamptz;
begin
  select deleted_at into v_deleted from public.requests where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_deleted is not null then
    -- 既に削除済み(重複操作)。冪等に成功扱い。
    return jsonb_build_object('ok', true, 'code', 'already_deleted');
  end if;

  update public.requests
     set deleted_at = now(), deleted_by = p_deleted_by
   where id = p_id;

  insert into public.request_histories (request_id, action, actor, detail)
  values (p_id, 'deleted', p_actor, jsonb_build_object('editor', p_editor, 'deleted_at', now()));

  return jsonb_build_object('ok', true, 'code', 'deleted');
end
$$;

-- 4) 復元 RPC(復元 + 履歴を原子的に。kintone/メール等には一切触れない)
create or replace function public.restore_request(
  p_id     uuid,
  p_actor  text,
  p_editor text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted timestamptz;
begin
  select deleted_at into v_deleted from public.requests where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_deleted is null then
    -- 既に有効(重複操作)。冪等に成功扱い。
    return jsonb_build_object('ok', true, 'code', 'not_deleted');
  end if;

  -- deleted_at をクリアするのみ。management_no / kintone_record_id / status 等は保持。
  update public.requests
     set deleted_at = null, deleted_by = null
   where id = p_id;

  insert into public.request_histories (request_id, action, actor, detail)
  values (p_id, 'restored', p_actor, jsonb_build_object('editor', p_editor, 'restored_at', now()));

  return jsonb_build_object('ok', true, 'code', 'restored');
end
$$;

-- 5) 一括論理削除(全件 or 全件拒否)。単一トランザクションで検証→削除→履歴を実行。
--    ・対象 id のいずれかが「存在しない / 担当事業外 / 既に削除済み」の場合は例外で全ロールバック
--      (部分成功を起こさない)。
--    ・各行を FOR UPDATE でロックし、承認・編集との競合を直列化する。
create or replace function public.soft_delete_requests_bulk(
  p_ids              uuid[],
  p_allowed_form_ids uuid[],
  p_actor            text,
  p_deleted_by       uuid,
  p_editor           text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count int := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', false, 'code', 'empty');
  end if;

  -- 全件を検証(ロックしながら)。1件でも不適格なら例外で全ロールバック。
  for r in
    select id, form_type_id, deleted_at
    from public.requests
    where id = any(p_ids)
    for update
  loop
    if not (r.form_type_id = any(p_allowed_form_ids)) then
      raise exception 'forbidden_form:%', r.id;
    end if;
    if r.deleted_at is not null then
      raise exception 'already_deleted:%', r.id;
    end if;
    v_count := v_count + 1;
  end loop;

  -- 取得できた件数が要求件数と一致しない = 存在しない id が含まれる → 全拒否
  if v_count <> array_length(p_ids, 1) then
    raise exception 'not_found_some';
  end if;

  -- 全件削除(論理)
  update public.requests
     set deleted_at = now(), deleted_by = p_deleted_by
   where id = any(p_ids);

  -- 全件の履歴(同一トランザクション)
  insert into public.request_histories (request_id, action, actor, detail)
  select unnest(p_ids), 'deleted', p_actor,
         jsonb_build_object('editor', p_editor, 'deleted_at', now(), 'bulk', true);

  return jsonb_build_object('ok', true, 'deleted', v_count);
end
$$;

-- 実行権限は service_role のみ(PUBLIC デフォルト付与を剥奪)
revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from public;
revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from anon;
revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from authenticated;
grant execute on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) to service_role;

revoke all on function public.soft_delete_request(uuid, text, uuid, text) from public;
revoke all on function public.soft_delete_request(uuid, text, uuid, text) from anon;
revoke all on function public.soft_delete_request(uuid, text, uuid, text) from authenticated;
grant execute on function public.soft_delete_request(uuid, text, uuid, text) to service_role;

revoke all on function public.restore_request(uuid, text, text) from public;
revoke all on function public.restore_request(uuid, text, text) from anon;
revoke all on function public.restore_request(uuid, text, text) from authenticated;
grant execute on function public.restore_request(uuid, text, text) to service_role;

commit;
