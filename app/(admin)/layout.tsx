import { AdminHeader } from "@/components/admin/admin-header";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, touchLastLogin } from "@/lib/admin-users";

/** 管理画面共通レイアウト(全 /admin/* ページに共通ヘッダーを表示) */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // 最終ログイン時刻の更新(10分間引き)。未ログイン(/admin/login)では admin=null で skip。
  try {
    const supabase = await createClient();
    const admin = await getCurrentAdmin(supabase);
    if (admin) await touchLastLogin(createAdminClient(), admin);
  } catch {
    /* 失敗しても画面表示は止めない */
  }

  return (
    <>
      <AdminHeader />
      {children}
    </>
  );
}
