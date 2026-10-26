import type{InventoryRecord,Assignment}from'./model';
import{addDays,validDate}from'./gantt';
export type CopySlot={source_group?:string;source_key:string;item_id:string;group_key:string;unit_number:number|null;screen_quantity:number};
export type InventoryCopy={id:string;child_request_id:string;parent_key:string;state:string;slots:CopySlot[]};
export function copyDates(end:string){if(!validDate(end))throw Error('コピー元の利用終了日を確認してください');const start=addDays(end,1);return{start,end:start,delivery:'',pickup:'',from:start,to:start,deliveryRequired:false,pickupRequired:false};}
/** Copy reservations share a physical unit, never an invoice or management number. */
export function applyInventoryCopies(records:InventoryRecord[],copies:InventoryCopy[],assignments:Assignment[]):InventoryRecord[]{
 const result=records.map(r=>({...r,booking:{...r.booking}}));
 for(const c of copies.filter(c=>c.state!=='cancelled')){const children=result.filter(r=>r.booking.kind==='request'&&r.booking.id===c.child_request_id&&!r.deleted);for(const [index,slot]of c.slots.entries()){
 const parent=result.find(r=>r.booking.key===slot.source_key),child=children.find(r=>r.booking.key===`request:${c.child_request_id}:${index}`);
 if(parent){parent.booking.group=slot.group_key;const a=assignments.find(a=>a.group_key===slot.group_key&&a.item_id===parent.itemId);if(a)parent.booking.unitNumber=a.unit_number;}
 if(!child)continue;child.booking.deliveryRequired??=!!child.booking.delivery;child.booking.pickupRequired??=!!child.booking.pickup;child.booking.extension=true;if(c.state==='draft')child.booking.status='hold';
 // Edited/replaced equipment cannot share the old physical unit without a real transfer.
 if(child.itemId!==slot.item_id)continue;
 child.booking.group=slot.group_key;const a=assignments.find(a=>a.group_key===slot.group_key&&a.item_id===child.itemId);child.booking.unitNumber=a?a.unit_number:slot.unit_number;
 if(parent&&child.booking.deliveryRequired===false&&child.booking.start===addDays(parent.booking.end,1)){
 parent.booking.pickup='';parent.booking.pickupRequired=false;parent.booking.to=parent.booking.end;
 }
 }}return result;
}
