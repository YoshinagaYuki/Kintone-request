import { addDays, validDate } from './gantt';
import type { InventoryRecord } from './model';
export type DeliveryRow={key:string;managementNo:string;store:string;date:string;staff:string[];contents:{name:string;quantity:number}[]};
export function deliveryWeek(today:string,offset=0){const weekday=new Date(`${today}T00:00:00Z`).getUTCDay();const monday=addDays(today,-((weekday+6)%7)+offset*7);return{monday,friday:addDays(monday,4)};}
/** Use the same authoritative, edited records as the gantt. Never infer a delivery date. */
export function deliveryRows(records:InventoryRecord[],items:{id:string;name:string}[]):DeliveryRow[]{
 const rows=new Map<string,DeliveryRow>();const seen=new Set<string>();
 const authoritativeNumbers=new Set(records.filter(r=>!r.deleted&&r.booking.kind==='request'&&!['rejected','cancelled'].includes(r.booking.status)).map(r=>r.booking.managementNo.trim()).filter(Boolean));
 for(const {booking:b,itemId,deleted} of records){
  if(deleted||['blocked','rejected','cancelled'].includes(b.status)||b.deliveryRequired===false||!validDate(b.delivery))continue;
  const identity=b.key??`${b.kind}:${b.id}:${b.group}`;if(seen.has(identity))continue;seen.add(identity);
  const number=b.managementNo.trim();
  if(number&&b.kind!=='request'&&authoritativeNumbers.has(number))continue;
  const caseKey=number?`number:${number}`:b.kind==='request'?`request:${b.id}`:`${b.kind}:${b.store.trim()}:${b.staff.trim()}`;
  const key=JSON.stringify([caseKey,b.delivery]);
  let row=rows.get(key);if(!row){row={key,managementNo:number,store:b.store,date:b.delivery,staff:[],contents:[]};rows.set(key,row);}
  if(b.staff&&!row.staff.includes(b.staff))row.staff.push(b.staff);
  const name=items.find(i=>i.id===itemId)?.name??'商品未設定';const content=row.contents.find(c=>c.name===name);if(content)content.quantity++;else row.contents.push({name,quantity:1});
 }
 return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.managementNo.localeCompare(b.managementNo,'ja',{numeric:true})||a.store.localeCompare(b.store,'ja'));
}
export function deliveriesInWeek(rows:DeliveryRow[],today:string,offset=0){const{monday,friday}=deliveryWeek(today,offset);return rows.filter(r=>r.date>=monday&&r.date<=friday);}
