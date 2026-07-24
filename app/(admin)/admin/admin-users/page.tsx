import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  AdminUsersManager,
  type AdminUserRow,
} from "@/components/admin/admin-users-manager";
import { getCurrentAdmin } from "@/lib/admin-users";

export const dynamic = "force-dynamic";

/** 管理者ユーザー管理(独立メニュー)。middleware により認証必須 */
export default async function AdminUsersPage() {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);

  const { data } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });
  const adminUsers = (data ?? []) as AdminUserRow[];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">管理者ユーザー</h1>
      <AdminUsersManager
        users={adminUsers}
        currentAuthUserId={me?.auth_user_id ?? ""}
        currentRole={me?.role ?? "admin"}
      />
    </main>
  );
}
