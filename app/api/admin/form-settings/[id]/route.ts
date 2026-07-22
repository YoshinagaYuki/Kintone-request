import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_TEMPLATE = 20000;
const MAX_TEXT = 5000;

/**
 * 申請フォーム設定の更新(管理者のみ)。
 * 対象: fmt_template(FMTテンプレート) / notes(注意事項) / input_guide(案内文章)
 * ・空欄保存を許可する
 * ・改行/全角スペース/インデントはそのまま保存(trimしない)
 * ・fmt_template 変更時は 0004 のトリガーで version が自動+1 され履歴が残る
 */
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

  let body: { fmt_template?: string; notes?: string; input_guide?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (typeof body.fmt_template === "string") {
    if (body.fmt_template.length > MAX_TEMPLATE) {
      return NextResponse.json({ error: "FMTテンプレートが長すぎます" }, { status: 400 });
    }
    update.fmt_template = body.fmt_template; // 空文字も許可・整形しない
  }
  if (typeof body.notes === "string") {
    if (body.notes.length > MAX_TEXT) {
      return NextResponse.json({ error: "注意事項が長すぎます" }, { status: 400 });
    }
    update.notes = body.notes;
  }
  if (typeof body.input_guide === "string") {
    if (body.input_guide.length > MAX_TEXT) {
      return NextResponse.json({ error: "案内文章が長すぎます" }, { status: 400 });
    }
    update.input_guide = body.input_guide;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }
  update.updated_by = user.id;

  const { error } = await supabase.from("form_types").update(update).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `保存に失敗しました: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
