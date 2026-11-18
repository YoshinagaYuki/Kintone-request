-- Preserve physical labels when the first unit is managed as a separate product.
alter table public.item_name_master add column unit_number_start integer not null default 1 check(unit_number_start between 1 and 250);
-- Inventory/application variant names may share a supported kintone equipment choice.
alter table public.item_name_master add column kintone_name text check(kintone_name is null or length(kintone_name) between 1 and 200);
