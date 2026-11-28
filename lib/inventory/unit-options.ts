import {stockOn,unitStart} from './board';
import {slotSchedule} from './operations';
import type {InventoryModel} from './model';
export type UnitOption={number:number;available:boolean;reason:string;reserve:boolean};
export function inventoryUnitOptions(model:Pick<InventoryModel,'items'|'records'>,itemId:string,from:string,to:string,schedule=slotSchedule(model.records)):UnitOption[]{
 const item=model.items.find(i=>i.id===itemId);if(!item)throw Error('商品が見つかりません');
 const first=unitStart(item),checks=[from,...(item.schedule??[]).filter(s=>from<=s.effective_date&&s.effective_date<=to).map(s=>s.effective_date)];
 const total=Math.min(...checks.map(d=>stockOn(item,d)?.total??0));
 const max=Math.min(251-first,Math.max(item.total_count??0,...(item.schedule??[]).map(s=>s.total_count)));
 const occupied=new Set(schedule.filter(r=>r.item_id===itemId&&r.occupied_from<=to&&r.occupied_to>=from).map(r=>r.unit_number));
 const usable=stockOn(item,from)?.usable??0;
 return Array.from({length:Math.max(0,max)},(_,i)=>{const number=first+i,reason=number>=first+total?'保有数の対象外':occupied.has(number)?'使用中':'';return{number,available:!reason,reason,reserve:number>=first+usable};});
}
