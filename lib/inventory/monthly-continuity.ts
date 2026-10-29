import type{InventoryRecord,BookingEdit,Assignment}from './model';
import{addDays}from './gantt';
import{inventoryStoreIdentity}from './sheet-import';
/** Monthly spreadsheet row order is not an equipment switch. Retain the earliest
 * source key so subsequent edits affect the complete continuous reservation.
 * Never absorb an independently edited/assigned source or simultaneous extra unit.
 */
export function joinMonthlyImports(records:InventoryRecord[],edits:BookingEdit[]=[],assignments:Assignment[]=[]):InventoryRecord[]{
 const result:InventoryRecord[]=[];
 for(const r of [...records].sort((a,b)=>a.booking.from.localeCompare(b.booking.from)||(a.booking.unitNumber??0)-(b.booking.unitNumber??0)||a.booking.id.localeCompare(b.booking.id))){
  const b=r.booking;
  const protectedSource=edits.some(e=>e.booking_key===b.key)||assignments.some(a=>a.item_id===r.itemId&&a.group_key===b.group);
  const candidates=b.kind==='imported'&&b.managementNo.trim()&&b.status==='registered'&&!protectedSource&&!b.unitSwitches?.length&&!b.sourceUnitSwitches?.length
   ?result.filter(p=>p.itemId===r.itemId&&p.booking.kind==='imported'&&p.booking.status===b.status&&p.booking.managementNo.normalize('NFKC').trim()===b.managementNo.normalize('NFKC').trim()&&inventoryStoreIdentity(p.booking.store)===inventoryStoreIdentity(b.store)&&addDays(p.booking.to,1)===b.from&&p.booking.to.slice(0,7)!==b.from.slice(0,7)&&!p.booking.unitSwitches?.length&&!p.booking.sourceUnitSwitches?.length):[];
  candidates.sort((a,c)=>Number(c.booking.unitNumber===b.unitNumber)-Number(a.booking.unitNumber===b.unitNumber)||(a.booking.unitNumber??0)-(c.booking.unitNumber??0));
  const prior=candidates[0];
  if(prior){prior.booking={...prior.booking,to:b.to,end:b.end,pickup:b.pickup,source:[prior.booking.source,b.source].filter(Boolean).join(' / ')};}
  else result.push({...r,booking:{...b}});
 }
 return result;
}
