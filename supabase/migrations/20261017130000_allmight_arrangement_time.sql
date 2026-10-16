-- オールマイト手配種別:チャーター便の時刻(配送/集荷)を保存する列を追加する。
--
-- ・allmight_delivery_time: 配送(納品)のチャーター時刻。kintone「納品_時間」(TIME)へ登録。
-- ・allmight_pickup_time:   集荷のチャーター時刻。  kintone「集荷_時刻」(TIME)へ登録。
--   形式は "HH:MM"(24時間)。通常配送(normal)のときは null(=時刻なし)。
--   申請者は入力せず、管理者(オールマイト担当)が申請詳細で設定する。
--
-- 【安全性】
--   ・NULL 許容の列追加のみ。既存行・てずくーる申請・請求アプリに影響しない。
--   ・値形式はアプリ側(API/フォーム)で "HH:MM" を検証する。DB CHECK は付けない
--     (既存データ・将来の表記ゆれで適用が失敗しないよう最小限にとどめる)。
--   ・再実行しても壊れないよう add column if not exists を用いる。
--   ・本ファイルは作成のみ。本番適用は内容確認後、SQL Editor で手動実行(supabase db push はしない)。

begin;

alter table public.requests
  add column if not exists allmight_delivery_time text;
alter table public.requests
  add column if not exists allmight_pickup_time text;

commit;
