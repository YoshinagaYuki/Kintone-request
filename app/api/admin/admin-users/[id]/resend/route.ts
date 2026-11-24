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
 * 招待の再送(active管理者のみ)。招待中のユーザーが対象。
 * 既存の Auth ユーザー・管理者レコードを再利用し、重複作成しない。
 * 期限切れでも新しい有効なリンクを送る。
 * ・招待用トークンを発行し、既存アカウントの場合は回復トークンで本人が設定する。
 *   どちらもレンタル管理へ直接進む専用メールで送信する。
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
  if (target.status !== "invited") {
    return NextResponse.json(
      { error: "招待中のユーザーのみ再送できます" },
      { status: 409 }
    );
  }

  let method: string;
  try {
    const link = await generateAdminPasswordLink(admin, target.email, req.nextUrl.origin, true, target.display_name ?? undefined);
    if (link.userId !== target.auth_user_id) throw new Error("認証アカウントを照合できませんでした");
    method = link.method;
    await deliverAdminPasswordLink(target.email, link.url, true);
  } catch (error) {
    return NextResponse.json({error: error instanceof Error ? error.message : "再送に失敗しました"}, {status: 502});
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
