-- 【廃止】この migration は当初 staff_members.name_kana(読み仮名)を必須化し、
-- 空読みの補完と CHECK 制約(staff_members_name_kana_not_blank)を追加していた。
--
-- 運用負荷が高いため name_kana 機能そのものを廃止した。
-- ・新規環境: 0012 で name_kana を追加しないため、本 migration は何もしない(no-op)。
-- ・適用済み環境: 追加済みの列・制約は 0017_drop_staff_name_kana.sql で削除する。
--
-- 履歴の連番を保つため空の migration として残置する。

do $$
begin
  -- no-op(name_kana 機能は廃止)
  null;
end $$;
