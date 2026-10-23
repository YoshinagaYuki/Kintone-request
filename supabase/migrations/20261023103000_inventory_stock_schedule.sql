begin;
set local lock_timeout='5s';
create table public.inventory_stock_schedule(
 item_id uuid not null references public.item_name_master(id) on delete restrict,
 effective_date date not null check(effective_date between date '2000-01-01' and date '2100-12-31'),
 total_count integer not null check(total_count between 0 and 100000),
 reserve_count integer not null check(reserve_count between 0 and total_count),
 updated_at timestamptz not null default now(),
 primary key(item_id,effective_date)
);
alter table public.inventory_stock_schedule enable row level security;
revoke all on public.inventory_stock_schedule from public,anon,authenticated;
grant select,insert,update on public.inventory_stock_schedule to authenticated;
grant all on public.inventory_stock_schedule to service_role;
create policy stock_schedule_read on public.inventory_stock_schedule for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create policy stock_schedule_insert on public.inventory_stock_schedule for insert to authenticated with check(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create policy stock_schedule_update on public.inventory_stock_schedule for update to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active')) with check(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger stock_schedule_validate before insert or update on public.inventory_stock_schedule for each row execute function public.inventory_validate_write();
create trigger stock_schedule_audit after insert or update on public.inventory_stock_schedule for each row execute function public.inventory_audit_write();
commit;
