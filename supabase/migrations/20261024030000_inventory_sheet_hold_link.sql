begin;
-- Explicit, audited reconciliation of a source reservation to an existing hold.
-- Read permissions remain administrator-only; clients cannot change these links.
alter table public.inventory_sheet_entries add column hold_id uuid references public.inventory_holds(id) on delete restrict;
alter table public.inventory_sheet_entries add constraint inventory_sheet_single_link check(not (request_id is not null and hold_id is not null));
commit;
