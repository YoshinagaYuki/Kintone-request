import type {InventoryRecord} from './model';
import type {BoardBooking} from './board';
export type ExtensionFlag={business:string;management_no:string;possible:boolean};
export function extensionNumber(booking:Pick<BoardBooking,'managementNo'>){const n=booking.managementNo.normalize('NFKC').trim();return /^\d{1,20}$/.test(n)?BigInt(n).toString():null;}
/** A case may occupy several machines or monthly source rows; its marker is shared. */
export function applyExtensionFlags(records:InventoryRecord[],items:{id:string;inventory_role?:string|null}[],flags:ExtensionFlag[]){
 const marked=new Set(flags.filter(f=>f.possible).map(f=>`${f.business}:${f.management_no}`));
 return records.map(r=>({...r,booking:{...r.booking,extensionPossible:marked.has(`${items.find(i=>i.id===r.itemId)?.inventory_role==='rental_kit'?'tezukuru':'allmight'}:${extensionNumber(r.booking)}`)}}));
}
