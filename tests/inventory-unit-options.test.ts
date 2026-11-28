import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inventoryUnitOptions} from '../lib/inventory/unit-options';
import {slotSchedule} from '../lib/inventory/operations';
import type {InventoryModel,InventoryRecord} from '../lib/inventory/model';
const record=(id:string,number:number,itemId='item'):InventoryRecord=>({itemId,booking:{id,key:id,group:id,kind:'hold',staff:'担当',store:'店舗',managementNo:'',status:'hold',unitNumber:number,start:'2026-12-11',end:'2026-12-13',delivery:'2026-12-10',pickup:'2026-12-14',from:'2026-12-10',to:'2026-12-14',href:''}});
const model=()=>({items:[{id:'item',name:'機器',total_count:5,reserve_count:1}],records:[record('other',2)]} as InventoryModel);
test('unit candidates include transport boundaries and reserve labels',()=>{
 const m=model();const options=inventoryUnitOptions(m,'item','2026-12-14','2026-12-15');
 assert.equal(options[1].available,false);assert.equal(options[0].available,true);assert.equal(options[4].reserve,true);
 assert.equal(inventoryUnitOptions(m,'item','2026-12-15','2026-12-16')[1].available,true);
});
test('group exclusion permits editing own unit while other item bookings do not block it',()=>{
 const m=model();m.records.push(record('different',1,'another'));
 const options=inventoryUnitOptions(m,'item','2026-12-10','2026-12-14',slotSchedule(m.records).filter(r=>r.group_key!=='other'));
 assert.equal(options[1].available,true);assert.equal(options[0].available,true);
});
test('stock reduction anywhere during reservation prevents out of stock choices',()=>{
 const m=model();m.items[0].schedule=[{item_id:'item',effective_date:'2026-12-12',total_count:3,reserve_count:1}];
 const options=inventoryUnitOptions(m,'item','2026-12-10','2026-12-14');
 assert.equal(options.length,5);assert.equal(options[2].available,true);assert.equal(options[3].reason,'保有数の対象外');
});
test('candidate calculation never changes saved dates or assignments',()=>{
 const m=model(),before=JSON.stringify(m);
 for(let i=0;i<30;i++)inventoryUnitOptions(m,'item','2026-12-10','2026-12-14');
 assert.equal(JSON.stringify(m),before);
});
