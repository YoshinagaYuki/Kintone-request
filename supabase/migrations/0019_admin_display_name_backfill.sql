-- 管理者ユーザーの display_name が空の場合に、メールアドレスを仮の表示名として補完する。
--
-- 0018 で既存 auth.users を master/active として取り込んだ際、
-- user_metadata に名前が無いユーザーは display_name が空になる。
-- 一覧表示のため空をメールアドレスで補完する(後から管理画面で変更可能)。
--
-- 【安全性】0018 は書き換えない。既存ユーザーの削除・再作成はしない。
-- 空(空白のみ含む)のみを対象にする冪等な UPDATE。

update public.admin_users
   set display_name = email
 where coalesce(btrim(display_name), '') = ''
   and coalesce(btrim(email), '') <> '';
