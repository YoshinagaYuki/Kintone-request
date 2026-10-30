import type{InventoryRecord,BookingEdit,Assignment}from './model';
import{addDays}from './gantt';
import{inventoryStoreIdentity}from './sheet-import';
const identity=(r:InventoryRecord)=>{const b=r.booking,n=b.managementNo.normalize('NFKC').trim();return n?`number:${n}`:b.status==='hold'&&inventoryStoreIdentity(b.store)&&!['未定','未確定','店舗未設定'].includes(b.store.trim())?`hold:${inventoryStoreIdentity(b.store)}:${b.staff.normalize('NFKC').replace(/\s/g,'')}`:'';};
/** Monthly source row order is not an equipment switch. Pair each source unit
 * one-to-one across adjacent usage months, retaining all simultaneous units.
 * Use effective old edits for the initial union, and a complete saved snapshot
 * for subsequent edits, so changing the joined dates cannot revive old pieces.
 */
export function joinMonthlyImports(records:InventoryRecord[],edits:BookingEdit[]=[],_assignments:Assignment[]=[],effective:InventoryRecord[]=records):InventoryRecord[]{
 const byKey=new Map(effective.map(r=>[r.booking.key,r]));
 const tracks:{raw:InventoryRecord[];effective:InventoryRecord[]}[]=[];
 for(const raw of [...records].sort((a,b)=>a.booking.start.localeCompare(b.booking.start)||(a.booking.unitNumber??0)-(b.booking.unitNumber??0)||a.booking.id.localeCompare(b.booking.id))){
  const r=byKey.get(raw.booking.key)??raw,b=raw.booking;
  const candidates=b.kind==='imported'&&identity(raw)&&b.status!=='blocked'?tracks.filter(t=>{const p=t.raw.at(-1)!,first=t.raw[0],e=t.effective.at(-1)!;const saved=edits.find(x=>x.booking_key===first.booking.key)?.patch.monthlySourceKeys;
   return p.itemId===raw.itemId&&p.booking.kind==='imported'&&identity(p)===identity(raw)&&addDays(p.booking.end,1)===b.start&&p.booking.end.slice(0,7)!==b.start.slice(0,7)&&(!r.deleted||raw.booking.key===first.booking.key)&&(!r.booking.unitSwitches?.length)&&(!r.booking.sourceUnitSwitches?.length)&&(Array.isArray(saved)||identity(e)===identity(r))&&(Array.isArray(saved)||r.booking.start<=addDays(e.booking.end,1));}):[];
  candidates.sort((a,c)=>Number(c.raw.at(-1)!.booking.unitNumber===b.unitNumber)-Number(a.raw.at(-1)!.booking.unitNumber===b.unitNumber)||(a.raw[0].booking.unitNumber??0)-(c.raw[0].booking.unitNumber??0));
  if(candidates[0]){candidates[0].raw.push(raw);candidates[0].effective.push(r);}else tracks.push({raw:[raw],effective:[r]});
 }
 const aliases=new Map<string,string>();
 const result=tracks.map(t=>{const first=t.effective[0];if(t.raw.length===1)return first;const keys=t.raw.map(r=>r.booking.key!);keys.forEach(k=>aliases.set(k,first.booking.key!));
  const saved=edits.find(e=>e.booking_key===first.booking.key)?.patch.monthlySourceKeys;
  const source=t.effective.map(r=>r.booking.source).filter(Boolean).join(' / ');
  if(Array.isArray(saved))return {...first,booking:{...first.booking,source,monthlySourceKeys:keys}};
  const last=t.effective.at(-1)!,start=t.effective.map(r=>r.booking.start).sort()[0],end=t.effective.map(r=>r.booking.end).sort().at(-1)!;
  const from=t.effective.map(r=>r.booking.from).sort()[0],to=t.effective.map(r=>r.booking.to).sort().at(-1)!;
  const store=t.effective.map(r=>r.booking.store).find(v=>v&&!/^(?:店舗名未入力|未定|未確定)$/.test(v))??first.booking.store;
  return {...first,booking:{...first.booking,store,screenQuantity:Math.max(...t.effective.map(r=>r.booking.screenQuantity??0)),start,end,from,to,delivery:first.booking.delivery,pickup:last.booking.pickup,pickupRequired:last.booking.pickupRequired,shippingBase:{from,to},source,monthlySourceKeys:keys}};
 });
 return result.map(r=>r.booking.parentKey&&aliases.has(r.booking.parentKey)?{...r,booking:{...r.booking,parentKey:aliases.get(r.booking.parentKey)}}:r);
}
