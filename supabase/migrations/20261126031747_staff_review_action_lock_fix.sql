create or replace function public.act_staff_request_review(p_hash text,p_revision bigint,p_updated timestamptz,p_action text,p_reason text default '') returns jsonb language plpgsql security invoker set search_path='' as $$
declare q public.requests; rev public.request_staff_reviews; v_id uuid;
begin
 select request_id into v_id from public.request_staff_reviews where reviewer_token_hash=p_hash;
 select * into q from public.requests where requests.id=v_id for update;
 select * into rev from public.request_staff_reviews where request_id=v_id for update;
 if q.id is null or rev.expires_at<now() or q.deleted_at is not null or q.status<>'pending' or q.processing_at is not null or q.kintone_record_id is not null or not exists(select 1 from public.staff_members s where s.id=rev.staff_id and s.is_active and s.email=rev.reviewer_email)then raise exception 'リンクが無効か、この申請は確認できません';end if;
 if p_revision is null or p_updated is null or q.staff_review_revision<>p_revision or q.updated_at<>p_updated or q.staff_review_state<>'pending' then raise exception '申請が更新されています。再読み込みしてください';end if;
 if p_action is null or p_action not in('approve','return') or p_action='return' and length(btrim(p_reason)) not between 1 and 2000 then raise exception '差し戻す理由を入力してください';end if;
 perform set_config('app.staff_review_action','1',true);
 update public.requests set staff_review_state=case when p_action='approve' then 'approved'else 'returned'end where requests.id=v_id;
 update public.request_staff_reviews set reason=case when p_action='return' then btrim(p_reason)else ''end,reviewed_at=now(),requester_token_hash=null,requester_sent_revision=null where request_id=v_id;
 insert into public.request_histories(request_id,action,actor,detail)values(v_id,'edited',rev.reviewer_email,jsonb_build_object('source','staff_review','action',p_action,'reason',case when p_action='return' then btrim(p_reason)else ''end,'revision',p_revision));
 perform set_config('app.staff_review_action','',true);
 return jsonb_build_object('ok',true,'request_id',v_id,'action',p_action);
end;$$;
revoke all on function public.act_staff_request_review(text,bigint,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.act_staff_request_review(text,bigint,timestamptz,text,text) to service_role;
