begin;
create or replace function public.cancel_inventory_copy_draft()returns trigger language plpgsql security definer set search_path=''as $$declare j public.inventory_copy_requests;s record;n int;begin
 if new.deleted_at is null and old.deleted_at is not null then update public.inventory_copy_requests set state='draft',updated_at=now()where id=new.id and state='cancelled';return new;end if;
 if new.deleted_at is null or old.deleted_at is not null then return new;end if;
 select * into j from public.inventory_copy_requests where id=new.id and state in('draft','failed')for update;
 if not found or coalesce((j.progress->>'recordAttempted')::boolean,false)or j.progress?'recordId'then return new;end if;
 for s in select * from jsonb_to_recordset(j.slots)as x(source_group text,group_key text,item_id uuid,continuity boolean)loop
 select unit_number into n from public.inventory_unit_assignments where group_key=s.group_key and item_id=s.item_id;
 if s.continuity is distinct from false and s.source_group is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(s.source_group,s.item_id,n,j.created_by)on conflict(group_key,item_id)do update set unit_number=excluded.unit_number,updated_by=excluded.updated_by,updated_at=now();end if;end loop;
 update public.inventory_copy_requests set state='cancelled',updated_at=now()where id=j.id;return new;
end;$$;
commit;
