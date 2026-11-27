begin;
create function public.invalidate_delivery_auto_identity(p_business text,p_key text,p_fingerprint text) returns void
language sql security invoker set search_path='' as $$
 update public.inventory_delivery_completions set completed=false,auto_checked_at=null,auto_status='配送伝票が変更されたため再確認が必要です',auto_lease=null,auto_lease_until=null
 where business=p_business and delivery_id=encode(sha256(convert_to(p_key,'UTF8')),'hex') and completed and completion_source='seino' and not auto_disabled and auto_fingerprint=p_fingerprint;
$$;
revoke all on function public.invalidate_delivery_auto_identity(text,text,text) from public,anon,authenticated;
grant execute on function public.invalidate_delivery_auto_identity(text,text,text) to service_role;
commit;
