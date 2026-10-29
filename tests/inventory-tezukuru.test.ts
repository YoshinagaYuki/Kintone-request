import{test}from'node:test';import assert from'node:assert/strict';
import{tezukuruKitNames}from'../lib/inventory/business';import{ganttEntry}from'../lib/inventory/gantt';import{linkedKitTracks}from'../lib/inventory/tezukuru-source';import{updateRequestEquipment}from'../lib/inventory/request-change';import{applyConfirmationShipping}from'../lib/inventory/confirmation-shipping';
test('consumable quantities do not create hundreds of rental kits; generic plans share one kit',()=>{
 assert.deepEqual(tezukuruKitNames({'レンタルプラン':'わくわく実験LAB_週末','コンテンツ1':'スクイーズ','数量1':'500','コンテンツ2':'スクイーズ','数量2':'300'}),['スクイーズLAB']);
 assert.deepEqual(tezukuruKitNames({'レンタルプラン':'てずくーる！！_週末','コンテンツ1':'シール','コンテンツ2':'スクイーズ'}),['てずくーる']);
 assert.deepEqual(tezukuruKitNames({'レンタルプラン':'わくわく実験LAB_長期','コンテンツ1':'HWスクイーズ','数量1':'400','コンテンツ2':'スクイーズ','数量2':'500'}),['実験ラボシーズン','スクイーズLAB']);
 assert.deepEqual(tezukuruKitNames({_inventory_kit_names:['スクイーズLAB(ベルパーク様)','bad']}),['スクイーズLAB(ベルパーク様)']);
});
test('Tezukuru uses shipping +/-1day while confirmed internal usage dates and slots win',()=>{
 const request:any={id:'r',status:'registered',parsed_data:{'配送日付':'2026-10-30','集荷日付':'2026-11-04','イベントブース名':'store','レンタルプラン':'わくわく実験LAB_週末','コンテンツ1':'スクイーズ','数量1':'300'}};
 const row=ganttEntry(request,'tezukuru')!;assert.equal(row.start,'2026-10-31');assert.equal(row.end,'2026-11-03');assert.equal(row.from,'2026-10-30');assert.deepEqual(row.items,['スクイーズLAB']);
 const copy=ganttEntry({...request,parsed_data:{...request.parsed_data,'配送日付':'','集荷日付':'',_inventory_usage_start:'2026-11-04',_inventory_usage_end:'2026-11-30',_inventory_delivery_required:false,_inventory_kit_names:['スクイーズLAB']}},'tezukuru')!;assert.equal(copy.from,'2026-11-04');assert.equal(copy.to,'2026-11-30');assert.equal(copy.deliveryRequired,false);
});
test('monthly physical number changes are one kit, simultaneous units are separate slots',()=>{
 const e=(n:number,from:string,to:string):any=>({item_id:'kit',source_key:`${n}:${from}`,source_lane:String(n),start_date:from,end_date:to});
 const track=linkedKitTracks([e(4,'2026-10-30','2026-10-31'),e(14,'2026-11-01','2026-11-04')]);assert.equal(track.length,1);assert.deepEqual(track[0].segments.map(s=>s.number),[4,14]);
 assert.equal(linkedKitTracks([e(4,'2026-10-30','2026-11-04'),e(14,'2026-10-31','2026-11-04')]).length,2);
});
test('editing kits changes the inventory without rewriting material names or quantity',()=>{
 const before={'コンテンツ1':'スクイーズ','数量1':'500',_inventory_kit_names:['スクイーズLAB']};const patch:any={start:'2026-11-01',end:'2026-11-10',delivery:'2026-10-31',pickup:'2026-11-11',store:'changed',staff:'staff'};
 const after=updateRequestEquipment(before,0,'スクイーズLAB(ベルパーク様)',['シールLAB'],patch);assert.equal(after.data['コンテンツ1'],'スクイーズ');assert.equal(after.data['数量1'],'500');assert.deepEqual(after.data._inventory_kit_names,['スクイーズLAB(ベルパーク様)','シールLAB']);assert.equal(after.data['配送日付'],'2026-10-31');
});
test('no physical shipping on kit continuations does not erase the invoiced usage interval',()=>{
 const parsed={_inventory_confirmation_keys:['source'],_inventory_kit_names:['スクイーズLAB'],_inventory_usage_start:'2026-11-01',_inventory_usage_end:'2026-11-30',_inventory_delivery_required:false,_inventory_pickup_required:false};
 const record:any={};applyConfirmationShipping(record,parsed,{mappings:[{fmt_label:'配送日付',kintone_code:'納品_日付'},{fmt_label:'配送日付',kintone_code:'日付_0'},{fmt_label:'集荷日付',kintone_code:'集荷_日付'},{fmt_label:'集荷日付',kintone_code:'日付_1'}]}as any);assert.equal(record['納品_日付'].value,'');assert.equal(record['集荷_日付'].value,'');assert.equal(record['日付_0'].value,'2026-11-01');assert.equal(record['日付_1'].value,'2026-11-30');
});

test('an explicit original collection-day number change retains the source machine without allowing a manual out-of-usage switch',async()=>{
 const{unitSegments}=await import('../lib/inventory/unit-switches');
 const b:any={start:'2026-11-04',end:'2026-11-29',from:'2026-11-03',to:'2026-12-01',pickup:'2026-12-01',unitNumber:15,sourceUnitSwitches:[{date:'2026-12-01',number:7}]};
 const segments=unitSegments(b);assert.equal(segments.length,2);assert.equal(segments[0].to,'2026-11-30');assert.equal(segments[1].from,'2026-12-01');assert.equal(segments[1].unitNumber,7);
 assert.throws(()=>unitSegments({...b,sourceUnitSwitches:undefined,unitSwitches:[{date:'2026-12-01',number:7}]}));
});

test('a copied continuation can use the terminal source number without rewriting the original monthly transfer',async()=>{
 const{applyInventoryCopies}=await import('../lib/inventory/copy-model');const{unitSegments}=await import('../lib/inventory/unit-switches');
 const parent:any={itemId:'kit',booking:{id:'parent',key:'request:parent:0',group:'parent:0',kind:'request',unitNumber:4,start:'2026-10-31',end:'2026-11-03',from:'2026-10-30',to:'2026-11-04',pickup:'2026-11-04',sourceUnitSwitches:[{date:'2026-11-01',number:14}]}};
 const child:any={itemId:'kit',booking:{id:'child',key:'request:child:0',group:'child:0',kind:'request',unitNumber:14,start:'2026-11-04',end:'2026-11-30',from:'2026-11-04',to:'2026-11-30',deliveryRequired:false}};
 const result=applyInventoryCopies([parent,child],[{id:'child',child_request_id:'child',parent_key:'parent',state:'draft',slots:[{preserveSourceGroup:true,source_key:parent.booking.key,item_id:'kit',group_key:'child:0',unit_number:14,screen_quantity:0}]}],[]);
 assert.equal(result[0].booking.unitNumber,4);assert.equal(result[0].booking.group,'parent:0');assert.equal(result[0].booking.to,'2026-11-03');assert.deepEqual(unitSegments(result[0].booking).map(b=>b.unitNumber),[4,14]);assert.equal(result[1].booking.unitNumber,14);
});
