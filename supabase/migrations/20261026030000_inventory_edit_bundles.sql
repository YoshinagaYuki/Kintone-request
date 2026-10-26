begin;
alter table public.inventory_holds add column parent_booking_key text;
create table public.inventory_change_jobs(id uuid primary key,input_hash text not null,request_id uuid references public.requests(id),created_by uuid not null references auth.users(id),status text not null check(status in('pending','processing','succeeded','failed')),updates jsonb not null default '[]',request_after jsonb not null default '{}',error text,run_token uuid,run_started_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index inventory_one_request_change on public.inventory_change_jobs(request_id)where status<>'succeeded';
alter table public.inventory_change_jobs enable row level security;
revoke all on public.inventory_change_jobs from anon,authenticated;grant select on public.inventory_change_jobs to authenticated;grant all on public.inventory_change_jobs to service_role;
create policy inventory_change_jobs_read on public.inventory_change_jobs for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create function public.save_inventory_bundle(p_actor uuid,p_job uuid,p_hash text,p_expected bigint,p_key text,p_group text,p_item uuid,p_number int,p_patch jsonb,p_candidate jsonb,p_existing jsonb,p_holds jsonb,p_request uuid,p_request_updated timestamptz,p_parsed jsonb,p_raw text,p_contents jsonb,p_assignments jsonb,p_updates jsonb)returns uuid language plpgsql security definer set search_path='' as $$declare r public.requests;j public.inventory_change_jobs;who text;changes jsonb;a record;new_version bigint;begin
 perform pg_advisory_xact_lock(842917,24);
 select coalesce(display_name,email)into who from public.admin_users where auth_user_id=p_actor and status='active';if who is null then raise exception 'active administrator required';end if;
 select * into j from public.inventory_change_jobs where id=p_job;if found then if j.created_by=p_actor and j.input_hash=p_hash then return p_job;else raise exception 'operation_mismatch';end if;end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if p_request is not null then
 select * into r from public.requests where id=p_request for update;
 if not found or r.deleted_at is not null or r.status not in('pending','registered')or r.processing_at is not null or p_request_updated is null or r.updated_at is distinct from p_request_updated then raise exception 'request_busy_or_changed';end if;
 if not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id join public.form_types f on f.id=b.form_type_id where u.auth_user_id=p_actor and u.status='active' and b.form_type_id=r.form_type_id and f.kintone_app_id=10)then raise exception 'business administrator required';end if;
 if p_key not like 'request:'||p_request::text||':%'then raise exception 'invalid request key';end if;
 end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 perform public.save_inventory_operation(p_actor,p_expected,'edit',p_key,p_group,p_item,p_number,p_patch,p_candidate,p_existing);
 if p_request is not null then
 select coalesce(jsonb_agg(jsonb_build_object('field',key,'before',r.parsed_data->key,'after',p_parsed->key)),'[]')into changes from(select jsonb_object_keys(coalesce(r.parsed_data,'{}'))as key union select jsonb_object_keys(p_parsed))k where coalesce(r.parsed_data->key,'null')is distinct from coalesce(p_parsed->key,'null');
 update public.requests set parsed_data=p_parsed,raw_text=p_raw,approved_contents=p_contents,approved_staff_name=p_patch->>'staff',processing_at=case when jsonb_array_length(p_updates)>0 then now()else null end,processing_token=case when jsonb_array_length(p_updates)>0 then p_job else null end where id=p_request;
 -- The application now owns common data; retain inventory-only padding, deletion and screen metadata.
 update public.inventory_booking_edits set patch=(patch-'item_id'-'staff'-'store'-'start'-'end'-'delivery'-'pickup')||jsonb_build_object('from',p_patch->>'from','to',p_patch->>'to'),updated_by=p_actor,updated_at=now()where booking_key like 'request:'||p_request::text||':%';
 for a in select * from jsonb_to_recordset(p_assignments)as x(group_key text,item_id uuid,unit_number int,screen_quantity int)loop
 insert into public.inventory_booking_edits(booking_key,patch,updated_by)values('request:'||p_request::text||':'||split_part(a.group_key,':',2),jsonb_build_object('from',p_patch->>'from','to',p_patch->>'to','screenQuantity',coalesce(a.screen_quantity,0)),p_actor)on conflict(booking_key)do update set patch=public.inventory_booking_edits.patch||excluded.patch,updated_by=p_actor,updated_at=now();
 insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(a.group_key,a.item_id,a.unit_number,p_actor)on conflict(group_key,item_id)do update set unit_number=excluded.unit_number,updated_by=p_actor,updated_at=now();end loop;
 insert into public.request_histories(request_id,action,actor,detail)values(p_request,'edited',who,jsonb_build_object('source','inventory','operation_id',p_job,'changes',changes,'raw_text_before',r.raw_text,'raw_text_after',p_raw,'kintone_sync',case when jsonb_array_length(p_updates)>0 then 'pending' else 'not_required'end));
 end if;
 if jsonb_array_length(p_holds)>0 then select version into new_version from public.inventory_change_clock where id=1;perform public.create_inventory_hold_batch(p_actor,p_job,new_version,p_holds,p_candidate,p_existing);end if;
 insert into public.inventory_change_jobs(id,input_hash,request_id,created_by,status,updates,request_after)values(p_job,p_hash,p_request,p_actor,case when jsonb_array_length(p_updates)>0 then 'pending'else 'succeeded'end,p_updates,coalesce(p_parsed,'{}'));
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_change_jobs',p_job::text,p_actor,'bundle_edit',jsonb_build_object('booking_key',p_key,'added',jsonb_array_length(p_holds),'request_id',p_request));
 return p_job;
end;$$;
revoke all on function public.save_inventory_bundle(uuid,uuid,text,bigint,text,text,uuid,int,jsonb,jsonb,jsonb,jsonb,uuid,timestamptz,jsonb,text,jsonb,jsonb,jsonb)from public,anon,authenticated;grant execute on function public.save_inventory_bundle(uuid,uuid,text,bigint,text,text,uuid,int,jsonb,jsonb,jsonb,jsonb,uuid,timestamptz,jsonb,text,jsonb,jsonb,jsonb)to service_role;
create function public.claim_inventory_change(p_actor uuid,p_job uuid,p_token uuid)returns jsonb language plpgsql security definer set search_path='' as $$declare j public.inventory_change_jobs;begin
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 select * into j from public.inventory_change_jobs where id=p_job for update;if not found then raise exception 'job not found';end if;
 if j.request_id is not null and not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id join public.requests r on r.form_type_id=b.form_type_id where u.auth_user_id=p_actor and r.id=j.request_id)then raise exception 'business administrator required';end if;
 if j.status='succeeded'then return jsonb_build_object('complete',true);end if;
 if j.request_id is not null and not exists(select 1 from public.requests where id=j.request_id and deleted_at is null and parsed_data=j.request_after and (processing_token is null or processing_token=p_job))then raise exception 'request changed after save';end if;
 if j.status='processing' and j.run_started_at>now()-interval '2 minutes'then return jsonb_build_object('busy',true);end if;
 if j.request_id is not null then update public.requests set processing_at=now(),processing_token=p_job where id=j.request_id;end if;
 update public.inventory_change_jobs set status='processing',run_token=p_token,run_started_at=now(),updated_at=now()where id=p_job;
 return jsonb_build_object('updates',j.updates);
end;$$;
create function public.finish_inventory_change(p_job uuid,p_token uuid,p_error text)returns void language plpgsql security definer set search_path='' as $$declare j public.inventory_change_jobs;who text;begin
 select * into j from public.inventory_change_jobs where id=p_job for update;if not found or j.run_token is distinct from p_token then raise exception 'invalid run token';end if;
 update public.inventory_change_jobs set status=case when p_error is null then 'succeeded'else 'failed'end,error=left(p_error,3000),run_token=null,updated_at=now()where id=p_job;
 if j.request_id is not null then
 if p_error is null then update public.requests set processing_at=null,processing_token=null where id=j.request_id and processing_token=p_job;end if;
 select coalesce(display_name,email)into who from public.admin_users where auth_user_id=j.created_by;
 insert into public.request_histories(request_id,action,actor,detail)values(j.request_id,'edited',who,jsonb_build_object('source','inventory_kintone_sync','operation_id',p_job,'status',case when p_error is null then 'succeeded'else 'failed'end,'error',p_error));end if;
end;$$;
revoke all on function public.claim_inventory_change(uuid,uuid,uuid),public.finish_inventory_change(uuid,uuid,text)from public,anon,authenticated;grant execute on function public.claim_inventory_change(uuid,uuid,uuid),public.finish_inventory_change(uuid,uuid,text)to service_role;
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
 for rec in select * from jsonb_to_recordset(p_records)as x(id uuid,item_id uuid,staff_id uuid,store_name text,start_date date,end_date date,delivery_date date,pickup_date date,occupied_from date,occupied_to date,quantity int,note text,unit_number int,booking_status text,management_no text,background_screen_count int,parent_booking_key text)loop
  insert into public.inventory_holds(id,batch_id,item_id,staff_id,store_name,start_date,end_date,delivery_date,pickup_date,occupied_from,occupied_to,quantity,note,created_by,booking_status,management_no,background_screen_count,parent_booking_key)values(rec.id,p_batch,rec.item_id,rec.staff_id,rec.store_name,rec.start_date,rec.end_date,rec.delivery_date,rec.pickup_date,rec.occupied_from,rec.occupied_to,1,rec.note,p_actor,coalesce(rec.booking_status,'hold'),coalesce(rec.management_no,''),coalesce(rec.background_screen_count,0),rec.parent_booking_key);
  if rec.unit_number is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values('hold:'||rec.id::text||':0',rec.item_id,rec.unit_number,p_actor);end if;
 end loop;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data)values('inventory_hold_batches',p_batch::text,p_actor,'create',p_records);
end;$$;
commit;
