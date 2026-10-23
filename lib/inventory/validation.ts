import { validDate } from "./gantt";
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function stockInput(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("入力内容が不正です");
  const b = body as Record<string, unknown>;
  if (!uuid(b.item_id)) throw new Error("商品を選択してください");
  const total = b.total_count, reserve = b.reserve_count;
  if (!Number.isInteger(total) || !Number.isInteger(reserve) || (total as number) < 0 || (total as number) > 100000 || (reserve as number) < 0 || (reserve as number) > (total as number)) throw new Error("在庫数・予備数は0〜100,000の整数で、予備数は在庫数以下にしてください");
  return { item_id: b.item_id, total_count: total as number, reserve_count: reserve as number };
}
export function holdInput(body: unknown) {
  if (!body || typeof body !== "object") throw new Error("入力内容が不正です");
  const b = body as Record<string, unknown>;
  if (!uuid(b.id) || !uuid(b.item_id) || !uuid(b.staff_id)) throw new Error("商品と担当者を選択してください");
  if (typeof b.store_name !== "string" || !b.store_name.trim() || b.store_name.trim().length > 200) throw new Error("店舗名は1〜200文字で入力してください");
  if (!validDate(b.start_date) || !validDate(b.end_date) || b.end_date < b.start_date || b.start_date < "2000-01-01" || b.end_date > "2100-12-31") throw new Error("利用期間を正しく指定してください（2000〜2100年）");
  if (!Number.isInteger(b.quantity) || (b.quantity as number) < 1 || (b.quantity as number) > 100000) throw new Error("台数は1〜100,000の整数で指定してください");
  if (b.note != null && (typeof b.note !== "string" || b.note.length > 2000)) throw new Error("備考は2,000文字以内で入力してください");
  return { id: b.id, item_id: b.item_id, staff_id: b.staff_id, store_name: b.store_name.trim(), start_date: b.start_date, end_date: b.end_date, quantity: b.quantity as number, note: typeof b.note === "string" ? b.note.trim() : "" };
}
