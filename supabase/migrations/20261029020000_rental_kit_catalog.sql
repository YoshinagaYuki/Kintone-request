begin;
set local lock_timeout='5s';
-- Materials and rental kits may share a display name, while remaining distinct masters.
do $$declare c record;begin for c in select conname from pg_constraint where conrelid='public.item_name_master'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (category, name)' loop execute format('alter table public.item_name_master drop constraint %I',c.conname);end loop;end;$$;
create unique index item_name_master_kind_name on public.item_name_master(category,coalesce(inventory_role,''),name);
create function public.rental_kit_identity(value text)returns text language sql immutable set search_path='' as $$select regexp_replace(translate(lower(normalize(value,NFKC)),'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ','ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'),'[[:space:]()（）\[\]【】・.。、,，!！?？~〜_–—ーｰ\-]','','g')$$;
revoke all on function public.rental_kit_identity(text)from public,anon,authenticated;
-- Names remain aliases, so historical requests continue resolving to their original stable IDs.
update public.item_name_master set aliases=coalesce(aliases,'[]')||jsonb_build_array(name),name=case name when '実験ラボシーズン' then '実験LABシリーズ' when 'てずくーる！！フェス' then 'てずくーる!!フェス' when 'スクイーズLAB(ベルパーク様)' then 'スクイーズLAB（ベルパーク様）' else name end where category='tezukuru' and inventory_role='rental_kit' and name in('実験ラボシーズン','てずくーる！！フェス','スクイーズLAB(ベルパーク様)');
update public.item_name_master set sort_order=case name when 'てずくーる' then 0 when 'てずくーる!!フェス' then 1 when 'シールLAB' then 2 when 'バウンドボールLAB' then 3 when 'スクイーズLAB' then 4 when '実験LABシリーズ' then 5 when 'スクイーズLAB（ベルパーク様）' then 6 else sort_order end where category='tezukuru' and inventory_role='rental_kit';
create function public.save_rental_kit(p_actor uuid,p_id uuid,p_expected timestamptz,p_action text,p_input jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare oldrow public.item_name_master;newname text;n int;r int;today date;begin
 perform pg_advisory_xact_lock(842917,24);
 if not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id join public.form_types f on f.id=b.form_type_id where u.auth_user_id=p_actor and u.status='active' and f.kintone_app_id=49)then raise exception 'business administrator required';end if;
 if p_action not in('create','edit','retire','restore')then raise exception 'invalid action';end if;
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 select * into oldrow from public.item_name_master where id=p_id for update;
 if p_action='create' then
  if found then raise exception 'catalog_exists';end if;
 else
  if not found or oldrow.category<>'tezukuru' or oldrow.inventory_role<>'rental_kit' then raise exception 'kit not found';end if;
  if p_expected is null or oldrow.updated_at<>p_expected then raise exception 'catalog_stale';end if;
 end if;
 if p_action in('create','edit')then
  newname:=btrim(p_input->>'name');n:=(p_input->>'total_count')::int;r:=(p_input->>'reserve_count')::int;
  if newname is null or length(newname)not between 1 and 100 or n is null or r is null or n not between 0 and 250 or r not between 0 and n or coalesce(p_input->>'sort_order','0')!~'^-?[0-9]{1,6}$' then raise exception 'invalid kit';end if;
  if exists(select 1 from public.item_name_master i cross join lateral jsonb_array_elements_text(coalesce(i.aliases,'[]')||jsonb_build_array(i.name))a(value)where i.id<>p_id and i.category='tezukuru' and i.inventory_role='rental_kit' and public.rental_kit_identity(a.value)=public.rental_kit_identity(newname))then raise exception 'rental_alias_conflict';end if;
  if p_action='create' then
   insert into public.item_name_master(id,category,inventory_role,name,aliases,sort_order,is_active)values(p_id,'tezukuru','rental_kit',newname,'[]',(p_input->>'sort_order')::int,true);
   insert into public.inventory_stock(item_id,total_count,reserve_count)values(p_id,n,r);
  else
   update public.item_name_master set name=newname,aliases=case when name<>newname then coalesce(aliases,'[]')||jsonb_build_array(name)else aliases end,sort_order=(p_input->>'sort_order')::int where id=p_id;
   today:=(now()at time zone'Asia/Tokyo')::date;
   -- Current edits must take effect even if the source sheet had dated stock changes.
   insert into public.inventory_stock_schedule(item_id,effective_date,total_count,reserve_count)values(p_id,today,n,r)on conflict(item_id,effective_date)do update set total_count=excluded.total_count,reserve_count=excluded.reserve_count;
  end if;
 else
  update public.item_name_master set is_active=p_action='restore' where id=p_id;
 end if;
 update public.inventory_change_clock set version=version+1 where id=1;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('item_name_master',p_id::text,p_actor,'rental_'||p_action,case when oldrow.id is null then null else to_jsonb(oldrow)end,(select to_jsonb(i)from public.item_name_master i where i.id=p_id));
 return p_id;
end;$$;
revoke all on function public.save_rental_kit(uuid,uuid,timestamptz,text,jsonb)from public,anon,authenticated;
grant execute on function public.save_rental_kit(uuid,uuid,timestamptz,text,jsonb)to service_role;
update public.inventory_change_clock set version=version+1 where id=1;
commit;
