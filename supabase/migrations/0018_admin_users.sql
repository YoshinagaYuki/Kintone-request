-- 管理者ユーザー管理(招待・権限・状態)+ 監査ログ
--
-- 【背景】これまで認証は Supabase Auth のみで、ログインできれば全員が管理者だった。
-- 本 migration で auth.users と紐づく管理者テーブルを追加し、権限(role)・状態(status)を管理する。
--
-- 【既存ユーザーの移行】現在ログインできている auth.users は master / active として取り込む
-- (削除・再作成はしない。既存ログインはそのまま維持)。
--
-- 【安全性】再実行しても壊れないよう if not exists / on conflict を用いる。

-- ============================================================
-- 1) 管理者ユーザー
-- ============================================================
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid not null unique references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text not null default '',
  -- 権限。将来拡張可能(初期は admin / master)。master は最上位(最後の1人は停止・削除不可)
  role          text not null default 'admin' check (role in ('admin', 'master')),
  -- 状態: invited(招待中) / active(利用中) / disabled(停止中)
  status        text not null default 'invited' check (status in ('invited', 'active', 'disabled')),
  invited_at    timestamptz,
  activated_at  timestamptz,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists admin_users_email_lower_idx
  on public.admin_users (lower(email));

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;

-- 認証済みは閲覧可(一覧表示・権限判定に使用)。作成/更新/削除はサーバー(service_role)経由のみ。
drop policy if exists "authenticated can read admin_users" on public.admin_users;
create policy "authenticated can read admin_users"
  on public.admin_users for select to authenticated using (true);

-- ============================================================
-- 2) 監査ログ(招待・再送・停止・再開・パスワード再設定送信など)
-- ============================================================
create table if not exists public.admin_user_audit_logs (
  id             uuid primary key default gen_random_uuid(),
  actor_user_id  uuid,   -- 実行者(auth.users.id)
  target_user_id uuid,   -- 対象(auth.users.id)
  action         text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists admin_user_audit_logs_created_idx
  on public.admin_user_audit_logs (created_at desc);

alter table public.admin_user_audit_logs enable row level security;

drop policy if exists "authenticated can read admin_user_audit_logs" on public.admin_user_audit_logs;
create policy "authenticated can read admin_user_audit_logs"
  on public.admin_user_audit_logs for select to authenticated using (true);

-- ============================================================
-- 3) 既存 auth.users を master / active として取り込む(冪等)
-- ============================================================
insert into public.admin_users (auth_user_id, email, display_name, role, status, activated_at)
select u.id,
       coalesce(u.email, ''),
       coalesce(u.raw_user_meta_data->>'name', ''),
       'master',
       'active',
       now()
from auth.users u
on conflict (auth_user_id) do nothing;
