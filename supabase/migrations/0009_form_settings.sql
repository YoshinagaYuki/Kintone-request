-- 申請フォーム設定(管理画面から編集)
--
-- 表示内容は既存カラムを流用する(重複カラムを作らない最小変更):
--   FMTテンプレート本文 → form_types.fmt_template
--   注意事項           → form_types.notes
--   案内文章           → form_types.input_guide
--   更新日時           → form_types.updated_at(既存トリガーで自動更新)
--   更新者             → form_types.updated_by(本migrationで追加)
-- form_types は種別ごとに1行のため、将来フォームが増えても同じ構造で対応できる。

-- ============================================================
-- 1) 更新者カラム
-- ============================================================
alter table public.form_types
  add column if not exists updated_by uuid references auth.users(id);

-- ============================================================
-- 2) RLS: 管理者(authenticated)のみ編集可(既存方針に合わせる)
--    ※ 参照は 0001 の "authenticated can read form_types" を維持
-- ============================================================
drop policy if exists "authenticated can update form_types" on public.form_types;
create policy "authenticated can update form_types"
  on public.form_types for update to authenticated
  using (true) with check (true);

-- ============================================================
-- 3) 初期値(未登録=空文字の場合のみ投入。既存の設定値は上書きしない)
--    ・fmt_template を更新すると version が自動+1され履歴が残る(0004のトリガー)
-- ============================================================
update public.form_types
set fmt_template = '取次店名:
イベントブース名:
◯月分として請求:
配送料:
《コンテンツは必要箇所のみご入力ください》
コンテンツ1:
　数量1:
コンテンツ2:
　数量2:
コンテンツ3:
　数量3:
コンテンツ4:
　数量4:
コンテンツ5:
　数量5:
コンテンツ6:
　数量6:
コンテンツ7:
　数量7:
コンテンツ8:
　数量8:
コンテンツ9:
　数量9:
コンテンツ10:
　数量10:
《配送》　※「建物名」「店舗名」などまで記載お願いします。
　日付:
　郵便番号:
　住所:
　受領者氏名:
　連絡先:
《集荷》※「建物名」「店舗名」などまで記載お願いします。
　日付:
　郵便番号:
　住所:
　当日引渡者氏名:
　連絡先:
《伝票番号連絡先》　※任意のため必須ではありません
to:
cc:
緊急時責任者氏名:
緊急時責任者電話番号: '
where name = 'てずくーる' and coalesce(trim(fmt_template), '') = '';

update public.form_types
set input_guide = 'レンタルプランは上のプルダウンから選択してください。テンプレートをコピーし、各項目の「:」の後に値を入力して貼り付けてください。使用しないコンテンツ欄は空欄のままで構いません。'
where name = 'てずくーる' and coalesce(trim(input_guide), '') = '';

update public.form_types
set notes = '・シールは「コンテンツ1」に記載してください
・コンテンツはkintoneの選択肢と同じ名称で入力してください
・◯月分として請求は「7月分」の形式で入力してください(自動で「7月分8月請求」に変換されます)
・日付は 2026/07/18 のような形式で入力してください'
where name = 'てずくーる' and coalesce(trim(notes), '') = '';
