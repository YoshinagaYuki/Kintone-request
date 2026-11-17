import {test} from 'node:test';import assert from 'node:assert/strict';
import {warehouseClosed,warehouseOpenDay,type WarehouseClosure} from '../lib/inventory/warehouse-calendar';
import {shippingPlan,carrierClosed} from '../lib/inventory/shipping-policy';
import {withShippingRecord} from '../lib/inventory/shipping-record';
import {slotSchedule,automaticNumberAvailable} from '../lib/inventory/operations';
const closure=(from:string,to=from):WarehouseClosure=>({id:'test',start_date:from,end_date:to,name:'倉庫休業'});
const b={start:'2026-06-16',end:'2026-06-16',delivery:'2026-06-15',pickup:'2026-06-17',from:'2026-06-15',to:'2026-06-17',transport:{address:'埼玉県朝霞市',carrier:'sagawa' as const}};
test('warehouse weekends, national holidays, substitute holidays and citizens holidays are closed',()=>{
 for(const d of ['2026-06-13','2026-06-14','2026-05-06','2026-09-22','2027-01-01'])assert.equal(warehouseClosed(d),true,d);
 assert.equal(warehouseClosed('2026-06-12'),false);assert.equal(warehouseOpenDay('2026-06-15',-1,[closure('2026-06-12','2026-06-15')]),'2026-06-11');
});
test('advance dispatch across a weekend and custom closures while keeping customer dates unchanged',()=>{
 assert.equal(shippingPlan(b,'JET Cola').dispatch,'2026-06-12');
 const p=shippingPlan(b,'JET Cola',[closure('2026-06-12')]);assert.equal(p.dispatch,'2026-06-11');assert.equal(p.from,'2026-06-11');assert.equal(p.returned,'2026-06-18');assert.equal(b.delivery,'2026-06-15');assert.equal(b.pickup,'2026-06-17');
 assert.equal(shippingPlan(b,'JET Cola',[closure('2026-06-11'),closure('2026-06-12')]).dispatch,'2026-06-10');
});
test('year-end closure crosses the year; next dispatch also waits for the warehouse to reopen',()=>{
 const c=[closure('2026-12-28','2027-01-05')];const p=shippingPlan({...b,start:'2027-01-08',end:'2027-01-08',delivery:'2027-01-07',pickup:'2027-01-09',from:'2027-01-07',to:'2027-01-09'},'JET Cola',c);
 assert.equal(p.dispatch,'2026-12-25');assert.equal(warehouseOpenDay('2027-01-01',1,c),'2027-01-06');
 assert.equal(warehouseOpenDay('2026-12-29',-1,[],d=>carrierClosed(d,'seino')),'2026-12-25');
});
test('closing and reopening days recalculates from the original base; reservation slots protect the earlier days',()=>{
 const r:any={itemId:'a',booking:{...b,id:'r',key:'r',group:'r',kind:'hold',staff:'担当',store:'店舗',status:'hold',managementNo:'',href:'',unitNumber:1}};
 const advanced=withShippingRecord(r,'JET Cola',[closure('2026-06-12')]);assert.equal(slotSchedule([advanced])[0].occupied_from,'2026-06-11');
 const released=withShippingRecord(advanced,'JET Cola',[]);assert.equal(released.booking.from,'2026-06-12');assert.equal(released.booking.delivery,r.booking.delivery);
 assert.deepEqual(withShippingRecord(advanced,'JET Cola',[closure('2026-06-12')]),advanced);
});
test('no-delivery continuations and maintenance blocks do not invent warehouse dispatches',()=>{
 assert.equal(shippingPlan({...b,deliveryRequired:false,delivery:'',from:'2026-06-14'},'JET Cola',[closure('2026-06-12')]).dispatch,'2026-06-14');
 const r:any={itemId:'a',booking:{...b,status:'blocked',from:'2026-06-14'}};assert.equal(withShippingRecord(r,'JET Cola').booking.from,'2026-06-14');
 const unknown={...b,transport:undefined,from:'2026-06-14'};assert.equal(shippingPlan(unknown,'JET Cola').dispatch,'2026-06-12');
});

test('Jan 1 collection returns Jan 4 after warehouse closure through Jan 3, without shifting customer collection',()=>{
 const dates={...b,start:'2026-12-30',end:'2026-12-31',delivery:'2026-12-29',pickup:'2027-01-01',from:'2026-12-29',to:'2027-01-01'};
 const c=[closure('2026-12-28','2027-01-03')];const plan=shippingPlan(dates,'JET Cola',c);
 assert.equal(plan.returned,'2027-01-04');assert.equal(plan.to,'2027-01-04');assert.equal(plan.nextDispatch,'2027-01-05');assert.equal(dates.pickup,'2027-01-01');
 const r:any={itemId:'a',booking:{...dates,id:'r',key:'r',group:'r',kind:'hold',staff:'担当',store:'店舗',status:'hold',managementNo:'',href:'',unitNumber:1}};
 const received=withShippingRecord(r,'JET Cola',c);assert.equal(slotSchedule([received])[0].occupied_to,'2027-01-04');
 const model:any={items:[{id:'a',name:'JET Cola',total_count:1,reserve_count:0}],records:[received]};
 for(const [day,available] of [['2027-01-04',false],['2027-01-05',true]] as const){const next:any={itemId:'a',booking:{...r.booking,id:'next',key:'next',group:'next',deliveryRequired:false,pickupRequired:false,delivery:'',pickup:'',start:day,end:day,from:day,to:day}};assert.equal(automaticNumberAvailable(model,next,1,[received]),available);}
});
test('return waits for consecutive closure, weekend and holiday, while slower carrier transit still wins',()=>{
 const dates={...b,start:'2026-12-30',end:'2026-12-31',delivery:'2026-12-29',pickup:'2027-01-01',from:'2026-12-29',to:'2027-01-01'};
 assert.equal(shippingPlan(dates,'JET Cola',[closure('2026-12-28','2027-01-11')]).returned,'2027-01-12');
 const slow=shippingPlan({...dates,transport:{...dates.transport,returnDays:7}},'JET Cola',[closure('2026-12-28','2027-01-03')]);assert.ok(slow.returned>'2027-01-04');
 const continuous=shippingPlan({...dates,pickupRequired:false,pickup:''},'JET Cola',[closure('2026-12-28','2027-01-11')]);assert.equal(continuous.returned,dates.to);
});
