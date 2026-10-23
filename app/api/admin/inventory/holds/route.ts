import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory/access";
import { holdInput } from "@/lib/inventory/validation";
async function POSTHandler(req: NextRequest) {
  const access = await inventoryAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  let input;
  try { input = holdInput(await req.json()); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "入力が不正です" }, { status: 400 }); }
  // DBトリガーでも事業・有効状態を検証。作成者はクライアントから受け取らない。
  const { error } = await access.db.from("inventory_holds").insert({ ...input, created_by: access.admin.auth_user_id });
  if (error?.code === "23505") {
    const { data: existing, error: readError } = await access.db.from("inventory_holds").select("id,item_id,staff_id,store_name,start_date,end_date,quantity,note,created_by,cancelled_at").eq("id", input.id).maybeSingle();
    const same = !readError && existing && existing.created_by === access.admin.auth_user_id && !existing.cancelled_at && Object.entries(input).every(([key, value]) => (existing as Record<string, unknown>)[key] === value);
    if (same) return NextResponse.json({ ok: true });
    return NextResponse.json({ error: "同じ登録番号で異なる内容が登録されています。画面を更新してください" }, { status: 409 });
  }
  if (error) return NextResponse.json({ error: "仮押さえを保存できませんでした。商品・担当者・設定を確認してください" }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

export const POST=withInventorySheetPush(POSTHandler);
