import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestDateSnapshot,applyRequestDates,assertTransferredDates} from '../lib/kintone/request-dates';
import {upsertShippingRecord} from '../lib/kintone/shipping';

test('customer dates transfer without timezone or warehouse/day offsets, including New Year and charter same-day',()=>{
 const normal={'利用開始日':'2026-12-15','利用最終日':'2026-12-26','配送日付':'2026-12-14','集荷日付':'2026-12-27'};
 assert.deepEqual(requestDateSnapshot(normal,10),{'日付_0':'2026-12-15','日付_1':'2026-12-26','納品_日付':'2026-12-14','集荷_日付':'2026-12-27'});
 const custom=requestDateSnapshot({...normal,'集荷日付':'2027-01-04'},10);assert.equal(custom['集荷_日付'],'2027-01-04');assert.equal(custom['日付_1'],'2026-12-26');
 assert.equal(requestDateSnapshot({...normal,'集荷日付':'2026-12-26'},10)['集荷_日付'],'2026-12-26');
 assert.throws(()=>requestDateSnapshot({...normal,'集荷日付':'2026-02-30'},10));
});
test('cancellation clears the customer date and read-back rejects even a one-day mismatch',()=>{
 const dates=requestDateSnapshot({'利用開始日':'2026-12-01','利用最終日':'2026-12-31','集荷日付':'2027-01-01',_inventory_pickup_required:false},10);
 assert.equal(dates['集荷_日付'],'');
 const record={'集荷_日付':{value:'wrong'}};applyRequestDates(record,dates);assertTransferredDates(dates,record,'fixture');assert.throws(()=>assertTransferredDates(dates,{'集荷_日付':{value:'2027-01-01'}},'fixture'),/集荷日/);
 assert.deepEqual(requestDateSnapshot({},49),{});
});
test('shipping upsert clears cancelled dates and verifies the actual saved dates before success',async(t)=>{
 const oldDomain=process.env.KINTONE_DOMAIN,oldToken=process.env.KINTONE_API_TOKEN;process.env.KINTONE_DOMAIN='fixture.invalid';process.env.KINTONE_API_TOKEN='fixture';t.after(()=>{if(oldDomain===undefined)delete process.env.KINTONE_DOMAIN;else process.env.KINTONE_DOMAIN=oldDomain;if(oldToken===undefined)delete process.env.KINTONE_API_TOKEN;else process.env.KINTONE_API_TOKEN=oldToken;});
 let record:Record<string,{value:unknown}>={'管理番号':{value:'123'},'納品_日付':{value:'2026-12-01'},'集荷_日付':{value:'2027-01-01'}};let corrupt=false;let writes=0;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));if(url.pathname.endsWith('/records.json'))return Response.json({records:[{'$id':{value:'7'}}]});if(init?.method==='PUT'){const payload=JSON.parse(String(init.body));Object.assign(record,payload.record);writes++;if(corrupt)record['集荷_日付']={value:'2027-01-05'};return Response.json({revision:'2'});}return Response.json({record:{...record,'$revision':{value:'2'}}});});
 await upsertShippingRecord('123',{'納品_日付':{value:'2026-12-01'},'集荷_日付':{value:''}},{verifyDates:true});assert.equal(record['集荷_日付'].value,'');assert.equal(writes,1);
 corrupt=true;await assert.rejects(upsertShippingRecord('123',{'納品_日付':{value:'2026-12-01'},'集荷_日付':{value:'2027-01-04'}},{verifyDates:true}),/日付照合に失敗/);
});
test('new shipping records are read back, and retry reuses the same record after a verification failure',async(t)=>{
 const prior={domain:process.env.KINTONE_DOMAIN,token:process.env.KINTONE_API_TOKEN};process.env.KINTONE_DOMAIN='fixture.invalid';process.env.KINTONE_API_TOKEN='fixture';t.after(()=>{if(prior.domain===undefined)delete process.env.KINTONE_DOMAIN;else process.env.KINTONE_DOMAIN=prior.domain;if(prior.token===undefined)delete process.env.KINTONE_API_TOKEN;else process.env.KINTONE_API_TOKEN=prior.token;});
 let saved:Record<string,{value:unknown}>|null=null,created=0,corrupt=true;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=new URL(String(input)).pathname;
  if(path.endsWith('/records.json'))return Response.json({records:saved?[{'$id':{value:'9'}}]:[]});
  if(init?.method==='POST'){saved=JSON.parse(String(init.body)).record;created++;return Response.json({id:'9',revision:'1'});}
  if(init?.method==='PUT'){Object.assign(saved!,JSON.parse(String(init.body)).record);return Response.json({revision:'2'});}
  return Response.json({record:{...saved,...(corrupt?{'集荷_日付':{value:'2026-12-28'}}:{}),'$revision':{value:'2'}}});
 });
 const source={'納品_日付':{value:'2026-12-14'},'集荷_日付':{value:'2026-12-27'}};
 await assert.rejects(upsertShippingRecord('1203',source,{verifyDates:true}),/日付照合に失敗/);corrupt=false;
 assert.deepEqual(await upsertShippingRecord('1203',source,{verifyDates:true}),{created:false,recordId:'9'});assert.equal(created,1);
});
