import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";

/**
 * 処理状態(processing_at)の手動解除。異常終了時のリカバリ用。
 *
 * 【安全対策】
 * ・利用中かつ担当事業の管理者のみ。
 * ・自動解除はしない。管理者が明示的に実行したときだけ processing_at/processing_token を解除する。
 * ・解除は RPC(clear_processing)で履歴(processing_cleared, 解除前の processing_at を記録)とともに原子的に行う。
 * ・kintone 再登録・配送再連携・メール送信は一切行わない(状態フラグの解除のみ)。
 * ・解除後、管理者は状態に応じて「再実行(register_failed)」や「削除」を行える。
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
    .select("id, form_type_id, processing_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }

  const { data: biz } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id)
    .eq("form_type_id", request.form_type_id as string)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json({ error: "担当事業の申請のみ操作できます" }, { status: 403 });
  }

  const { data: rpc, error } = await admin.rpc("clear_processing", {
    p_id: id,
    p_actor: me!.auth_user_id ?? "system",
    p_editor: me!.email ?? null,
  });
  if (error) {
    return NextResponse.json({ error: `解除に失敗しました: ${error.message}` }, { status: 500 });
  }
  const res = (rpc ?? {}) as { ok?: boolean; code?: string };
  return NextResponse.json({ ok: res.ok === true, code: res.code });
}

export const POST=withInventorySheetPush(POSTHandler);
