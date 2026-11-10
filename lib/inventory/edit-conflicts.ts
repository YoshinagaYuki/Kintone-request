import type {InventoryRecord} from './model';
import {slotSchedule} from './operations';
import {addDays} from './gantt';
/** Existing collisions must not block an edit that introduces no additional overlap.
 * Subtract only the same saved slot's occupancy on the same physical equipment.
 * Compare the added portions against all other bookings, including edited siblings. */
export function editConflictSchedule(candidates:InventoryRecord[],before:InventoryRecord[],existing:InventoryRecord[]){
 const changed=candidates.flatMap(record=>{
  const previous=before.find(r=>r.booking.key===record.booking.key);
  const old=previous?slotSchedule([previous]):[];
  return slotSchedule([record]).flatMap(next=>{
   let pieces=[next];
   for(const prior of old.filter(p=>p.item_id===next.item_id&&p.unit_number===next.unit_number&&p.group_key===next.group_key)){
    pieces=pieces.flatMap(piece=>{
     if(prior.occupied_to<piece.occupied_from||prior.occupied_from>piece.occupied_to)return[piece];
     return [...(piece.occupied_from<prior.occupied_from?[{...piece,occupied_to:addDays(prior.occupied_from,-1)}]:[]),...(piece.occupied_to>prior.occupied_to?[{...piece,occupied_from:addDays(prior.occupied_to,1)}]:[])];
    });
   }
   return pieces;
  });
 });
 return {candidate:changed,existing:slotSchedule([...existing,...candidates])};
}
