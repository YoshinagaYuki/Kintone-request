-- 2026-07-xx 仕様変更
--  1) オールマイトを新規申請導線から非表示(is_active=false。データ・設定は保持)
--  2) 申請者(お客様)入力: 氏名/電話/メール
--  3) 申請完了/承認完了メールの二重送信防止用タイムスタンプ
--  4) レンタル状況(すでに借りている/新規)+ レンタルプラン(申請/承認)
--  5) お客様要望欄
--  6) レンタルプランマスタ(管理画面CRUD)
-- すべて既存レコードを壊さないよう NULL許容で追加(必須チェックは新規申請APIで実施)

-- ============================================================
-- 1) オールマイトを機能オフ(削除ではなく is_active=false。再開はtrueに戻すだけ)
-- ============================================================
update public.form_types set is_active = false where name = 'オールマイト';

-- ============================================================
-- 6) レンタルプランマスタ
-- ============================================================
create table if not exists public.rental_plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- プラン名(kintone レンタル機材 の選択肢と一致させる)
  description text not null default '',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger rental_plans_updated_at
  before update on public.rental_plans
  for each row execute function public.set_updated_at();

alter table public.rental_plans enable row level security;

create policy "authenticated can read rental_plans"
  on public.rental_plans for select to authenticated using (true);
create policy "authenticated can insert rental_plans"
  on public.rental_plans for insert to authenticated with check (true);
create policy "authenticated can update rental_plans"
  on public.rental_plans for update to authenticated using (true) with check (true);
create policy "authenticated can delete rental_plans"
  on public.rental_plans for delete to authenticated using (true);

-- 既存の てずくーる レンタルプラン選択肢を初期投入(name は kintone選択肢と一致)
insert into public.rental_plans (name, description, sort_order) values
  ('てずくーる！！_週末',   '週末レンタル', 0),
  ('てずくーる！！_1ヶ月',  '1ヶ月レンタル', 1),
  ('てずくーる！！フェス',  'フェス向け', 2),
  ('シールLAB_週末',       'シールLAB 週末', 3),
  ('シールLAB__長期',      'シールLAB 長期', 4),
  ('送付不要_1ヶ月',        '送付不要(1ヶ月)', 5)
on conflict do nothing;

-- ============================================================
-- 2)-5) requests への追加カラム(すべてNULL許容)
-- ============================================================
alter table public.requests add column if not exists applicant_name  text;
alter table public.requests add column if not exists applicant_phone text;
alter table public.requests add column if not exists applicant_email text;

alter table public.requests add column if not exists rental_status text
  check (rental_status is null or rental_status in ('already_renting','new_rental'));

alter table public.requests add column if not exists requested_rental_plan_id uuid references public.rental_plans(id);
alter table public.requests add column if not exists approved_rental_plan_id  uuid references public.rental_plans(id);

alter table public.requests add column if not exists customer_requests text;

-- メール二重送信防止(送信成功時刻)+ 失敗情報
alter table public.requests add column if not exists application_email_sent_at timestamptz;
alter table public.requests add column if not exists approval_email_sent_at    timestamptz;
alter table public.requests add column if not exists application_email_error   text;
alter table public.requests add column if not exists approval_email_error      text;

-- ============================================================
-- 履歴アクションに email_sent / email_failed を追加
-- ============================================================
alter table public.request_histories drop constraint request_histories_action_check;
alter table public.request_histories add constraint request_histories_action_check
  check (action in (
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed'
  ));
