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

-- 注記: 当初この migration では staff_members.name_kana(読み仮名)も追加していたが、
-- 運用負荷が高いため name_kana 機能は廃止した。列・制約の追加は行わない
-- (適用済み環境向けの削除は 0017_drop_staff_name_kana.sql を参照)。
