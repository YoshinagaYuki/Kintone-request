import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AdminUsersManager,
  type AdminUserRow,
  type BusinessOption,
} from "@/components/admin/admin-users-manager";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/** 管理者ユーザー管理(独立メニュー)。middleware により認証必須 */
export default async function AdminUsersPage() {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);

  const { data } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  // 担当事業(admin_user_businesses)は RLSポリシー無し = service_role 経由でのみ取得。
  // 閲覧者が有効な管理者のときだけ読む(middlewareでも /admin を保護済み)。
  const svc = createAdminClient();
  const { data: biz } = isActiveAdmin(me)
    ? await svc.from("admin_user_businesses").select("admin_user_id, form_type_id")
    : { data: [] as { admin_user_id: string; form_type_id: string }[] };
  const byAdmin = new Map<string, string[]>();
  for (const row of biz ?? []) {
    const key = row.admin_user_id as string;
    const arr = byAdmin.get(key) ?? [];
    arr.push(row.form_type_id as string);
    byAdmin.set(key, arr);
  }

  const adminUsers: AdminUserRow[] = (data ?? []).map((u) => ({
    id: u.id as string,
    auth_user_id: u.auth_user_id as string,
    email: u.email as string,
    display_name: u.display_name as string,
    role: u.role as AdminUserRow["role"],
    status: u.status as AdminUserRow["status"],
    invited_at: (u.invited_at as string | null) ?? null,
    activated_at: (u.activated_at as string | null) ?? null,
    last_login_at: (u.last_login_at as string | null) ?? null,
    push_notify_enabled: (u.push_notify_enabled as boolean | null) ?? true,
    email_notify_enabled: (u.email_notify_enabled as boolean | null) ?? true,
    form_type_ids: byAdmin.get(u.id as string) ?? [],
  }));

  // 担当事業の選択肢(全 form_types。オールマイト非公開中でも割当可能にするため is_active で絞らない)
  const { data: forms } = await supabase
    .from("form_types")
    .select("id, name, kintone_app_id")
    .order("kintone_app_id", { ascending: false }); // 49(てずくーる) → 10(オールマイト)
  const businessOptions: BusinessOption[] = (forms ?? []).map((f) => ({
    id: f.id as string,
    name: f.name as string,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">管理者ユーザー</h1>
      <AdminUsersManager
        users={adminUsers}
        businessOptions={businessOptions}
        currentAuthUserId={me?.auth_user_id ?? ""}
        currentRole={me?.role ?? "admin"}
      />
    </main>
  );
}
