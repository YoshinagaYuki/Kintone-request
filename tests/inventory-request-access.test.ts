import {test} from "node:test";
import {strict as assert} from "node:assert";
import type {SupabaseClient} from "@supabase/supabase-js";
import {canManageInventoryRequest} from "../lib/inventory/request-access";
function fixture(overrides:Record<string,unknown[]>={}){
 const tables:Record<string,unknown[]>={admin_users:[{id:"admin",auth_user_id:"actor",status:"active"}],requests:[{id:"request",form_type_id:"allmight","form_types.kintone_app_id":10}],admin_user_businesses:[{admin_user_id:"admin",form_type_id:"allmight"}],...overrides};
 return {from(table:string){let rows=tables[table] as Record<string,unknown>[];return {select(){return this;},eq(key:string,value:unknown){rows=rows.filter(row=>row[key]===value);return this;},in(key:string,values:unknown[]){rows=rows.filter(row=>values.includes(row[key]));return this;},async maybeSingle(){return {data:rows[0]??null,error:null};}};}} as unknown as SupabaseClient;
}
test("extension requires active administrator and assignment to the exact supported business request",async()=>{
 assert.equal(await canManageInventoryRequest(fixture(),"request","actor"),true);
 assert.equal(await canManageInventoryRequest(fixture({admin_user_businesses:[{admin_user_id:"admin",form_type_id:"tezukuru"}]}),"request","actor"),false);
 assert.equal(await canManageInventoryRequest(fixture({admin_users:[{id:"admin",auth_user_id:"actor",status:"disabled"}]}),"request","actor"),false);
 assert.equal(await canManageInventoryRequest(fixture(),"missing","actor"),false);
 assert.equal(await canManageInventoryRequest(fixture({requests:[{id:"request",form_type_id:"tezukuru","form_types.kintone_app_id":49}]}),"request","actor"),false);
});

test("Tezukuru inventory requires the Tezukuru assignment, and unrelated app IDs are rejected",async()=>{
 const requests=[{id:'request',form_type_id:'tezukuru','form_types.kintone_app_id':49}],assigned=[{admin_user_id:'admin',form_type_id:'tezukuru'}];
 assert.equal(await canManageInventoryRequest(fixture({requests,admin_user_businesses:assigned}),'request','actor',[49]),true);
 assert.equal(await canManageInventoryRequest(fixture({requests:[{id:'request',form_type_id:'tezukuru','form_types.kintone_app_id':99}],admin_user_businesses:assigned}),'request','actor',[49]),false);
});
