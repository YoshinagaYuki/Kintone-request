import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** レンタルプランマスターの新規作成(管理者のみ。RLSで保護) */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { name?: string; description?: string; sort_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "プラン名は必須です" }, { status: 400 });
  }
  if (name.length > 100) {
    return NextResponse.json({ error: "プラン名が長すぎます" }, { status: 400 });
  }

  const { error } = await supabase.from("rental_plans").insert({
    name,
    description: (body.description ?? "").toString().slice(0, 500),
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
  });

  if (error) {
    return NextResponse.json({ error: `作成に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
