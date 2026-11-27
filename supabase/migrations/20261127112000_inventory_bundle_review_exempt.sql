begin;
do $patch$
declare definition text; pos integer; ending integer;
begin
 select pg_get_functiondef(oid) into strict definition from pg_proc where pronamespace='public'::regnamespace and proname='save_inventory_bundle';
 pos:=strpos(lower(definition),'update public.requests set');
 if pos=0 then raise exception 'Bundle request update not found';end if;
 ending:=pos+strpos(substr(definition,pos),';');
 definition:=substr(definition,1,pos-1)||E'perform set_config(\'app.inventory_review_not_required\',\'1\',true);\n '||substr(definition,pos,ending-pos)||E'\n perform set_config(\'app.inventory_review_not_required\',\'0\',true);\n '||substr(definition,ending);
 execute definition;
end $patch$;
commit;
