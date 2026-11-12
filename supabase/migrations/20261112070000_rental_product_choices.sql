begin;
set local lock_timeout='5s';
alter table public.item_name_master add column rental_product_ids uuid[];
comment on column public.item_name_master.rental_product_ids is 'Rental kit product choices: null=all active products; empty array=no products';
do $migration$
declare body text;needle text;patch text;
begin
 body:=pg_get_functiondef('public.save_rental_kit(uuid,uuid,timestamptz,text,jsonb)'::regprocedure);
 needle:=' update public.inventory_change_clock set version=version+1 where id=1;';
 patch:=$patch$
 if p_action in('create','edit') and p_input ? 'rental_product_ids' then
  if p_input->'rental_product_ids'='null'::jsonb then
   update public.item_name_master set rental_product_ids=null where id=p_id;
  else
   if jsonb_typeof(p_input->'rental_product_ids')<>'array' or jsonb_array_length(p_input->'rental_product_ids')>500 then raise exception 'invalid product choices';end if;
   if exists(select 1 from jsonb_array_elements_text(p_input->'rental_product_ids') v(value) where not exists(select 1 from public.item_name_master i where i.id=v.value::uuid and i.category='tezukuru' and i.inventory_role is null and i.is_active))then raise exception 'invalid product choices';end if;
   update public.item_name_master set rental_product_ids=array(select distinct value::uuid from jsonb_array_elements_text(p_input->'rental_product_ids')) where id=p_id;
  end if;
 end if;
$patch$;
 if position(needle in body)=0 then raise exception 'save_rental_kit definition changed';end if;
 execute replace(body,needle,patch||needle);
end;$migration$;
commit;
