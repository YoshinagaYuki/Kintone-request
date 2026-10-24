begin;
set local lock_timeout='5s';
create table public.inventory_change_clock(id integer primary key check(id=1),version bigint not null default 0);
insert into public.inventory_change_clock(id) values(1);
create table public.inventory_booking_edits(booking_key text primary key check(length(booking_key)<200),patch jsonb not null default '{}' check(jsonb_typeof(patch)='object'),deleted boolean not null default false,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now());
create table public.inventory_unit_assignments(group_key text not null check(length(group_key)<200),item_id uuid not null references public.item_name_master(id),unit_number integer check(unit_number between 1 and 250),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),primary key(group_key,item_id));
create table public.inventory_hold_batches(id uuid primary key,payload jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
alter table public.inventory_holds add column batch_id uuid references public.inventory_hold_batches(id),add column delivery_date date,add column pickup_date date,add column occupied_from date,add column occupied_to date;
alter table public.inventory_holds add constraint inventory_hold_occupied_range check((occupied_from is null and occupied_to is null) or (occupied_from<=start_date and occupied_to>=end_date and (delivery_date is null or delivery_date between occupied_from and occupied_to) and (pickup_date is null or pickup_date between occupied_from and occupied_to)));
create function public.inventory_touch_clock() returns trigger language plpgsql security definer set search_path='' as $$begin perform pg_advisory_xact_lock(842917,24);update public.inventory_change_clock set version=version+1 where id=1;return new;end;$$;
revoke all on function public.inventory_touch_clock() from public,anon,authenticated;
create trigger inventory_booking_edits_clock after insert or update on public.inventory_booking_edits for each statement execute function public.inventory_touch_clock();
create trigger inventory_unit_assignments_clock after insert or update on public.inventory_unit_assignments for each statement execute function public.inventory_touch_clock();
create trigger inventory_holds_clock after insert or update on public.inventory_holds for each statement execute function public.inventory_touch_clock();
create trigger inventory_stock_clock after insert or update on public.inventory_stock for each statement execute function public.inventory_touch_clock();
create trigger inventory_stock_schedule_clock after insert or update on public.inventory_stock_schedule for each statement execute function public.inventory_touch_clock();
create trigger inventory_requests_clock after insert or update on public.requests for each statement execute function public.inventory_touch_clock();
create trigger inventory_sheet_entries_clock after insert or update on public.inventory_sheet_entries for each statement execute function public.inventory_touch_clock();
create trigger inventory_extensions_clock after insert or update on public.inventory_extensions for each statement execute function public.inventory_touch_clock();
alter table public.inventory_change_clock enable row level security;alter table public.inventory_booking_edits enable row level security;alter table public.inventory_unit_assignments enable row level security;alter table public.inventory_hold_batches enable row level security;
revoke all on public.inventory_change_clock,public.inventory_booking_edits,public.inventory_unit_assignments,public.inventory_hold_batches from anon,authenticated;
grant select on public.inventory_change_clock,public.inventory_booking_edits,public.inventory_unit_assignments to authenticated;
create policy inventory_clock_read on public.inventory_change_clock for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create policy inventory_edits_read on public.inventory_booking_edits for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create policy inventory_assignments_read on public.inventory_unit_assignments for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
-- Input schedules come from the trusted server's complete versioned model, never the browser.
create function public.inventory_assert_conflicts(p_candidate jsonb,p_existing jsonb) returns void language plpgsql set search_path='' as $$begin
 if jsonb_typeof(p_candidate)<>'array' or jsonb_typeof(p_existing)<>'array' then raise exception 'invalid schedule';end if;
 if exists(select 1 from jsonb_to_recordset(p_candidate) as a(item_id uuid,unit_number int,group_key text,occupied_from date,occupied_to date) cross join jsonb_to_recordset(p_existing||p_candidate) as b(item_id uuid,unit_number int,group_key text,occupied_from date,occupied_to date) where a.item_id=b.item_id and a.unit_number=b.unit_number and a.group_key<>b.group_key and a.occupied_from<=b.occupied_to and a.occupied_to>=b.occupied_from)then raise exception 'inventory_conflict';end if;
end;$$;
revoke all on function public.inventory_assert_conflicts(jsonb,jsonb) from public,anon,authenticated;
create function public.save_inventory_operation(p_actor uuid,p_expected bigint,p_action text,p_key text,p_group text,p_item_id uuid,p_unit_number integer,p_patch jsonb,p_candidate jsonb,p_existing jsonb) returns void language plpgsql security definer set search_path='' as $$declare before_edit jsonb;after_edit jsonb;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if p_action not in('assign','edit','delete','restore')or p_key is null or p_group is null or length(p_key)>199 or length(p_group)>199 then raise exception 'invalid operation';end if;
 if not exists(select 1 from public.item_name_master where id=p_item_id and category='allmight' and is_active)then raise exception 'invalid item';end if;
 if p_unit_number is not null and (p_unit_number<1 or p_unit_number>250)then raise exception 'invalid unit';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 select to_jsonb(e) into before_edit from public.inventory_booking_edits e where booking_key=p_key;
 if p_action in('edit','delete','restore')then
  insert into public.inventory_booking_edits(booking_key,patch,deleted,updated_by)values(p_key,case when p_action='edit' then p_patch else '{}'::jsonb end,p_action='delete',p_actor)
  on conflict(booking_key)do update set patch=public.inventory_booking_edits.patch||excluded.patch,deleted=excluded.deleted,updated_by=p_actor,updated_at=now();
 end if;
 if p_action in('assign','edit')then
  select to_jsonb(a) into before_edit from public.inventory_unit_assignments a where group_key=p_group and item_id=p_item_id;
  insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(p_group,p_item_id,p_unit_number,p_actor)on conflict(group_key,item_id)do update set unit_number=p_unit_number,updated_by=p_actor,updated_at=now();
 end if;
 select jsonb_build_object('edit',(select to_jsonb(e)from public.inventory_booking_edits e where booking_key=p_key),'assignment',(select to_jsonb(a)from public.inventory_unit_assignments a where group_key=p_group and item_id=p_item_id)) into after_edit;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_manual_operations',p_key,p_actor,p_action,before_edit,after_edit);
end;$$;
revoke all on function public.save_inventory_operation(uuid,bigint,text,text,text,uuid,integer,jsonb,jsonb,jsonb) from public,anon,authenticated;grant execute on function public.save_inventory_operation(uuid,bigint,text,text,text,uuid,integer,jsonb,jsonb,jsonb)to service_role;
create function public.create_inventory_hold_batch(p_actor uuid,p_batch uuid,p_expected bigint,p_records jsonb,p_candidate jsonb,p_existing jsonb)returns void language plpgsql security definer set search_path='' as $$declare prior public.inventory_hold_batches;rec record;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 select * into prior from public.inventory_hold_batches where id=p_batch;
 if found then if prior.created_by=p_actor and prior.payload=p_records then return;else raise exception 'batch_mismatch';end if;end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)<1 or jsonb_array_length(p_records)>100 then raise exception 'invalid batch';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 insert into public.inventory_hold_batches(id,payload,created_by)values(p_batch,p_records,p_actor);
 for rec in select * from jsonb_to_recordset(p_records)as x(id uuid,item_id uuid,staff_id uuid,store_name text,start_date date,end_date date,delivery_date date,pickup_date date,occupied_from date,occupied_to date,quantity int,note text,unit_number int)loop
  insert into public.inventory_holds(id,batch_id,item_id,staff_id,store_name,start_date,end_date,delivery_date,pickup_date,occupied_from,occupied_to,quantity,note,created_by)values(rec.id,p_batch,rec.item_id,rec.staff_id,rec.store_name,rec.start_date,rec.end_date,rec.delivery_date,rec.pickup_date,rec.occupied_from,rec.occupied_to,1,rec.note,p_actor);
  if rec.unit_number is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values('hold:'||rec.id::text||':0',rec.item_id,rec.unit_number,p_actor);end if;
 end loop;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_hold_batches',p_batch::text,p_actor,'create',p_records);
end;$$;
revoke all on function public.create_inventory_hold_batch(uuid,uuid,bigint,jsonb,jsonb,jsonb)from public,anon,authenticated;grant execute on function public.create_inventory_hold_batch(uuid,uuid,bigint,jsonb,jsonb,jsonb)to service_role;
commit;
