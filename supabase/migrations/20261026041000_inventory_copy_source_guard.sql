begin;
create or replace function public.protect_inventory_copy_request()returns trigger language plpgsql security definer set search_path=''as $$begin
 if exists(select 1 from public.inventory_copy_requests where state<>'cancelled'and source_snapshot->>'source_request_id'=old.id::text)and(new.parsed_data is distinct from old.parsed_data or new.deleted_at is distinct from old.deleted_at or new.form_type_id is distinct from old.form_type_id)then raise exception '元の申請にはコピー先があります。元を変更する前にコピー先を確認してください';end if;
 if exists(select 1 from public.inventory_copy_requests where id=old.id and(state in('running','complete')or coalesce((progress->>'recordAttempted')::boolean,false)or progress?'recordId'))and(new.parsed_data is distinct from old.parsed_data or new.deleted_at is distinct from old.deleted_at or new.form_type_id is distinct from old.form_type_id)then raise exception '登録処理を開始したコピー申請は内容を変更できません。連携状態を確認してください';end if;return new;end;$$;
commit;
