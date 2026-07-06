-- form_types 完全マスタ化 + バージョン管理 + てずくーる追加
-- (system-design.md §3.1 / §3.1b。0004を未適用の前提で全面改訂)
--
-- ・種別ごとの文言/テンプレート/設定はすべて form_types で管理(SQLのみで変更可)
-- ・fmt_template / parser_config / field_mapping / notify_config の変更で version が自動 +1
-- ・各バージョンの定義は form_type_versions に不変の履歴として自動保存
-- ・申請は requests.form_type_version に申請時点の version を保存し、
--   承認処理は申請時点の定義で実行する(FMT改訂で過去申請が壊れない)

-- ============================================================
-- 1) form_types 拡張
-- ============================================================
alter table public.form_types add column fmt_template     text    not null default '';
alter table public.form_types add column input_guide      text    not null default '';
alter table public.form_types add column notes            text    not null default '';
alter table public.form_types add column complete_message text    not null default '';
alter table public.form_types add column display_order    integer not null default 0;
alter table public.form_types add column version          integer not null default 1;

-- ============================================================
-- 2) requests に申請時点のバージョンを保持
-- ============================================================
alter table public.requests add column form_type_version integer not null default 1;

update public.requests r
set form_type_version = ft.version
from public.form_types ft
where r.form_type_id = ft.id;

-- ============================================================
-- 3) バージョン履歴テーブル
-- ============================================================
create table public.form_type_versions (
  id             uuid primary key default gen_random_uuid(),
  form_type_id   uuid not null references public.form_types(id) on delete cascade,
  version        integer not null,
  fmt_template   text  not null default '',
  parser_config  jsonb not null default '{}'::jsonb,
  field_mapping  jsonb not null default '{}'::jsonb,
  notify_config  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (form_type_id, version)
);

alter table public.form_type_versions enable row level security;

create policy "authenticated can read form_type_versions"
  on public.form_type_versions for select to authenticated using (true);

-- ============================================================
-- 4) 既存データの整備(トリガー作成前に実施)
-- ============================================================

-- オールマイト: 確定済みFMTテンプレート等を設定(version は 1 のまま)
update public.form_types
set
  display_order = 0,
  fmt_template = '機器商品:
イベントブース名:
取次店名:
金額:
配送日付:
配送郵便番号:
配送住所:
当日受領者氏名:
配送連絡先:
集荷日付:
集荷郵便番号:
集荷住所:
当日引渡者氏名:
集荷連絡先:
伝票通知to:
伝票通知cc:
責任者氏名:
責任者電話番号:
配送料: ',
  input_guide = 'テンプレートをコピーし、各項目の「:」の後に値を入力して貼り付けてください。',
  notes = '・日付は 2026/07/18 のような形式で入力してください
・機器商品はkintoneの選択肢と同じ名称で入力してください',
  complete_message = '申請を受け付けました。
内容を確認のうえ、担当者よりご連絡いたします。'
where kintone_app_id = 10;

-- てずくーる(App49): 受付のみ先行公開。
-- field_mapping が空 = kintone登録は未設定(マッピング確定後にUPDATEで有効化 → versionが自動+1)
insert into public.form_types
  (slug, name, kintone_app_id, field_mapping, parser_config,
   fmt_template, input_guide, notes, complete_message, display_order, is_active)
values (
  'tz-CHANGE-ME-q8x3k7v2',  -- ★推測困難な値に変更すること
  'てずくーる',
  49,
  '{"mappings": [], "constants": []}'::jsonb,
  '{"separator": ":", "required_labels": []}'::jsonb,
  '',  -- FMT確定後に設定
  '',
  '',
  '',
  1,
  true
);

-- 全既存レコードの version 1 スナップショットを作成
insert into public.form_type_versions
  (form_type_id, version, fmt_template, parser_config, field_mapping, notify_config)
select id, version, fmt_template, parser_config, field_mapping, notify_config
from public.form_types;

-- ============================================================
-- 5) バージョン自動採番トリガー
--    ・INSERT: version=1 の履歴を自動作成
--    ・UPDATE: fmt_template / parser_config / field_mapping / notify_config の
--      いずれかが変わったら version を +1 し履歴を自動作成
--      (名称・表示順・文言のみの変更では version は上がらない)
-- ============================================================
create or replace function public.form_types_snapshot_on_insert()
returns trigger
language plpgsql
as $$
begin
  insert into public.form_type_versions
    (form_type_id, version, fmt_template, parser_config, field_mapping, notify_config)
  values
    (new.id, new.version, new.fmt_template, new.parser_config, new.field_mapping, new.notify_config);
  return null;
end;
$$;

create or replace function public.form_types_bump_version_on_update()
returns trigger
language plpgsql
as $$
begin
  if (new.fmt_template  is distinct from old.fmt_template)
  or (new.parser_config is distinct from old.parser_config)
  or (new.field_mapping is distinct from old.field_mapping)
  or (new.notify_config is distinct from old.notify_config) then
    new.version := old.version + 1;
    insert into public.form_type_versions
      (form_type_id, version, fmt_template, parser_config, field_mapping, notify_config)
    values
      (new.id, new.version, new.fmt_template, new.parser_config, new.field_mapping, new.notify_config);
  end if;
  return new;
end;
$$;

create trigger form_types_snapshot_insert
  after insert on public.form_types
  for each row execute function public.form_types_snapshot_on_insert();

create trigger form_types_bump_version
  before update on public.form_types
  for each row execute function public.form_types_bump_version_on_update();
