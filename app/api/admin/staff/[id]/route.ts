import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 担当者マスターの更新(氏名・所属・表示順・公開フラグ) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: {
    name?: string;
    name_kana?: string;
    company?: string;
    sort_order?: number;
    is_active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
    update.name = name;
  }
  if (typeof body.name_kana === "string") {
    const nameKana = body.name_kana.trim();
    if (!nameKana)
      return NextResponse.json({ error: "読み(ふりがな)は必須です" }, { status: 400 });
    update.name_kana = nameKana;
  }
  if (typeof body.company === "string") update.company = body.company.trim();
  if (Number.isInteger(body.sort_order)) update.sort_order = body.sort_order;
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase.from("staff_members").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** 担当者マスターの削除 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { error } = await supabase.from("staff_members").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: `削除に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
