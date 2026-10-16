-- 担当者マスター(staff_members)へ「メールアドレス」と「メール通知ON/OFF」を追加。
--
-- 用途:新規申請時、申請の弊社担当者名が staff_members.name と完全一致(1件のみ・公開中)で、
--       email_notify_enabled=true かつ有効なメールアドレスが登録されている場合に、その担当者へ
--       新規申請メールを送る(第4段階)。ファジーマッチはしない。
--
-- 【既存データの扱い】
--   ・email は既定 ''(未登録)。email_notify_enabled は既定 false(=既存担当者は初期OFF)。
--     → 既存担当者に勝手にメールが飛ばない。運用で各担当者にメール登録+ONしたときのみ送信。
--
-- 【migration番号】
--   ・本システムは別アプリ(請求アプリ・CLI連番0001〜)と同一Supabaseを共有するため、
--     衝突しないタイムスタンプ版で命名。SQL Editor での手動適用運用。既存migrationは変更しない。
--
-- 【安全性】
--   ・NULL/既定値での列追加のみ。既存 staff_members 行・公開設定・CRUD・既存申請に影響しない。
--   ・再実行しても壊れないよう add column if not exists を使用。

alter table public.staff_members
  add column if not exists email text not null default '';

alter table public.staff_members
  add column if not exists email_notify_enabled boolean not null default false;
