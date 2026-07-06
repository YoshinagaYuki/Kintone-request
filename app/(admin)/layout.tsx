import { AdminHeader } from "@/components/admin/admin-header";

/** 管理画面共通レイアウト(全 /admin/* ページに共通ヘッダーを表示) */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AdminHeader />
      {children}
    </>
  );
}
