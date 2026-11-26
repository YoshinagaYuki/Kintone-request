-- Explicit internal registration is final-reviewed by the signed-in Unity admin.
-- Only the service endpoint can call this; public application metadata cannot bypass review.
create function public.confirm_internal_inventory_review(p_id uuid,p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
declare q public.requests;
begin
 select * into q from public.requests where id=p_id for update;
 if q.id is null or q.status<>'pending' or q.processing_at is not null or q.deleted_at is not null
 or coalesce(q.parsed_data->>'_inventory_skip_applicant_contact','false')<>'true'
 or not exists(select 1 from public.inventory_confirmation_sources c where c.request_id=p_id and c.created_by=p_actor)
 or not exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id where a.auth_user_id=p_actor and a.status='active' and b.form_type_id=q.form_type_id)
 then raise exception '社内本登録の権限・保存内容を確認してください';end if;
 perform set_config('app.staff_review_action','1',true);
 update public.requests set staff_review_state='not_required',staff_review_staff_id=null,staff_review_revision=staff_review_revision+1 where id=p_id;
 perform set_config('app.staff_review_action','',true);
end;$$;
revoke all on function public.confirm_internal_inventory_review(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_internal_inventory_review(uuid,uuid) to service_role;
