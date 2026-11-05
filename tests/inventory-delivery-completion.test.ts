import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completionDelivery, completionInput, completionRange } from '../lib/inventory/delivery-completion';
import { deliveryRows } from '../lib/inventory/deliveries';
import type { InventoryRecord } from '../lib/inventory/model';
const record=(key:string,date='2026-11-05',number='1044'):InventoryRecord=>({itemId:'a',booking:{key,id:'case',group:key,kind:'request',staff:'担当者',store:'店舗',managementNo:number,status:'registered',start:date,end:date,delivery:date,pickup:'',from:date,to:date,href:''}});
test('completion requires an explicit boolean and a known business, never a truthy string or toggle',()=>{
 assert.deepEqual(completionInput({business:'allmight',key:'key',completed:false,updated_by:'forged'}),{business:'allmight',key:'key',completed:false});
 for(const value of [null,[],{business:'other',key:'key',completed:true},{business:'allmight',key:'',completed:true},{business:'allmight',key:'key',completed:'false'},{business:'allmight',key:'key'}])assert.throws(()=>completionInput(value));
});
test('completion read periods reject invalid or unbounded ranges but accept a cross-year week',()=>{
 assert.deepEqual(completionRange('2026-12-28','2027-01-01'),{from:'2026-12-28',to:'2027-01-01'});
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-11-06','2026-11-05'],['2026-01-01','2026-12-31']])assert.throws(()=>completionRange(from,to));
});
test('completion targets one aggregated case and delivery day; a different day or no-delivery case cannot reuse the check',()=>{
 const records=[record('a'),record('b')];const items=[{id:'a',name:'A'}];
 const rows=deliveryRows(records,items);assert.equal(rows.length,1);assert.equal(completionDelivery(rows,rows[0].key).contents[0].quantity,2);
 const moved=deliveryRows(records.map(r=>({...r,booking:{...r.booking,delivery:'2026-11-06'}})),items);
 assert.throws(()=>completionDelivery(moved,rows[0].key));
 assert.throws(()=>completionDelivery(deliveryRows(records.map(r=>({...r,booking:{...r.booking,deliveryRequired:false}})),items),rows[0].key));
 assert.equal(rows[0].key,deliveryRows([...records].reverse(),items)[0].key);
});
test('different unnumbered requests and different delivery days keep independent completion keys',()=>{
 const a=record('a','2026-11-05',''),b=record('b','2026-11-05','');b.booking.id='other';
 const rows=deliveryRows([a,b,record('c','2026-11-06','')],[{id:'a',name:'A'}]);
 assert.equal(new Set(rows.map(r=>r.key)).size,3);
});
