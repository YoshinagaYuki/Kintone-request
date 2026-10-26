begin;
alter table public.item_name_master add column inventory_role text check(inventory_role is null or (inventory_role='background_screen' and category='allmight'));
create unique index inventory_one_background_screen on public.item_name_master(inventory_role)where inventory_role is not null;
insert into public.item_name_master(category,name,aliases,sort_order,is_active)select 'allmight','背景スクリーン','[]'::jsonb,1000,false where not exists(select 1 from public.item_name_master where category='allmight' and name='背景スクリーン');
update public.item_name_master set inventory_role='background_screen' where category='allmight' and name='背景スクリーン';
alter table public.inventory_holds add column background_screen_count integer not null default 0 check(background_screen_count between 0 and 1);
create trigger inventory_item_master_clock after insert or update or delete on public.item_name_master for each statement execute function public.inventory_touch_clock();
create or replace function public.create_inventory_hold_batch(p_actor uuid,p_batch uuid,p_expected bigint,p_records jsonb,p_candidate jsonb,p_existing jsonb)returns void language plpgsql security definer set search_path='' as $$declare prior public.inventory_hold_batches;rec record;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 select * into prior from public.inventory_hold_batches where id=p_batch;
 if found then if prior.created_by=p_actor and prior.payload=p_records then return;else raise exception 'batch_mismatch';end if;end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if jsonb_typeof(p_records)<>'array' or jsonb_array_length(p_records)<1 or jsonb_array_length(p_records)>100 then raise exception 'invalid batch';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 insert into public.inventory_hold_batches(id,payload,created_by)values(p_batch,p_records,p_actor);
 for rec in select * from jsonb_to_recordset(p_records)as x(id uuid,item_id uuid,staff_id uuid,store_name text,start_date date,end_date date,delivery_date date,pickup_date date,occupied_from date,occupied_to date,quantity int,note text,unit_number int,booking_status text,management_no text,background_screen_count int)loop
  insert into public.inventory_holds(id,batch_id,item_id,staff_id,store_name,start_date,end_date,delivery_date,pickup_date,occupied_from,occupied_to,quantity,note,created_by,booking_status,management_no,background_screen_count)values(rec.id,p_batch,rec.item_id,rec.staff_id,rec.store_name,rec.start_date,rec.end_date,rec.delivery_date,rec.pickup_date,rec.occupied_from,rec.occupied_to,1,rec.note,p_actor,coalesce(rec.booking_status,'hold'),coalesce(rec.management_no,''),coalesce(rec.background_screen_count,0));
  if rec.unit_number is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values('hold:'||rec.id::text||':0',rec.item_id,rec.unit_number,p_actor);end if;
 end loop;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_hold_batches',p_batch::text,p_actor,'create',p_records);
end;$$;
create or replace function public.link_inventory_sheet_request(p_actor uuid,p_expected bigint,p_source text,p_request uuid,p_group text,p_item uuid,p_number int,p_candidate jsonb,p_existing jsonb)returns void language plpgsql security definer set search_path='' as $$declare source_before jsonb;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 select to_jsonb(s) into source_before from public.inventory_sheet_entries s where source_key=p_source and item_id=p_item and hold_id is null and (request_id is null or request_id=p_request) for update;
 if source_before is null then raise exception 'invalid source';end if;
 if not exists(select 1 from public.requests r join public.form_types f on f.id=r.form_type_id where r.id=p_request and r.deleted_at is null and r.status<>'rejected' and f.kintone_app_id=10)then raise exception 'invalid request';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 update public.inventory_sheet_entries set request_id=p_request,state='linked' where source_key=p_source;
 insert into public.inventory_booking_edits(booking_key,patch,deleted,updated_by)values('request:'||p_request::text||':'||split_part(p_group,':',2),jsonb_build_object('screenQuantity',greatest(coalesce((select (patch->>'screenQuantity')::int from public.inventory_booking_edits where booking_key='sheet:'||p_source),0),coalesce((select (patch->>'screenQuantity')::int from public.inventory_booking_edits where booking_key='request:'||p_request::text||':'||split_part(p_group,':',2)),0))),false,p_actor)on conflict(booking_key)do update set patch=public.inventory_booking_edits.patch||excluded.patch,deleted=false,updated_by=p_actor,updated_at=now();
 insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(p_group,p_item,p_number,p_actor)on conflict(group_key,item_id)do update set unit_number=p_number,updated_by=p_actor,updated_at=now();
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_sheet_entries',p_source,p_actor,'link_request',source_before,jsonb_build_object('request_id',p_request,'group',p_group,'unit_number',p_number));
end;$$;
commit;
