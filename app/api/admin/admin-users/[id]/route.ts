import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentAdmin,
  isActiveAdmin,
  isMaster,
  isProtectedMaster,
  recordAdminAudit,
  countActiveMasters,
  findInvalidFormTypeIds,
  setAdminBusinessAndNotify,
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

  let body: {
    status?: string;
    role?: string;
    display_name?: string;
    form_type_ids?: string[];
    push_notify_enabled?: boolean;
    email_notify_enabled?: boolean;
  };
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

  // 権限(role)の変更は一切許可しない。
  // マスターは指定2名で固定(昇格・降格ともに禁止)。クライアントが role を送っても拒否する。
  if (typeof body.role === "string") {
    return NextResponse.json(
      { error: "権限(マスター/管理者)の変更はできません" },
      { status: 403 }
    );
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

  // 担当事業・通知設定(master のみ。クライアント値を信用せずサーバーで判定)
  const wantsBusiness = Array.isArray(body.form_type_ids);
  const wantsNotify =
    typeof body.push_notify_enabled === "boolean" ||
    typeof body.email_notify_enabled === "boolean";
  if ((wantsBusiness || wantsNotify) && me!.role !== "master") {
    return NextResponse.json(
      { error: "担当事業・通知設定の変更は master のみ可能です" },
      { status: 403 }
    );
  }

  const formTypeIds = Array.isArray(body.form_type_ids)
    ? body.form_type_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (wantsBusiness && formTypeIds.length > 0) {
    const invalid = await findInvalidFormTypeIds(admin, formTypeIds);
    if (invalid.length > 0) {
      return NextResponse.json({ error: "担当事業の指定が不正です" }, { status: 400 });
    }
  }

  const pushVal = typeof body.push_notify_enabled === "boolean" ? body.push_notify_enabled : null;
  const emailVal = typeof body.email_notify_enabled === "boolean" ? body.email_notify_enabled : null;

  // 担当事業を変更しない場合のみ、通知フラグを admin_users 更新に含める(単一行で原子的)。
  // 担当事業を変更する場合は、担当事業+通知を combined RPC で1トランザクション更新する。
  if (!wantsBusiness) {
    if (pushVal !== null) {
      update.push_notify_enabled = pushVal;
      audits.push({ action: "update_notify", metadata: { push: pushVal } });
    }
    if (emailVal !== null) {
      update.email_notify_enabled = emailVal;
      audits.push({ action: "update_notify", metadata: { email: emailVal } });
    }
  }

  if (Object.keys(update).length === 0 && !wantsBusiness) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  if (Object.keys(update).length > 0) {
    const { error } = await admin.from("admin_users").update(update).eq("id", id);
    if (error) {
      return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
    }
  }

  // 担当事業(+通知)を combined RPC で1トランザクション更新。
  // 途中失敗時は全ロールバックされ、担当事業・Push・メールの3項目が更新前の状態に戻る。
  if (wantsBusiness) {
    const r = await setAdminBusinessAndNotify(admin, id, formTypeIds, pushVal, emailVal);
    if (!r.ok) {
      return NextResponse.json(
        { error: "担当事業・通知設定の保存に失敗しました(変更は反映されていません)" },
        { status: 500 }
      );
    }
    audits.push({ action: "update_businesses", metadata: { form_type_ids: formTypeIds } });
    if (pushVal !== null || emailVal !== null) {
      audits.push({ action: "update_notify", metadata: { push: pushVal, email: emailVal } });
    }
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

/**
 * 管理者の削除(マスターのみ実行可)。
 * ・マスター(role=master または 指定メール)は削除不可(本人・他マスター問わず)。
 * ・削除対象は admin_users の対象レコードのみ(admin_user_businesses はFKのCASCADEで自動削除)。
 *   auth.users・申請/承認履歴・監査ログ・請求アプリ関連は削除しない。
 * ・削除前に監査ログを記録し、監査ログ保存に失敗した場合は削除しない。
 * ・削除後は middleware により対象者の管理画面ログインが遮断される。
 *   auth.users は残すため、同じメールでの将来の再招待にも対応できる(招待API側で処理)。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  // 削除は「マスター(DBのrole=master かつ 指定メール)」のみ。メール一致だけでは許可しない。
  if (!isMaster(me)) {
    return NextResponse.json(
      { error: "管理者の削除はマスター管理者のみ可能です" },
      { status: 403 }
    );
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

  // マスターは削除不可(本人・他マスターを含む)。role か 指定メールのいずれか該当で保護。
  if (isProtectedMaster(target)) {
    return NextResponse.json(
      { error: "マスター管理者は削除できません" },
      { status: 403 }
    );
  }
  // 念のため自己削除も明示ブロック(マスターは上で弾かれるが二重防御)
  if (target.auth_user_id === me!.auth_user_id) {
    return NextResponse.json({ error: "自分自身は削除できません" }, { status: 400 });
  }

  // 監査ログを先に記録。失敗した場合は削除を実行しない。
  const { error: auditError } = await admin.from("admin_user_audit_logs").insert({
    actor_user_id: me!.auth_user_id,
    target_user_id: target.auth_user_id,
    action: "delete",
    metadata: {
      email: target.email,
      display_name: target.display_name,
      role: target.role,
    },
  });
  if (auditError) {
    return NextResponse.json(
      { error: "監査ログの記録に失敗したため削除を中止しました" },
      { status: 500 }
    );
  }

  // admin_users の対象行のみ削除(admin_user_businesses はCASCADE)。auth.users は削除しない。
  const { error: delError } = await admin.from("admin_users").delete().eq("id", id);
  if (delError) {
    return NextResponse.json(
      { error: `削除に失敗しました: ${delError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
