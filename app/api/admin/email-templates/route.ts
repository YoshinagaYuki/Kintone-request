import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * メールテンプレートの更新(管理者のみ。RLSで保護)。
 * body: { key: 'application'|'approval'; subject: string; body: string }
 * ・本文はDB保存(コード直書きしない)。差込プレースホルダは保存時に検証しない(自由記述)。
 */
const VALID_KEYS = new Set(["application", "approval"]);

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  let body: { key?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const key = (body.key ?? "").trim();
  if (!VALID_KEYS.has(key)) {
    return NextResponse.json({ error: "テンプレート種別が不正です" }, { status: 400 });
  }
  const subject = (body.subject ?? "").toString();
  const templateBody = (body.body ?? "").toString();
  if (!subject.trim()) {
    return NextResponse.json({ error: "件名を入力してください" }, { status: 400 });
  }
  if (!templateBody.trim()) {
    return NextResponse.json({ error: "本文を入力してください" }, { status: 400 });
  }

  const { error } = await supabase
    .from("email_templates")
    .upsert({ key, subject, body: templateBody }, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ error: `保存に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
