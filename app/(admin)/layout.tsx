import {DraftOwnerProvider} from "@/components/drafts/form-draft";
import {WarehouseCalendarProvider} from '@/components/admin/warehouse-calendar-context';
import {loadWarehouseClosures} from '@/lib/inventory/warehouse-calendar-server';
import type {WarehouseClosure} from '@/lib/inventory/warehouse-calendar';
import { HomeScreenStart } from "@/components/admin/home-screen-start";
import {homePage} from "@/lib/home-screen";
import {AdminSectionNav} from "@/components/admin/admin-section-nav";
import { AdminHeader } from "@/components/admin/admin-header";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, touchLastLogin } from "@/lib/admin-users";

/** 管理画面共通レイアウト(全 /admin/* ページに共通ヘッダーを表示) */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let closures:WarehouseClosure[]=[];
  let draftOwner="anonymous";
  let preferred="/admin/requests";
  // 最終ログイン時刻の更新(10分間引き)。未ログイン(/admin/login)では admin=null で skip。
  try {
    const supabase = await createClient();
    const {data:{user}}=await supabase.auth.getUser();
    draftOwner=user?.id??"anonymous";
    preferred=homePage(user?.user_metadata?.home_start_path);
    const admin = await getCurrentAdmin(supabase);
    if (admin){await touchLastLogin(createAdminClient(), admin);closures=await loadWarehouseClosures(supabase);}
  } catch {
    /* 失敗しても画面表示は止めない */
  }

  return (
    <DraftOwnerProvider value={draftOwner}><WarehouseCalendarProvider closures={closures}><div className="admin-shell min-h-screen">
      <HomeScreenStart preferred={preferred}/>
      <AdminHeader />
      <AdminSectionNav/>
      {children}
    </div></WarehouseCalendarProvider></DraftOwnerProvider>
  );
}
