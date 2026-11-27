begin;
alter table public.inventory_holds alter column staff_id drop not null;
alter table public.inventory_holds add column external_staff_name text;
alter table public.inventory_holds add constraint inventory_holds_staff_choice check(
 (staff_id is not null and external_staff_name is null) or
 (staff_id is null and external_staff_name is not null and length(btrim(external_staff_name)) between 1 and 100 and external_staff_name !~ '[[:cntrl:]]')
);
do $patch$
declare definition text;
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='create_inventory_hold_batch';
 if strpos(definition,'staff_id uuid,store_name text')=0 or strpos(definition,'item_id,staff_id,store_name')=0 or strpos(definition,'rec.item_id,rec.staff_id,rec.store_name')=0 then raise exception 'Hold insert signature changed';end if;
 definition:=replace(definition,'staff_id uuid,store_name text','staff_id uuid,external_staff_name text,store_name text');
 definition:=replace(definition,'item_id,staff_id,store_name','item_id,staff_id,external_staff_name,store_name');
 definition:=replace(definition,'rec.item_id,rec.staff_id,rec.store_name','rec.item_id,rec.staff_id,rec.external_staff_name,rec.store_name');
 execute definition;
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='save_inventory_bundle';
 if strpos(definition,'approved_staff_name=p_patch->>''staff'',')=0 then raise exception 'Bundle staff update changed';end if;
 definition:=replace(definition,'approved_staff_name=p_patch->>''staff'',','approved_staff_name=p_patch->>''staff'',approved_staff_external=coalesce((p_patch->>''staffExternal'')::boolean,false),');
 execute definition;
end $patch$;
commit;
