import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyExtensionFlags,extensionNumber} from '../lib/inventory/extension-flags';
import {bookingLabel} from '../lib/inventory/presentation';
import type {InventoryRecord} from '../lib/inventory/model';
const row=(itemId:string,key:string):InventoryRecord=>({itemId,booking:{id:key,key,group:key,kind:'imported',staff:'担当',store:'店舗',managementNo:'１０２６',status:'registered',from:'2026-11-01',to:'2026-12-01',start:'2026-11-02',end:'2026-11-30',delivery:'2026-11-01',pickup:'2026-12-01',href:''}});
test('extension possibility is shared across the same invoice but separated by business and does not change rental dates',()=>{
 const original=[row('a','monthly1'),row('a','monthly2'),row('b','tezukuru')];const items=[{id:'a',inventory_role:null},{id:'b',inventory_role:'rental_kit'}];
 const flagged=applyExtensionFlags(original,items,[{business:'allmight',management_no:'1026',possible:true}]);assert.deepEqual(flagged.map(r=>r.booking.extensionPossible),[true,true,false]);
 assert.match(bookingLabel(flagged[0].booking,'2026-11-10'),/延長候補/);assert.equal(original[0].booking.extensionPossible,undefined);
 for(let i=0;i<original.length;i++){const {extensionPossible,...booking}=flagged[i].booking;assert.deepEqual(booking,original[i].booking);}
 assert.ok(applyExtensionFlags(original,items,[{business:'allmight',management_no:'1026',possible:false}]).every(r=>!r.booking.extensionPossible));
 assert.equal(extensionNumber({managementNo:'0001026'}),'1026');assert.equal(extensionNumber({managementNo:'未発行'}),null);
});

import {occupiedCycle} from '../lib/inventory/occupied-cycle';
import {slotSchedule,automaticNumberAvailable} from '../lib/inventory/operations';
import {layoutBoard,bookingOn} from '../lib/inventory/board';
import {boardColor,boardSegments} from '../lib/inventory/presentation';
import {unitSegments} from '../lib/inventory/unit-switches';
test('extension reserves one calendar month, shades the tail and releases when cleared without changing actual dates',()=>{
 const source=row('a','source');source.booking.unitNumber=1;source.booking.extensionPossible=true;
 assert.equal(occupiedCycle(source.booking).to,'2026-12-30');
 assert.equal(source.booking.to,'2026-12-01');assert.equal(source.booking.pickup,'2026-12-01');
 const item={id:'a',name:'機材',total_count:1,reserve_count:0};
 const lanes=layoutBoard(item,['2026-12-29','2026-12-30','2026-12-31'],[source.booking]);
 assert.equal(bookingOn(lanes[0],'2026-12-30')?.id,'source');assert.equal(bookingOn(lanes[0],'2026-12-31'),undefined);
 assert.equal(boardColor(source.booking,'2026-12-02'),'#f1f5f9');
 const next=row('a','next');next.booking={...next.booking,unitNumber:1,from:'2026-12-15',to:'2026-12-18',start:'2026-12-16',end:'2026-12-17',delivery:'2026-12-15',pickup:'2026-12-18'};
 const model={items:[item],records:[source,next]} as any;
 assert.equal(automaticNumberAvailable(model,next,1,[source]),false);
 source.booking.extensionPossible=false;
 assert.equal(occupiedCycle(source.booking).to,'2026-12-01');assert.equal(automaticNumberAvailable(model,next,1,[source]),true);
});
test('calendar month clamps leap February and reserves only the final switched machine for the tail',()=>{
 const b={...row('a','leap').booking,unitNumber:1,end:'2028-01-31',start:'2028-01-01',from:'2027-12-31',to:'2028-02-01',delivery:'2027-12-31',pickup:'2028-02-01',extensionPossible:true,unitSwitches:[{date:'2028-01-20',number:2}]};
 assert.equal(occupiedCycle(b).to,'2028-02-29');
 const parts=unitSegments(b);assert.equal(parts[0].to,'2028-01-19');assert.equal(parts[1].unitNumber,2);assert.equal(parts[1].to,'2028-02-29');
 assert.equal(slotSchedule([{itemId:'a',booking:b}])[1].occupied_to,'2028-02-29');
 const lanes=layoutBoard({id:'a',name:'機材',total_count:2,reserve_count:0},['2028-02-20'],[b]);assert.equal(bookingOn(lanes[0],'2028-02-20'),undefined);assert.equal(bookingOn(lanes[1],'2028-02-20')?.unitNumber,2);
});

test('two-row staff bars split at the extension boundary',()=>{const b={...row('a','staff').booking,unitNumber:1,extensionPossible:true};const lane={key:'one',number:1,kind:'normal' as const,bookings:[b]};const segments=boardSegments(lane,['2026-11-30','2026-12-01','2026-12-02'],()=>false,{splitPhases:false});assert.deepEqual(segments.map(s=>[s.date,s.span]),[['2026-11-30',1],['2026-12-01',2]]);});
