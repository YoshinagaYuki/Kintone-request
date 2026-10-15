-- 管理者ごとの「担当事業」と「通知設定」を追加。
--
-- ・担当事業は form_types.id との多対多(admin_user_businesses)。
--   事業名や kintone App ID を重複保存しない(form_types を正とする)。
-- ・通知設定は admin_users に push_notify_enabled / email_notify_enabled を追加。
-- ・担当事業と通知設定は独立。
--
-- 【既存管理者の移行(通知漏れ防止)】
--   ・通知設定は既定 true(= 受け取る)。既存管理者は従来どおり通知対象のまま。
--   ・担当事業は「初回適用時のみ」既存管理者すべてに全事業を割り当てる(第4段階の事業別
--     振り分け導入後も、既存管理者が急に通知を受け取れなくならないようにするため)。
--   ・再実行(2回目以降)では担当事業を一切変更しない。管理者が意図的に解除した設定
--     (0件を含む)は維持される。
--
-- 【migration番号について】
--   ・本システム(allmight-request)は同一Supabaseプロジェクトを別アプリ(請求アプリ)と共有する。
--     請求アプリは CLI 連番(0001〜0047…)を schema_migrations に登録済みで番号が衝突するため、
--     本ファイルは衝突しないタイムスタンプ版(20261015090000)へ改番した。
--     本アプリは SQL Editor での手動適用運用(schema_migrations には登録しない)。既存migrationは変更しない。
--
-- 【安全性】
--   ・NULL/既定値で安全な追加のみ。既存 admin_users 行・ログイン・Push購読・請求アプリの
--     テーブル/履歴には一切影響しない。
--   ・再実行しても壊れないよう if not exists / create or replace / 初回判定 を使用。

-- 1) 通知設定(既定 true = 受け取る)
alter table public.admin_users
  add column if not exists push_notify_enabled boolean not null default true;
alter table public.admin_users
  add column if not exists email_notify_enabled boolean not null default true;

-- 2) 担当事業(多対多。form_types.id を参照)+ 3) 初回のみ既存管理者へ全事業を割当
--
-- テーブル作成と「既存管理者への全事業割当(移行)」は、テーブルが存在しない【初回適用時のみ】
-- 実行する。これにより、再実行しても担当事業設定を上書きしない
-- (管理者が解除した設定・0件も維持される)。
do $$
declare
  v_first_apply boolean := to_regclass('public.admin_user_businesses') is null;
begin
  if v_first_apply then
    create table public.admin_user_businesses (
      admin_user_id uuid not null references public.admin_users(id) on delete cascade,
      form_type_id  uuid not null references public.form_types(id) on delete cascade,
      created_at    timestamptz not null default now(),
      primary key (admin_user_id, form_type_id)
    );

    create index admin_user_businesses_form_type_idx
      on public.admin_user_businesses (form_type_id);

    -- 初回のみ:既存管理者へ全事業を割当(通知漏れ防止)。再実行時はこのブロックに入らない。
    insert into public.admin_user_businesses (admin_user_id, form_type_id)
    select a.id, f.id
    from public.admin_users a
    cross join public.form_types f
    on conflict do nothing;
  end if;
end $$;

-- RLS は有効のまま「ポリシーを作らない」= 一般の authenticated/anon からは直接 SELECT 不可。
-- 読み取り・書き込みはすべてサーバーの service_role(RLSバイパス)経由でのみ行う。
-- (担当事業情報が、管理者以外のログインセッションから直接取得されるのを防ぐ)
-- これらは冪等なので毎回実行して問題ない(再実行時も設定を上書きしない)。
alter table public.admin_user_businesses enable row level security;
drop policy if exists "authenticated can read admin_user_businesses" on public.admin_user_businesses;

-- ============================================================
-- 4) 担当事業の置換 + 通知設定(Push/メール)を1トランザクションで原子的に更新する RPC
--    ・担当事業の delete→insert と admin_users の通知フラグ更新を関数内(=単一トランザクション)
--      で実行。途中失敗時は全ロールバックされ、3項目すべてが更新前の状態に戻る。
--    ・p_push / p_email は NULL のとき「変更しない」(coalesce で現在値を維持)。
--    ・不正な form_type_id が含まれる場合は例外(=ロールバック)。
--    ・0件(空配列)は担当事業の全解除として正常に許可。
--    ・対象の admin_users が存在しない場合は例外。
--    ・SECURITY DEFINER + search_path 固定。EXECUTE は service_role のみに制限。
-- ============================================================
create or replace function public.set_admin_business_and_notify(
  p_admin_user_id uuid,
  p_form_type_ids uuid[],
  p_push  boolean,
  p_email boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- 対象管理者の存在確認
  if not exists (select 1 from public.admin_users a where a.id = p_admin_user_id) then
    raise exception 'admin_user not found';
  end if;

  -- 不正な form_type_id(実在しないID)が含まれていれば中断(ロールバック)
  if exists (
    select 1
    from unnest(coalesce(p_form_type_ids, '{}'::uuid[])) as t(id)
    where not exists (select 1 from public.form_types f where f.id = t.id)
  ) then
    raise exception 'invalid form_type_id';
  end if;

  -- 通知フラグ(NULL は現在値を維持)
  update public.admin_users
     set push_notify_enabled  = coalesce(p_push,  push_notify_enabled),
         email_notify_enabled = coalesce(p_email, email_notify_enabled)
   where id = p_admin_user_id;

  -- 担当事業の置き換え(0件は全解除)
  delete from public.admin_user_businesses where admin_user_id = p_admin_user_id;

  insert into public.admin_user_businesses (admin_user_id, form_type_id)
  select p_admin_user_id, t.id
  from unnest(coalesce(p_form_type_ids, '{}'::uuid[])) as t(id)
  on conflict do nothing;
end;
$$;

-- 既定の EXECUTE 権限を剥奪し、service_role のみ実行可能にする
revoke all on function public.set_admin_business_and_notify(uuid, uuid[], boolean, boolean) from public;
revoke all on function public.set_admin_business_and_notify(uuid, uuid[], boolean, boolean) from anon;
revoke all on function public.set_admin_business_and_notify(uuid, uuid[], boolean, boolean) from authenticated;
grant execute on function public.set_admin_business_and_notify(uuid, uuid[], boolean, boolean) to service_role;
