-- 承認/kintone連携「処理中」の申請を削除から保護する。
--
-- 【背景・調査結果】
--   ・status は pending→approved→registered / register_failed。
--     「approved」= 承認後〜kintone登録完了前(連携中)。
--     ただし register_failed からの「再実行(retry)中」は status が register_failed のままで、
--     status だけでは「処理中」を判別できない。
--   ・そこで最小限の処理状態として requests.processing_at(連携開始で now、完了/失敗で NULL)と
--     processing_token(処理の所有者トークン)を追加。approve / retry が外部処理の前後で
--     設定・解除する。解除は自処理のトークン一致時のみ(他処理のロックを誤解除しない)。
--
-- 【削除可否】次のいずれかなら削除不可(処理中):
--     status = 'approved'(承認〜登録完了前)
--     processing_at が非 NULL(登録/採番/配送連携・再実行が進行中、または異常終了で未解除)
--   → 経過時間では自動的に削除可能にしない。processing_at が古い場合は「処理状態の確認が必要」
--     として扱い、管理者が手動で解除(clear_processing)してから削除・再実行する(自動解除はしない)。
--   それ以外(pending / registered / register_failed[idle] / rejected)は削除可。
--
-- 【安全性】NULL 許容列追加のみ。既存データ・受付・承認に影響しない。本番は手動適用。

begin;

alter table public.requests
  add column if not exists processing_at timestamptz;
alter table public.requests
  add column if not exists processing_token uuid;

-- request_histories.action に 'processing_cleared'(処理状態の手動解除)を追加
do $$
declare
  v_def        text;
  v_existing   text[];
  v_confirmed  text[] := array[
    'submitted','approved','rejected','kintone_registered','kintone_failed',
    'numbered','shipping_synced','notified','notify_failed','email_sent','email_failed',
    'arrangement_changed','arrangement_synced','arrangement_sync_failed','edited','deleted','restored'
  ];
  v_universe   text[] := array[
    'submitted','approved','rejected','kintone_registered','kintone_failed',
    'numbered','shipping_synced','notified','notify_failed','email_sent','email_failed',
    'arrangement_changed','arrangement_synced','arrangement_sync_failed','edited','deleted','restored',
    'processing_cleared'
  ];
  v_shape_any  text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*=\s*ANY\s*\(\s*ARRAY\[\s*''[^'']*''(::text)?(\s*,\s*''[^'']*''(::text)?)*\s*\]\s*\)\s*\)+\s*$';
  v_shape_in   text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*IN\s*\(\s*''[^'']*''(\s*,\s*''[^'']*'')*\s*\)\s*\)+\s*$';
  v_unexpected text[];
  v_final      text[];
  v_list       text;
begin
  select pg_get_constraintdef(oid) into v_def
  from pg_constraint
  where conrelid = 'public.request_histories'::regclass and contype = 'c'
    and conname = 'request_histories_action_check';
  if v_def is null then
    raise exception 'request_histories_action_check が見つかりません。中止します。';
  end if;
  if not (v_def ~ v_shape_any or v_def ~ v_shape_in) then
    raise exception 'request_histories_action_check が想定形式ではありません。現定義: %。中止します。', v_def;
  end if;
  v_existing := array(select m[1] from regexp_matches(v_def, '''([^'']+)''', 'g') as m);
  if not (v_confirmed <@ v_existing) then
    raise exception 'request_histories_action_check が確認済み許可値を満たしません(先行migrationを適用してください)。現定義: %', v_def;
  end if;
  select array_agg(e) into v_unexpected from unnest(v_existing) as e where e <> all (v_universe);
  if v_unexpected is not null then
    raise exception 'request_histories_action_check に想定外の値 % が含まれます。中止します。', v_unexpected;
  end if;
  select array_agg(distinct v order by v) into v_final from unnest(v_existing || array['processing_cleared']) as v;
  select string_agg(quote_literal(v), ', ') into v_list from unnest(v_final) as v;
  alter table public.request_histories drop constraint request_histories_action_check;
  execute format('alter table public.request_histories add constraint request_histories_action_check check (action in (%s))', v_list);
end $$;

-- 単一の論理削除 RPC(処理中ガードを追加して再定義)
create or replace function public.soft_delete_request(
  p_id        uuid,
  p_actor     text,
  p_deleted_by uuid,
  p_editor    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted    timestamptz;
  v_status     text;
  v_processing timestamptz;
begin
  select deleted_at, status, processing_at
    into v_deleted, v_status, v_processing
  from public.requests where id = p_id for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_deleted is not null then
    return jsonb_build_object('ok', true, 'code', 'already_deleted');
  end if;
  -- 処理中(承認〜登録完了前 / 外部連携進行中・未解除)は経過時間に関わらず削除不可
  if v_status = 'approved' or v_processing is not null then
    return jsonb_build_object('ok', false, 'code', 'processing');
  end if;

  update public.requests
     set deleted_at = now(), deleted_by = p_deleted_by
   where id = p_id;

  insert into public.request_histories (request_id, action, actor, detail)
  values (p_id, 'deleted', p_actor, jsonb_build_object('editor', p_editor, 'deleted_at', now()));

  return jsonb_build_object('ok', true, 'code', 'deleted');
end
$$;

-- 一括論理削除 RPC(全件 or 全件拒否 + 処理中ガード)
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

  for r in
    select id, form_type_id, deleted_at, status, processing_at
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
    if r.status = 'approved' or r.processing_at is not null then
      raise exception 'processing:%', r.id;
    end if;
    v_count := v_count + 1;
  end loop;

  if v_count <> array_length(p_ids, 1) then
    raise exception 'not_found_some';
  end if;

  update public.requests
     set deleted_at = now(), deleted_by = p_deleted_by
   where id = any(p_ids);

  insert into public.request_histories (request_id, action, actor, detail)
  select unnest(p_ids), 'deleted', p_actor,
         jsonb_build_object('editor', p_editor, 'deleted_at', now(), 'bulk', true);

  return jsonb_build_object('ok', true, 'deleted', v_count);
end
$$;

-- 権限は service_role のみ(再定義後も明示)
revoke all on function public.soft_delete_request(uuid, text, uuid, text) from public;
revoke all on function public.soft_delete_request(uuid, text, uuid, text) from anon;
revoke all on function public.soft_delete_request(uuid, text, uuid, text) from authenticated;
grant execute on function public.soft_delete_request(uuid, text, uuid, text) to service_role;

revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from public;
revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from anon;
revoke all on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) from authenticated;
grant execute on function public.soft_delete_requests_bulk(uuid[], uuid[], text, uuid, text) to service_role;

-- 処理状態の手動解除(異常終了時のリカバリ)。自動解除はしない。管理者が明示的に実行する。
-- 解除内容(解除前の processing_at)を履歴に残す。
create or replace function public.clear_processing(
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
  v_proc timestamptz;
begin
  select processing_at into v_proc from public.requests where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_proc is null then
    return jsonb_build_object('ok', true, 'code', 'not_processing');
  end if;

  update public.requests
     set processing_at = null, processing_token = null
   where id = p_id;

  insert into public.request_histories (request_id, action, actor, detail)
  values (p_id, 'processing_cleared', p_actor,
          jsonb_build_object('editor', p_editor, 'cleared_at', now(), 'was_processing_at', v_proc));

  return jsonb_build_object('ok', true, 'code', 'cleared');
end
$$;

revoke all on function public.clear_processing(uuid, text, text) from public;
revoke all on function public.clear_processing(uuid, text, text) from anon;
revoke all on function public.clear_processing(uuid, text, text) from authenticated;
grant execute on function public.clear_processing(uuid, text, text) to service_role;

commit;
