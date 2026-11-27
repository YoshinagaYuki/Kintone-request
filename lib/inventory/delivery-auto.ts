import {createHash} from 'node:crypto';
import type {DeliveryRow} from './deliveries';
import type {DeliveryTracking} from './delivery-tracking';
import type {CarrierCheck} from './carriers/seino';
import {seinoNumber} from './carriers/seino';
import {addDays} from './gantt';
export type AutoState={completed:boolean;completion_source?:string;auto_disabled?:boolean;auto_checked_at?:string|null;auto_fingerprint?:string|null};
export function trackingFingerprint(value:DeliveryTracking){return createHash('sha256').update(JSON.stringify([value.carrier,seinoNumber(value.number)??value.number])).digest('hex');}
export async function runDeliveryAutoChecks(rows:DeliveryRow[],tracking:Record<string,DeliveryTracking>,state:Record<string,AutoState>,today:string,ports:{
 claim:(row:DeliveryRow,fingerprint:string)=>Promise<string|null>;
 check:(number:string,date:string)=>Promise<CarrierCheck>;
 refresh:()=>Promise<{rows:DeliveryRow[];tracking:Record<string,DeliveryTracking>}>;
 finish:(row:DeliveryRow,lease:string,fingerprint:string,delivered:boolean,status:string)=>Promise<void>;
},limit=8){
 const candidates=rows.filter(row=>{
  const shipment=tracking[row.managementNo],saved=state[row.key];
  return row.date<=today&&row.date>=addDays(today,-30)&&shipment?.carrier==='西濃運輸'&&!shipment.ambiguous&&!!seinoNumber(shipment.number)&&!saved?.auto_disabled&&(!saved?.completed||saved.completion_source==='seino'&&saved.auto_fingerprint!==trackingFingerprint(shipment));
 }).sort((a,b)=>(state[a.key]?.auto_checked_at??'').localeCompare(state[b.key]?.auto_checked_at??'')).slice(0,limit);
 const results:{row:DeliveryRow;lease:string;fingerprint:string;result:CarrierCheck}[]=[];
 const queue=[...candidates];
 await Promise.all([0,1].map(async()=>{while(queue.length){const row=queue.shift()!,shipment=tracking[row.managementNo],fingerprint=trackingFingerprint(shipment),lease=await ports.claim(row,fingerprint);if(!lease)continue;
  let result:CarrierCheck;try{result=await ports.check(seinoNumber(shipment.number)!,row.date);}catch{result={number:shipment.number,delivered:false,status:'追跡情報を確認できませんでした（手動確認できます）'};}
  results.push({row,lease,fingerprint,result});
 }}));
 let latest:Awaited<ReturnType<typeof ports.refresh>>|null=null;
 if(results.some(r=>r.result.delivered)){try{latest=await ports.refresh();}catch{/* No verified current identity means no automatic completion. */}}
 let completed=0;
 for(const {row,lease,fingerprint,result} of results){
  const current=latest?.rows.find(r=>r.key===row.key),shipment=current?latest?.tracking[current.managementNo]:null;
  const delivered=result.delivered&&result.status==='配達済み'&&result.number===seinoNumber(tracking[row.managementNo].number)&&!!current&&!!shipment&&!shipment.ambiguous&&trackingFingerprint(shipment)===fingerprint;
  await ports.finish(row,lease,fingerprint,delivered,result.delivered&&!delivered?'配送情報の再確認が必要です':result.status);if(delivered)completed++;
 }
 return {checked:results.length,verified:completed};
}
