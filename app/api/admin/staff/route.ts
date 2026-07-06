import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 担当者マスターの新規作成(管理者のみ。RLSで保護) */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { name?: string; company?: string; sort_order?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "氏名は必須です" }, { status: 400 });
  }

  const { error } = await supabase.from("staff_members").insert({
    name,
    company: (body.company ?? "").trim(),
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
  });

  if (error) {
    return NextResponse.json({ error: `作成に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
