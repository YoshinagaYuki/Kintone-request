-- 担当者マスター
-- ・申請画面のプルダウンに表示(is_active=true を sort_order 順)
-- ・選択値は「担当者:氏名」のFMT行として注入され、kintoneの担当者フィールドへ登録される
-- ・管理画面(/admin/staff)からCRUD

create table public.staff_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,             -- 氏名
  company     text not null default '',  -- 所属会社
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger staff_members_updated_at
  before update on public.staff_members
  for each row execute function public.set_updated_at();

alter table public.staff_members enable row level security;

-- 管理者(認証済み)のみCRUD可。申請画面はサーバー(service_role)経由で取得するためanonポリシー不要
create policy "authenticated can read staff_members"
  on public.staff_members for select to authenticated using (true);
create policy "authenticated can insert staff_members"
  on public.staff_members for insert to authenticated with check (true);
create policy "authenticated can update staff_members"
  on public.staff_members for update to authenticated using (true) with check (true);
create policy "authenticated can delete staff_members"
  on public.staff_members for delete to authenticated using (true);

-- 初期データ
insert into public.staff_members (name, company, sort_order)
values ('吉永 勇樹', '株式会社ユニティ', 0);
