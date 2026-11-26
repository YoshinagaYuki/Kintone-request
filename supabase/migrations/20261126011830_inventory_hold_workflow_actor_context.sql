-- Case-wide tracking. No timer or automatic cancellation; only an explicit administrator action.
create or replace function public.save_inventory_hold_workflow(p_actor uuid,p_expected bigint,p_keys text[],p_phase text,p_cancel boolean,p_app integer) returns void
language plpgsql security invoker set search_path='' as $$
declare k text; prior jsonb; rid uuid; old_request jsonb;
begin
 perform pg_advisory_xact_lock(842917,24);
 if p_app not in (10,49) or not exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id join public.form_types f on f.id=b.form_type_id where a.auth_user_id=p_actor and a.status='active' and f.kintone_app_id=p_app)then raise exception 'business permission required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if p_phase is null or p_phase not in ('hold','waiting_shipping','shipping_entered') or p_cancel is null or coalesce(cardinality(p_keys),0) not between 1 and 1000 then raise exception 'invalid workflow';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 -- Cancel native reservations as well as their board rows, preventing later form linkage.
 if p_cancel then
  for rid in select distinct split_part(key,':',2)::uuid from unnest(p_keys) key where key like 'hold:%' loop
   perform 1 from public.inventory_holds where id=rid for update;
   if exists(select 1 from public.inventory_hold_links l join public.requests r on r.id=l.request_id where l.hold_id=rid and r.deleted_at is null and r.status<>'rejected')then raise exception 'linked request must be withdrawn first';end if;
   insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)
    select 'inventory_hold_links',rid::text,p_actor,'delete',jsonb_agg(to_jsonb(l)),jsonb_build_object('reason','仮押さえの手動キャンセル') from public.inventory_hold_links l where l.hold_id=rid having count(*)>0;
   delete from public.inventory_hold_links where hold_id=rid;
   update public.inventory_holds set cancelled_at=now() where id=rid and cancelled_at is null;
  end loop;
 end if;
 foreach k in array p_keys loop
  if k is null or length(k) not between 1 and 199 then raise exception 'invalid key';end if;
  -- A copied draft must be withdrawn as well, otherwise it could still be approved later.
  if p_cancel and k like 'request:%' then
   rid:=split_part(k,':',2)::uuid;
   select to_jsonb(r) into old_request from public.requests r where r.id=rid and r.deleted_at is null for update;
   if old_request is not null then
    if old_request->>'status'<>'pending' or coalesce(old_request->>'kintone_record_id','')<>'' or coalesce(old_request->>'management_no','')<>'' or not exists(select 1 from public.inventory_copy_requests c where c.child_request_id=rid and c.state='draft' and not(c.progress?'recordId') and not coalesce((c.progress->>'recordAttempted')::boolean,false))then raise exception 'only an unregistered draft can be cancelled';end if;
    update public.requests set deleted_at=now() where id=rid;
    insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('requests',rid::text,p_actor,'delete',old_request,jsonb_build_object('reason','仮押さえの手動キャンセル'));
   end if;
  end if;
  select patch into prior from public.inventory_booking_edits where booking_key=k;
  insert into public.inventory_booking_edits(booking_key,patch,deleted,updated_by)values(k,jsonb_build_object('holdPhase',p_phase,'holdWorkflowUpdatedAt',now())||case when p_cancel then jsonb_build_object('holdCancelledAt',now())else '{}'::jsonb end,p_cancel,p_actor)
  on conflict(booking_key)do update set patch=public.inventory_booking_edits.patch||excluded.patch,deleted=case when p_cancel then true else public.inventory_booking_edits.deleted end,updated_by=p_actor,updated_at=now();
  insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_hold_workflow',k,p_actor,case when p_cancel then 'delete'else 'edit'end,prior,jsonb_build_object('holdPhase',p_phase,'cancelled',p_cancel));
 end loop;
end;$$;
revoke all on function public.save_inventory_hold_workflow(uuid,bigint,text[],text,boolean,integer) from public,anon,authenticated;
grant execute on function public.save_inventory_hold_workflow(uuid,bigint,text[],text,boolean,integer) to service_role;
