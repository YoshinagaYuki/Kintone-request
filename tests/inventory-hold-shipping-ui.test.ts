import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {InventoryShippingPlan} from '../components/admin/inventory-shipping-plan';
import {assertCopyTransportReady,shippingPlan} from '../lib/inventory/shipping-policy';
(globalThis as any).React=React;
const dates={start:'2026-12-11',end:'2026-12-11',delivery:'2026-12-11',pickup:'2026-12-12',from:'2026-12-11',to:'2026-12-12'};
const render=(value:any,extra={})=>renderToStaticMarkup(React.createElement(InventoryShippingPlan,{value,onChange(){},dates:{...dates,...extra},names:['JET Cola']}));
test('remote destination shows lead-time inputs outside collapsed settings, including after manual entry',()=>{
 for(const value of [{address:'沖縄県那覇市',confirmed:true},{address:'沖縄県那覇市',outboundDays:5,returnDays:5,confirmed:true}]){
  const html=render(value);const details=html.indexOf('<details>');assert.ok(html.indexOf('aria-label="往路の日数"')<details);assert.ok(html.indexOf('aria-label="復路の日数"')<details);
  assert.equal((html.match(/aria-label="往路の日数"/g)||[]).length,1);assert.match(html,/チェックだけでは登録できません/);
 }
 assert.throws(()=>assertCopyTransportReady({...dates,transport:{address:'沖縄県那覇市',confirmed:true}},'JET Cola'),/個別確認/);
 assert.doesNotThrow(()=>assertCopyTransportReady({...dates,transport:{address:'沖縄県那覇市',outboundDays:5,returnDays:5,confirmed:true}},'JET Cola'));
});
test('unknown address can be held without guessing transit times and without an HTML required field',()=>{
 const html=render({address:''});assert.match(html,/住所未定でも仮押さえできます/);assert.doesNotMatch(html,/<input[^>]*required/);
 const b={...dates,transport:{address:''}};assert.doesNotThrow(()=>assertCopyTransportReady(b,'JET Cola'));const p=shippingPlan(b,'JET Cola');assert.equal(p.dispatch,dates.from);assert.equal(p.returned,dates.to);
});
test('pickup-only remote continuation shows only the return lead-time input',()=>{
 const html=render({address:'',returnAddress:'沖縄県那覇市'},{deliveryRequired:false,pickupRequired:true});assert.doesNotMatch(html,/aria-label="往路の日数"/);assert.equal((html.match(/aria-label="復路の日数"/g)||[]).length,1);
});
