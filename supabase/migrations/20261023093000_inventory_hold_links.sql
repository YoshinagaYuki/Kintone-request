-- 仮押さえ候補と申請の紐付け。外部サービスへの書込なし。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create table public.inventory_hold_links (
  hold_id uuid primary key references public.inventory_holds(id) on delete restrict,
  request_id uuid not null references public.requests(id) on delete restrict,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now()
);
create index inventory_hold_links_request_idx on public.inventory_hold_links(request_id);
alter table public.inventory_hold_links enable row level security;
revoke all on public.inventory_hold_links from public, anon, authenticated;
grant select on public.inventory_hold_links to authenticated;
create policy inventory_links_read on public.inventory_hold_links for select to authenticated using (exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create function public.set_inventory_hold_links(p_request_id uuid, p_hold_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; h record; selected_ids uuid[]; expected_count integer; selected_count integer;
begin
 if not exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active') then raise exception 'active administrator required'; end if;
 if p_hold_ids is null or cardinality(p_hold_ids)>5 or array_position(p_hold_ids,null) is not null then raise exception 'invalid hold selection'; end if;
 select array_agg(distinct id order by id) into selected_ids from unnest(p_hold_ids) as u(id);
 selected_ids := coalesce(selected_ids, '{}'::uuid[]);
 -- 全紐付け操作を直列化。実際の仮押さえ行もロックし、取消との競合を防ぐ。
 perform pg_advisory_xact_lock(20261023, 93000);
 select * into r from public.requests where id=p_request_id for update;
 if not found or not exists(select 1 from public.form_types where id=r.form_type_id and kintone_app_id=10) then raise exception 'allmight request required'; end if;
 if r.processing_at is not null then raise exception 'request is processing'; end if;
 if cardinality(selected_ids)>0 and (r.deleted_at is not null or r.status='rejected') then raise exception 'request unavailable'; end if;
 perform id from public.inventory_holds where id=any(selected_ids) order by id for update;
 if (select count(*) from public.inventory_holds where id=any(selected_ids) and cancelled_at is null) <> cardinality(selected_ids) then raise exception 'hold unavailable'; end if;
 if exists(select 1 from public.inventory_hold_links where hold_id=any(selected_ids) and request_id<>p_request_id) then raise exception 'hold already linked'; end if;
 for h in select item_id,sum(quantity)::integer as quantity from public.inventory_holds where id=any(selected_ids) group by item_id loop
  select count(*) into expected_count
  from jsonb_each_text(r.parsed_data) p join public.item_name_master m on m.id=h.item_id and m.category='allmight'
  where p.key in ('機器商品①','機器商品②','機器商品③','機器商品④','機器商品⑤') and (btrim(p.value)=m.name or m.aliases ? btrim(p.value)) and (select count(*) from public.item_name_master x where x.category='allmight' and (x.name=btrim(p.value) or x.aliases ? btrim(p.value)))=1;
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
create function public.inventory_prevent_linked_cancel() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if new.cancelled_at is not null and exists(select 1 from public.inventory_hold_links where hold_id=new.id) then raise exception 'unlink request before cancellation'; end if;
 return new;
end;
$$;
revoke all on function public.inventory_prevent_linked_cancel() from public;
create trigger inventory_hold_linked_cancel before update on public.inventory_holds for each row execute function public.inventory_prevent_linked_cancel();
commit;
