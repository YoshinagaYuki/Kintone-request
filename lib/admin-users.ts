import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 管理者ユーザー(admin_users)のサーバー側ヘルパ。
 * ・権限確認は必ずサーバー側で行う(クライアントの申告を信用しない)。
 * ・service_role はサーバー専用(createAdminClient)。クライアントへ渡さない。
 */

export type AdminRole = "admin" | "master";
export type AdminStatus = "invited" | "active" | "disabled";

export type AdminUser = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: AdminRole;
  status: AdminStatus;
  invited_at: string | null;
  activated_at: string | null;
  last_login_at: string | null;
  /** プッシュ通知を受け取るか(担当事業とは独立) */
  push_notify_enabled: boolean;
  /** メール通知を受け取るか(担当事業とは独立) */
  email_notify_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export const STATUS_LABELS: Record<AdminStatus, string> = {
  invited: "招待中",
  active: "利用中",
  disabled: "停止中",
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: "管理者",
  master: "マスター",
};

/**
 * マスター管理者の固定メールアドレス(この2名のみマスター)。
 * ・昇格/降格は禁止。削除も禁止(本人・他マスター問わず)。
 * ・権限判定はメール一致だけで完結させず、必ずログイン済みユーザー+DBの role と併せて確認する。
 */
export const MASTER_EMAILS = [
  "y-yoshinaga@unity-corp.jp",
  "m-furuki@unity-corp.jp",
] as const;

/** メールが固定マスターのものか(大文字小文字無視) */
export function isMasterEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return (MASTER_EMAILS as readonly string[]).includes(e);
}

/**
 * この管理者が「マスター」か。DBの role=master かつ 指定メールの両方を満たす場合のみ true。
 * (role列のドリフトやメール偽装の双方に耐える二重判定)
 */
export function isMaster(admin: AdminUser | null): admin is AdminUser {
  return !!admin && admin.role === "master" && isMasterEmail(admin.email);
}

/** 削除・降格から保護すべきマスター対象か(role か メールのいずれかが該当すれば保護) */
export function isProtectedMaster(admin: Pick<AdminUser, "role" | "email">): boolean {
  return admin.role === "master" || isMasterEmail(admin.email);
}

/**
 * ログイン中ユーザーに対応する admin_users を返す(無ければ null)。
 * 認証済みのユーザー権限クライアント(server client)を渡すこと。
 */
export async function getCurrentAdmin(
  supabase: SupabaseClient
): Promise<AdminUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  return (data as AdminUser | null) ?? null;
}

/** 有効(active)な管理者のみ許可。停止中・招待中・未登録は null(=拒否) */
export function isActiveAdmin(admin: AdminUser | null): admin is AdminUser {
  return !!admin && admin.status === "active";
}

/** 監査ログを記録(service_role クライアントで) */
export async function recordAdminAudit(
  adminClient: SupabaseClient,
  params: {
    actorUserId: string | null;
    targetUserId: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await adminClient.from("admin_user_audit_logs").insert({
    actor_user_id: params.actorUserId,
    target_user_id: params.targetUserId,
    action: params.action,
    metadata: params.metadata ?? {},
  });
}

/**
 * last_login_at を更新(10分に1回程度に間引く)。
 * 認証済み server client で呼ぶ想定だが、更新は service_role で行う。
 */
export async function touchLastLogin(
  adminClient: SupabaseClient,
  admin: AdminUser
): Promise<void> {
  const last = admin.last_login_at ? new Date(admin.last_login_at).getTime() : 0;
  if (Date.now() - last < 10 * 60 * 1000) return;
  await adminClient
    .from("admin_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", admin.id);
}

/** 指定の form_type_id がすべて実在するか検証(不正IDの登録防止)。無効なIDの配列を返す */
export async function findInvalidFormTypeIds(
  adminClient: SupabaseClient,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await adminClient
    .from("form_types")
    .select("id")
    .in("id", ids);
  const valid = new Set((data ?? []).map((r) => r.id as string));
  return ids.filter((id) => !valid.has(id));
}

/**
 * 管理者の担当事業(置換)+ 通知設定(Push/メール)を1トランザクションで原子的に更新する(service_role)。
 *
 * ・RPC set_admin_business_and_notify を呼ぶ。担当事業の delete→insert と通知フラグ更新を
 *   単一トランザクションで実行し、途中失敗時は全ロールバック(3項目すべて更新前に戻る)。
 * ・push / email に null を渡すと「変更しない」(現在値を維持)。
 * ・0件(空配列)は担当事業の全解除として正常に許可。
 * ・不正な form_type_id を含む場合は RPC 側で例外→ ok:false を返す。
 * ・成否を返すので、呼び出し側は失敗時に明示エラーを返すこと。
 */
export async function setAdminBusinessAndNotify(
  adminClient: SupabaseClient,
  adminUserId: string,
  formTypeIds: string[],
  push: boolean | null,
  email: boolean | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unique = Array.from(new Set(formTypeIds));
  const { error } = await adminClient.rpc("set_admin_business_and_notify", {
    p_admin_user_id: adminUserId,
    p_form_type_ids: unique,
    p_push: push,
    p_email: email,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** 現在 active な master の人数(最後の1人保護に使用) */
export async function countActiveMasters(
  adminClient: SupabaseClient,
  excludeId?: string
): Promise<number> {
  let query = adminClient
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role", "master")
    .eq("status", "active");
  if (excludeId) query = query.neq("id", excludeId);
  const { count } = await query;
  return count ?? 0;
}
