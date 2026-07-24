-- ① 商品マスターにスロット固有の除外設定を追加(App49 コンテンツ①〜⑩の選択肢差に対応)
-- ② 申請に「構造化フォーム由来か」のフラグを追加(承認画面の再マッチング要否の判定に使う)
--
-- 【背景】App49 のコンテンツ①〜⑩はスロットごとに選択肢が異なる:
--   ・「シール」はコンテンツ①のみ選択可(②〜⑩には無い)
--   ・「粘土12色」はコンテンツ④に無い(①②③⑤〜⑩にはある)
-- そのため画面①〜⑩をそのまま kintone①〜⑩へ登録(位置保持)し、
-- スロットごとに選べない商品はフォームで除外する。固定配列はコードに持たず、DBで管理する。
--
-- 【安全性】再実行しても壊れないよう if not exists / 冪等な update を用いる。

-- ============================================================
-- 1) 商品マスター: 除外スロット(このスロット番号では選択不可)
-- ============================================================
alter table public.item_name_master
  add column if not exists excluded_slots integer[] not null default '{}';

-- シール: コンテンツ①のみ → ②〜⑩を除外
update public.item_name_master
   set excluded_slots = '{2,3,4,5,6,7,8,9,10}'
 where category = 'tezukuru' and name = 'シール';

-- 粘土12色: コンテンツ④に無い → ④を除外
update public.item_name_master
   set excluded_slots = '{4}'
 where category = 'tezukuru' and name = '粘土12色';

-- ============================================================
-- 2) requests: 構造化フォーム由来フラグ
-- ============================================================
-- true の申請は、申請時に商品マスターの正式名称を選択済み(表記ゆれ無し)。
-- 承認画面での商品の再マッチング/再選択は不要(申請時の値をそのまま使う)。
alter table public.requests
  add column if not exists is_structured boolean not null default false;
