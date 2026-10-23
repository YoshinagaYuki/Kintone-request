import { normalizeForCompare } from "@/lib/item-normalizer";
import { validDate } from "./gantt";
export type CapacityItem = { id: string; name: string; aliases?: unknown; total_count?: number; reserve_count?: number };
export type Occupancy = { item_id: string; from: string; to: string; quantity: number };
export function matchCapacityItem(name: string, items: CapacityItem[]): CapacityItem | null {
  const exact = items.filter(i => i.name === name);
  if (exact.length === 1) return exact[0];
  const n = normalizeForCompare(name);
  if (!n) return null;
  const matches=items.filter(i=>[i.name,...(Array.isArray(i.aliases)?i.aliases.filter((s):s is string=>typeof s==="string"):[])].some(s=>normalizeForCompare(s)===n));
  return matches.length===1?matches[0]:null;
}
export function capacityOn(date: string, item: CapacityItem, occupancies: Occupancy[]) {
  const used = occupancies.filter(o=>o.item_id===item.id&&validDate(o.from)&&validDate(o.to)&&o.from<=date&&o.to>=date).reduce((sum,o)=>sum+o.quantity,0);
  const configured=Number.isInteger(item.total_count)&&Number.isInteger(item.reserve_count)&&(item.total_count??-1)>=0&&(item.reserve_count??-1)>=0&&item.reserve_count!<=item.total_count!;
  return { used, remaining:configured?item.total_count!-item.reserve_count!-used:null };
}
