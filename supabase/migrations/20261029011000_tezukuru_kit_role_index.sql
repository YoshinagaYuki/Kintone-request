begin;
set local lock_timeout='5s';
-- Background screen remains a singleton; each Tezukuru rental pool needs its own kit master.
drop index if exists public.inventory_one_background_screen;
create unique index inventory_one_background_screen on public.item_name_master(inventory_role) where inventory_role='background_screen';
commit;
