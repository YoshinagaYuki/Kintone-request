import{test}from'node:test';import assert from'node:assert/strict';import{unitSegments}from'../lib/inventory/unit-switches';import{slotSchedule,validateNumber,resolveUnitNumber}from'../lib/inventory/operations';import{layoutBoard,bookingOn,type BoardBooking}from'../lib/inventory/board';import{boardSegments,laneLocked}from'../lib/inventory/presentation';import{applyInventoryEdits,type InventoryModel}from'../lib/inventory/model';import{addDays}from'../lib/inventory/gantt';
const item={id:'item',name:'機器',total_count:3,reserve_count:1};const b:BoardBooking={id:'case',key:'case',group:'case:0',kind:'hold',unitNumber:3,staff:'担当者',store:'店舗',managementNo:'100',status:'registered',start:'2026-10-26',end:'2026-10-30',from:'2026-10-25',to:'2026-10-31',delivery:'2026-10-25',pickup:'2026-10-31',href:'',unitSwitches:[{date:'2026-10-28',number:1}]};const model={items:[item],records:[]}as unknown as InventoryModel;
test('reserve-to-normal switch is inclusive on target day and never adds transport or changes invoice/dates',()=>{const s=unitSegments(b);assert.deepEqual(s.map(x=>[x.unitNumber,x.from,x.to]),[[3,'2026-10-25','2026-10-27'],[1,'2026-10-28','2026-10-31']]);assert.ok(s.every(x=>x.managementNo==='100'&&x.start===b.start&&x.end===b.end&&x.delivery===b.delivery&&x.pickup===b.pickup));assert.equal(b.unitNumber,3);const slots=slotSchedule([{itemId:item.id,booking:b}]);assert.equal(slots[0].occupied_to,'2026-10-27');assert.equal(slots[1].occupied_from,'2026-10-28');});
test('both gantt rows show the same case on their respective dates; reserve is clickable',()=>{const dates=Array.from({length:7},(_,i)=>addDays('2026-10-25',i));const rows=layoutBoard(item,dates,[b]);const reserve=rows.find(r=>r.number===3)!;const normal=rows.find(r=>r.number===1)!;assert.equal(bookingOn(reserve,'2026-10-27')?.id,'case');assert.equal(bookingOn(reserve,'2026-10-28'),undefined);assert.equal(bookingOn(normal,'2026-10-28')?.id,'case');assert.equal(laneLocked(item,reserve,2,2,'2026-10-28'),false);});
test('manual reserve is allowed; auto allocation never consumes reserves; total reductions still reject',()=>{validateNumber(model,{itemId:'item',booking:b},3);const others=[1,2].map(n=>({itemId:'item',booking:{...b,id:String(n),group:String(n),unitSwitches:[],unitNumber:n}}));assert.throws(()=>resolveUnitNumber(model,{itemId:'item',booking:{...b,unitSwitches:[]}},'auto',others),/空いている番号/);assert.throws(()=>validateNumber(model,{itemId:'item',booking:{...b,unitSwitches:[{date:'2026-10-28',number:4}]}},3),/保有数/);});
test('switches persist through booking overlays and can be fully cleared',()=>{const r={itemId:'item',booking:{...b,unitSwitches:undefined}};const applied=applyInventoryEdits([r],[{booking_key:'case',patch:{unitSwitches:b.unitSwitches},deleted:false}],[]);assert.deepEqual(applied[0].booking.unitSwitches,b.unitSwitches);assert.equal(unitSegments({...b,unitSwitches:[]}).length,1);assert.throws(()=>unitSegments({...b,unitSwitches:[{date:'2026-11-01',number:1}]}),/切替日/);});
test('today no longer forces a split in one continuous gantt case',()=>{const dates=['2026-10-26','2026-10-27','2026-10-28'];const rows=layoutBoard(item,dates,[{...b,unitNumber:1,unitSwitches:[]}]);assert.equal(boardSegments(rows[0],dates,()=>false).length,1);});

test('delivery and pickup markers occupy one day even when transit adds several days',()=>{const booking={...b,from:'2026-11-11',to:'2026-11-18',start:'2026-11-14',end:'2026-11-15',delivery:'2026-11-13',pickup:'2026-11-16',unitSwitches:[]};const days=Array.from({length:8},(_,i)=>addDays('2026-11-11',i));const segments=boardSegments({key:'normal:1',number:1,kind:'normal',bookings:[booking]},days,()=>false);assert.deepEqual(segments.map(s=>[s.date,s.span]),[['2026-11-11',2],['2026-11-13',1],['2026-11-14',2],['2026-11-16',1],['2026-11-17',2]]);assert.equal(segments[0].booking,undefined);assert.equal(segments.at(-1)?.booking,undefined);assert.equal(segments[1].booking?.id,booking.id);assert.equal(bookingOn({key:'normal:1',number:1,kind:'normal',bookings:[booking]},'2026-11-11')?.id,booking.id);});

import {addedSlotSchedule} from '../lib/inventory/operations';
const overlaps=(a:ReturnType<typeof slotSchedule>,b:ReturnType<typeof slotSchedule>)=>a.some(x=>b.some(y=>x.item_id===y.item_id&&x.unit_number===y.unit_number&&x.group_key!==y.group_key&&x.occupied_from<=y.occupied_to&&x.occupied_to>=y.occupied_from));
test('1044: moving 13 to empty 23 on Nov 6 is allowed despite unchanged Nov 4–5 overlap with 1045',()=>{
 const original={itemId:'item',booking:{...b,unitNumber:13,unitSwitches:[],from:'2026-11-04',to:'2026-11-10',start:'2026-11-05',end:'2026-11-09',delivery:'2026-11-04',pickup:'2026-11-10'}};
 const target={...original,booking:{...original.booking,unitSwitches:[{date:'2026-11-06',number:23}]}};
 const other={itemId:'item',booking:{...original.booking,group:'1045',from:'2026-10-26',to:'2026-12-01'}};
 assert.equal(overlaps(slotSchedule([target]),slotSchedule([other])),true);
 assert.deepEqual(addedSlotSchedule([original],[target]).map(s=>[s.unit_number,s.occupied_from,s.occupied_to]),[[23,'2026-11-06','2026-11-10']]);
 assert.equal(overlaps(addedSlotSchedule([original],[target]),slotSchedule([other])),false);
 assert.equal(overlaps(addedSlotSchedule([target],[original]),slotSchedule([other])),true,'clearing the switch must not reintroduce an occupied unit');
});
test('switch still rejects target conflicts including a return-transit day, and changes to existing switches',()=>{
 const original={itemId:'item',booking:{...b,unitNumber:3,unitSwitches:[]}};
 const target={...original,booking:b};
 const other={itemId:'item',booking:{...b,group:'other',unitNumber:1,unitSwitches:[],from:'2026-10-31',to:'2026-11-02',start:'2026-11-01',end:'2026-11-01',delivery:'2026-10-31',pickup:'2026-11-02'}};
 assert.equal(overlaps(addedSlotSchedule([original],[target]),slotSchedule([other])),true);
 const moved={...target,booking:{...b,unitSwitches:[{date:'2026-10-27',number:1}]}};
 assert.deepEqual(addedSlotSchedule([target],[moved]).map(s=>[s.unit_number,s.occupied_from,s.occupied_to]),[[1,'2026-10-27','2026-10-27']]);
 assert.deepEqual(addedSlotSchedule([target],[target]),[]);
});
test('new occupancy subtracts several previous segments and never subtracts another item or group',()=>{
 const original={itemId:'item',booking:b};
 const target={...original,booking:{...b,unitSwitches:[{date:'2026-10-27',number:1},{date:'2026-10-29',number:3},{date:'2026-10-30',number:1}]}};
 assert.deepEqual(addedSlotSchedule([original],[target]).map(s=>[s.unit_number,s.occupied_from,s.occupied_to]),[[1,'2026-10-27','2026-10-27'],[3,'2026-10-29','2026-10-29']]);
 assert.equal(addedSlotSchedule([{...original,itemId:'another'}],[original]).length,2);
 assert.equal(addedSlotSchedule([{...original,booking:{...b,group:'another'}}],[original]).length,2);
});
test('1215-style intermediate exchange can be replaced with one full-period assignment without splitting invoices or dates',()=>{
 const before={itemId:'item',booking:{...b,managementNo:'1215'}};
 const after=applyInventoryEdits([before],[{booking_key:'case',patch:{unitSwitches:[]},deleted:false}],[{group_key:'case:0',item_id:'item',unit_number:1}])[0];
 const segments=unitSegments(after.booking);
 assert.equal(segments.length,1);assert.equal(segments[0].unitNumber,1);
 for(const key of ['id','managementNo','start','end','delivery','pickup'] as const)assert.equal(after.booking[key],before.booking[key]);
 assert.deepEqual(before.booking.unitSwitches,b.unitSwitches);
});
