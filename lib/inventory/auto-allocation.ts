import{shippingPlan}from'./shipping-policy';
import type {InventoryModel,InventoryRecord} from './model';
import {automaticNumberAvailable} from './operations';
/** Preserve confirmed/manual numbers; allocate missing slots together, preferring a consecutive run. */
export function planRequestAllocation(model:InventoryModel,requestId:string){
 const missing=model.records.filter(r=>r.booking.kind==='request'&&r.booking.id===requestId&&r.booking.unitNumber==null);
 const assigned:InventoryRecord[]=[];const unavailable:InventoryRecord[]=[];
 for(const itemId of [...new Set(missing.map(r=>r.itemId))]){
  const slots=missing.filter(r=>r.itemId===itemId).sort((a,b)=>a.booking.key!.localeCompare(b.booking.key!));
  if(slots.some(r=>r.booking.transport&&shippingPlan(r.booking,model.items.find(i=>i.id===itemId)?.name??'').unresolved)){unavailable.push(...slots);continue;}
  let chosen:InventoryRecord[]|null=null;
  const fixed=model.records.filter(r=>r.itemId===itemId&&r.booking.id===requestId&&r.booking.unitNumber!=null).map(r=>r.booking.unitNumber!);
  const span=(first:number)=>{const all=[...fixed,first,first+slots.length-1];return Math.max(...all)-Math.min(...all);};
  const starts=Array.from({length:251-slots.length},(_,i)=>i+1).sort((a,b)=>span(a)-span(b)||a-b);
  for(const first of starts){
   const attempt:InventoryRecord[]=[];
   for(let i=0;i<slots.length;i++){
    const number=first+i;if(!automaticNumberAvailable(model,slots[i],number,[...model.records,...assigned,...attempt]))break;
    attempt.push({...slots[i],booking:{...slots[i].booking,unitNumber:number}});
   }
   if(attempt.length===slots.length){chosen=attempt;break;}
  }
  if(!chosen){const attempt:InventoryRecord[]=[];
   for(const slot of slots){const number=Array.from({length:250},(_,i)=>i+1).find(n=>automaticNumberAvailable(model,slot,n,[...model.records,...assigned,...attempt]));if(number==null)break;attempt.push({...slot,booking:{...slot.booking,unitNumber:number}});}
   if(attempt.length===slots.length)chosen=attempt;
  }
  if(chosen)assigned.push(...chosen);else unavailable.push(...slots);
 }
 return {assigned,unavailable};
}
