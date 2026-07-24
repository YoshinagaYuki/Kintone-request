-- システム設定(key-value) + メールテンプレート(申請完了/承認完了)
--
-- 【目的】
--  ・最小注文数量(minimum_order_quantity)や Google Drive 共有URL(manual_drive_url)を
--    コードへ直書きせず、管理画面から変更できるようにする。
--  ・申請完了/承認完了メールの本文をDB保存し、管理画面「メールテンプレート」で編集可能にする。
--    本文はコードへ直書きしない(差込プレースホルダで動的展開)。
--
-- 【安全性】再実行しても壊れないよう if not exists / on conflict do nothing を用いる。

-- ============================================================
-- 1) システム設定(key-value ストア)
-- ============================================================
create table if not exists public.system_settings (
  key         text primary key,
  value       text not null default '',
  description text not null default '',
  updated_at  timestamptz not null default now()
);

-- updated_at 自動更新(set_updated_at は 0001 で定義済み)
drop trigger if exists system_settings_updated_at on public.system_settings;
create trigger system_settings_updated_at
  before update on public.system_settings
  for each row execute function public.set_updated_at();

alter table public.system_settings enable row level security;

-- 管理者(認証済み)のみ読み書き。公開申請画面はサーバー(service_role)経由で読むため anon 不要
drop policy if exists "authenticated can read system_settings" on public.system_settings;
create policy "authenticated can read system_settings"
  on public.system_settings for select to authenticated using (true);
drop policy if exists "authenticated can upsert system_settings" on public.system_settings;
create policy "authenticated can upsert system_settings"
  on public.system_settings for insert to authenticated with check (true);
drop policy if exists "authenticated can update system_settings" on public.system_settings;
create policy "authenticated can update system_settings"
  on public.system_settings for update to authenticated using (true) with check (true);

-- 初期値(既存があれば変更しない)
insert into public.system_settings (key, value, description) values
  ('minimum_order_quantity', '100', '1商品あたりの最小注文数量(これ未満はエラー)'),
  ('manual_drive_url', '', 'メールへ差し込む Google Drive 共有リンク(マニュアル等)')
on conflict (key) do nothing;

-- ============================================================
-- 2) メールテンプレート(申請完了 / 承認完了)
-- ============================================================
create table if not exists public.email_templates (
  key         text primary key check (key in ('application', 'approval')),
  subject     text not null default '',
  body        text not null default '',
  updated_at  timestamptz not null default now()
);

drop trigger if exists email_templates_updated_at on public.email_templates;
create trigger email_templates_updated_at
  before update on public.email_templates
  for each row execute function public.set_updated_at();

alter table public.email_templates enable row level security;

drop policy if exists "authenticated can read email_templates" on public.email_templates;
create policy "authenticated can read email_templates"
  on public.email_templates for select to authenticated using (true);
drop policy if exists "authenticated can upsert email_templates" on public.email_templates;
create policy "authenticated can upsert email_templates"
  on public.email_templates for insert to authenticated with check (true);
drop policy if exists "authenticated can update email_templates" on public.email_templates;
create policy "authenticated can update email_templates"
  on public.email_templates for update to authenticated using (true) with check (true);

-- 初期テンプレート。差込プレースホルダ:
--   {{applicant_name}} 入力者氏名 / {{management_no}} 管理番号 / {{form_type_name}} 種別
--   {{booth_name}} イベントブース名 / {{agency_name}} 取次店名
--   {{submitted_at}} 申請日時 / {{approved_at}} 承認日時
--   {{order_details}} 注文内容(商品・数量・配送先・配送日・担当者・電話番号・住所を自動展開)
--   {{manual_drive_url}} Google Drive 共有リンク(system_settings)
insert into public.email_templates (key, subject, body) values
(
  'application',
  '【{{form_type_name}}】申請を受け付けました',
  '{{applicant_name}} 様

＝＝＝＝＝＝＝＝＝＝＝＝＝＝
３営業日経っても承認メールが届かない場合は、
担当営業までご連絡ください。
＝＝＝＝＝＝＝＝＝＝＝＝＝＝

この度はご申請いただきありがとうございます。以下の内容で申請を受け付けました。

管理番号: {{management_no}}
申請日時: {{submitted_at}}

──────────────
■ 申請内容一覧
──────────────
{{order_details}}

現在は「確認待ち」の状態です。社内で内容を確認のうえ、あらためてご連絡いたします。

※このメールは自動送信です。ご返信いただいてもお答えできない場合があります。'
),
(
  'approval',
  '【株式会社ユニティ】ご注文承認のお知らせ',
  '{{applicant_name}} 様

ご申請いただいた内容が承認されましたのでお知らせいたします。

管理番号: {{management_no}}
承認日時: {{approved_at}}

──────────────
■ ご注文内容
──────────────
{{order_details}}

──────────────
■ ご案内
──────────────
各種マニュアル・資料は以下の共有リンクよりご確認ください。
{{manual_drive_url}}

今後の詳細については、必要に応じて担当者よりご連絡いたします。

※このメールは自動送信です。ご返信いただいてもお答えできない場合があります。'
)
on conflict (key) do nothing;
