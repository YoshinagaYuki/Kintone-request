import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["allmight", "tezukuru"];

/** 名称マスターの更新 */
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
    category?: string;
    name?: string;
    aliases?: string[];
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
    if (!name) return NextResponse.json({ error: "正式名称は必須です" }, { status: 400 });
    update.name = name;
  }
  if (typeof body.category === "string") {
    if (!CATEGORIES.includes(body.category)) {
      return NextResponse.json({ error: "種別が不正です" }, { status: 400 });
    }
    update.category = body.category;
  }
  if (Array.isArray(body.aliases)) {
    update.aliases = body.aliases.map((a) => String(a).trim()).filter(Boolean);
  }
  if (Number.isInteger(body.sort_order)) update.sort_order = body.sort_order;
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase.from("item_name_master").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** 名称マスターの削除 */
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

  const { error } = await supabase.from("item_name_master").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: `削除に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
