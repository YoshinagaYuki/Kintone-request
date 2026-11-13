import {test} from 'node:test';import assert from 'node:assert/strict';
import {approvalFees,applyApprovalFees,parseFee} from '../lib/approval-fees';
import {inventoryCopyDraft} from '../lib/inventory/extensions/model';
test('fees preserve zero, reject invalid amounts and keep rental cost out of kintone',()=>{
 const data=approvalFees({'取次店名':'企業'}, {delivery_fee:'0',rental_fee:'12345'});const record:any={};applyApprovalFees(record,data);assert.deepEqual(record,{'配送費':{value:'0'}});assert.equal(data._internal_rental_fee,'12345');assert.equal(data['取次店名'],'企業');assert.equal(parseFee('', '費用'),null);
 for(const v of [-1,'1.5','abc',1000000000,{}])assert.throws(()=>parseFee(v,'費用'));
 assert.equal(approvalFees(data,{delivery_fee:''})._approved_delivery_fee,undefined);assert.equal(approvalFees(data,{})._internal_rental_fee,'12345');
});
test('copy drafts retain explicit delivery fee after extension pricing and omit internal rental cost',()=>{
 const parsed:any={'利用開始日':'2026-12-01','利用最終日':'2026-12-01','集荷日付':'2026-12-02',_inventory_delivery_required:false,_inventory_pickup_required:true,_approved_delivery_fee:'3500',_internal_rental_fee:'9000'};
 const draft=inventoryCopyDraft(parsed,{mappings:[{fmt_label:'集荷住所',kintone_code:'集荷_住所',kintone_type:'SINGLE_LINE_TEXT'},{fmt_label:'利用開始日',kintone_code:'日付_0',kintone_type:'DATE'},{fmt_label:'利用最終日',kintone_code:'日付_1',kintone_type:'DATE'}]},'child','100');assert.equal(draft['配送費'].value,'3500');assert.equal('_internal_rental_fee'in draft,false);assert.equal('レンタル費用'in draft,false);
});
