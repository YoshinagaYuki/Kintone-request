-- 弊社担当者氏名(申請者が入力 → 承認時に担当者マスターの正式名称へ確定)
--
-- ・company_staff_name_input : 申請者が入力した原文(監査・確認用に保持)
-- ・approved_staff_name      : 承認画面で確定した担当者マスターの正式名称(kintone登録値)
-- kintone App49 の「担当者」(文字列__1行__0)には approved_staff_name を登録する。
-- 既存の approved_contents と同様、申請原文と承認確定値を分離する。

alter table public.requests
  add column if not exists company_staff_name_input text;
alter table public.requests
  add column if not exists approved_staff_name text;

-- 担当者マスターに読み仮名を追加(任意)。
-- 「よしなが」のようなひらがな入力を漢字氏名へ自動照合するために使う。
-- 未入力でも動作するが、その場合ひらがな入力は自動選択されず「選択してください」になる。
alter table public.staff_members
  add column if not exists name_kana text not null default '';
