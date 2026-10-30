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
 const result=tracks.map(t=>{const first=t.effective[0];
  if(t.raw.length===1)return first;const keys=t.raw.map(r=>r.booking.key!);keys.forEach(k=>aliases.set(k,first.booking.key!));
  const saved=edits.find(e=>e.booking_key===first.booking.key)?.patch.monthlySourceKeys;
  const source=t.effective.map(r=>r.booking.source).filter(Boolean).join(' / ');
  if(Array.isArray(saved))return {...first,booking:{...first.booking,source,monthlySourceKeys:keys}};
  const last=t.effective.at(-1)!,start=t.effective.map(r=>r.booking.start).sort()[0],end=t.effective.map(r=>r.booking.end).sort().at(-1)!;
  const from=t.effective.map(r=>r.booking.from).sort()[0],to=t.effective.map(r=>r.booking.to).sort().at(-1)!;
  const store=t.effective.map(r=>r.booking.store).find(v=>v&&!/^(?:店舗名未入力|未定|未確定)$/.test(v))??first.booking.store;
  return {...first,booking:{...first.booking,store,screenQuantity:Math.max(...t.effective.map(r=>r.booking.screenQuantity??0)),start,end,from,to,delivery:first.booking.delivery,pickup:last.booking.pickup,pickupRequired:last.booking.pickupRequired,shippingBase:{from,to},source,monthlySourceKeys:keys}};
 });
 // Resolve row swaps for other source-only cases displaced by the joined
 // case, using its released monthly source rows. Never move system requests,
 // real holds, switches, or equipment choices saved after normalization.
 const overlaps=(a:InventoryRecord,b:InventoryRecord)=>a.itemId===b.itemId&&!a.deleted&&!b.deleted&&a.booking.from<=b.booking.to&&a.booking.to>=b.booking.from;
 for(let i=0;i<tracks.length;i++){const t=tracks[i],joined=result[i];if(t.raw.length<2)continue;
  const released=[...new Set(t.effective.slice(1).map(r=>r.booking.unitNumber).filter((n):n is number=>typeof n==='number'&&n>0&&n!==joined.booking.unitNumber))];
  for(let j=0;j<result.length;j++){const other=result[j];if(i===j||other.booking.kind!=='imported'||other.booking.monthlySourceKeys?.length||other.booking.unitSwitches?.length||other.booking.sourceUnitSwitches?.length||other.booking.unitNumber!==joined.booking.unitNumber||!overlaps(joined,other)||edits.some(e=>e.booking_key===other.booking.key&&e.patch.monthlyRowNormalized===true))continue;
   const number=released.find(n=>!result.some((x,k)=>k!==j&&x.booking.unitNumber===n&&overlaps(other,x)));
   if(number)result[j]={...other,booking:{...other.booking,unitNumber:number}};
  }
 }
 return result.map(r=>r.booking.parentKey&&aliases.has(r.booking.parentKey)?{...r,booking:{...r.booking,parentKey:aliases.get(r.booking.parentKey)}}:r);
}
