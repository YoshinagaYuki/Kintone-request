begin;
-- Imported source is immutable to clients. Only reviewed server-side imports may write.
create table public.inventory_sheet_entries (
 source_key text primary key check(length(source_key)=64),
 source_tab text not null,
 source_cell text not null,
 source_raw text not null,
 source_lane text not null,
 item_id uuid not null references public.item_name_master(id),
 staff_name text not null,
 store_name text not null,
 management_no text not null default '',
 start_date date not null,
 end_date date not null check(end_date>=start_date),
 request_id uuid references public.requests(id) on delete restrict,
 state text not null check(state in ('linked','skipped','hold','blocked','review')),
 imported_at timestamptz not null default now(),
 check((state='linked')=(request_id is not null))
);
create index inventory_sheet_entries_period on public.inventory_sheet_entries(start_date,end_date);
alter table public.inventory_sheet_entries enable row level security;
revoke all on public.inventory_sheet_entries from anon,authenticated;
grant select on public.inventory_sheet_entries to authenticated;
create policy inventory_sheet_entries_read on public.inventory_sheet_entries for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger inventory_sheet_entries_audit after insert or update on public.inventory_sheet_entries for each row execute function public.inventory_audit_write();
commit;
