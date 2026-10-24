import type {BoardBooking} from './board';
import {addDays} from './gantt';
export type ImportedEntry={source_key:string;source_tab:string;source_cell:string;staff_name:string;store_name:string;management_no:string;start_date:string;end_date:string;request_id:string|null;hold_id?:string|null;item_id:string;state:string};
/** Call separately for each product. A number alone cannot prove product/date/quantity coverage. */
export function importedBookings(entries:ImportedEntry[],existing:BoardBooking[]=[]):BoardBooking[]{
 const result:BoardBooking[]=[],claimed=new Set<string>();
 for(const e of entries.filter(e=>['hold','blocked','linked','review'].includes(e.state)).sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.source_key.localeCompare(b.source_key))){
  const targets=existing.filter(b=>(e.request_id&&b.kind==='request'&&b.id===e.request_id)||(e.hold_id&&b.kind==='hold'&&b.id===e.hold_id));
  let runStart='';
  const append=(end:string)=>{if(!runStart)return;result.push({id:e.source_key,group:`sheet:${e.source_key}`,kind:'imported',staff:e.staff_name,store:e.store_name,managementNo:e.management_no,status:e.state==='blocked'?'blocked':e.management_no?'registered':'hold',from:runStart,to:end,start:runStart,end,delivery:'',pickup:'',href:'https://docs.google.com/spreadsheets/d/1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0/edit',source:`${e.source_tab} ${e.source_cell}`});runStart='';};
  for(let date=e.start_date;date<=e.end_date;date=addDays(date,1)){
   const target=targets.find(b=>b.from<=date&&b.to>=date&&!claimed.has(`${b.group}:${date}`));
   if(target){claimed.add(`${target.group}:${date}`);append(addDays(date,-1));}else if(!runStart)runStart=date;
  }
  append(e.end_date);
 }
 return result;
}
