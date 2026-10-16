import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";

/**
 * メールテンプレートの更新(有効な管理者のみ。RLSでも保護)。
 * body: { key: 'application'|'approval'; business?: 'tezukuru'|'allmight'; subject; body }
 * ・business='allmight' のときは実キー `${key}_allmight` に保存(てずくーるは従来キー)。
 * ・本文はDB保存(コード直書きしない)。差込プレースホルダは保存時に検証しない(自由記述)。
 */
const VALID_BASE_KEYS = new Set(["application", "approval"]);
const VALID_BUSINESS = new Set(["tezukuru", "allmight"]);

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  // ログインだけでなく「有効(active)な管理者」であることを必須にする。
  // 停止中(disabled)・招待中(invited)・admin_users 未登録の認証ユーザーは拒否する。
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { key?: string; business?: string; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const baseKey = (body.key ?? "").trim();
  const business = (body.business ?? "tezukuru").trim();
  if (!VALID_BASE_KEYS.has(baseKey)) {
    return NextResponse.json({ error: "テンプレート種別が不正です" }, { status: 400 });
  }
  if (!VALID_BUSINESS.has(business)) {
    return NextResponse.json({ error: "事業区分が不正です" }, { status: 400 });
  }
  const key = business === "allmight" ? `${baseKey}_allmight` : baseKey;
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
