import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {InventoryShippingPlan} from '../components/admin/inventory-shipping-plan';
import {shippingPlan} from '../lib/inventory/shipping-policy';
(globalThis as any).React=React;
const dates={start:'2026-12-11',end:'2026-12-11',delivery:'2026-12-11',pickup:'2026-12-12',from:'2026-12-11',to:'2026-12-12'};
const render=(value:any,extra={})=>renderToStaticMarkup(React.createElement(InventoryShippingPlan,{value,onChange(){},dates:{...dates,...extra},names:['JET Cola']}));
test('retired shipping-entry panel renders no fields or warnings for any transport direction',()=>{
 for(const value of [{address:''},{address:'沖縄県那覇市',confirmed:false},{address:'東京都',confirmed:true}])for(const flags of [{},{deliveryRequired:false,pickupRequired:true},{deliveryRequired:false,pickupRequired:false}])assert.equal(render(value,flags),'');
});
test('removing the entry panel preserves existing warehouse return-date calculation',()=>{
 const p=shippingPlan({...dates,transport:{address:''}},'JET Cola');assert.equal(p.dispatch,dates.from);assert.equal(p.returned,'2026-12-14');
});
