import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory/access";
async function PUTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await inventoryAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  let ids: unknown;
  try { ids = (await req.json()).hold_ids; } catch { return NextResponse.json({ error: "入力内容が不正です" }, { status: 400 }); }
  const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  if (!uuid(id) || !Array.isArray(ids) || ids.length > 5 || !ids.every(uuid)) return NextResponse.json({ error: "仮押さえの選択が不正です" }, { status: 400 });
  const { error } = await access.db.rpc("set_inventory_hold_links", { p_request_id: id, p_hold_ids: ids });
  if (error) return NextResponse.json({ error: "紐付けを保存できませんでした。別申請への紐付け・取消・商品台数・処理中状態を確認してください" }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export const PUT=withInventorySheetPush(PUTHandler);
