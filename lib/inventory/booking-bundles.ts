import type {InventoryRecord} from './model';
/** A creation batch and later additions remain one editable rental case. Invoice copies remain separate. */
export function linkBookingBundles(records:InventoryRecord[]):InventoryRecord[]{
 const parents=new Map<string,string>();const root=(key:string):string=>{const p=parents.get(key);if(!p){parents.set(key,key);return key;}return p===key?key:root(p);};
 const union=(a:string,b:string)=>{const x=root(a),y=root(b);if(x!==y)parents.set(x<y?y:x,x<y?x:y);};
 const byKey=new Map(records.map(r=>[r.booking.key,r]));
 const key=(r:InventoryRecord)=>r.booking.kind==='request'?`request:${r.booking.id}`:r.booking.bundleKey??r.booking.key!;
 for(const r of records){root(key(r));if(r.booking.kind!=='request'&&r.booking.parentKey){const parent=byKey.get(r.booking.parentKey);if(parent&&parent.booking.kind!=='request')union(key(r),key(parent));}}
 return records.map(r=>({...r,booking:{...r.booking,bundleKey:root(key(r))}}));
}
export function linkedBookings(records:InventoryRecord[],selected:InventoryRecord){return records.filter(r=>r.booking.bundleKey===selected.booking.bundleKey&&!!selected.booking.bundleKey);}
/** Compare only editable persisted data, excluding global clock, URLs and UI metadata. */
export function bookingEditBaseline(records:InventoryRecord[]){return JSON.stringify(records.map(r=>({item:r.itemId,deleted:!!r.deleted,key:r.booking.key,group:r.booking.group,unit:r.booking.unitNumber??null,staff:r.booking.staff,store:r.booking.store,start:r.booking.start,end:r.booking.end,from:r.booking.from,to:r.booking.to,delivery:r.booking.delivery,pickup:r.booking.pickup,deliveryRequired:r.booking.deliveryRequired,pickupRequired:r.booking.pickupRequired,status:r.booking.status,managementNo:r.booking.managementNo,screenQuantity:r.booking.screenQuantity??0,switches:r.booking.unitSwitches??[]})).sort((a,b)=>String(a.key).localeCompare(String(b.key))));}
export const commonBookingPatch=(patch:Record<string,unknown>)=>Object.fromEntries(['staff','store','start','end','delivery','pickup','from','to','deliveryRequired','pickupRequired','status','managementNo'].filter(k=>k in patch).map(k=>[k,patch[k]]));
