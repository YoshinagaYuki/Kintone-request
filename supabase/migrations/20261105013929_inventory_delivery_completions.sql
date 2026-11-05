begin;
set local lock_timeout = '5s';
create table public.inventory_delivery_completions (
  business text not null check (business in ('allmight', 'tezukuru')),
  delivery_id text not null check (delivery_id = encode(sha256(convert_to(delivery_key, 'UTF8')), 'hex')),
  delivery_key text not null check (length(delivery_key) between 1 and 10000),
  delivery_date date not null check (delivery_date between date '2000-01-01' and date '2100-12-31'),
  completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business, delivery_id),
  check ((completed and completed_at is not null) or (not completed and completed_at is null and completed_by is null))
);
create index inventory_delivery_completions_date_idx on public.inventory_delivery_completions(business, delivery_date);
create index inventory_delivery_completions_actor_idx on public.inventory_delivery_completions(updated_by) where updated_by is not null;
create index inventory_delivery_completions_completed_by_idx on public.inventory_delivery_completions(completed_by) where completed_by is not null;
alter table public.inventory_delivery_completions enable row level security;
revoke all on public.inventory_delivery_completions from public, anon, authenticated;
grant all on public.inventory_delivery_completions to service_role;
-- Only the authenticated, business-authorized server route reads or writes. No stock-clock trigger.
create function public.inventory_delivery_completion_stamp() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.completed then
    if tg_op = 'UPDATE' and old.completed then
      new.completed_at := old.completed_at;
    else
      new.completed_at := now();
      new.completed_by := new.updated_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;
revoke all on function public.inventory_delivery_completion_stamp() from public, anon, authenticated;
grant execute on function public.inventory_delivery_completion_stamp() to service_role;
create trigger inventory_delivery_completion_stamp before insert or update on public.inventory_delivery_completions
for each row execute function public.inventory_delivery_completion_stamp();
commit;
