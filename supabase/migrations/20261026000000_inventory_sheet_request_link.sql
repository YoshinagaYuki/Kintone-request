begin;
create function public.link_inventory_sheet_request(p_actor uuid,p_expected bigint,p_source text,p_request uuid,p_group text,p_item uuid,p_number int,p_candidate jsonb,p_existing jsonb)returns void language plpgsql security definer set search_path='' as $$declare source_before jsonb;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 select to_jsonb(s) into source_before from public.inventory_sheet_entries s where source_key=p_source and item_id=p_item and hold_id is null and (request_id is null or request_id=p_request) for update;
 if source_before is null then raise exception 'invalid source';end if;
 if not exists(select 1 from public.requests r join public.form_types f on f.id=r.form_type_id where r.id=p_request and r.deleted_at is null and r.status<>'rejected' and f.kintone_app_id=10)then raise exception 'invalid request';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 update public.inventory_sheet_entries set request_id=p_request,state='linked' where source_key=p_source;
 insert into public.inventory_booking_edits(booking_key,deleted,updated_by)values('request:'||p_request::text||':'||split_part(p_group,':',2),false,p_actor)on conflict(booking_key)do update set deleted=false,updated_by=p_actor,updated_at=now();
 insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(p_group,p_item,p_number,p_actor)on conflict(group_key,item_id)do update set unit_number=p_number,updated_by=p_actor,updated_at=now();
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_sheet_entries',p_source,p_actor,'link_request',source_before,jsonb_build_object('request_id',p_request,'group',p_group,'unit_number',p_number));
end;$$;
revoke all on function public.link_inventory_sheet_request(uuid,bigint,text,uuid,text,uuid,int,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.link_inventory_sheet_request(uuid,bigint,text,uuid,text,uuid,int,jsonb,jsonb)to service_role;
commit;
