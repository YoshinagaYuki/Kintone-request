import {test} from 'node:test';import assert from 'node:assert/strict';
import {assignBatchUnits} from '../lib/inventory/batch-unit-allocation';
import type {InventoryModel,InventoryRecord} from '../lib/inventory/model';
const make=(id:string,number:number|null=null,itemId='item'):InventoryRecord=>({itemId,booking:{id,key:id,group:id,kind:'hold',staff:'担当',store:'店舗',managementNo:'',status:'hold',unitNumber:number,start:'2026-12-11',end:'2026-12-13',delivery:'2026-12-10',pickup:'2026-12-14',from:'2026-12-10',to:'2026-12-14',href:''}});
const model=(blocked:number[],total=8,reserve=0)=>({items:[{id:'item',name:'機器',total_count:total,reserve_count:reserve},{id:'other',name:'別商品',total_count:total,reserve_count:reserve}],records:blocked.map(n=>make(`old-${n}`,n))} as InventoryModel);
const numbers=(rows:InventoryRecord[])=>rows.map(r=>r.booking.unitNumber);
test('one case prefers adjacent units over an earlier isolated gap, including repeated item lines',()=>{
 const m=model([1,3]);const rows=[make('new-a'),make('new-b')];
 const result=assignBatchUnits(m,rows,['auto','auto']);assert.deepEqual(numbers(result),[4,5]);
 assert.deepEqual(numbers(rows),[null,null]);assert.deepEqual(numbers(m.records),[1,3]);
});
test('fragmented stock still allocates available gaps without moving existing reservations',()=>{
 const m=model([1,3,5,7],7);assert.deepEqual(numbers(assignBatchUnits(m,[make('a'),make('b'),make('c')],['auto','auto','auto'])),[2,4,6]);
});
test('manual numbers and intentionally unassigned units are preserved, and other contents stay independent',()=>{
 const m=model([1,3]);const result=assignBatchUnits(m,[make('a'),make('b'),make('c'),make('other-a',null,'other')],['auto',4,null,'auto']);
 assert.deepEqual(numbers(result),[5,4,null,1]);
});
test('adjacency never consumes reserve stock or ignores return turnaround',()=>{
 const m=model([1],5,1);const near=make('recent',2);near.booking.start='2026-12-06';near.booking.end='2026-12-08';near.booking.delivery='2026-12-05';near.booking.pickup='2026-12-09';near.booking.from='2026-12-05';near.booking.to='2026-12-09';m.records.push(near);
 assert.deepEqual(numbers(assignBatchUnits(m,[make('a'),make('b')],['auto','auto'])),[3,4]);
 assert.throws(()=>assignBatchUnits(m,[make('a'),make('b'),make('c')],['auto','auto','auto']),/空いている番号/);
});
test('retrying the same hold keys retains saved assignments instead of allocating a second block',()=>{
 const m=model([1,3]),rows=[make('new-a'),make('new-b')];const saved=assignBatchUnits(m,rows,['auto','auto']);
 m.records.push(...saved);
 assert.deepEqual(numbers(assignBatchUnits(m,rows,['auto','auto'])),[4,5]);
});
