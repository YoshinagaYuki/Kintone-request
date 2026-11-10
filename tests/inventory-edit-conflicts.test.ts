import {test} from 'node:test';
import assert from 'node:assert/strict';
import {editConflictSchedule} from '../lib/inventory/edit-conflicts';
import type {InventoryRecord} from '../lib/inventory/model';
const booking:InventoryRecord={itemId:'item',booking:{key:'source',id:'source',group:'source',kind:'imported',unitNumber:13,staff:'担当者',store:'店舗',managementNo:'1045',status:'registered',start:'2026-10-27',end:'2026-11-25',from:'2026-10-27',to:'2026-11-26',delivery:'',pickup:'2026-11-26',deliveryRequired:false,pickupRequired:true,href:''}};
const revised={...booking,booking:{...booking.booking,end:'2026-11-30',to:'2026-12-01',pickup:'2026-12-01'}};
const other=(from:string,to:string):InventoryRecord=>({...booking,booking:{...booking.booking,key:'other',group:'other',start:from,end:to,from,to,delivery:'',pickup:'',deliveryRequired:false,pickupRequired:false}});
function conflicts(s:ReturnType<typeof editConflictSchedule>){return s.candidate.some(a=>s.existing.some(b=>a.item_id===b.item_id&&a.unit_number===b.unit_number&&a.group_key!==b.group_key&&a.occupied_from<=b.occupied_to&&b.occupied_from<=a.occupied_to));}
test('extending past an existing historical collision checks only added occupancy',()=>{
 const s=editConflictSchedule([revised],[booking],[other('2026-11-04','2026-11-10')]);
 assert.deepEqual(s.candidate.map(v=>[v.occupied_from,v.occupied_to]),[['2026-11-27','2026-12-01']]);assert.equal(conflicts(s),false);
});
test('a real collision in the extended period is rejected',()=>assert.equal(conflicts(editConflictSchedule([revised],[booking],[other('2026-11-28','2026-12-03')])),true));
test('changing equipment number requires full validation',()=>{
 const changed={...revised,booking:{...revised.booking,unitNumber:14}};
 const s=editConflictSchedule([changed],[booking],[{...other('2026-11-04','2026-11-10'),booking:{...other('2026-11-04','2026-11-10').booking,unitNumber:14}}]);assert.equal(conflicts(s),true);
});
test('new bookings and added sibling slots cannot bypass each other',()=>{
 const sibling={...other('2026-11-28','2026-12-03'),booking:{...other('2026-11-28','2026-12-03').booking,key:'new',group:'new'}};
 assert.equal(conflicts(editConflictSchedule([revised,sibling],[booking],[])),true);
});
test('metadata edits and shortened reservations do not create new occupancy',()=>{
 assert.equal(editConflictSchedule([{...booking,booking:{...booking.booking,store:'変更後'}}],[booking],[]).candidate.length,0);
 const shorter={...booking,booking:{...booking.booking,end:'2026-11-20',to:'2026-11-21',pickup:'2026-11-21'}};assert.equal(editConflictSchedule([shorter],[booking],[]).candidate.length,0);
});
