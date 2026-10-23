import { ALLMIGHT_FMT_LABELS as L } from "@/lib/allmight-fmt";
import { addDays, validDate } from "../gantt";
import { buildKintoneRecord, type FieldMapping, type KintoneRecord } from "@/lib/kintone/mapper";
import { applyAllmightPricing } from "@/lib/allmight/pricing";
import { SHIPPING_FIELD_MAPPING, EQUIPMENT_CODE_FIELDS, resolveEquipmentCode } from "@/lib/kintone/shipping-mapping";

export const SHIPPING_LABELS = [L.deliveryDate, L.deliveryAddress, L.deliveryPostal, L.deliveryReceiver, L.deliveryContact, L.pickupAddress, L.pickupPostal, L.pickupHandover, L.pickupContact, L.shippingFee];
export const BLANK_SHIPPING_CODES = ["納品_日付", "納品_住所", "納品_担当者", "納品_電話番号", "郵便番号", "納品_時間", "集荷_住所", "集荷_担当者", "集荷_電話番号", "郵便番号_0", "集荷_時刻"];
export type ExtensionInput = { id: string; usage_end: string; pickup_date: string; billing_month: number };
export function extensionInput(body: unknown): ExtensionInput {
  if (!body || typeof body !== "object") throw new Error("入力内容が不正です");
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(b.id)) throw new Error("登録番号が不正です");
  if (!validDate(b.usage_end) || !validDate(b.pickup_date) || b.pickup_date < b.usage_end || b.usage_end < "2000-01-01" || b.pickup_date > "2100-12-31") throw new Error("利用終了日と集荷日を正しく指定してください");
  if (!Number.isInteger(b.billing_month) || (b.billing_month as number) < 1 || (b.billing_month as number) > 12) throw new Error("請求対象月を選択してください");
  return { id: b.id, usage_end: b.usage_end, pickup_date: b.pickup_date, billing_month: b.billing_month as number };
}
export function extensionParsed(parent: Record<string, string>, input: ExtensionInput) {
  if (!validDate(parent[L.usageEnd]) || input.usage_end <= parent[L.usageEnd]) throw new Error("延長後の利用終了日は現在の終了日より後にしてください");
  const result = { ...parent };
  for (const label of SHIPPING_LABELS) delete result[label];
  result[L.usageStart] = addDays(parent[L.usageEnd], 1);
  result[L.usageEnd] = input.usage_end;
  result[L.pickupDate] = input.pickup_date;
  result[L.billingMonth] = `${input.billing_month}月分`;
  return result;
}
export function extensionDraft(parsed: Record<string, string>, mapping: FieldMapping, childId: string, parentNumber: string): KintoneRecord {
  const blankCodes = new Set([...BLANK_SHIPPING_CODES, "配送費"]);
  const adjusted = { ...mapping, mappings: mapping.mappings.map(m => blankCodes.has(m.kintone_code) ? { ...m, required: false } : m) };
  const mapped = buildKintoneRecord(parsed, adjusted);
  if (!mapped.ok) throw new Error(`延長の登録項目を確認してください: ${mapped.errors.join(" / ")}`);
  const record = mapped.record;
  delete record["管理番号"];
  for (const code of BLANK_SHIPPING_CODES) record[code] = { value: "" };
  record["手配種別"] = { value: "手配不要" };
  // 新しい配送管理の準備完了まで、集荷は有効にしない。
  record["集荷_手配種別"] = { value: "手配不要" };
  record["集荷_日付"] = { value: parsed[L.pickupDate] };
  record["配送費"] = { value: "0" };
  record["external_project_id"] = { value: `inventory-extension:${childId}` };
  record["文字列__複数行_"] = { value: `管理番号${parentNumber}からの延長（新規納品なし）` };
  const pricing = applyAllmightPricing(record);
  if (pricing.warnings.length) throw new Error(`延長料金を計算できません: ${pricing.warnings.join(" / ")}`);
  return record;
}
export function extensionShippingDraft(source: KintoneRecord, managementNo: string): KintoneRecord {
  const record: KintoneRecord = { "管理番号": { value: managementNo } };
  for (const { from, to } of SHIPPING_FIELD_MAPPING) if (source[from]) record[to] = { ...source[from] };
  for (const { equipmentField, codeField } of EQUIPMENT_CODE_FIELDS) {
    const value = record[equipmentField]?.value;
    if (typeof value === "string") { const code = resolveEquipmentCode(value); if (code) record[codeField] = { value: code }; }
  }
  record["ドロップダウン_1"] = { value: "入力中" };
  return record;
}
