begin;
create table public.inventory_copy_requests(
 id uuid primary key references public.requests(id), child_request_id uuid not null unique references public.requests(id),parent_key text not null,
 source_key text not null,source_snapshot jsonb not null,slots jsonb not null,
 state text not null default 'draft'check(state in('draft','running','failed','complete','cancelled')),progress jsonb not null default '{}',last_error text,
 lease_token uuid,lease_at timestamptz,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),input_hash text not null
);
create unique index inventory_copy_one_active on public.inventory_copy_requests(parent_key)where state<>'cancelled';
alter table public.inventory_copy_requests enable row level security;
revoke all on public.inventory_copy_requests from public,anon,authenticated;
grant select on public.inventory_copy_requests to authenticated;grant all on public.inventory_copy_requests to service_role;
create policy inventory_copy_read on public.inventory_copy_requests for select to authenticated using(exists(select 1 from public.admin_users where auth_user_id=auth.uid() and status='active'));
create trigger inventory_copy_clock after insert or update or delete on public.inventory_copy_requests for each statement execute function public.inventory_touch_clock();
create function public.create_inventory_copy(p_actor uuid,p_id uuid,p_hash text,p_expected bigint,p_parent_key text,p_source_key text,p_snapshot jsonb,p_slots jsonb,p_form uuid,p_version int,p_parsed jsonb,p_raw text,p_staff text,p_candidate jsonb,p_existing jsonb)returns uuid language plpgsql security definer set search_path=''as $$declare prior public.inventory_copy_requests;s record;who text;begin
 perform pg_advisory_xact_lock(842917,24);
 select coalesce(display_name,email)into who from public.admin_users where auth_user_id=p_actor and status='active';if who is null then raise exception 'active administrator required';end if;
 select * into prior from public.inventory_copy_requests where id=p_id;if found then if prior.created_by=p_actor and prior.input_hash=p_hash then return p_id;else raise exception 'copy_mismatch';end if;end if;
 if p_expected is null or p_expected<>(select version from public.inventory_change_clock where id=1)then raise exception 'inventory_stale';end if;
 if not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id join public.form_types f on f.id=b.form_type_id where u.auth_user_id=p_actor and b.form_type_id=p_form and f.kintone_app_id=10)then raise exception 'business administrator required';end if;
 if jsonb_array_length(p_slots)not between 1 and 5 then raise exception 'invalid equipment count';end if;
 perform public.inventory_assert_conflicts(p_candidate,p_existing);
 insert into public.requests(id,form_type_id,form_type_version,raw_text,parsed_data,status,company_staff_name_input,is_structured,allmight_delivery_arrangement,allmight_pickup_arrangement)values(p_id,p_form,p_version,p_raw,p_parsed,'pending',p_staff,true,case when p_parsed->>'_inventory_delivery_required'='true'then 'normal'else null end,case when p_parsed->>'_inventory_pickup_required'='true'then 'normal'else null end);
 insert into public.inventory_copy_requests(id,child_request_id,parent_key,source_key,source_snapshot,slots,created_by,input_hash)values(p_id,p_id,p_parent_key,p_source_key,p_snapshot,p_slots,p_actor,p_hash);
 for s in select * from jsonb_to_recordset(p_slots)as x(slot int,item_id uuid,group_key text,unit_number int,screen_quantity int)loop
 insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(s.group_key,s.item_id,s.unit_number,p_actor)on conflict(group_key,item_id)do update set unit_number=excluded.unit_number,updated_by=p_actor,updated_at=now();
 insert into public.inventory_booking_edits(booking_key,patch,updated_by)values('request:'||p_id::text||':'||s.slot,jsonb_build_object('from',least(p_parsed->>'利用開始日',nullif(p_parsed->>'配送日付','')),'to',greatest(p_parsed->>'利用最終日',p_parsed->>'集荷日付'),'deliveryRequired',(p_parsed->>'_inventory_delivery_required')::boolean,'pickupRequired',(p_parsed->>'_inventory_pickup_required')::boolean,'screenQuantity',s.screen_quantity),p_actor);
 end loop;
 insert into public.request_histories(request_id,action,actor,detail)values(p_id,'submitted',who,jsonb_build_object('kind','inventory_copy','source_key',p_source_key,'parent_management_no',p_snapshot->>'management_no','billing_month',p_parsed->>'◯月分として請求','copied_equipment',jsonb_array_length(p_slots)));
 return p_id;
end;$$;
create function public.claim_inventory_copy(p_id uuid,p_actor uuid,p_token uuid)returns jsonb language plpgsql security definer set search_path=''as $$declare j public.inventory_copy_requests;r public.requests;begin
 if not exists(select 1 from public.admin_users where auth_user_id=p_actor and status='active')then raise exception 'active administrator required';end if;
 select * into j from public.inventory_copy_requests where id=p_id for update;if not found then raise exception 'copy not found';end if;
 select * into r from public.requests where id=p_id for update;
 if not exists(select 1 from public.admin_users u join public.admin_user_businesses b on b.admin_user_id=u.id where u.auth_user_id=p_actor and b.form_type_id=r.form_type_id)then raise exception 'business administrator required';end if;
 if j.state='complete'then return jsonb_build_object('complete',true,'job',to_jsonb(j));end if;
 if r.deleted_at is not null or r.status not in('approved','register_failed')then raise exception 'approval required';end if;
 if j.lease_token is not null and j.lease_at>now()-interval '5 minutes'then return jsonb_build_object('busy',true);end if;
 update public.inventory_copy_requests set state='running',lease_token=p_token,lease_at=now(),last_error=null,updated_at=now()where id=p_id returning * into j;
 update public.requests set processing_at=now(),processing_token=p_token where id=p_id;return jsonb_build_object('job',to_jsonb(j));
end;$$;
create function public.finish_inventory_copy(p_id uuid,p_token uuid,p_record text,p_number text)returns void language plpgsql security definer set search_path=''as $$declare j public.inventory_copy_requests;begin
 select * into j from public.inventory_copy_requests where id=p_id for update;if not found or j.lease_token is distinct from p_token or j.state<>'running'then raise exception 'copy ownership lost';end if;
 if p_record is null or p_number is null or p_number!~'^[0-9]+$'or p_number=j.source_snapshot->>'management_no'then raise exception 'new identity required';end if;
 update public.requests set status='registered',kintone_record_id=p_record,management_no=p_number,processing_at=null,processing_token=null where id=p_id;
 update public.inventory_copy_requests set state='complete',lease_token=null,lease_at=null,last_error=null,updated_at=now()where id=p_id;
 insert into public.request_histories(request_id,action,actor,detail)values(p_id,'shipping_synced',j.created_by::text,jsonb_build_object('kind','inventory_copy','management_no',p_number,'source_key',j.source_key));
end;$$;
revoke all on function public.create_inventory_copy(uuid,uuid,text,bigint,text,text,jsonb,jsonb,uuid,int,jsonb,text,text,jsonb,jsonb),public.claim_inventory_copy(uuid,uuid,uuid),public.finish_inventory_copy(uuid,uuid,text,text)from public,anon,authenticated;
grant execute on function public.create_inventory_copy(uuid,uuid,text,bigint,text,text,jsonb,jsonb,uuid,int,jsonb,text,text,jsonb,jsonb),public.claim_inventory_copy(uuid,uuid,uuid),public.finish_inventory_copy(uuid,uuid,text,text)to service_role;
create function public.protect_inventory_copy_request()returns trigger language plpgsql security definer set search_path=''as $$begin
 if exists(select 1 from public.inventory_copy_requests where id=old.id and(state in('running','complete')or coalesce((progress->>'recordAttempted')::boolean,false)or progress?'recordId'))and(new.parsed_data is distinct from old.parsed_data or new.deleted_at is distinct from old.deleted_at or new.form_type_id is distinct from old.form_type_id)then raise exception '登録処理を開始したコピー申請は内容を変更できません。連携状態を確認してください';end if;return new;end;$$;
create trigger protect_inventory_copy_request before update on public.requests for each row execute function public.protect_inventory_copy_request();
create function public.cancel_inventory_copy_draft()returns trigger language plpgsql security definer set search_path=''as $$declare j public.inventory_copy_requests;s record;n int;begin
 if new.deleted_at is null and old.deleted_at is not null then update public.inventory_copy_requests set state='draft',updated_at=now()where id=new.id and state='cancelled';return new;end if;
 if new.deleted_at is null or old.deleted_at is not null then return new;end if;
 select * into j from public.inventory_copy_requests where id=new.id and state in('draft','failed')for update;
 if not found or coalesce((j.progress->>'recordAttempted')::boolean,false)or j.progress?'recordId'then return new;end if;
 for s in select * from jsonb_to_recordset(j.slots)as x(source_group text,group_key text,item_id uuid)loop
 select unit_number into n from public.inventory_unit_assignments where group_key=s.group_key and item_id=s.item_id;
 if s.source_group is not null then insert into public.inventory_unit_assignments(group_key,item_id,unit_number,updated_by)values(s.source_group,s.item_id,n,j.created_by)on conflict(group_key,item_id)do update set unit_number=excluded.unit_number,updated_by=excluded.updated_by,updated_at=now();end if;end loop;
 update public.inventory_copy_requests set state='cancelled',updated_at=now()where id=j.id;return new;
end;$$;
create trigger cancel_inventory_copy_draft after update on public.requests for each row execute function public.cancel_inventory_copy_draft();
commit;
