import test from'node:test';import assert from'node:assert/strict';import{chooseRange,monthCells,rangeError}from'../lib/inventory/range-picker';
test('range selects delivery then pickup and a third selection restarts',()=>{let r=chooseRange({delivery:'',pickup:''},'2026-11-05');assert.deepEqual(r,{delivery:'2026-11-05',pickup:''});r=chooseRange(r,'2026-11-10');assert.equal(r.pickup,'2026-11-10');assert.deepEqual(chooseRange(r,'2026-12-01'),{delivery:'2026-12-01',pickup:''});});
test('earlier second click restarts delivery without reversed ranges',()=>{assert.deepEqual(chooseRange({delivery:'2026-11-05',pickup:''},'2026-10-31'),{delivery:'2026-10-31',pickup:''});});
test('month grid aligns leap days with weekdays',()=>{const cells=monthCells('2028-02');assert.equal(cells[0],null);assert.equal(cells[1],null);assert.equal(cells[2],'2028-02-01');assert.equal(cells.at(-1),'2028-02-29');});
test('at least one usage day is needed; year and month boundaries work',()=>{assert.ok(rangeError({delivery:'2026-11-01',pickup:'2026-11-02'}));assert.ok(rangeError({delivery:'2026-11-01',pickup:''}));assert.equal(rangeError({delivery:'2026-12-31',pickup:'2027-01-02'}),'');assert.ok(rangeError({delivery:'2026-02-30',pickup:'2026-03-03'}));});

import{quickHoldCatalog}from'../lib/inventory/quick-hold';
test('brand catalogs expose only active rental equipment, never material or shared screens',()=>{const all=[{id:'a',name:'A',category:'allmight'},{id:'t',name:'T',category:'tezukuru',inventory_role:'rental_kit'},{id:'m',name:'material',category:'tezukuru'},{id:'s',name:'screen',category:'allmight',inventory_role:'background_screen'},{id:'old',name:'retired',category:'tezukuru',inventory_role:'rental_kit',is_active:false}];assert.deepEqual(quickHoldCatalog(all).map(i=>i.id),['a','t']);});

import {rangeUsage} from '../lib/inventory/range-picker';
test('delivery-day use allows a single evening with next-day collection',()=>{
 const range={delivery:'2026-12-11',pickup:'2026-12-12'};
 assert.equal(rangeError(range,true),'');assert.deepEqual(rangeUsage(range,true),{start:'2026-12-11',end:'2026-12-11'});
 assert.ok(rangeError(range));assert.ok(rangeError({delivery:'2026-12-11',pickup:'2026-12-11'},true));
 assert.deepEqual(rangeUsage({delivery:'2026-12-31',pickup:'2027-01-01'},true),{start:'2026-12-31',end:'2026-12-31'});
 assert.deepEqual(rangeUsage({delivery:'2026-12-10',pickup:'2026-12-12'}),{start:'2026-12-11',end:'2026-12-11'});
});

import {initialInventoryDates} from '../lib/inventory/date-defaults';
import {bookingPatch} from '../lib/inventory/operations';
test('delivery-day quick hold payload is accepted with one usage day and both transport dates retained',()=>{
 const range={delivery:'2026-12-11',pickup:'2026-12-12'},usage=rangeUsage(range,true);
 const patch=bookingPatch({item_id:'11111111-1111-4111-8111-111111111111',staff:'担当者',store:'当日利用',...initialInventoryDates(usage.start,usage.end,range.delivery,range.pickup)});
 assert.equal(patch.start,patch.end);assert.equal(patch.start,'2026-12-11');assert.equal(patch.delivery,'2026-12-11');assert.equal(patch.pickup,'2026-12-12');assert.equal(patch.to,'2026-12-12');
});
