-- Service-only, scoped administrative review actions. No registration side effects.
create function public.admin_staff_review_action(p_id uuid,p_actor uuid,p_revision bigint,p_action text,p_reason text default '',p_hash text default null,p_role text default 'reviewer')returns void language plpgsql security invoker set search_path='' as $$
declare q public.requests; who text; rev public.request_staff_reviews;
begin
 select * into q from public.requests where id=p_id for update;
 select coalesce(a.display_name,a.email)into who from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id where a.auth_user_id=p_actor and a.status='active' and b.form_type_id=q.form_type_id;
 if who is null then raise exception '担当事業の管理者のみ操作できます';end if;
 if q.deleted_at is not null or q.status<>'pending' or q.processing_at is not null or q.kintone_record_id is not null or q.staff_review_state not in('pending','returned') or q.staff_review_revision<>p_revision then raise exception '申請の状態が変わりました。画面を更新してください';end if;
 select * into rev from public.request_staff_reviews where request_id=p_id for update;
 if rev.request_id is null then raise exception '担当者確認の設定を確認してください';end if;
 if p_action='override' then
  if length(btrim(p_reason))not between 1 and 1000 then raise exception '代理承認の理由を入力してください（1000文字まで）';end if;
  perform set_config('app.staff_review_action','1',true);
  update public.requests set staff_review_state='approved',staff_review_revision=staff_review_revision+1 where id=p_id;
  perform set_config('app.staff_review_action','',true);
  update public.request_staff_reviews set reviewed_at=now(),reviewer_token_hash=null,requester_token_hash=null,reason=btrim(p_reason)where request_id=p_id;
 elsif p_action='link' then
  if p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_role not in('reviewer','requester') or(p_role='requester' and q.staff_review_state<>'returned')then raise exception '再発行の内容を確認してください';end if;
  if not exists(select 1 from public.staff_members s where s.id=rev.staff_id and s.is_active)then raise exception '担当者が無効です。マスターを確認してください';end if;
  update public.request_staff_reviews set reviewer_token_hash=case when p_role='reviewer' then p_hash else reviewer_token_hash end,requester_token_hash=case when p_role='requester' then p_hash else requester_token_hash end,reviewer_email=(select s.email from public.staff_members s where s.id=rev.staff_id),expires_at=now()+interval '30 days' where request_id=p_id;
 else raise exception '操作が不正です';end if;
 insert into public.request_histories(request_id,action,actor,detail)values(p_id,'edited',who,jsonb_build_object('kind',case when p_action='override'then 'staff_review_admin_override'else 'staff_review_link_reissued'end,'reason',case when p_action='override'then btrim(p_reason)else null end,'role',p_role,'revision',p_revision));
end;$$;
revoke all on function public.admin_staff_review_action(uuid,uuid,bigint,text,text,text,text)from public,anon,authenticated;
grant execute on function public.admin_staff_review_action(uuid,uuid,bigint,text,text,text,text)to service_role;
