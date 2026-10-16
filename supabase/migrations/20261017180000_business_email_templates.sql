-- メール/Drive URL の事業別対応。
--
-- 【内容】
--   ・email_templates.key の CHECK を拡張し、オールマイト専用キー
--     'application_allmight' / 'approval_allmight' を許可する。
--   ・オールマイト用の空テンプレ行を追加(未設定時はコード側の汎用フォールバックが使われる。
--     空行は管理画面での編集読み込み用。既存2行 application/approval は一切変更しない)。
--   ・system_settings に manual_drive_url_allmight を追加(既存 manual_drive_url は変更しない)。
--
-- 【安全性(CHECK制約の扱い)】
--   ・変更対象は key の許可値を制限する「email_templates_key_check」ただ1つに限定する。
--     この名前は 0014 の CREATE TABLE で `key text primary key check (key in (...))` と
--     列インライン定義したことにより Postgres が自動採番する既定名(= <table>_<column>_check)。
--   ・文字列の部分一致で他制約を一括削除することはしない。削除は上記の「名前一致」のみ。
--   ・万一、key を制限する別名の CHECK 制約が存在した場合は、推測で削除せず
--     例外を送出して中断する(下記ガード)。その際は末尾の「確認用 読み取り専用SQL」で
--     実際の制約名・定義を確認し、名前を合わせてから再実行すること。
--   ・既存行(application / approval, manual_drive_url 等)の内容・updated_at は変更しない
--     (insert は on conflict do nothing、CHECK 拡張は許可値を増やすのみ)。
--   ・本ファイルは作成のみ。本番適用は内容確認後、SQL Editor で手動実行(supabase db push はしない)。
--   ・適用前に、末尾の「確認用 読み取り専用SQL」で対象制約名が email_templates_key_check で
--     あることを必ず確認すること。

begin;

-- 1) 安全ガード: key を制限する「別名の」CHECK 制約が無いか確認(あれば中断。削除はしない)
do $$
declare
  v_other text;
begin
  select conname into v_other
  from pg_constraint
  where conrelid = 'public.email_templates'::regclass
    and contype = 'c'
    and conname <> 'email_templates_key_check'
    and pg_get_constraintdef(oid) ilike '%key%'
    and pg_get_constraintdef(oid) ilike '%application%';

  if v_other is not null then
    raise exception
      'key を制限する想定外の CHECK 制約 "%" を検出しました。自動削除せず中断します。実際の定義を確認し、対象制約名を合わせて再実行してください。',
      v_other;
  end if;
end $$;

-- 2) 対象の制約(名前一致)だけを付け替える。存在しなければ新規作成のみ。
--    ・drop は「email_templates_key_check」という名前に限定(他制約には触れない)。
--    ・既存行は application / approval のみで、新しい許可集合に含まれるため検証で失敗しない。
alter table public.email_templates
  drop constraint if exists email_templates_key_check;

alter table public.email_templates
  add constraint email_templates_key_check
  check (key in ('application', 'approval', 'application_allmight', 'approval_allmight'));

-- 3) オールマイト用テンプレ行(空。既存があれば変更しない)
insert into public.email_templates (key, subject, body) values
  ('application_allmight', '', ''),
  ('approval_allmight', '', '')
on conflict (key) do nothing;

-- 4) オールマイト用 Google Drive URL(空。既存 manual_drive_url は変更しない)
insert into public.system_settings (key, value, description) values
  ('manual_drive_url_allmight', '', 'オールマイト用: メールへ差し込む Google Drive 共有リンク')
on conflict (key) do nothing;

commit;

-- ============================================================
-- 確認用 読み取り専用SQL(適用前に実行。何も変更しない)
-- ============================================================
-- email_templates の CHECK 制約一覧と定義を確認し、
-- key を制限する制約が「email_templates_key_check」ただ1つであることを確かめる。
-- 別名だった場合は、本ファイルの drop constraint の名前をその名前に合わせてから適用すること。
--
--   select conname, pg_get_constraintdef(oid) as definition
--   from pg_constraint
--   where conrelid = 'public.email_templates'::regclass
--     and contype = 'c'
--   order by conname;
--
-- 既存テンプレ2行が変更されないことの事前確認(件名・本文・updated_at のスナップショット):
--
--   select key, subject, body, updated_at
--   from public.email_templates
--   where key in ('application', 'approval')
--   order by key;
