begin;
-- Share the inventory lock/version used by booking creation and edits.
create function public.set_inventory_extension_reservation(p_actor uuid,p_business text,p_number text,p_possible boolean,p_previous boolean,p_expected bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(842917,24);
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1) then raise exception 'inventory_stale'; end if;
 perform public.set_inventory_extension_flag(p_actor,p_business,p_number,p_possible,p_previous);
end;$$;
revoke all on function public.set_inventory_extension_reservation(uuid,text,text,boolean,boolean,bigint) from public,anon,authenticated;
grant execute on function public.set_inventory_extension_reservation(uuid,text,text,boolean,boolean,bigint) to service_role;
commit;
