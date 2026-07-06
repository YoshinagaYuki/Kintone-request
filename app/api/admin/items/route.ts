import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["allmight", "tezukuru"];

/** 名称マスターの新規作成(管理者のみ。RLSで保護) */
export async function POST(req: NextRequest) {
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "正式名称は必須です" }, { status: 400 });
  }
  if (!CATEGORIES.includes(body.category ?? "")) {
    return NextResponse.json({ error: "種別が不正です" }, { status: 400 });
  }
  const aliases = Array.isArray(body.aliases)
    ? body.aliases.map((a) => String(a).trim()).filter(Boolean)
    : [];

  const { error } = await supabase.from("item_name_master").insert({
    category: body.category,
    name,
    aliases,
    sort_order: Number.isInteger(body.sort_order) ? body.sort_order : 0,
  });

  if (error) {
    return NextResponse.json({ error: `作成に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
