alter table public.staff_members add column review_required boolean not null default false;
alter table public.staff_members add constraint staff_review_email_required check(not review_required or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.requests add column staff_review_state text not null default 'not_required' check(staff_review_state in('not_required','pending','approved','returned'));
alter table public.requests add column staff_review_staff_id uuid references public.staff_members(id) on delete restrict;
alter table public.requests add column staff_review_revision bigint not null default 0;
create table public.request_staff_reviews(
 request_id uuid primary key references public.requests(id) on delete cascade,
 staff_id uuid not null references public.staff_members(id) on delete restrict,
 reviewer_email text not null,
 reviewer_token_hash text unique, requester_token_hash text unique,
 expires_at timestamptz not null default(now()+interval '30 days'),
 reason text not null default '', reviewed_at timestamptz,
 reviewer_sent_revision bigint, requester_sent_revision bigint,
 reviewer_sending_at timestamptz, requester_sending_at timestamptz,
 reviewer_mail_error text, requester_mail_error text,
 created_at timestamptz not null default now()
);
alter table public.request_staff_reviews enable row level security;
revoke all on public.request_staff_reviews from public,anon,authenticated;
grant all on public.request_staff_reviews to service_role;
grant select on public.request_staff_reviews to authenticated;
create policy staff_review_admin_read on public.request_staff_reviews for select to authenticated using(exists(select 1 from public.requests r join public.admin_user_businesses b on b.form_type_id=r.form_type_id join public.admin_users a on a.id=b.admin_user_id where r.id=request_id and a.auth_user_id=(select auth.uid()) and a.status='active'));
create function public.guard_staff_request_review()returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.staff_members; matches integer; internal_action boolean:=coalesce(current_setting('app.staff_review_action',true),'')='1'; changed boolean;
begin
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
create trigger zz_staff_review_guard before insert or update on public.requests for each row execute function public.guard_staff_request_review();
-- This trigger writes the private review row for inserts made by either the public form or administrators.
create function public.sync_staff_request_review()returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.staff_review_staff_id is not null and new.staff_review_state<>'not_required' then
  insert into public.request_staff_reviews(request_id,staff_id,reviewer_email)
  select new.id,s.id,s.email from public.staff_members s where s.id=new.staff_review_staff_id
  on conflict(request_id)do update set staff_id=excluded.staff_id,reviewer_email=case when public.request_staff_reviews.staff_id<>excluded.staff_id then excluded.reviewer_email else public.request_staff_reviews.reviewer_email end,
   reviewer_token_hash=case when public.request_staff_reviews.staff_id<>excluded.staff_id then null else public.request_staff_reviews.reviewer_token_hash end,
   requester_token_hash=case when public.request_staff_reviews.staff_id<>excluded.staff_id then null else public.request_staff_reviews.requester_token_hash end,
   reviewer_sent_revision=case when public.request_staff_reviews.staff_id<>excluded.staff_id then null else public.request_staff_reviews.reviewer_sent_revision end;
 end if;
 return new;
end;$$;
create trigger zz_staff_review_sync after insert or update on public.requests for each row execute function public.sync_staff_request_review();
revoke all on function public.guard_staff_request_review(),public.sync_staff_request_review() from public,anon,authenticated;

create function public.act_staff_request_review(p_hash text,p_revision bigint,p_updated timestamptz,p_action text,p_reason text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.requests; rev public.request_staff_reviews; id uuid;
begin
 select request_id into id from public.request_staff_reviews where reviewer_token_hash=p_hash;
 select * into q from public.requests where requests.id=id for update;
 select * into rev from public.request_staff_reviews where request_id=id for update;
 if q.id is null or rev.expires_at<now() or q.deleted_at is not null or q.status<>'pending' or q.processing_at is not null or q.kintone_record_id is not null or not exists(select 1 from public.staff_members s where s.id=rev.staff_id and s.is_active and s.email=rev.reviewer_email)then raise exception 'リンクが無効か、この申請は確認できません';end if;
 if p_revision is null or p_updated is null or q.staff_review_revision<>p_revision or q.updated_at<>p_updated or q.staff_review_state<>'pending' then raise exception '申請が更新されています。再読み込みしてください';end if;
 if p_action is null or p_action not in('approve','return') or p_action='return' and length(btrim(p_reason)) not between 1 and 2000 then raise exception '差し戻す理由を入力してください';end if;
 perform set_config('app.staff_review_action','1',true);
 update public.requests set staff_review_state=case when p_action='approve' then 'approved'else 'returned'end where requests.id=id;
 update public.request_staff_reviews set reason=case when p_action='return' then btrim(p_reason)else ''end,reviewed_at=now(),requester_token_hash=null,requester_sent_revision=null where request_id=id;
 insert into public.request_histories(request_id,action,actor,detail)values(id,'edited',rev.reviewer_email,jsonb_build_object('source','staff_review','action',p_action,'reason',case when p_action='return' then btrim(p_reason)else ''end,'revision',p_revision));
 perform set_config('app.staff_review_action','',true);
 return jsonb_build_object('ok',true,'request_id',id,'action',p_action);
end;$$;
revoke all on function public.act_staff_request_review(text,bigint,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.act_staff_request_review(text,bigint,timestamptz,text,text) to service_role;

create function public.edit_staff_review_request(p_hash text,p_revision bigint,p_id uuid,p_expected_updated_at timestamptz,p_raw_text text,p_parsed_data jsonb,p_applicant_name text,p_applicant_phone text,p_applicant_email text,p_company_staff_name_input text,p_customer_requests text,p_is_structured boolean,p_set_sns boolean,p_sns_promotion_requested boolean,p_set_rental boolean,p_rental_status text,p_requested_rental_plan_id uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.requests; rev public.request_staff_reviews; role text; result jsonb;
begin
 select * into q from public.requests where id=p_id for update;
 select * into rev from public.request_staff_reviews where request_id=p_id for update;
 role:=case when rev.reviewer_token_hash=p_hash then 'reviewer' when rev.requester_token_hash=p_hash then 'requester'else ''end;
 if q.id is null or role='' or rev.expires_at<now() or q.status<>'pending' or q.deleted_at is not null or q.processing_at is not null or q.kintone_record_id is not null or q.staff_review_revision<>p_revision or q.updated_at<>p_expected_updated_at then raise exception '申請が更新されています。リンクから開き直してください';end if;
 if not exists(select 1 from public.staff_members s where s.id=rev.staff_id and s.is_active and s.email=rev.reviewer_email) or role='requester' and q.staff_review_state<>'returned' or role='reviewer' and q.staff_review_state not in('pending','approved')then raise exception 'この状態では修正できません';end if;
 if p_company_staff_name_input is distinct from q.company_staff_name_input then raise exception '担当者は変更できません';end if;
 -- Reuse the established editor's atomic write, audit and validation pipeline.
 result:=public.edit_request_atomic(p_id,p_expected_updated_at,p_raw_text,p_parsed_data,p_applicant_name,p_applicant_phone,p_applicant_email,p_company_staff_name_input,p_customer_requests,p_is_structured,p_set_sns,p_sns_promotion_requested,p_set_rental,p_rental_status,p_requested_rental_plan_id,'staff-review:'||role,case when role='reviewer' then rev.reviewer_email else q.applicant_email end);
 return result;
end;$$;
revoke all on function public.edit_staff_review_request(text,bigint,uuid,timestamptz,text,jsonb,text,text,text,text,text,boolean,boolean,boolean,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.edit_staff_review_request(text,bigint,uuid,timestamptz,text,jsonb,text,text,text,text,text,boolean,boolean,boolean,boolean,text,uuid) to service_role;
create function public.claim_staff_review_mail(p_id uuid,p_role text,p_hash text,p_force boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.requests; r public.request_staff_reviews;
begin
 select * into q from public.requests where id=p_id for update;
 select * into r from public.request_staff_reviews where request_id=p_id for update;
 if not exists(select 1 from public.staff_members s where s.id=r.staff_id and s.is_active)then return null;end if;
 if q.status<>'pending' or q.deleted_at is not null or r.request_id is null or p_hash !~ '^[a-f0-9]{64}$' or p_role not in('reviewer','requester')then return null;end if;
 if p_role='reviewer' then
  if q.staff_review_state<>'pending' or not p_force and r.reviewer_sent_revision=q.staff_review_revision or r.reviewer_sending_at>now()-interval '2 minutes' then return null;end if;
  update public.request_staff_reviews set reviewer_email=(select email from public.staff_members where id=r.staff_id),reviewer_token_hash=p_hash,expires_at=now()+interval '30 days',reviewer_sending_at=now(),reviewer_mail_error=null where request_id=p_id;
 else
  if q.staff_review_state<>'returned' or not p_force and r.requester_sent_revision=q.staff_review_revision or r.requester_sending_at>now()-interval '2 minutes' then return null;end if;
  update public.request_staff_reviews set reviewer_email=(select email from public.staff_members where id=r.staff_id),requester_token_hash=p_hash,expires_at=now()+interval '30 days',requester_sending_at=now(),requester_mail_error=null where request_id=p_id;
 end if;
 return jsonb_build_object('revision',q.staff_review_revision,'email',(select email from public.staff_members where id=r.staff_id));
end;$$;
revoke all on function public.claim_staff_review_mail(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.claim_staff_review_mail(uuid,text,text,boolean) to service_role;
