begin;
create table public.inventory_extension_flags(
 business text not null check(business in('allmight','tezukuru')),
 management_no text not null check(management_no ~ '^(0|[1-9][0-9]{0,19})$'),
 possible boolean not null default false,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key(business,management_no)
);
alter table public.inventory_extension_flags enable row level security;
revoke all on public.inventory_extension_flags from public,anon,authenticated;
grant select on public.inventory_extension_flags to authenticated;
create policy extension_flags_read on public.inventory_extension_flags for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger inventory_extension_flags_clock after insert or update on public.inventory_extension_flags for each statement execute function public.inventory_touch_clock();
create function public.set_inventory_extension_flag(p_actor uuid,p_business text,p_number text,p_possible boolean,p_previous boolean) returns void
language plpgsql security definer set search_path='' as $$
declare prior boolean;
begin
 if p_actor is null or p_business is null or p_business not in('allmight','tezukuru') or p_number is null or p_number !~ '^(0|[1-9][0-9]{0,19})$' or p_possible is null or p_previous is null then raise exception 'invalid flag';end if;
 if not exists(select 1 from public.admin_users a join public.admin_user_businesses b on b.admin_user_id=a.id join public.form_types f on f.id=b.form_type_id where a.auth_user_id=p_actor and a.status='active' and f.kintone_app_id=case when p_business='tezukuru' then 49 else 10 end) then raise exception 'business access required';end if;
 perform pg_advisory_xact_lock(hashtextextended('extension-flag:'||p_business||':'||p_number,0));
 select possible into prior from public.inventory_extension_flags where business=p_business and management_no=p_number for update;
 prior:=coalesce(prior,false);
 if prior=p_possible then return;end if;
 if prior<>p_previous then raise exception 'flag_changed';end if;
 insert into public.inventory_extension_flags(business,management_no,possible,updated_by)values(p_business,p_number,p_possible,p_actor)
 on conflict(business,management_no)do update set possible=excluded.possible,updated_by=excluded.updated_by,updated_at=now();
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('inventory_extension_flags',p_business||':'||p_number,p_actor,'EXTENSION_POSSIBILITY',jsonb_build_object('possible',prior),jsonb_build_object('possible',p_possible));
end;$$;
revoke all on function public.set_inventory_extension_flag(uuid,text,text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.set_inventory_extension_flag(uuid,text,text,boolean,boolean) to service_role;
commit;
