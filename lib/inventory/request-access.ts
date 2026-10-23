import type { SupabaseClient } from "@supabase/supabase-js";
/** Service-side authorization: active administrator AND assignment to this Allmight request. */
export async function canManageInventoryRequest(db: SupabaseClient, requestId: string, actor: string): Promise<boolean> {
  const [admin, request] = await Promise.all([
    db.from("admin_users").select("id").eq("auth_user_id", actor).eq("status", "active").maybeSingle(),
    db.from("requests").select("form_type_id,form_types!inner(kintone_app_id)").eq("id", requestId).eq("form_types.kintone_app_id", 10).maybeSingle(),
  ]);
  if (admin.error || request.error || !admin.data || !request.data) return false;
  const assigned = await db.from("admin_user_businesses").select("form_type_id").eq("admin_user_id", admin.data.id).eq("form_type_id", request.data.form_type_id).maybeSingle();
  return !assigned.error && !!assigned.data;
}
