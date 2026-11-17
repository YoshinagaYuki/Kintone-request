begin;
set local lock_timeout='5s';
create function public.company_portal_key(p_name text)returns text language plpgsql immutable set search_path='' as $$
declare n text;begin
 n:=lower(regexp_replace(normalize(coalesce(p_name,''),NFKC),'[[:space:]　]','','g'));
 n:=regexp_replace(n,'^(株式会社|\(株\))+','');n:=regexp_replace(n,'(株式会社|\(株\))+$','');
 return case when n='unity' then 'ユニティ' else n end;
end;$$;
revoke all on function public.company_portal_key(text) from public,anon;
grant execute on function public.company_portal_key(text) to authenticated,service_role;
alter table public.requests add column portal_company_key text generated always as(public.company_portal_key(coalesce(nullif(btrim(parsed_data->>'企業名'),''),nullif(btrim(parsed_data->>'取次店名'),'')))) stored;
create index requests_portal_company_key_idx on public.requests(portal_company_key) where deleted_at is null and status='registered';
create table public.company_portals(
 id uuid primary key,
 company_key text not null unique check(length(company_key) between 1 and 200),
 display_name text not null check(length(btrim(display_name)) between 1 and 200),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 token_ciphertext text not null,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 revoked_at timestamptz
);
alter table public.company_portals enable row level security;
-- Public URLs are resolved by server code. Neither anonymous clients nor signed-in clients can read credentials directly.
revoke all on public.company_portals from public,anon,authenticated;
grant all on public.company_portals to service_role;
create function public.manage_company_portal(p_actor uuid,p_action text,p_id uuid,p_name text,p_hash text,p_secret text,p_expected timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare prior public.company_portals; key text;
begin
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 if p_id is null or p_action is null or p_action not in('issue','rotate','revoke') then raise exception 'invalid portal action';end if;
 if p_action='issue' then
  key:=public.company_portal_key(p_name);
  if length(key)<1 or length(key)>200 or length(btrim(p_name))>200 then raise exception 'invalid company';end if;
  insert into public.company_portals(id,company_key,display_name,token_hash,token_ciphertext,created_by)values(p_id,key,btrim(p_name),p_hash,p_secret,p_actor);
 else
  select * into prior from public.company_portals where id=p_id for update;
  if prior.id is null then raise exception 'portal not found';end if;
  if p_expected is null or prior.updated_at<>p_expected then raise exception 'portal_stale';end if;
  if p_action='revoke' then update public.company_portals set revoked_at=now(),updated_at=now() where id=p_id;
  else update public.company_portals set token_hash=p_hash,token_ciphertext=p_secret,revoked_at=null,updated_at=now() where id=p_id;end if;
 end if;
 insert into public.inventory_audit_logs(table_name,record_id,actor_id,action,before_data,after_data)values('company_portals',p_id::text,p_actor,'COMPANY_PORTAL_'||upper(p_action),case when prior.id is null then null else jsonb_build_object('company',prior.display_name,'revoked',prior.revoked_at is not null)end,jsonb_build_object('company',coalesce(prior.display_name,p_name),'action',p_action));
end;$$;
revoke all on function public.manage_company_portal(uuid,text,uuid,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.manage_company_portal(uuid,text,uuid,text,text,text,timestamptz) to service_role;
commit;
