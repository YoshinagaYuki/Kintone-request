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
