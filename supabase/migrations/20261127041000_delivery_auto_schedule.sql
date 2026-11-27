begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke usage on schema net from public,anon,authenticated;
revoke execute on all functions in schema net from public,anon,authenticated;
select cron.schedule('rental-delivery-auto-status','*/30 * * * *',$job$
 select net.http_post(
  url:='https://kintone-request.vercel.app/api/cron/delivery-status',
  headers:=jsonb_build_object('Content-Type','application/json','X-Delivery-Automation-Token',token),
  body:='{}'::jsonb,timeout_milliseconds:=120000
 ) from public.inventory_delivery_automation_config where singleton and enabled;
$job$);
commit;
