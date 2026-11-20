-- Memo-only writes never change allocation, schedules or external systems.
create function public.save_inventory_memos(p_actor uuid,p_expected bigint,p_keys text[],p_memo text) returns void language plpgsql security invoker set search_path='' as $$
declare k text; prior jsonb;
begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if p_memo is null or length(p_memo)>2000 or coalesce(cardinality(p_keys),0) not between 1 and 1000 then raise exception 'invalid memo';end if;
 foreach k in array p_keys loop
  if k is null or length(k) not between 1 and 199 then raise exception 'invalid key';end if;
  select patch->'memo' into prior from public.inventory_booking_edits where booking_key=k;
  insert into public.inventory_booking_edits(booking_key,patch,updated_by)values(k,jsonb_build_object('memo',p_memo),p_actor)
  on conflict(booking_key)do update set patch=public.inventory_booking_edits.patch||excluded.patch,updated_by=p_actor,updated_at=now();
  insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_memos',k,p_actor,'edit',jsonb_build_object('memo',prior),jsonb_build_object('memo',p_memo));
 end loop;
end;$$;
revoke all on function public.save_inventory_memos(uuid,bigint,text[],text) from public,anon,authenticated;
grant execute on function public.save_inventory_memos(uuid,bigint,text[],text) to service_role;
