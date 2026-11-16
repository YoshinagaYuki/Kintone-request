import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {ApplyForm} from '../components/apply/apply-form';
import {AllmightApplyForm} from '../components/apply/allmight-apply-form';
// tsx uses the classic JSX transform for the repository's Next.js JSX-preserve setting.
(globalThis as any).React=React;
const formTypes=[{id:'test',name:'てずくーる',is_tezukuru:true,has_rental_plan:true,select_fields:[],fmt_template:'',input_guide:'',notes:''}];
const rentalPlans=[{id:'plan',name:'検証用プラン',is_active:true,description:'',sort_order:0}];
const inventory={deliveryRequired:true,pickupRequired:true,onBack(){},async onSubmit(){}};
function render(element:React.ReactElement){return renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{} as any},element));}
test('manual Tezukuru confirmation exposes its required rental plan and removes legacy fee field',()=>{
 const html=render(React.createElement(ApplyForm,{formTypes,rentalPlans,productItems:[],minimumOrderQuantity:100,inventory}));
 assert.match(html,/検証用プラン/);assert.match(html,/rentalPlanId/);assert.doesNotMatch(html,/shippingFee/);
});
test('public Tezukuru retains customer shipping fee while rental status choice stays removed',()=>{
 const html=render(React.createElement(ApplyForm,{formTypes,rentalPlans,productItems:[],minimumOrderQuantity:100}));
 assert.match(html,/shippingFee/);assert.doesNotMatch(html,/検証用プラン/);assert.doesNotMatch(html,/すでに借りている/);
});
test('editing an existing new-rental Tezukuru request keeps the plan selectable',()=>{
 const html=render(React.createElement(ApplyForm,{formTypes,rentalPlans,productItems:[],minimumOrderQuantity:100,mode:'edit',initialValues:{rentalStatus:'new_rental',rentalPlanId:'plan'}}));
 assert.match(html,/<option value="plan" selected="">検証用プラン/);
});
test('Allmight uses only the top fee control for internal confirmation, preserving the public fee',()=>{
 const common={formTypeId:'allmight',productOptions:['JET Cola']};
 assert.doesNotMatch(render(React.createElement(AllmightApplyForm,{...common,inventory:{...inventory,staff:[],equipments:['JET Cola']}})),/shippingFee/);
 assert.match(render(React.createElement(AllmightApplyForm,common)),/shippingFee/);
});
test('public Allmight derives locked delivery and collection dates from the manually selected usage period',()=>{
 const html=render(React.createElement(AllmightApplyForm,{formTypeId:'a',productOptions:['JET Cola'],initialValues:{usageStart:'2026-11-21',usageEnd:'2026-11-22',deliveryDate:'2099-01-01',pickupDate:'2099-01-01'}}));
 assert.match(html,/deliveryDate[^>]*readOnly=""[^>]*value="2026-11-20"/);
 assert.match(html,/pickupDate[^>]*readOnly=""[^>]*value="2026-11-23"/);
 assert.match(html,/希望日と理由/);assert.match(html,/確約不可/);
});

import {InventoryMatchPicker} from '../components/admin/inventory-match-picker';
test('hold matching opens on the requested master product and retains selected holds from other product filters',()=>{
 const candidates=[{id:'a',item_id:'a',item_name:'JET Cola',staff_name:'担当',store_name:'候補A',start_date:'2026-11-21',end_date:'2026-11-22',quantity:1},{id:'b',item_id:'b',item_name:'クレーンゲーム',staff_name:'担当',store_name:'候補B',start_date:'2026-11-21',end_date:'2026-11-22',quantity:1}];
 const props={requestId:'r',candidates,items:[{id:'a',name:'JET Cola'},{id:'b',name:'クレーンゲーム'}],masterLabel:'商品マスタ',initialItemId:'a'};
 const filtered=render(React.createElement(InventoryMatchPicker,{...props,selected:[]}));assert.match(filtered,/商品マスタで絞り込み/);assert.match(filtered,/候補A/);assert.doesNotMatch(filtered,/候補B/);
 const selected=render(React.createElement(InventoryMatchPicker,{...props,selected:['b']}));assert.match(selected,/候補B/);
});
