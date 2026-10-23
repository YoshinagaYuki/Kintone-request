import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";

/**
 * 削除済み申請の復元(ゴミ箱→通常一覧)。管理者のみ。
 *
 * 【安全対策】
 * ・利用中かつ担当事業(admin_user_businesses)の管理者のみ復元可。
 * ・復元 + 履歴(action='restored')を RPC で原子的に実行(restore_request)。
 * ・復元は deleted_at を NULL に戻すだけ。kintone 再登録・配送再連携・メール再送は行わない。
 *   management_no / kintone_record_id / status は保持(重複レコードを作らない)。
 */
async function POSTHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select("id, form_type_id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }

  // 担当事業チェック
  const { data: biz } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id)
    .eq("form_type_id", request.form_type_id as string)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json(
      { error: "担当事業の申請のみ復元できます" },
      { status: 403 }
    );
  }

  if (!request.deleted_at) {
    return NextResponse.json(
      { error: "この申請は削除されていません(既に有効です)" },
      { status: 409 }
    );
  }

  const { data: rpc, error } = await admin.rpc("restore_request", {
    p_id: id,
    p_actor: me!.auth_user_id ?? "system",
    p_editor: me!.email ?? null,
  });
  if (error) {
    return NextResponse.json({ error: `復元に失敗しました: ${error.message}` }, { status: 500 });
  }
  const res = (rpc ?? {}) as { ok?: boolean; code?: string };
  if (!res.ok) {
    return NextResponse.json({ error: "復元に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, code: res.code });
}

export const POST=withInventorySheetPush(POSTHandler);
