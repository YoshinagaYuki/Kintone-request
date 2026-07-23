-- 担当者マスターの読み仮名(name_kana)を必須運用にする。
--
-- 0012 で name_kana 列(text not null default '')を追加済み。本 migration では:
--   (1) 読みが空の既存データを補完(seed の吉永 勇樹 など)
--   (2) 空文字/空白のみの読みを禁止する CHECK 制約を追加
--
-- 【安全性】0012 は本番適用済みのため変更しない。本 migration は再実行しても
-- 壊れないよう、列の存在確認・既存データの確認・制約の重複回避をすべて含める。
-- ・列が無い環境でも DO ブロック内でスキップ(エラーにしない)
-- ・制約は drop if exists → add で冪等
-- ・制約追加前に残存する空読みを一括補完し、CHECK 追加時の失敗を防ぐ

do $$
begin
  -- name_kana 列が存在する場合のみ処理(0012 未適用環境での事故防止)
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'staff_members'
      and column_name = 'name_kana'
  ) then

    -- (1) 既存 seed(0006 投入)の読みを補完
    update public.staff_members
       set name_kana = 'よしなが ゆうき'
     where name = '吉永 勇樹'
       and coalesce(btrim(name_kana), '') = '';

    -- (1') 上記以外に読みが空の行が残っている場合は、CHECK 制約で失敗しないよう
    --      暫定的に氏名を読みへコピー(運用側で正しい読みに直す想定)。
    --      ※ ここで暫定補完しておかないと、空読みが1件でもあると制約追加が失敗する。
    update public.staff_members
       set name_kana = name
     where coalesce(btrim(name_kana), '') = ''
       and coalesce(btrim(name), '') <> '';

    -- (2) 空文字/空白のみの読みを禁止する CHECK 制約(冪等)
    alter table public.staff_members
      drop constraint if exists staff_members_name_kana_not_blank;
    alter table public.staff_members
      add constraint staff_members_name_kana_not_blank
      check (btrim(name_kana) <> '');

  end if;
end $$;
