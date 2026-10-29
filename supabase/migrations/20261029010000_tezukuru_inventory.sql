begin;
set local lock_timeout='5s';
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.item_name_master'::regclass and contype='c' and pg_get_constraintdef(oid) like '%inventory_role%' loop execute format('alter table public.item_name_master drop constraint %I',c.conname);end loop;end;$$;
alter table public.item_name_master add constraint item_name_master_inventory_role_check check(inventory_role is null or(inventory_role='background_screen' and category='allmight')or(inventory_role='rental_kit' and category='tezukuru'));
-- Existing grants, locks, conflict checks and per-business assignments are retained.
do $$declare f record;body text;begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('inventory_validate_write','save_inventory_operation','create_inventory_hold_batch','save_inventory_bundle','create_inventory_copy','create_inventory_confirmation','link_inventory_sheet_request')loop
  body:=pg_get_functiondef(f.oid);
  body:=replace(body,'kintone_app_id=10','kintone_app_id in(10,49)');
  body:=replace(body,'category=''allmight''','(category=''allmight'' or(category=''tezukuru'' and inventory_role=''rental_kit''))');
  body:=replace(body,'category = ''allmight''','(category = ''allmight'' or(category=''tezukuru'' and inventory_role=''rental_kit''))');
  if f.proname='create_inventory_confirmation' then
   body:=replace(body,'for s in select * from jsonb_to_recordset(p_slots)',
    'if exists(select 1 from public.form_types where id=p_form and kintone_app_id=49) then update public.requests set rental_status=nullif(p_input->>''rental_status'',''''),requested_rental_plan_id=nullif(p_input->>''rental_plan_id'','''')::uuid,billing_type=p_input->>''billing_type'',sns_promotion_requested=(p_input->>''sns_promotion_requested'')::boolean where id=p_id;end if; for s in select * from jsonb_to_recordset(p_slots)');
  end if;
  if f.proname='create_inventory_copy' then
   body:=replace(body,'p_parsed->>''利用開始日''','coalesce(p_parsed->>''_inventory_usage_start'',p_parsed->>''利用開始日'')');
   body:=replace(body,'p_parsed->>''利用最終日''','coalesce(p_parsed->>''_inventory_usage_end'',p_parsed->>''利用最終日'')');
   body:=replace(body,'for s in select * from jsonb_to_recordset(p_slots)',
    'if exists(select 1 from public.form_types where id=p_form and kintone_app_id=49) then update public.requests set rental_status=''already_renting'',requested_rental_plan_id=nullif(p_parsed->>''_inventory_rental_plan_id'','''')::uuid,billing_type=p_parsed->>''_inventory_billing_type'' where id=p_id;end if;for s in select * from jsonb_to_recordset(p_slots)');
  end if;
  execute body;
 end loop;
end;$$;
create table public.inventory_source_snapshots(source_hash text primary key,source_url text not null,captured_at timestamptz not null default now(),actor uuid not null references auth.users(id),summary jsonb not null,source_data jsonb not null);
alter table public.inventory_source_snapshots enable row level security;
revoke all on public.inventory_source_snapshots from public,anon,authenticated;
grant all on public.inventory_source_snapshots to service_role;
-- An atomic, idempotent migration endpoint; service-only and restricted to the7kit IDs supplied.
create function public.import_tezukuru_inventory(p_actor uuid,p_hash text,p_url text,p_items jsonb,p_entries jsonb,p_snapshot jsonb,p_summary jsonb)returns jsonb language plpgsql security definer set search_path='' as $$
declare i jsonb;e jsonb;plan jsonb;who text;begin
 perform pg_advisory_xact_lock(842917,24);
 select coalesce(display_name,email)into who from public.admin_users where auth_user_id=p_actor and status='active';if who is null then raise exception 'active administrator required';end if;
 if exists(select 1 from public.inventory_source_snapshots where source_hash=p_hash)then return jsonb_build_object('already_imported',true);end if;
 if jsonb_array_length(p_items)<>7 or jsonb_array_length(p_entries)>2000 then raise exception 'invalid snapshot';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 for i in select value from jsonb_array_elements(p_items)loop
  if i->>'category'<>'tezukuru' or i->>'inventory_role'<>'rental_kit' then raise exception 'invalid kit';end if;
  insert into public.item_name_master(id,category,name,aliases,sort_order,is_active,inventory_role)values((i->>'id')::uuid,'tezukuru',i->>'name',coalesce(i->'aliases','[]'),(i->>'sort_order')::int,true,'rental_kit')on conflict(id)do nothing;
  if not exists(select 1 from public.item_name_master where id=(i->>'id')::uuid and category='tezukuru' and inventory_role='rental_kit')then raise exception 'kit mismatch';end if;
  insert into public.inventory_stock(item_id,total_count,reserve_count)values((i->>'id')::uuid,(i->>'total_count')::int,(i->>'reserve_count')::int)on conflict(item_id)do nothing;
  for plan in select value from jsonb_array_elements(i->'plans')loop
   insert into public.inventory_stock_schedule(item_id,effective_date,total_count,reserve_count)values((i->>'id')::uuid,(plan->>'effective_date')::date,(plan->>'total_count')::int,(plan->>'reserve_count')::int)on conflict(item_id,effective_date)do nothing;
  end loop;
 end loop;
 for e in select value from jsonb_array_elements(p_entries)loop
  if not exists(select 1 from jsonb_array_elements(p_items) as kit(value) where kit.value->>'id'=e->>'item_id')then raise exception 'outside kit';end if;
  if nullif(e->>'request_id','')is not null and not exists(select 1 from public.requests r join public.form_types f on f.id=r.form_type_id where r.id=(e->>'request_id')::uuid and f.kintone_app_id=49)then raise exception 'outside business';end if;
  insert into public.inventory_sheet_entries(source_key,source_tab,source_cell,source_raw,source_lane,item_id,staff_name,store_name,management_no,start_date,end_date,request_id,state)values(e->>'source_key',e->>'source_tab',e->>'source_cell',e->>'source_raw',e->>'source_lane',(e->>'item_id')::uuid,e->>'staff_name',e->>'store_name',e->>'management_no',(e->>'start_date')::date,(e->>'end_date')::date,nullif(e->>'request_id','')::uuid,e->>'state')on conflict(source_key)do nothing;
 end loop;
 insert into public.inventory_source_snapshots(source_hash,source_url,actor,summary,source_data)values(p_hash,p_url,p_actor,p_summary,p_snapshot);
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_source_snapshots',p_hash,p_actor,'import',p_summary);
 return jsonb_build_object('items',jsonb_array_length(p_items),'entries',jsonb_array_length(p_entries));
end;$$;
revoke all on function public.import_tezukuru_inventory(uuid,text,text,jsonb,jsonb,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.import_tezukuru_inventory(uuid,text,text,jsonb,jsonb,jsonb,jsonb)to service_role;
commit;
