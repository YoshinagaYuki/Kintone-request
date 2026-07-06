-- 名称正規化マスター(オールマイト機器商品/てずくーるコンテンツ共通)
-- ・申請者の表記ゆれ入力を正式名称へ補正してkintoneへ登録する
-- ・管理画面(/admin/items)からCRUD

create table public.item_name_master (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('allmight', 'tezukuru')),
  name        text not null,                       -- 正式名称(kintone選択肢と完全一致させる)
  aliases     jsonb not null default '[]'::jsonb,  -- 別名/ゆらぎ表記の配列
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (category, name)
);

create index item_name_master_category_idx on public.item_name_master (category, sort_order);

create trigger item_name_master_updated_at
  before update on public.item_name_master
  for each row execute function public.set_updated_at();

alter table public.item_name_master enable row level security;

create policy "authenticated can read item_name_master"
  on public.item_name_master for select to authenticated using (true);
create policy "authenticated can insert item_name_master"
  on public.item_name_master for insert to authenticated with check (true);
create policy "authenticated can update item_name_master"
  on public.item_name_master for update to authenticated using (true) with check (true);
create policy "authenticated can delete item_name_master"
  on public.item_name_master for delete to authenticated using (true);

-- ============================================================
-- 初期データ(正式名称はkintone選択肢と一致。別名は代表的なゆらぎのみ・随時追加)
-- ============================================================

-- オールマイト(機器商品)
insert into public.item_name_master (category, name, aliases, sort_order) values
  ('allmight', 'スティックキャッチ（ペア）', '["スティックキャッチペア", "スティックキャッチ(ペア)"]'::jsonb, 0),
  ('allmight', 'スティックキャッチ（大）', '["スティックキャッチ大", "スティックキャッチ(大)"]'::jsonb, 1),
  ('allmight', 'スティックキャッチ（小）', '["スティックキャッチ小", "スティックキャッチ(小)"]'::jsonb, 2),
  ('allmight', 'イライラスティック', '[]'::jsonb, 3),
  ('allmight', 'イライラスティックver.2', '["イライラスティックver2", "イライラver.2", "イライラver2"]'::jsonb, 4),
  ('allmight', 'クレーンゲーム', '[]'::jsonb, 5),
  ('allmight', 'あひるサンダー', '[]'::jsonb, 6),
  ('allmight', 'あひるサンダーv2', '["あひるサンダーver2", "あひるサンダーV2"]'::jsonb, 7),
  ('allmight', 'JET Cola', '["JETコーラ", "ジェットコーラ", "JETcola"]'::jsonb, 8),
  ('allmight', 'kidsスペース', '["キッズスペース"]'::jsonb, 9),
  ('allmight', 'ぬりえスタジアム', '[]'::jsonb, 10);

-- てずくーる(コンテンツ)
insert into public.item_name_master (category, name, aliases, sort_order) values
  ('tezukuru', 'シール', '[]'::jsonb, 0),
  ('tezukuru', 'ねこちゃん仮面', '[]'::jsonb, 1),
  ('tezukuru', 'くるくる万華鏡', '["万華鏡"]'::jsonb, 2),
  ('tezukuru', 'カラフル絵馬', '[]'::jsonb, 3),
  ('tezukuru', '木製クラフト貯金箱', '["クラフト貯金箱"]'::jsonb, 4),
  ('tezukuru', 'しゃかしゃかキーホルダー', '["しゃかしゃかキーホルダ"]'::jsonb, 5),
  ('tezukuru', 'オリジナル花束', '[]'::jsonb, 6),
  ('tezukuru', '粘土12色', '["ねんど12色"]'::jsonb, 7),
  ('tezukuru', 'スノードーム', '[]'::jsonb, 8),
  ('tezukuru', 'ぬりえトートバッグ', '["ぬりえトート"]'::jsonb, 9),
  ('tezukuru', 'おえかきキャップ', '[]'::jsonb, 10),
  ('tezukuru', 'カラフルスムージー', '[]'::jsonb, 11),
  ('tezukuru', 'ぽんぽんアイスクリーム', '[]'::jsonb, 12),
  ('tezukuru', '光るおえかきボード', '["おえかきボード"]'::jsonb, 13);
