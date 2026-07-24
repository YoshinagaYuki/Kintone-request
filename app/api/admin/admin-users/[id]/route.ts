import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentAdmin,
  isActiveAdmin,
  recordAdminAudit,
  countActiveMasters,
  type AdminUser,
} from "@/lib/admin-users";

/**
 * 管理者の状態変更(利用停止/利用再開)・権限/表示名変更(active管理者のみ)。
 * ・自分自身は停止できない
 * ・最後の active な master は停止・降格できない
 * ・master の停止/権限変更は master のみ
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { status?: string; role?: string; display_name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
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

  const update: Record<string, unknown> = {};
  const audits: { action: string; metadata?: Record<string, unknown> }[] = [];

  // 状態変更
  if (body.status === "disabled" || body.status === "active") {
    if (body.status === "disabled") {
      if (target.auth_user_id === me!.auth_user_id) {
        return NextResponse.json({ error: "自分自身は停止できません" }, { status: 400 });
      }
      if (target.role === "master") {
        if (me!.role !== "master") {
          return NextResponse.json({ error: "master の停止は master のみ可能です" }, { status: 403 });
        }
        if ((await countActiveMasters(admin, target.id)) === 0) {
          return NextResponse.json(
            { error: "最後の master は停止できません" },
            { status: 400 }
          );
        }
      }
      update.status = "disabled";
      audits.push({ action: "disable" });
    } else {
      update.status = "active";
      audits.push({ action: "enable" });
    }
  }

  // 権限変更(master のみ実行可)
  if (body.role === "admin" || body.role === "master") {
    if (me!.role !== "master") {
      return NextResponse.json({ error: "権限変更は master のみ可能です" }, { status: 403 });
    }
    // 最後の active master の降格を防ぐ
    if (
      target.role === "master" &&
      body.role === "admin" &&
      target.status === "active" &&
      (await countActiveMasters(admin, target.id)) === 0
    ) {
      return NextResponse.json({ error: "最後の master は降格できません" }, { status: 400 });
    }
    update.role = body.role;
    audits.push({ action: "update_role", metadata: { role: body.role } });
  }

  // 氏名(表示名)の変更
  let displayNameChanged = false;
  if (typeof body.display_name === "string") {
    const dn = body.display_name.trim();
    if (!dn) {
      return NextResponse.json({ error: "氏名は空にできません" }, { status: 400 });
    }
    update.display_name = dn;
    displayNameChanged = true;
    audits.push({ action: "update_display_name", metadata: { display_name: dn } });
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await admin.from("admin_users").update(update).eq("id", id);
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }

  // Supabase Auth の user_metadata(name)も可能なら更新(失敗しても致命ではない)
  if (displayNameChanged) {
    try {
      await admin.auth.admin.updateUserById(target.auth_user_id, {
        user_metadata: { name: update.display_name as string },
      });
    } catch {
      /* metadata更新は補助的。失敗しても admin_users は更新済み */
    }
  }

  for (const a of audits) {
    await recordAdminAudit(admin, {
      actorUserId: me!.auth_user_id,
      targetUserId: target.auth_user_id,
      action: a.action,
      metadata: a.metadata,
    });
  }

  return NextResponse.json({ ok: true });
}
