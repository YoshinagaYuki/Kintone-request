import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** レンタルプランの更新(名称/説明/表示順/有効フラグ) */
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
    description?: string;
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
    if (!name) return NextResponse.json({ error: "プラン名は必須です" }, { status: 400 });
    update.name = name.slice(0, 100);
  }
  if (typeof body.description === "string") update.description = body.description.slice(0, 500);
  if (Number.isInteger(body.sort_order)) update.sort_order = body.sort_order;
  if (typeof body.is_active === "boolean") update.is_active = body.is_active;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase.from("rental_plans").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * 削除。利用済み(申請から参照)のプランは物理削除しない(無効化を促す)。
 */
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

  // 参照チェック(requested / approved いずれかで使われていれば削除不可)
  const { count } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .or(`requested_rental_plan_id.eq.${id},approved_rental_plan_id.eq.${id}`);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "このプランは申請で利用されているため削除できません。無効化してください。" },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("rental_plans").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: `削除に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
