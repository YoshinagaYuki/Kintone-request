begin;
alter table public.inventory_holds add column booking_status text not null default 'hold' check(booking_status in('hold','registered')),add column management_no text not null default '';
alter table public.inventory_holds add constraint inventory_manual_confirmed_number check(booking_status='hold' or management_no ~ '^[0-9]{1,20}$');
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
 for rec in select * from jsonb_to_recordset(p_records)as x(id uuid,item_id uuid,staff_id uuid,store_name text,start_date date,end_date date,delivery_date date,pickup_date date,occupied_from date,occupied_to date,quantity int,note text,unit_number int,booking_status text,management_no text)loop
  insert into public.inventory_holds(id,batch_id,item_id,staff_id,store_name,start_date,end_date,delivery_date,pickup_date,occupied_from,occupied_to,quantity,note,created_by,booking_status,management_no)values(rec.id,p_batch,rec.item_id,rec.staff_id,rec.store_name,rec.start_date,rec.end_date,rec.delivery_date,rec.pickup_date,rec.occupied_from,rec.occupied_to,1,rec.note,p_actor,coalesce(rec.booking_status,'hold'),coalesce(rec.management_no,''));
  if rec.unit_number is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values('hold:'||rec.id::text||':0',rec.item_id,rec.unit_number,p_actor);end if;
 end loop;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_hold_batches',p_batch::text,p_actor,'create',p_records);
end;$$;
commit;
