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
 * パスワード再設定メールの送信(active管理者のみ)。
 * 管理者は「再設定用URLを本人へ送る」だけ。管理者が他人のパスワードを直接設定はしない。
 * Supabase Auth の resetPasswordForEmail を使用(本人がリンク先で新パスワードを設定)。
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

  const { error } = await admin.auth.resetPasswordForEmail(target.email, {
    redirectTo: getSetPasswordUrl(),
  });
  if (error) {
    return NextResponse.json(
      { error: `再設定メールの送信に失敗しました: ${error.message}` },
      { status: 502 }
    );
  }

  await recordAdminAudit(admin, {
    actorUserId: me!.auth_user_id,
    targetUserId: target.auth_user_id,
    action: "send_reset",
  });

  return NextResponse.json({ ok: true });
}
