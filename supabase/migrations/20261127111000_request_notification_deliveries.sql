begin;
create table public.request_notification_deliveries(
 request_id uuid not null references public.requests(id) on delete cascade,
 kind text not null check(kind in ('submitted','staff_approved','internal','extension')),
 recipient text not null,
 lease uuid,
 sending_at timestamptz,
 sent_at timestamptz,
 error text,
 primary key(request_id,kind,recipient)
);
alter table public.request_notification_deliveries enable row level security;
revoke all on public.request_notification_deliveries from public,anon,authenticated;
grant all on public.request_notification_deliveries to service_role;
create function public.claim_request_notification(p_id uuid,p_kind text,p_recipient text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare token uuid:=gen_random_uuid(); result uuid;
begin
 insert into public.request_notification_deliveries(request_id,kind,recipient) values(p_id,p_kind,lower(btrim(p_recipient))) on conflict do nothing;
 update public.request_notification_deliveries set lease=token,sending_at=now(),error=null
 where request_id=p_id and kind=p_kind and recipient=lower(btrim(p_recipient)) and sent_at is null and (sending_at is null or sending_at<now()-interval '2 minutes') returning lease into result;
 return result;
end;$$;
revoke all on function public.claim_request_notification(uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_request_notification(uuid,text,text) to service_role;
commit;
