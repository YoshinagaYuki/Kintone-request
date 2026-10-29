import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory/access";
import { stockInput } from "@/lib/inventory/validation";
async function PUTHandler(req: NextRequest) {
  const access = await inventoryAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  let input;
  try { input = stockInput(await req.json()); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "入力が不正です" }, { status: 400 }); }
  const { data: item, error: itemError } = await access.db.from("item_name_master").select("id").eq("id", input.item_id).in("category", ["allmight","tezukuru"]).eq("is_active", true).maybeSingle();
  if (itemError) return NextResponse.json({ error: "商品の確認に失敗しました" }, { status: 500 });
  if (!item) return NextResponse.json({ error: "有効な在庫商品を選択してください" }, { status: 400 });
  const { error } = await access.db.from("inventory_stock").upsert(input, { onConflict: "item_id" });
  if (error) return NextResponse.json({ error: "在庫数を保存できませんでした。設定を確認してください" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export const PUT=withInventorySheetPush(PUTHandler);
