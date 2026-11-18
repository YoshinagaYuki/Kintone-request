-- Keep the existing request-level arrangement editor and inventory editor ordered
-- without rewriting immutable copy-invoice JSON or other application fields.
alter table public.requests add column allmight_arrangement_updated_at timestamptz;
create function public.touch_request_arrangement_time() returns trigger language plpgsql set search_path='' as $$begin new.allmight_arrangement_updated_at=clock_timestamp();return new;end;$$;
revoke all on function public.touch_request_arrangement_time() from public,anon,authenticated;
create trigger request_arrangement_time before update of allmight_delivery_arrangement,allmight_pickup_arrangement,allmight_delivery_time,allmight_pickup_time on public.requests for each row execute function public.touch_request_arrangement_time();
