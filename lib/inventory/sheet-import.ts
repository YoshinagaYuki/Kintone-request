import type {BoardBooking} from './board';
export type ImportedEntry={source_key:string;source_tab:string;source_cell:string;staff_name:string;store_name:string;management_no:string;start_date:string;end_date:string;request_id:string|null;hold_id?:string|null;item_id:string;state:string};
export function inventoryStoreIdentity(value:string){return value.normalize('NFKC').toLowerCase().replace(/[\s_：:・]/g,'').replace(/(?:延長|継続)$/,'');}
/** System records are authoritative. Keep raw source evidence, but omit matched source bookings entirely.
 * existing must contain only this product; authoritativeRequests spans all products and dates.
 */
export function importedBookings(entries:ImportedEntry[],existing:BoardBooking[]=[],authoritativeRequests:Pick<BoardBooking,'id'|'managementNo'>[]=existing.filter(b=>b.kind==='request')):BoardBooking[]{
 const ids=new Set(authoritativeRequests.map(r=>r.id)),numbers=new Set(authoritativeRequests.map(r=>r.managementNo.normalize('NFKC').trim()).filter(Boolean));
 return entries.filter(e=>{
  if(!['hold','blocked','linked','review'].includes(e.state))return false;
  if((e.request_id&&ids.has(e.request_id))||(e.management_no&&numbers.has(e.management_no.normalize('NFKC').trim())))return false;
  if(e.hold_id&&existing.some(b=>b.kind==='hold'&&b.id===e.hold_id))return false;
  // Exact normalized store + same product + overlapping dates; do not merge different issued numbers.
  return !existing.some(b=>(b.kind==='request'||(b.kind==='hold'&&!b.parentKey))&&(!e.management_no||!b.managementNo||e.management_no===b.managementNo)&&inventoryStoreIdentity(e.store_name)===inventoryStoreIdentity(b.store)&&e.start_date<=b.to&&e.end_date>=b.from);
 }).map(e=>({id:e.source_key,group:`sheet:${e.source_key}`,kind:'imported',staff:e.staff_name,store:e.store_name,managementNo:e.management_no,status:e.state==='blocked'?'blocked':e.management_no?'registered':'hold',from:e.start_date,to:e.end_date,start:e.start_date,end:e.end_date,delivery:'',pickup:'',href:'https://docs.google.com/spreadsheets/d/1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0/edit',source:`${e.source_tab} ${e.source_cell}`}));
}
