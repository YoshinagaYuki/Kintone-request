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
