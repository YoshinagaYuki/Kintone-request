import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentAdmin,
  isActiveAdmin,
  recordAdminAudit,
  type AdminUser,
} from "@/lib/admin-users";
import { generateAdminPasswordLink, deliverAdminPasswordLink } from "@/lib/auth/admin-password-mail";

/**
 * パスワード再設定メールの送信(active管理者のみ)。
 * 管理者は「再設定用URLを本人へ送る」だけ。管理者が他人のパスワードを直接設定はしない。
 * 専用メール内のワンタイムリンクで、本人がパスワードを設定。
 */
export async function POST(
  req: NextRequest,
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

  if (target.status === "disabled") return NextResponse.json({error: "無効な管理者には送信できません"}, {status: 409});
  try {
    const link = await generateAdminPasswordLink(admin, target.email, req.nextUrl.origin, false);
    if (link.userId !== target.auth_user_id) throw new Error("認証アカウントを照合できませんでした");
    await deliverAdminPasswordLink(target.email, link.url, false);
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "再設定メールの送信に失敗しました"}, {status: 502});
  }

  await recordAdminAudit(admin, {
    actorUserId: me!.auth_user_id,
    targetUserId: target.auth_user_id,
    action: "send_reset",
  });

  return NextResponse.json({ ok: true });
}
