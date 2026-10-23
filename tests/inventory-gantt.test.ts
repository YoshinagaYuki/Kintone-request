import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDays, ganttEntry, validDate, type InventoryRequest } from "../lib/inventory/gantt";
const base: InventoryRequest = { id: "r1", status: "pending", management_no: null, parsed_data: { "利用開始日": "2026-10-23", "利用最終日": "2026-10-25", "配送日付": "2026-10-21", "集荷日付": "2026-10-27", "機器商品①": "JET Cola", "機器商品②": "JET Cola", "イベントブース名": "店舗A" }, approved_staff_name: "確定担当", company_staff_name_input: "入力担当" };
test("invalid calendar dates and reversed periods are rejected", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(ganttEntry({ ...base, parsed_data: { ...base.parsed_data, "利用最終日": "2026-10-22" } }), null);
});
test("delivery/pickup outside usage remain visible and repeated equipment slots survive", () => {
  const e = ganttEntry(base)!;
  assert.equal(e.from, "2026-10-21"); assert.equal(e.to, "2026-10-27");
  assert.deepEqual(e.items, ["JET Cola", "JET Cola"]);
  assert.equal(e.staff, "確定担当"); assert.equal(e.store, "店舗A");
});
test("management numbers reflect source and missing legacy dates are not invented", () => {
  assert.equal(ganttEntry({ ...base, management_no: "1010" })?.management_no, "1010");
  assert.equal(ganttEntry({ ...base, parsed_data: null }), null);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
