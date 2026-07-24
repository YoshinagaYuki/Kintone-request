import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentAdmin,
  isActiveAdmin,
  recordAdminAudit,
  type AdminUser,
} from "@/lib/admin-users";
import { getSetPasswordUrl } from "@/lib/site-url";

/**
 * 招待の再送(active管理者のみ)。招待中のユーザーが対象。
 * 既存の Auth ユーザー・管理者レコードを再利用し、重複作成しない。
 * 期限切れでも新しい有効なリンクを送る。
 * ・まず招待メール再送を試行。既に登録済みで再送不可の場合は、
 *   回復(パスワード設定)メールにフォールバックして本人がパスワードを設定できるようにする。
 */
export async function POST(
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
  const { data: target } = await admin
    .from("admin_users")
    .select("*")
    .eq("id", id)
    .maybeSingle<AdminUser>();
  if (!target) {
    return NextResponse.json({ error: "対象の管理者が見つかりません" }, { status: 404 });
  }
  if (target.status !== "invited") {
    return NextResponse.json(
      { error: "招待中のユーザーのみ再送できます" },
      { status: 409 }
    );
  }

  const redirectTo = getSetPasswordUrl();
  let method = "invite";
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(target.email, {
    redirectTo,
  });
  if (inviteError) {
    // 既に登録済み等で再招待できない場合は回復メールにフォールバック
    method = "recovery";
    const { error: recoverError } = await admin.auth.resetPasswordForEmail(target.email, {
      redirectTo,
    });
    if (recoverError) {
      return NextResponse.json(
        { error: `再送に失敗しました: ${recoverError.message}` },
        { status: 502 }
      );
    }
  }

  await admin
    .from("admin_users")
    .update({ invited_at: new Date().toISOString() })
    .eq("id", id);

  await recordAdminAudit(admin, {
    actorUserId: me!.auth_user_id,
    targetUserId: target.auth_user_id,
    action: "resend_invite",
    metadata: { method },
  });

  return NextResponse.json({ ok: true });
}
