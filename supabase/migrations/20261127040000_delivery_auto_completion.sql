begin;
set local lock_timeout='5s';
alter table public.inventory_delivery_completions
 add column completion_source text not null default 'manual' check(completion_source in ('manual','seino')),
 add column auto_disabled boolean not null default false,
 add column auto_checked_at timestamptz,
 add column auto_status text,
 add column auto_fingerprint text,
 add column auto_lease uuid,
 add column auto_lease_until timestamptz;
-- A previously unchecked saved row represents an explicit manual decision.
update public.inventory_delivery_completions set auto_disabled=true where not completed;
create function public.claim_delivery_auto_check(p_business text,p_key text,p_date date,p_fingerprint text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id text:=encode(sha256(convert_to(p_key,'UTF8')),'hex'); v_lease uuid:=gen_random_uuid(); v_result uuid;
begin
 if p_business not in ('allmight','tezukuru') or length(p_fingerprint)<>64 then raise exception 'Invalid delivery check'; end if;
 insert into public.inventory_delivery_completions(business,delivery_id,delivery_key,delivery_date)
 values(p_business,v_id,p_key,p_date) on conflict do nothing;
 update public.inventory_delivery_completions set completed=case when completion_source='seino' and auto_fingerprint is distinct from p_fingerprint then false else completed end,auto_lease=v_lease,auto_lease_until=now()+interval '2 minutes'
 where business=p_business and delivery_id=v_id and (not completed or completion_source='seino' and auto_fingerprint is distinct from p_fingerprint) and not auto_disabled
 and (auto_lease_until is null or auto_lease_until<now())
 and (auto_checked_at is null or auto_checked_at<now()-interval '15 minutes' or auto_fingerprint is distinct from p_fingerprint)
 returning auto_lease into v_result;
 return v_result;
end;$$;
create function public.finish_delivery_auto_check(p_business text,p_key text,p_lease uuid,p_fingerprint text,p_delivered boolean,p_status text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_delivered and p_status<>'配達済み' then raise exception 'Unverified delivery'; end if;
 update public.inventory_delivery_completions set
 auto_checked_at=now(),auto_fingerprint=p_fingerprint,auto_status=left(p_status,120),auto_lease=null,auto_lease_until=null,
 completed=case when p_delivered then true else completed end,
 completion_source=case when p_delivered then 'seino' else completion_source end,updated_by=null
 where business=p_business and delivery_id=encode(sha256(convert_to(p_key,'UTF8')),'hex')
 and auto_lease=p_lease and not completed and not auto_disabled;
end;$$;
revoke all on function public.claim_delivery_auto_check(text,text,date,text) from public,anon,authenticated;
revoke all on function public.finish_delivery_auto_check(text,text,uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_delivery_auto_check(text,text,date,text) to service_role;
grant execute on function public.finish_delivery_auto_check(text,text,uuid,text,boolean,text) to service_role;
create table public.inventory_delivery_automation_config(
 singleton boolean primary key default true check(singleton),
 token text not null default encode(extensions.gen_random_bytes(32),'hex'),
 enabled boolean not null default false
);
alter table public.inventory_delivery_automation_config enable row level security;
revoke all on public.inventory_delivery_automation_config from public,anon,authenticated;
grant all on public.inventory_delivery_automation_config to service_role;
insert into public.inventory_delivery_automation_config(singleton) values(true);
commit;
