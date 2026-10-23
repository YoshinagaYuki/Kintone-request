-- 延長は既存申請と別の承認済み申請。外部連携の途中状態を保持する。
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
alter table public.requests add column inventory_parent_request_id uuid references public.requests(id) on delete restrict;
create table public.inventory_extensions (
 id uuid primary key,
 parent_request_id uuid not null unique references public.requests(id) on delete restrict,
 child_request_id uuid not null unique references public.requests(id) on delete restrict,
 usage_end date not null, pickup_date date not null check (pickup_date >= usage_end),
 billing_month integer not null check (billing_month between 1 and 12),
 state text not null default 'pending' check (state in ('pending','running','failed','complete')),
 progress jsonb not null default '{}'::jsonb,
 last_error text,
 lease_token uuid, lease_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.inventory_extensions enable row level security;
revoke all on public.inventory_extensions from public,anon,authenticated;
grant select on public.inventory_extensions to authenticated;
grant all on public.inventory_extensions to service_role;
create policy inventory_extensions_read on public.inventory_extensions for select to authenticated using (exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger inventory_extensions_updated before update on public.inventory_extensions for each row execute function public.set_updated_at();
create function public.create_inventory_extension(p_id uuid,p_parent_id uuid,p_usage_end date,p_pickup_date date,p_billing_month integer,p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; e public.inventory_extensions%rowtype; d jsonb; raw text; old_end date;
begin
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active') then raise exception 'active administrator required'; end if;
 select * into r from public.requests where id=p_parent_id for update;
 if not found or not exists(select 1 from public.form_types where id=r.form_type_id and kintone_app_id=10) then raise exception 'allmight request required'; end if;
 select * into e from public.inventory_extensions where parent_request_id=p_parent_id;
 if found then
  if e.usage_end=p_usage_end and e.pickup_date=p_pickup_date and e.billing_month=p_billing_month then return e.child_request_id; end if;
  raise exception 'an extension already exists; open its request';
 end if;
 if r.status<>'registered' or r.deleted_at is not null or r.processing_at is not null or r.kintone_record_id is null or r.management_no is null then raise exception 'registered and idle request required'; end if;
 if r.inventory_parent_request_id is not null and not exists(select 1 from public.inventory_extensions where child_request_id=r.id and state='complete') then raise exception 'previous extension incomplete'; end if;
 old_end := (r.parsed_data->>'利用最終日')::date;
 if old_end is null or p_usage_end is null or p_pickup_date is null or p_billing_month is null or p_usage_end<=old_end or p_pickup_date<p_usage_end or p_usage_end<date '2000-01-01' or p_pickup_date>date '2100-12-31' or p_billing_month not between 1 and 12 then raise exception 'invalid extension dates or billing month'; end if;
 d := r.parsed_data - array['配送日付','配送住所','配送郵便番号','当日受領者氏名','配送連絡先','集荷住所','集荷郵便番号','当日引渡者氏名','集荷連絡先','内）配送料'];
 d := d || jsonb_build_object('利用開始日',(old_end+1)::text,'利用最終日',p_usage_end::text,'集荷日付',p_pickup_date::text,'◯月分として請求',p_billing_month::text||'月分');
 select string_agg(key||': '||value,E'\n' order by key) into raw from jsonb_each_text(d);
 insert into public.requests(id,form_type_id,form_type_version,raw_text,parsed_data,status,applicant_name,applicant_phone,applicant_email,company_staff_name_input,approved_staff_name,is_structured,customer_requests,approved_by,approved_at,inventory_parent_request_id)
 values(p_id,r.form_type_id,r.form_type_version,raw,d,'approved',r.applicant_name,r.applicant_phone,r.applicant_email,r.company_staff_name_input,r.approved_staff_name,true,r.customer_requests,p_actor,now(),r.id);
 insert into public.inventory_extensions(id,parent_request_id,child_request_id,usage_end,pickup_date,billing_month,created_by) values(p_id,r.id,p_id,p_usage_end,p_pickup_date,p_billing_month,p_actor);
 insert into public.request_histories(request_id,action,actor,detail) values(p_id,'submitted',p_actor::text,jsonb_build_object('kind','extension','parent_request_id',r.id)),(p_id,'approved',p_actor::text,jsonb_build_object('kind','extension','parent_management_no',r.management_no));
 return p_id;
end;
$$;
-- この関数を呼ぶAPIは、利用中の管理者を認証した上でservice_roleを使用する。
revoke all on function public.create_inventory_extension(uuid,uuid,date,date,integer,uuid) from public,anon,authenticated;
grant execute on function public.create_inventory_extension(uuid,uuid,date,date,integer,uuid) to service_role;
create function public.claim_inventory_extension(p_id uuid,p_token uuid,p_actor uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.inventory_extensions%rowtype;
begin
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active') then raise exception 'active administrator required'; end if;
 select * into e from public.inventory_extensions where id=p_id for update;
 if not found then raise exception 'extension not found'; end if;
 if e.state='complete' then return jsonb_build_object('complete',true,'job',to_jsonb(e)); end if;
 -- Vercel実行時間は60秒。5分以内の所有者トークンは奪わない。
 if e.lease_token is not null and e.lease_at>now()-interval '5 minutes' then return jsonb_build_object('busy',true); end if;
 update public.inventory_extensions set state='running',lease_token=p_token,lease_at=now(),last_error=null where id=e.id returning * into e;
 update public.requests set processing_at=now(),processing_token=p_token where id=e.child_request_id;
 return jsonb_build_object('job',to_jsonb(e));
end;
$$;
revoke all on function public.claim_inventory_extension(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_inventory_extension(uuid,uuid,uuid) to service_role;
create function public.finish_inventory_extension(p_id uuid,p_token uuid,p_record_id text,p_management_no text) returns void
language plpgsql security definer set search_path = '' as $$
declare e public.inventory_extensions%rowtype;
begin
 select * into e from public.inventory_extensions where id=p_id for update;
 if not found or e.lease_token is distinct from p_token or e.state<>'running' then raise exception 'extension ownership lost'; end if;
 if p_record_id is null or p_management_no is null or p_management_no!~'^[0-9]+$' then raise exception 'invalid registration result'; end if;
 update public.requests set status='registered',kintone_record_id=p_record_id,management_no=p_management_no,processing_at=null,processing_token=null where id=e.child_request_id;
 update public.inventory_extensions set state='complete',lease_token=null,lease_at=null,last_error=null where id=e.id;
 insert into public.request_histories(request_id,action,actor,detail) values(e.child_request_id,'shipping_synced',e.created_by::text,jsonb_build_object('kind','extension','management_no',p_management_no,'old_pickup_cancelled',true));
end;
$$;
revoke all on function public.finish_inventory_extension(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.finish_inventory_extension(uuid,uuid,text,text) to service_role;
-- 日付・商品・手配情報の通常編集や論理削除で延長チェーンを壊さない。
create function public.protect_inventory_extension_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.inventory_extensions where parent_request_id=old.id or child_request_id=old.id) and
 (new.parsed_data is distinct from old.parsed_data or new.deleted_at is distinct from old.deleted_at or new.form_type_id is distinct from old.form_type_id or new.inventory_parent_request_id is distinct from old.inventory_parent_request_id or new.allmight_delivery_arrangement is distinct from old.allmight_delivery_arrangement or new.allmight_pickup_arrangement is distinct from old.allmight_pickup_arrangement or new.allmight_delivery_time is distinct from old.allmight_delivery_time or new.allmight_pickup_time is distinct from old.allmight_pickup_time) then
  raise exception '延長に紐づく申請は通常の編集・削除・手配変更ができません。延長の連携状態を確認してください。';
 end if;
 return new;
end;
$$;
revoke all on function public.protect_inventory_extension_request() from public;
create trigger protect_inventory_extension_request before update on public.requests for each row execute function public.protect_inventory_extension_request();
commit;
