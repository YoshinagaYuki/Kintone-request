import type {BoardBooking} from './board';
export type ImportedEntry={source_key:string;source_tab:string;source_cell:string;staff_name:string;store_name:string;management_no:string;start_date:string;end_date:string;request_id:string|null;item_id:string;state:string};
/** Linked entries are provenance only: the request remains the single occupancy source. */
export function importedBookings(entries:ImportedEntry[]):BoardBooking[]{
 return entries.filter(e=>e.state==='hold'||e.state==='blocked').map(e=>({id:e.source_key,group:`sheet:${e.source_key}`,kind:'imported',staff:e.staff_name,store:e.store_name,managementNo:e.management_no,status:e.state==='blocked'?'blocked':'hold',from:e.start_date,to:e.end_date,start:e.start_date,end:e.end_date,delivery:'',pickup:'',href:'https://docs.google.com/spreadsheets/d/1bEbV3bJvGIBhRdKnf3KwBIoJo-2EA-uXRNx2szq6Qx0/edit',source:`${e.source_tab} ${e.source_cell}`}));
}
