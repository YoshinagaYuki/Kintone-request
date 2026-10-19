-- 倉庫(DSP様)への引き継ぎ事項を申請ごとに保存できるようにする。
--
-- ・requests に dsp_handover_note(text, NULL 許容)を追加する。
--   管理者が承認画面で入力する任意項目。null/空=未入力。改行をそのまま保持する。
--   承認時にサーバーへ送られ、kintone 登録「前」にこの列へ保存される。
--   そのため kintone 登録が失敗しても入力内容は失われず、再実行時に再利用できる。
-- ・承認時に kintone の「補足欄」(App49/App10 共通のフィールドコード)へ登録する。
--   入力が空のときは「補足欄」を送らず、既存値を意図せず上書きしない。
--
-- 【安全性】
--   ・ファイル全体を BEGIN; ... COMMIT; で囲む。途中でエラーが起きれば全てロールバックされる。
--   ・NULL 許容の列追加のみ(if not exists)。既存データ・既存申請・請求アプリに影響しない。
--   ・CHECK 制約や既存列には一切触れない。てずくーる/オールマイト双方で同一の列を使う。
--   ・再実行しても壊れない(add column if not exists)。
--   ・本ファイルは作成のみ。本番適用は確認後、SQL Editor で手動実行(supabase db push はしない)。

begin;

alter table public.requests
  add column if not exists dsp_handover_note text;

comment on column public.requests.dsp_handover_note is
  'DSP様共有事項(倉庫への引き継ぎ)。管理者が承認時に入力する任意テキスト。改行保持。承認時に kintone「補足欄」へ登録(空は送らない)。';

commit;
