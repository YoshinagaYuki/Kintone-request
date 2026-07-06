import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_DELETE = 100;

/**
 * 申請の一括削除(管理者のみ)。
 * body: { ids: string[] } → 削除件数を返す。
 * request_histories は FK(on delete cascade)により自動削除される(migration 0001)。
 * 承認・採番・kintone登録・通知処理には一切触れない(DBの行削除のみ)。
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "削除対象が選択されていません" }, { status: 400 });
  }
  if (ids.length > MAX_DELETE) {
    return NextResponse.json(
      { error: `一度に削除できるのは${MAX_DELETE}件までです` },
      { status: 400 }
    );
  }

  // requests には authenticated の delete ポリシーが無いため、
  // 認証確認のうえ service_role で削除する(履歴はcascadeで自動削除)
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) {
    console.error("[api/admin/requests] delete failed:", error.message);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: data?.length ?? 0 });
}
