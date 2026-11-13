begin;
set local lock_timeout='5s';
alter table public.requests add column company_name text generated always as (coalesce(nullif(btrim(parsed_data->>'企業名'),''),nullif(btrim(parsed_data->>'取次店名'),''))) stored;
create index requests_company_name_idx on public.requests(company_name);
comment on column public.requests.company_name is 'Company from application data; historical values reconciled by business and management number';
commit;
