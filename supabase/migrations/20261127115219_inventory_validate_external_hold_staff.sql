begin;
do $patch$
declare definition text;
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='inventory_validate_write';
 if strpos(definition,'if not exists (select 1 from public.staff_members where id = new.staff_id and is_active)')=0 then raise exception 'Staff validator changed';end if;
 definition:=replace(definition,'if not exists (select 1 from public.staff_members where id = new.staff_id and is_active)','if new.staff_id is not null and not exists (select 1 from public.staff_members where id = new.staff_id and is_active)');
 execute definition;
end $patch$;
commit;
