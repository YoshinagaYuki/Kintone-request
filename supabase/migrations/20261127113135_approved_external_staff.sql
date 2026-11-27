begin;
alter table public.requests add column approved_staff_external boolean not null default false;
create function public.guard_approved_external_staff() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (tg_op='INSERT' and new.approved_staff_external) or (tg_op='UPDATE' and new.approved_staff_external is distinct from old.approved_staff_external) then
  if current_user not in('postgres','service_role') then
   if not exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id where a.auth_user_id=auth.uid() and a.status='active' and b.form_type_id=new.form_type_id) then raise exception 'business administrator required for external staff';end if;
  end if;
 end if;
 return new;
end;$$;
revoke all on function public.guard_approved_external_staff() from public,anon,authenticated;
create trigger requests_guard_external_staff before insert or update on public.requests for each row execute function public.guard_approved_external_staff();
commit;
