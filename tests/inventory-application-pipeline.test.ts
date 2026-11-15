import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFmt} from '../lib/parser/fmt-parser';
import {rewriteInventoryFmt} from '../lib/inventory/request-change';
import {eventShippingDates} from '../lib/tezukuru-application';
import {buildTezukuruFmt,type TezukuruInput} from '../lib/tezukuru-fmt';
import {buildKintoneRecord,type FieldMapping} from '../lib/kintone/mapper';
import {confirmationMapping,confirmationShippingLabels} from '../lib/inventory/confirmation-shipping';
import {shippingConfirmationKey,assertCopyTransportReady,type ShippingBooking} from '../lib/inventory/shipping-policy';

const config={separator:':',required_labels:['取次店名','コンテンツ1','数量1','配送日付','集荷日付']};
const mapping:FieldMapping={mappings:[{fmt_label:'配送日付',kintone_code:'納品_日付',kintone_type:'DATE',required:true},{fmt_label:'集荷日付',kintone_code:'集荷_日付',kintone_type:'DATE',required:true}]};
const input:TezukuruInput={agencyName:'動作確認企業',boothName:'動作確認先',billingMonth:'12月分',shippingFee:'',products:[{name:'教材',quantity:'100'}],deliveryDate:'2026-11-30',pickupDate:'2026-12-02',deliveryPostal:'',deliveryAddress:'',deliveryReceiver:'',deliveryContact:'',pickupPostal:'',pickupAddress:'',pickupHandover:'',pickupContact:'',slipTo:'',slipCc:'',emergencyName:'',emergencyPhone:''};

test('public Tezukuru generated dates survive rewrite, required validation and kintone mapping',()=>{
 const raw=buildTezukuruFmt(input);
 for(const [start,end] of [['2026-12-01','2026-12-01'],['2026-12-31','2027-01-01'],['2028-03-01','2028-03-02']]){
  const dates=eventShippingDates(start,end);
  const rewritten=rewriteInventoryFmt(raw,{'配送日付':dates.delivery,'集荷日付':dates.pickup});
  const parsed=parseFmt(rewritten,config);if(!parsed.ok)throw Error(parsed.errors.join('/'));assert.equal(parsed.ok,true);
  assert.equal(parsed.data['配送日付'],dates.delivery);assert.equal(parsed.data['集荷日付'],dates.pickup);
  const record=buildKintoneRecord(parsed.data,mapping);assert.equal(record.ok,true);if(record.ok){assert.equal(record.record['納品_日付'].value,dates.delivery);assert.equal(record.record['集荷_日付'].value,dates.pickup);}
 }
});
test('legacy FMT accepts mixed colons, configured separators and shipping block aliases without changing duplicate precedence',()=>{
 const parsed=parseFmt('企業名=確認\n《配送》\n日付：2026-11-30\n《集荷》\n日付: 2026-12-02\n集荷日付：2099-01-01',{separator:'=',required_labels:['企業名','配送日付','集荷日付'],block_aliases:{'《配送》':{'日付':'配送日付'},'《集荷》':{'日付':'集荷日付'}}});
 assert.deepEqual(parsed,{ok:true,data:{'企業名':'確認','配送日付':'2026-11-30','集荷日付':'2026-12-02'}});
 assert.equal(parseFmt('配送日付：\n集荷日付: ',{required_labels:['配送日付','集荷日付']}).ok,false);
});
test('manual hold confirmation and copy parse optional shipping directions while retaining active date requirements',()=>{
 for(const copy of [false,true])for(const delivery of [false,true])for(const pickup of [false,true]){
  const metadata={...(copy?{_inventory_copy:true}:{_inventory_confirmation_keys:['hold:test:0']}),_inventory_delivery_required:delivery,_inventory_pickup_required:pickup};
  const raw=rewriteInventoryFmt('取次店名: 確認',{'配送日付':delivery?'2026-11-30':'','集荷日付':pickup?'2026-12-02':''});
  const omitted=confirmationShippingLabels(metadata);
  const parsed=parseFmt(raw,{separator:':',required_labels:['配送日付','集荷日付'].filter(k=>!omitted.includes(k as any))});
  assert.equal(parsed.ok,true);if(parsed.ok)assert.equal(buildKintoneRecord(parsed.data,confirmationMapping(mapping,metadata)).ok,true);
 }
});
test('shipping acknowledgement persists through its own toggle and unrelated copy form edits but invalidates on actual shipping changes',()=>{
 const dates:ShippingBooking={start:'2026-12-01',end:'2027-01-03',delivery:'',pickup:'2027-01-04',from:'2026-12-01',to:'2027-01-04',deliveryRequired:false,pickupRequired:true,transport:{address:'埼玉県朝霞市',confirmed:false}};
 const names=['あひるサンダーv2'];const unchecked=shippingConfirmationKey(dates,names,dates.transport!);
 const checked={...dates,transport:{...dates.transport!,confirmed:true},store:'別店舗',billing_month:1};
 assert.equal(shippingConfirmationKey(checked,[...names],checked.transport),unchecked);
 assert.doesNotThrow(()=>assertCopyTransportReady(checked,names[0]));
 assert.notEqual(shippingConfirmationKey({...checked,pickup:'2027-01-05'},names,checked.transport),unchecked);
 assert.notEqual(shippingConfirmationKey(checked,names,{...checked.transport,returnAddress:'沖縄県那覇市'}),unchecked);
 assert.notEqual(shippingConfirmationKey(checked,['クレーンゲーム'],checked.transport),unchecked);
 assert.notEqual(shippingConfirmationKey(checked,names,{...checked.transport,returnDays:3}),unchecked);
});
