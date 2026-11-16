begin;
set local lock_timeout='5s';
-- Resolve requested physical rentals, never consumable quantities.
create or replace function public.inventory_link_item_names(p_data jsonb,p_app integer)
returns setof text language plpgsql immutable set search_path='' as $$
declare plan text; names text[]; v text; kit text;
begin
 if p_app=10 then
  return query select btrim(value) from jsonb_each_text(coalesce(p_data,'{}')) where key in ('機器商品①','機器商品②','機器商品③','機器商品④','機器商品⑤') and btrim(value)<>'';return;
 end if;
 if p_app<>49 then return;end if;
 if jsonb_typeof(p_data->'_inventory_kit_names')='array' then
  return query select value#>>'{}' from jsonb_array_elements(p_data->'_inventory_kit_names') where jsonb_typeof(value)='string' and btrim(value#>>'{}')<>'';return;
 end if;
 plan:=coalesce(p_data->>'レンタルプラン','');
 if plan ~ 'フェス' then return next 'てずくーる！！フェス';return;end if;
 if plan !~* 'LAB|ラボ|実験' then return next 'てずくーる';return;end if;
 names:='{}';
 for v in select p_data->>('コンテンツ'||i) from generate_series(1,10) i loop
  if coalesce(v,'')='' then continue;end if;
  kit:=case when v ~* '^(HW|ハロウィン|クリスマス|Xmas)' then '実験ラボシーズン' when v ~ 'シール' then 'シールLAB' when v ~ 'バウンド|スーパーボール' then 'バウンドボールLAB' when v ~ 'スクイーズ|スライム' then 'スクイーズLAB' else '実験ラボシーズン' end;
  if not kit=any(names) then names:=array_append(names,kit);end if;
 end loop;
 if cardinality(names)=0 then names:=array['実験ラボシーズン'];end if;
 return query select unnest(names);
end;$$;
revoke all on function public.inventory_link_item_names(jsonb,integer) from public,anon,authenticated;
create or replace function public.set_inventory_hold_links(p_request_id uuid, p_hold_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; h record; selected_ids uuid[]; expected_count integer; selected_count integer; app integer; link_category text;
begin
 if not exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active') then raise exception 'active administrator required'; end if;
 if p_hold_ids is null or cardinality(p_hold_ids)>5 or array_position(p_hold_ids,null) is not null then raise exception 'invalid hold selection'; end if;
 select array_agg(distinct id order by id) into selected_ids from unnest(p_hold_ids) as u(id);
 selected_ids := coalesce(selected_ids, '{}'::uuid[]);
 -- 全紐付け操作を直列化。実際の仮押さえ行もロックし、取消との競合を防ぐ。
 perform pg_advisory_xact_lock(20261023, 93000);
 select * into r from public.requests where id=p_request_id for update;
 if not found then raise exception 'request unavailable';end if;
 select kintone_app_id into app from public.form_types where id=r.form_type_id;
 if app is null or app not in(10,49) then raise exception 'unsupported business';end if;
 if not exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id where a.auth_user_id=auth.uid() and a.status='active' and b.form_type_id=r.form_type_id) then raise exception 'business access required';end if;
 link_category:=case when app=10 then 'allmight' else 'tezukuru' end;
 if r.processing_at is not null then raise exception 'request is processing'; end if;
 if cardinality(selected_ids)>0 and (r.deleted_at is not null or r.status='rejected') then raise exception 'request unavailable'; end if;
 perform id from public.inventory_holds where id=any(selected_ids) order by id for update;
 if (select count(*) from public.inventory_holds where id=any(selected_ids) and cancelled_at is null) <> cardinality(selected_ids) then raise exception 'hold unavailable'; end if;
 if exists(select 1 from public.inventory_hold_links where hold_id=any(selected_ids) and request_id<>p_request_id) then raise exception 'hold already linked'; end if;
 for h in select item_id,sum(quantity)::integer as quantity from public.inventory_holds where id=any(selected_ids) group by item_id loop
  if not exists(select 1 from public.item_name_master m where m.id=h.item_id and m.category=link_category and ((app=10 and m.inventory_role is null)or(app=49 and m.inventory_role='rental_kit'))) then raise exception 'wrong business or non-rental product';end if;
  select count(*) into expected_count from public.inventory_link_item_names(r.parsed_data,app) p(name)
  join public.item_name_master m on m.id=h.item_id and (btrim(p.name)=m.name or m.aliases ? btrim(p.name))
  where (select count(*) from public.item_name_master x where x.category=link_category and ((app=10 and x.inventory_role is null)or(app=49 and x.inventory_role='rental_kit')) and (x.name=btrim(p.name) or x.aliases ? btrim(p.name)))=1;
  if h.quantity>expected_count then raise exception 'selected quantity exceeds matching requested equipment'; end if;
 end loop;
 -- 以前の選択を解除し、新しい選択を同一トランザクションで保存。なし=[]も監査に記録する。
 delete from public.inventory_hold_links where request_id=p_request_id;
 insert into public.inventory_hold_links(hold_id,request_id,linked_by) select id,p_request_id,auth.uid() from unnest(selected_ids) u(id);
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,after_data) values ('inventory_hold_links',p_request_id::text,auth.uid(),'MATCH',jsonb_build_object('hold_ids',selected_ids));
end;
$$;
revoke all on function public.set_inventory_hold_links(uuid,uuid[]) from public,anon;
grant execute on function public.set_inventory_hold_links(uuid,uuid[]) to authenticated;

commit;
