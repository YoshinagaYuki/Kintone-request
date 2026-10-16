-- マスター管理者を指定2名(吉永・古木)に固定するための role 正規化。
--
-- 背景: 0018 で既存 auth.users を全員 master として取り込んでいたため、
--       指定2名以外にも master が存在し得る。本migrationで以下に正規化する。
--   ・y-yoshinaga@unity-corp.jp / m-furuki@unity-corp.jp → master
--   ・それ以外の管理者 → admin(一般管理者)
--
-- 【安全性】
--   ・admin_users の role 列のみ更新(行の削除・auth.users・申請/承認/監査/請求アプリは触らない)。
--   ・メールは小文字比較。再実行しても結果が変わらない冪等UPDATE。
--   ・既存migrationは変更せず、衝突しないタイムスタンプ版で追加。SQL Editorで手動適用し、
--     本番適用は確認後に行う(このファイルは作成のみ。supabase db push はしない)。

-- 指定2名を master に
update public.admin_users
   set role = 'master'
 where lower(email) in ('y-yoshinaga@unity-corp.jp', 'm-furuki@unity-corp.jp')
   and role <> 'master';

-- それ以外を admin に(指定2名以外に master が残らないようにする)
update public.admin_users
   set role = 'admin'
 where lower(email) not in ('y-yoshinaga@unity-corp.jp', 'm-furuki@unity-corp.jp')
   and role <> 'admin';
