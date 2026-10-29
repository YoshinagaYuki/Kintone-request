import{tezukuruKitNames}from'./business';
import { ALLMIGHT_FMT_LABELS as L, equipmentLabel } from "@/lib/allmight-fmt";

export type InventoryRequest = {
  inventory_parent_request_id?: string | null; inventory_root_id?: string; pickup_cancelled?: boolean;
  approved_contents?:Record<string,string>|null; id: string; status: string; management_no: string | null;
  parsed_data: Record<string, unknown> | null;
  approved_staff_name: string | null; company_staff_name_input: string | null;
};
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function ganttEntry(request: InventoryRequest,business:'allmight'|'tezukuru'='allmight') {
  const data = request.parsed_data ?? {};
  const text = (key: string) => typeof data[key] === "string" ? (data[key] as string).trim() : "";
  const tezu=business==='tezukuru';
  const delivery = text(tezu?'配送日付':L.deliveryDate), pickup = request.pickup_cancelled ? "" : text(tezu?'集荷日付':L.pickupDate);
  const start = tezu?(text('_inventory_usage_start')||(validDate(delivery)?addDays(delivery,1):'')):text(L.usageStart), end = tezu?(text('_inventory_usage_end')||(validDate(pickup)?addDays(pickup,-1):'')):text(L.usageEnd);
  if (!validDate(start) || !validDate(end) || end < start) return null;
  const dates = [start, end, delivery, pickup].filter(validDate).sort();
  return {
    ...request, start, end, delivery, pickup, deliveryRequired:(request.inventory_parent_request_id||data['_inventory_delivery_required']===false)?false:undefined,pickupRequired:request.pickup_cancelled||data['_inventory_pickup_required']===false?false:undefined,
    from: dates[0], to: dates[dates.length - 1],
    store: (tezu?text('イベントブース名'):'') || text(L.eventBoothName) || text(L.eventBooth) || text(L.agencyName) || "店舗名未設定",
    staff: request.approved_staff_name || request.company_staff_name_input || text("担当者") || "担当者未設定",
    // 同一商品が複数枠にある場合も、各枠を独立した行として残す。
    items: tezu?tezukuruKitNames(data):Array.from({ length: 5 }, (_, i) => text(equipmentLabel(i + 1))).filter(Boolean),
  };
}
