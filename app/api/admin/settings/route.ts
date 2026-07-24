import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SETTING_KEYS } from "@/lib/system-settings";

/**
 * システム設定の更新(管理者のみ。RLSで保護)。
 * body: { minimum_order_quantity?: number|string; manual_drive_url?: string }
 * ・minimum_order_quantity は正の整数のみ
 * ・manual_drive_url は http(s) のみ許可(空は許可=未設定)
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });

  let body: { minimum_order_quantity?: number | string; manual_drive_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const rows: { key: string; value: string }[] = [];

  if (body.minimum_order_quantity !== undefined) {
    const n = Number.parseInt(String(body.minimum_order_quantity).trim(), 10);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "最小注文数量は1以上の整数で入力してください" },
        { status: 400 }
      );
    }
    rows.push({ key: SETTING_KEYS.minimumOrderQuantity, value: String(n) });
  }

  if (body.manual_drive_url !== undefined) {
    const url = String(body.manual_drive_url).trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "共有リンクは http:// または https:// で始まるURLを入力してください" },
        { status: 400 }
      );
    }
    rows.push({ key: SETTING_KEYS.manualDriveUrl, value: url });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase
    .from("system_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
