-- allmight-request 初期スキーマ
-- 実行順: 0001 → 0002

create extension if not exists "pgcrypto";

-- ============================================================
-- 案件種別マスタ(将来「てずくーる」等をレコード追加で拡張)
-- ============================================================
create table public.form_types (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,          -- 専用URLスラッグ(推測困難な値にすること)
  name            text not null,                 -- 種別名(例: オールマイト)
  kintone_app_id  integer not null,              -- 登録先kintoneあアプリID
  field_mapping   jsonb not null default '{}'::jsonb,  -- FMT項目→kintoneフィールドコード
  parser_config   jsonb not null default '{}'::jsonb,  -- FMTパース定義
  notify_config   jsonb not null default '{}'::jsonb,  -- LINE WORKS通知設定(後回し)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- 申請(Supabaseは受付システムの正式DB)
-- ============================================================
create table public.requests (
  id                 uuid primary key default gen_random_uuid(),  -- 内部ID(Surelyには非表示)
  form_type_id       uuid not null references public.form_types(id),
  raw_text           text not null,                -- FMT原文
  parsed_data        jsonb not null default '{}'::jsonb,
  status             text not null default 'pending'
                     check (status in ('pending','approved','registered','register_failed','rejected')),
  reject_reason      text,
  kintone_record_id  text,
  approved_by        uuid references auth.users(id),
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index requests_status_created_idx on public.requests (status, created_at desc);
create index requests_form_type_idx on public.requests (form_type_id);

-- ============================================================
-- 操作履歴(監査用)
-- ============================================================
create table public.request_histories (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.requests(id) on delete cascade,
  action      text not null
              check (action in ('submitted','approved','rejected','kintone_registered','kintone_failed','notified','notify_failed')),
  actor       text not null,   -- 'surely' または 担当者の user_id
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index request_histories_request_idx on public.request_histories (request_id, created_at);

-- ============================================================
-- updated_at 自動更新
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger form_types_updated_at
  before update on public.form_types
  for each row execute function public.set_updated_at();

create trigger requests_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

-- ============================================================
-- RLS
--   ・anon: 全テーブルアクセス不可(申請INSERTも Route Handler の service_role 経由)
--   ・authenticated(ユニティ担当者): 参照・更新可
--   ・service_role: RLSバイパス(サーバーのみ)
-- ============================================================
alter table public.form_types enable row level security;
alter table public.requests enable row level security;
alter table public.request_histories enable row level security;

create policy "authenticated can read form_types"
  on public.form_types for select to authenticated using (true);

create policy "authenticated can read requests"
  on public.requests for select to authenticated using (true);

create policy "authenticated can update requests"
  on public.requests for update to authenticated using (true) with check (true);

create policy "authenticated can read request_histories"
  on public.request_histories for select to authenticated using (true);

create policy "authenticated can insert request_histories"
  on public.request_histories for insert to authenticated with check (true);
