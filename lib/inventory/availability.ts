import { normalizeForCompare } from "@/lib/item-normalizer";
import { validDate } from "./gantt";
export type StockSchedule = {item_id:string;effective_date:string;total_count:number;reserve_count:number};
export type CapacityItem = { schedule?:StockSchedule[]; id: string; name: string; aliases?: unknown; total_count?: number; reserve_count?: number };
export type Occupancy = { group?: string; item_id: string; from: string; to: string; quantity: number };
export function matchCapacityItem(name: string, items: CapacityItem[]): CapacityItem | null {
  const exact = items.filter(i => i.name === name);
  if (exact.length === 1) return exact[0];
  const n = normalizeForCompare(name);
  if (!n) return null;
  const matches=items.filter(i=>[i.name,...(Array.isArray(i.aliases)?i.aliases.filter((s):s is string=>typeof s==="string"):[])].some(s=>normalizeForCompare(s)===n));
  return matches.length===1?matches[0]:null;
}
export function capacityOn(date: string, item: CapacityItem, occupancies: Occupancy[]) {
  const planned=item.schedule?.filter(p=>p.effective_date<=date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
  if(planned)item={...item,total_count:planned.total_count,reserve_count:planned.reserve_count};
  const groups = new Map<string, number>();
  occupancies.forEach((o,index) => { if(o.item_id===item.id&&validDate(o.from)&&validDate(o.to)&&o.from<=date&&o.to>=date) { const key=o.group??`row:${index}`; groups.set(key,Math.max(groups.get(key)??0,o.quantity)); } });
  const used = [...groups.values()].reduce((sum,n)=>sum+n,0);
  const configured=Number.isInteger(item.total_count)&&Number.isInteger(item.reserve_count)&&(item.total_count??-1)>=0&&(item.reserve_count??-1)>=0&&item.reserve_count!<=item.total_count!;
  return { used, remaining:configured?item.total_count!-item.reserve_count!-used:null };
}
