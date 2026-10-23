-- 承認用ドラフト。自動マイグレーション対象外。適用前に検証DBで実行すること。
-- 既存テーブル・既存レコードの変更なし。全操作を1トランザクションで適用。
begin;
create table public.inventory_stock (
  item_id uuid primary key references public.item_name_master(id) on delete restrict,
  total_count integer not null check (total_count between 0 and 100000),
  reserve_count integer not null check (reserve_count between 0 and total_count),
  updated_at timestamptz not null default now()
);
create table public.inventory_holds (
  id uuid primary key,
  item_id uuid not null references public.item_name_master(id) on delete restrict,
  staff_id uuid not null references public.staff_members(id) on delete restrict,
  store_name text not null check (length(btrim(store_name)) between 1 and 200),
  start_date date not null check (start_date >= date '2000-01-01'),
  end_date date not null check (end_date <= date '2100-12-31' and end_date >= start_date),
  quantity integer not null check (quantity between 1 and 100000),
  note text not null default '' check (length(note) <= 2000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index inventory_holds_period_idx on public.inventory_holds (start_date, end_date) where cancelled_at is null;
create table public.inventory_audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  actor_id uuid,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
-- service_roleでも直接変更を行わず、運用は認証済み管理者経由に統一。
create function public.inventory_validate_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active') then
    raise exception 'active administrator required';
  end if;
  if tg_table_name = 'inventory_holds' and tg_op = 'UPDATE' then
    if old.cancelled_at is not null or new.cancelled_at is null then raise exception 'invalid cancellation'; end if;
    new.cancelled_at = now();
    return new;
  end if;
  if not exists (select 1 from public.item_name_master where id = new.item_id and category = 'allmight' and is_active) then
    raise exception 'active allmight item required';
  end if;
  if tg_table_name = 'inventory_holds' then
    if not exists (select 1 from public.staff_members where id = new.staff_id and is_active) then
      raise exception 'active staff required';
    end if;
    if tg_op = 'INSERT' and new.created_by <> auth.uid() then raise exception 'invalid actor'; end if;
  else
    new.updated_at = now();
  end if;
  return new;
end;
$$;
-- 監査ログは同じトランザクションで記録。クライアントには追加・更新・削除権限を与えない。
create function public.inventory_audit_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inventory_audit_logs(table_name, record_id, actor_id, action, before_data, after_data)
  values (tg_table_name, coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'item_id'), auth.uid(), tg_op,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end, to_jsonb(new));
  return new;
end;
$$;
revoke all on function public.inventory_audit_write() from public;
revoke all on function public.inventory_validate_write() from public;
create trigger inventory_stock_validate before insert or update on public.inventory_stock for each row execute function public.inventory_validate_write();
create trigger inventory_holds_validate before insert or update on public.inventory_holds for each row execute function public.inventory_validate_write();
create trigger inventory_stock_audit after insert or update on public.inventory_stock for each row execute function public.inventory_audit_write();
create trigger inventory_holds_audit after insert or update on public.inventory_holds for each row execute function public.inventory_audit_write();
alter table public.inventory_stock enable row level security;
alter table public.inventory_holds enable row level security;
alter table public.inventory_audit_logs enable row level security;
revoke all on public.inventory_stock, public.inventory_holds, public.inventory_audit_logs from anon, authenticated;
grant select, insert, update on public.inventory_stock to authenticated;
grant select, insert on public.inventory_holds to authenticated;
grant update(cancelled_at) on public.inventory_holds to authenticated;
grant select on public.inventory_audit_logs to authenticated;
create policy inventory_stock_read on public.inventory_stock for select to authenticated using (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_stock_insert on public.inventory_stock for insert to authenticated with check (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_stock_update on public.inventory_stock for update to authenticated using (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active')) with check (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_holds_read on public.inventory_holds for select to authenticated using (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_holds_insert on public.inventory_holds for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_holds_cancel on public.inventory_holds for update to authenticated using (cancelled_at is null and exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active')) with check (cancelled_at is not null and exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
create policy inventory_audit_read on public.inventory_audit_logs for select to authenticated using (exists (select 1 from public.admin_users where auth_user_id = auth.uid() and status = 'active'));
commit;
