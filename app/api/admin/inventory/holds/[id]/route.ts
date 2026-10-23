import { NextResponse } from "next/server";
import { inventoryAccess } from "@/lib/inventory/access";
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await inventoryAccess();
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "登録番号が不正です" }, { status: 400 });
  const { data, error } = await access.db.from("inventory_holds").update({ cancelled_at: new Date().toISOString() }).eq("id", id).is("cancelled_at", null).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "仮押さえを取り消せませんでした" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "仮押さえが見つからないか、すでに取消済みです" }, { status: 409 });
  return NextResponse.json({ ok: true });
}
