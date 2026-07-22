-- 共通通知サービスの送信ログ(二重通知防止 + 送信結果の保存)
--
-- kintone直接登録 / 申請システム登録 のどちらから通知しても、
-- 同じ kintoneレコードに対する通知は1回だけ送られるよう dedup_key で制御する。
--   dedup_key 例: 'kintone:49:160'(アプリID:レコードID)
-- 送信結果(チャネルごとの成否)を channel_results に保持し、管理画面に表示する。

create table if not exists public.notification_logs (
  id                uuid primary key default gen_random_uuid(),
  dedup_key         text not null unique,
  source            text not null check (source in ('app', 'kintone')),
  kintone_app_id    integer,
  kintone_record_id text,
  management_no     text,
  form_type_name    text,
  message           text not null default '',
  channel_results   jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now()
);

create index notification_logs_created_idx on public.notification_logs (created_at desc);

alter table public.notification_logs enable row level security;

-- 参照は管理者のみ。書き込みはサーバー(service_role)経由
create policy "authenticated can read notification_logs"
  on public.notification_logs for select to authenticated using (true);
