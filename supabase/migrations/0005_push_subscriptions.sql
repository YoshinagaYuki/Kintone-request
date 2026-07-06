-- Web Push(PWA)通知の購読情報
-- ・管理者(ログインユーザー)が通知を許可すると1端末1行で保存
-- ・同一 endpoint の再登録は UPSERT(unique制約)
-- ・送信は service_role(RLSバイパス)で全購読へ、失効(404/410)は自動削除

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- 本人の購読のみ操作可(登録・再登録・解除)
create policy "own subscriptions select"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create policy "own subscriptions insert"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

create policy "own subscriptions update"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own subscriptions delete"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
