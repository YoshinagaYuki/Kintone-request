-- 申請の「SNS宣伝の希望」と、承認時の「料金区分(有償/無償)」を保存する列を追加。
--
-- ・sns_promotion_requested : 申請フォームの「SNSでの宣伝について」希望有無(てずくーる対象)
--     true=希望する / false=希望しない / null=未設定(今回追加前の既存申請)
-- ・billing_type            : てずくーる承認時の料金区分
--     'paid'=有償 / 'free'=無償 / null=未設定(オールマイトや今回追加前の既存承認)
--
-- 【互換性】どちらも NULL 許容。既存データは NULL(未設定)としてそのまま扱える(一括更新しない)。
-- 【kintone】SNS宣伝・料金区分に対応する kintone フィールドは現状 App49 に存在しないため、
--   これらは kintone へは送信しない(アプリ内保存・表示・メールのみ)。
-- 【安全性】再実行しても壊れないよう if not exists / check制約は drop→add で冪等。

alter table public.requests
  add column if not exists sns_promotion_requested boolean;

alter table public.requests
  add column if not exists billing_type text;

alter table public.requests
  drop constraint if exists requests_billing_type_check;
alter table public.requests
  add constraint requests_billing_type_check
  check (billing_type is null or billing_type in ('paid', 'free'));
