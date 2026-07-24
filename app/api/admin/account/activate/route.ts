import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAdminAudit, type AdminUser } from "@/lib/admin-users";

/**
 * 本人のアカウント有効化(パスワード設定完了後に本人自身が呼ぶ)。
 * ・招待リンク/再設定リンク経由で確立したセッションのユーザーを対象にする。
 * ・invited → active に更新(activated_at 記録)。disabled は有効化しない(停止のまま)。
 * ・自分自身のみ対象(他人のレコードは触らない)。
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: me } = await admin
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle<AdminUser>();
  if (!me) {
    return NextResponse.json({ error: "管理者として登録されていません" }, { status: 403 });
  }
  if (me.status === "disabled") {
    return NextResponse.json({ error: "このアカウントは停止中です" }, { status: 403 });
  }

  if (me.status !== "active") {
    await admin
      .from("admin_users")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", me.id);
    await recordAdminAudit(admin, {
      actorUserId: user.id,
      targetUserId: user.id,
      action: "activate",
    });
  }

  return NextResponse.json({ ok: true });
}
