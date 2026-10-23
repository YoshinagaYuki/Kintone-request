import { strict as assert } from "node:assert";
import { test } from "node:test";
import { stockInput, holdInput } from "../lib/inventory/validation";
const item_id = "33333333-3333-4333-8333-333333333333";
const hold = { id: "66666666-6666-4666-8666-666666666666", item_id, staff_id: "55555555-5555-4555-8555-555555555555", store_name: " 店舗A ", start_date: "2026-10-23", end_date: "2026-10-25", quantity: 2, note: " 連絡事項 " };
test("stock permits zero and full reserve; rejects unknown, fractional, negative, excessive and coerced counts", () => {
  assert.equal(stockInput({ item_id, total_count: 0, reserve_count: 0 }).total_count, 0);
  assert.equal(stockInput({ item_id, total_count: 5, reserve_count: 5 }).reserve_count, 5);
  for (const [total_count, reserve_count] of [[null, 0], [5, 6], [3.5, 0], [-1, 0], [100001, 0], ["5", 0], [5, -1], [5, 0.5]]) assert.throws(() => stockInput({ item_id, total_count, reserve_count }));
});
test("holds validate real dates, ordering, quantities, identifiers and text limits", () => {
  for (const patch of [{ start_date: "2026-02-30" }, { end_date: "2026-10-22" }, { quantity: 0 }, { quantity: 1.5 }, { item_id: "invalid" }, { staff_id: null }, { store_name: " " }, { store_name: "a".repeat(201) }, { note: "a".repeat(2001) }, { start_date: "1999-01-01" }, { end_date: "2101-01-01" }]) assert.throws(() => holdInput({ ...hold, ...patch }));
  assert.doesNotThrow(() => holdInput({ ...hold, end_date: hold.start_date }));
});
test("client-controlled actor and unknown fields are removed", () => {
  const result = holdInput({ ...hold, created_by: "spoof", cancelled_at: "2026-10-24", management_no: "1010" });
  assert.equal(result.store_name, "店舗A"); assert.equal(result.note, "連絡事項");
  assert.equal("created_by" in result, false); assert.equal("cancelled_at" in result, false);
  assert.equal("management_no" in result, false);
});
