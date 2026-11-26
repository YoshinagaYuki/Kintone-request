import type {InventoryRecord,InventoryModel} from './model';
import {slotSchedule,resolveUnitNumber,turnaroundWarnings,validateNumber} from './operations';
import {occupiedCycle} from './occupied-cycle';
import {shippingPlan} from './shipping-policy';
export type ConfirmationConflict={item:string;number:number;from:string;to:string;otherFrom:string;otherTo:string;store:string;managementNo:string;overlapFrom:string;overlapTo:string};
/** Match the database's inclusive, per-physical-unit check, including transit and switches. */
export function confirmationConflicts(candidates:InventoryRecord[],existing:InventoryRecord[],items:{id:string;name:string}[]):ConfirmationConflict[]{
 const result:ConfirmationConflict[]=[],seen=new Set<string>();
 for(const candidate of candidates){for(const a of slotSchedule([candidate])){for(const other of [...existing,...candidates]){for(const b of slotSchedule([other])){
  if(a.item_id!==b.item_id||a.unit_number!==b.unit_number||a.group_key===b.group_key||a.occupied_from>b.occupied_to||a.occupied_to<b.occupied_from)continue;
  const key=[a.item_id,a.unit_number,a.group_key,b.group_key,a.occupied_from,b.occupied_from].join(':');if(seen.has(key))continue;seen.add(key);
  result.push({item:items.find(i=>i.id===a.item_id)?.name??'商品',number:a.unit_number!,from:a.occupied_from,to:a.occupied_to,otherFrom:b.occupied_from,otherTo:b.occupied_to,store:other.booking.store,managementNo:other.booking.managementNo,overlapFrom:[a.occupied_from,b.occupied_from].sort().at(-1)!,overlapTo:[a.occupied_to,b.occupied_to].sort()[0]});
  if(result.length>=10)return result;
 }}}}
 return result;
}

export type ConfirmationNumberChange={item:string;from:number|null;to:number;fromDate:string;toDate:string};
/** Preserve safe explicit assignments; replacements use normal stock and the full automatic shipping/turnaround rules. */
export function slideConfirmationNumbers(model:InventoryModel,candidates:InventoryRecord[],existing:InventoryRecord[]){
 const assigned:InventoryRecord[]=[],changes:ConfirmationNumberChange[]=[];
 for(const candidate of candidates){
  const reserved=[...existing,...assigned],number=candidate.booking.unitNumber??null;
  let valid=true;try{validateNumber(model,candidate,number);}catch{valid=false;}
  const safe=valid&&number!==null&&!confirmationConflicts([candidate],reserved,model.items).length&&!turnaroundWarnings([candidate],reserved).length;
  if(safe){assigned.push(candidate);continue;}
  if(shippingPlan(candidate.booking,model.items.find(i=>i.id===candidate.itemId)?.name??'',model.warehouseClosures).unresolved)throw Error('配送先の輸送日数が未確定のため、自動振り替えはできません。往路・復路の日数を確認してください。');
  let next:number|null;try{next=resolveUnitNumber(model,candidate,'auto',reserved);}catch{throw Error(`${model.items.find(i=>i.id===candidate.itemId)?.name??'商品'}：輸送・返却・点検の期間を通して空いている機器番号がありません。日程または配送条件を確認してください。入力内容は残っています。`);}
  if(next==null)throw Error('空き機器番号を確保できませんでした');
  assigned.push({...candidate,booking:{...candidate.booking,unitNumber:next}});
  const cycle=occupiedCycle(candidate.booking);changes.push({item:model.items.find(i=>i.id===candidate.itemId)?.name??'商品',from:number,to:next,fromDate:cycle.from,toDate:cycle.to});
 }
 return{records:assigned,changes};
}
