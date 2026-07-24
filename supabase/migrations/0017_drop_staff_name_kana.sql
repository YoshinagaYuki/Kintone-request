-- 担当者マスターの読み仮名(name_kana)機能を廃止する。
--
-- 0012/0013 で追加していた name_kana 列と CHECK 制約を削除する。
-- ・適用済み環境: 既存の列・制約を安全に削除(if exists)。
-- ・新規環境(0012で列を追加しない): 何もしない(if exists により no-op)。
-- 再実行しても壊れない。

-- 空読み禁止の CHECK 制約を削除
alter table public.staff_members
  drop constraint if exists staff_members_name_kana_not_blank;

-- 読み仮名の列を削除
alter table public.staff_members
  drop column if exists name_kana;
