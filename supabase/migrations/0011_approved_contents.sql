-- 承認画面で確定したコンテンツ正式名称の保存先
--
-- ・申請時の原文(parsed_data)は監査のためそのまま保持する
-- ・kintoneへ登録するコンテンツ名は、承認画面で選択された「商品マスタの正式名称」を使用する
-- ・形式: { "コンテンツ1": "しゃかしゃかキーホルダー", "コンテンツ2": "..." }
--   キーはFMTラベルなので、数量(数量1/数量2…)との対応関係は崩れない

alter table public.requests
  add column if not exists approved_contents jsonb;
