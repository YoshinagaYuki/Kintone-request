begin;
set local lock_timeout='5s';
create table public.inventory_confirmation_sources(
 source_key text primary key, request_id uuid not null references public.requests(id),
 created_by uuid not null references auth.users(id), input_hash text not null,created_at timestamptz not null default now()
);
alter table public.inventory_confirmation_sources enable row level security;
revoke all on public.inventory_confirmation_sources from public,anon,authenticated;
grant all on public.inventory_confirmation_sources to service_role;
grant select on public.inventory_confirmation_sources to authenticated;
create policy inventory_confirmation_read on public.inventory_confirmation_sources for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create function public.create_inventory_confirmation(p_actor uuid,p_id uuid,p_hash text,p_expected bigint,p_form uuid,p_version int,p_parsed jsonb,p_raw text,p_input jsonb,p_slots jsonb,p_candidate jsonb,p_existing jsonb)returns uuid language plpgsql security definer set search_path='' as $$
declare s record;who text;prior public.inventory_confirmation_sources;begin
 perform pg_advisory_xact_lock(842917,24);
 select coalesce(display_name,email)into who from public.admin_users where auth_user_id=p_actor and status='active';
 if who is null or not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id join public.form_types f on f.id=b.form_type_id where u.auth_user_id=p_actor and b.form_type_id=p_form and f.kintone_app_id=10)then raise exception 'business administrator required';end if;
 select * into prior from public.inventory_confirmation_sources where request_id=p_id limit 1;
 if found then if prior.created_by=p_actor and prior.input_hash=p_hash then return p_id;else raise exception 'confirmation_mismatch';end if;end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots)not between 1 and 5 then raise exception 'invalid equipment count';end if;
 if exists(select 1 from jsonb_array_elements(p_slots) as v(value) join public.inventory_confirmation_sources c on c.source_key=v.value->>'source_key')then raise exception 'source_already_confirmed';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 insert into public.requests(id,form_type_id,form_type_version,raw_text,parsed_data,status,company_staff_name_input,is_structured,applicant_name,applicant_phone,applicant_email,customer_requests,allmight_delivery_arrangement,allmight_pickup_arrangement)
 values(p_id,p_form,p_version,p_raw,p_parsed,'pending',p_input->>'staff',true,p_input->>'applicant_name',p_input->>'applicant_phone',p_input->>'applicant_email',nullif(p_input->>'customer_requests',''),case when p_parsed->>'_inventory_delivery_required'='true'then 'normal'else null end,case when p_parsed->>'_inventory_pickup_required'='true'then 'normal'else null end);
 for s in select * from jsonb_to_recordset(p_slots)as x(slot int,source_key text,item_id uuid,unit_number int,patch jsonb)loop
  insert into public.inventory_confirmation_sources(source_key,request_id,created_by,input_hash)values(s.source_key,p_id,p_actor,p_hash);
  insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(p_id::text||':'||s.slot,s.item_id,s.unit_number,p_actor);
  insert into public.inventory_booking_edits(booking_key,patch,updated_by)values('request:'||p_id::text||':'||s.slot,s.patch,p_actor);
 end loop;
 insert into public.request_histories(request_id,action,actor,detail)values(p_id,'submitted',who,jsonb_build_object('kind','inventory_confirmation','sources',p_parsed->'_inventory_confirmation_keys','equipment_count',jsonb_array_length(p_slots)));
 return p_id;
end;$$;
revoke all on function public.create_inventory_confirmation(uuid,uuid,text,bigint,uuid,int,jsonb,text,jsonb,jsonb,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.create_inventory_confirmation(uuid,uuid,text,bigint,uuid,int,jsonb,text,jsonb,jsonb,jsonb,jsonb)to service_role;
commit;
