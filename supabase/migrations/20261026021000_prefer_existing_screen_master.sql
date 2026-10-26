begin;
-- Prefer an already active screen master supplied by the operator over the inactive seed.
do $$declare candidate uuid;begin
 if (select count(*)from public.item_name_master where category='allmight' and is_active and inventory_role is null and name like '背景スクリーン%')=1 then
 select id into candidate from public.item_name_master where category='allmight' and is_active and inventory_role is null and name like '背景スクリーン%';
 update public.item_name_master set inventory_role=null where inventory_role='background_screen' and not is_active;
 update public.item_name_master set inventory_role='background_screen' where id=candidate;
 end if;
end;$$;
commit;
