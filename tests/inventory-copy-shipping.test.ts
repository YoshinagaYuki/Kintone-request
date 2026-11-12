import {test} from 'node:test';import assert from 'node:assert/strict';
import {applyCopyShipping} from '../lib/inventory/copy-shipping';
import {inventoryCopyDraft} from '../lib/inventory/extensions/model';
import {requestShipping} from '../lib/inventory/request-shipping';
import {assertTransportReady} from '../lib/inventory/shipping-policy';
test('pickup-only continuation retains no delivery and carries the explicitly entered pickup address',()=>{
 const source={'配送住所':'','集荷住所':'','配送日付':'',_inventory_delivery_required:false,_inventory_pickup_required:true};
 const data=applyCopyShipping(source,{address:'',returnAddress:'埼玉県川越市',confirmed:true},false,true);
 assert.equal(data['配送住所'],'');assert.equal(data['配送日付'],'');assert.equal(data['集荷住所'],'埼玉県川越市');assert.equal(source['集荷住所'],'');
 const plan=requestShipping({id:'test',status:'pending',parsed_data:{...data,'機器商品①':'あひるサンダーv2','利用開始日':'2026-12-01','利用最終日':'2027-01-04','集荷日付':'2027-01-05'}} as any,10)!;
 assert.doesNotThrow(()=>assertTransportReady({...plan.dates,transport:plan.transport},plan.names[0]));
});
test('empty pickup address still requires correction, and directions not used stay omitted',()=>{
 const data=applyCopyShipping({'配送住所':'','集荷住所':''},{address:'',returnAddress:''},false,false);assert.equal(data['配送住所'],'');assert.equal(data['集荷住所'],'');
 assert.throws(()=>applyCopyShipping({}, {address:'',returnDays:0},false,true));
});

test('pickup details entered for a copy reach the new kintone draft without enabling delivery',()=>{
 const parsed:any={'機器商品①':'JET Cola','利用開始日':'2026-12-01','利用最終日':'2027-01-04','集荷住所':'埼玉県川越市','集荷連絡先':'090-0000-0000','集荷日付':'2027-01-05',_inventory_pickup_required:true,_inventory_delivery_required:false};
 const draft=inventoryCopyDraft(parsed,{mappings:[{fmt_label:'機器商品①',kintone_code:'レンタル機材',kintone_type:'DROP_DOWN'},{fmt_label:'利用開始日',kintone_code:'日付_0',kintone_type:'DATE'},{fmt_label:'利用最終日',kintone_code:'日付_1',kintone_type:'DATE'},{fmt_label:'集荷住所',kintone_code:'集荷_住所',kintone_type:'SINGLE_LINE_TEXT'},{fmt_label:'集荷連絡先',kintone_code:'集荷_電話番号',kintone_type:'SINGLE_LINE_TEXT'}]},'copy','1026');
 assert.equal(draft['集荷_住所'].value,'埼玉県川越市');assert.equal(draft['集荷_電話番号'].value,'090-0000-0000');assert.equal(draft['納品_住所'].value,'');assert.equal(draft['手配種別'].value,'手配不要');
});

test('copied invoices allow blank transport addresses but validate supplied destinations',async()=>{
 const {assertCopyTransportReady}=await import('../lib/inventory/shipping-policy');
 const dates={start:'2026-12-01',end:'2027-01-03',delivery:'',pickup:'2027-01-04',from:'2026-12-01',to:'2027-01-04',deliveryRequired:false,pickupRequired:true};
 assert.doesNotThrow(()=>assertCopyTransportReady({...dates,transport:{address:''}},'JET Cola'));
 assert.throws(()=>assertTransportReady({...dates,transport:{address:''}},'JET Cola'),/住所/);
 assert.throws(()=>assertCopyTransportReady({...dates,transport:{address:'沖縄県那覇市'}},'JET Cola'),/個別確認/);
 const parsed:any={'機器商品①':'JET Cola','利用開始日':dates.start,'利用最終日':dates.end,'集荷日付':dates.pickup,_inventory_pickup_required:true,_inventory_delivery_required:false};
 const draft=inventoryCopyDraft(parsed,{mappings:[{fmt_label:'利用開始日',kintone_code:'日付_0',kintone_type:'DATE'},{fmt_label:'利用最終日',kintone_code:'日付_1',kintone_type:'DATE'},{fmt_label:'集荷住所',kintone_code:'集荷_住所',kintone_type:'SINGLE_LINE_TEXT',required:true}]},'copy','1026');
 assert.equal(draft['集荷_住所'].value,'');assert.equal(draft['集荷_日付'].value,dates.pickup);
});

test('copy preview makes contact fields optional without clearing supplied addresses',async()=>{
 const {confirmationMapping,applyConfirmationShipping}=await import('../lib/inventory/confirmation-shipping');
 const mapping:any={mappings:[{fmt_label:'集荷住所',kintone_code:'集荷_住所',kintone_type:'SINGLE_LINE_TEXT',required:true}]};
 const parsed={_inventory_copy:true,_inventory_pickup_required:true,'集荷住所':'埼玉県川越市'};
 assert.equal(confirmationMapping(mapping,parsed).mappings[0].required,false);
 assert.equal(confirmationMapping(mapping,{}).mappings[0].required,true);
 const record={'集荷_住所':{value:'埼玉県川越市'}};applyConfirmationShipping(record,parsed,mapping);assert.equal(record['集荷_住所'].value,'埼玉県川越市');
});
