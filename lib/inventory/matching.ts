import { validDate } from "./gantt";
import { normalizeForCompare, similarity } from "@/lib/item-normalizer";
export type HoldCandidate = { id: string; item_id: string; item_name: string; staff_name: string; store_name: string; start_date: string; end_date: string; quantity: number };
export function rankCandidates(holds: HoldCandidate[], request: { start: string; end: string; staff: string; store: string; items: string[] }) {
  if (!validDate(request.start) || !validDate(request.end) || request.end < request.start) return [];
  const diff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  return holds.filter(h => validDate(h.start_date) && validDate(h.end_date) && diff(h.start_date, request.start) <= 7 && diff(h.end_date, request.end) <= 7)
    .map(h => ({ ...h, score: (normalizeForCompare(h.staff_name) === normalizeForCompare(request.staff) && request.staff ? 40 : 0) + similarity(h.store_name, request.store) * 40 + (request.items.includes(h.item_name) ? 20 : 0) - diff(h.start_date, request.start) - diff(h.end_date, request.end) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
