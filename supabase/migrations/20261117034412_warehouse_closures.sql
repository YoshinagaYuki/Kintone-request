begin;
create table public.warehouse_closures(
 id uuid primary key,
 start_date date not null check(start_date>='2000-01-01'),
 end_date date not null check(end_date<='2100-12-31'),
 name text not null check(length(btrim(name)) between 1 and 100),
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 cancelled_at timestamptz,
 check(end_date>=start_date and end_date-start_date<=366)
);
alter table public.warehouse_closures enable row level security;
revoke all on public.warehouse_closures from public,anon,authenticated;
grant select on public.warehouse_closures to authenticated;
create policy warehouse_closures_read on public.warehouse_closures for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger warehouse_closures_clock after insert or update on public.warehouse_closures for each statement execute function public.inventory_touch_clock();
create function public.save_warehouse_closure(p_actor uuid,p_id uuid,p_start date,p_end date,p_name text,p_cancel boolean,p_expected bigint) returns void
language plpgsql security definer set search_path='' as $$
declare prior jsonb;
begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if p_id is null or p_cancel is null then raise exception 'invalid closure';end if;
 select to_jsonb(c) into prior from public.warehouse_closures c where id=p_id for update;
 if p_cancel then
  if prior is null then raise exception 'closure not found';end if;
  update public.warehouse_closures set cancelled_at=now(),updated_by=p_actor,updated_at=now() where id=p_id;
 else
  insert into public.warehouse_closures(id,start_date,end_date,name,updated_by) values(p_id,p_start,p_end,btrim(p_name),p_actor)
  on conflict(id)do update set start_date=excluded.start_date,end_date=excluded.end_date,name=excluded.name,updated_by=p_actor,updated_at=now(),cancelled_at=null;
 end if;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('warehouse_closures',p_id::text,p_actor,case when p_cancel then 'CANCEL_WAREHOUSE_CLOSURE' else 'SAVE_WAREHOUSE_CLOSURE' end,prior,jsonb_build_object('start_date',p_start,'end_date',p_end,'name',p_name,'cancelled',p_cancel));
end;$$;
revoke all on function public.save_warehouse_closure(uuid,uuid,date,date,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.save_warehouse_closure(uuid,uuid,date,date,text,boolean,bigint) to service_role;
commit;
