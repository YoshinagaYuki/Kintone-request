begin;
set local lock_timeout='5s';
create or replace function public.guard_staff_request_review()returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.staff_members; matches integer; internal_action boolean:=coalesce(current_setting('app.staff_review_action',true),'')='1'; changed boolean;
begin
 -- Only a trusted, business-authorized inventory/admin RPC may set this local flag.
 if current_user in ('postgres','service_role') then
 if (
 coalesce(current_setting('app.inventory_review_not_required',true),'')='1'
 or tg_op='UPDATE' and (exists(select 1 from public.inventory_copy_requests c where c.child_request_id=new.id)
 or exists(select 1 from public.inventory_confirmation_sources c where c.request_id=new.id)
 or exists(select 1 from public.inventory_extensions e where e.child_request_id=new.id))) then
 new.staff_review_state:='not_required';new.staff_review_staff_id:=null;
 new.staff_review_revision:=case when tg_op='INSERT' then 0 when old.staff_review_state<>'not_required' then old.staff_review_revision+1 else old.staff_review_revision end;
 return new;
 end if;
 end if;
 if tg_op='INSERT' then
  new.staff_review_state:='not_required';new.staff_review_revision:=0;new.staff_review_staff_id:=null;
 else
  -- Review fields cannot be forged by a normal client update.
  if not internal_action then new.staff_review_state:=old.staff_review_state;new.staff_review_revision:=old.staff_review_revision;new.staff_review_staff_id:=old.staff_review_staff_id;end if;
  if old.staff_review_state<>'not_required' and new.processing_at is not null and new.processing_at is distinct from old.processing_at and new.status not in('approved','register_failed')then raise exception 'ユニティ管理者の最終承認が必要です';end if;
  if old.staff_review_state in('pending','returned') and (new.status in('approved','registered','register_failed') or new.processing_at is not null and new.processing_at is distinct from old.processing_at)then raise exception '担当者の確認・承認が完了していません';end if;
 end if;
 if new.status<>'pending' and not(tg_op='INSERT' and new.status='approved') then return new;end if;
 if tg_op='INSERT' or new.company_staff_name_input is distinct from old.company_staff_name_input then
  select count(*) into matches from public.staff_members where is_active and btrim(name)=btrim(coalesce(new.company_staff_name_input,''));
  if matches>1 and exists(select 1 from public.staff_members where is_active and review_required and btrim(name)=btrim(coalesce(new.company_staff_name_input,'')))then raise exception '担当者名が重複しています。担当者マスターを確認してください';end if;
  if matches=1 then select * into s from public.staff_members where is_active and btrim(name)=btrim(new.company_staff_name_input);end if;
  if s.review_required then if tg_op='INSERT' then new.status:='pending';new.approved_at:=null;new.approved_by:=null;end if;new.staff_review_state:='pending';new.staff_review_staff_id:=s.id;new.staff_review_revision:=case when tg_op='INSERT' then 1 else old.staff_review_revision+1 end;
  else new.staff_review_state:='not_required';new.staff_review_staff_id:=null;end if;
 elsif tg_op='UPDATE' and not internal_action and old.staff_review_state<>'not_required' then
  changed:=new.parsed_data is distinct from old.parsed_data or new.raw_text is distinct from old.raw_text or new.applicant_name is distinct from old.applicant_name or new.applicant_phone is distinct from old.applicant_phone or new.applicant_email is distinct from old.applicant_email or new.customer_requests is distinct from old.customer_requests or new.requested_rental_plan_id is distinct from old.requested_rental_plan_id;
  if changed then new.staff_review_state:='pending';new.staff_review_revision:=old.staff_review_revision+1;end if;
 end if;
 return new;
end;$$;

-- Keep the complete existing conflict/authorization logic, enclosing only the request INSERT.
do $patch$
declare p record; definition text; pos integer; ending integer; count_patched integer:=0;
begin
 for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname in ('create_inventory_copy','create_inventory_confirmation','create_inventory_extension') loop
 definition:=pg_get_functiondef(p.oid);pos:=strpos(lower(definition),'insert into public.requests(');
 if pos=0 then raise exception 'Inventory request insert not found';end if;
 ending:=pos+strpos(substr(definition,pos),';');
 definition:=substr(definition,1,pos-1)||E'perform set_config(\'app.inventory_review_not_required\',\'1\',true);\n '||substr(definition,pos,ending-pos)||E'\n perform set_config(\'app.inventory_review_not_required\',\'0\',true);\n '||substr(definition,ending);
 execute definition;count_patched:=count_patched+1;
 end loop;
 if count_patched<>3 then raise exception 'Unexpected inventory entry points';end if;
 -- Public reviewer/requester edits use a non-admin actor and keep their review workflow.
 for p in select oid from pg_proc where pronamespace='public'::regnamespace and proname='edit_request_atomic' loop
 definition:=pg_get_functiondef(p.oid);pos:=strpos(lower(definition),'update public.requests set');if pos=0 then raise exception 'Admin edit update not found';end if;
 ending:=pos+strpos(substr(definition,pos),';');
 definition:=substr(definition,1,pos-1)||E'if exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id join public.requests r on r.form_type_id=b.form_type_id where r.id=p_id and a.auth_user_id::text=p_actor and a.status=\'active\') then perform set_config(\'app.inventory_review_not_required\',\'1\',true);end if;\n '||substr(definition,pos,ending-pos)||E'\n perform set_config(\'app.inventory_review_not_required\',\'0\',true);\n '||substr(definition,ending);
 execute definition;
 end loop;
end $patch$;
with changed as (
 update public.requests r set staff_review_state='not_required'
 where r.staff_review_state<>'not_required' and (
 exists(select 1 from public.inventory_copy_requests c where c.child_request_id=r.id)
 or exists(select 1 from public.inventory_confirmation_sources c where c.request_id=r.id)
 or exists(select 1 from public.inventory_extensions e where e.child_request_id=r.id))
 returning r.id
) insert into public.request_histories(request_id,action,actor,detail)
select id,'edited','system',jsonb_build_object('kind','internal_staff_review_exempt','reason','管理画面入力・延長は担当者確認不要') from changed;
update public.request_staff_reviews v set reviewer_token_hash=null,requester_token_hash=null
where exists(select 1 from public.requests r where r.id=v.request_id and r.staff_review_state='not_required');
commit;
