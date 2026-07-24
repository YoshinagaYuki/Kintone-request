import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StaffManager, type StaffRow } from "@/components/admin/staff-manager";

export const dynamic = "force-dynamic";

/** 担当者マスター管理(CRUD)。middleware により認証必須 */
export default async function StaffPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("staff_members")
    .select("id, name, company, sort_order, is_active")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const staff = (data ?? []) as StaffRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">担当者マスター</h1>
      <StaffManager staff={staff} />
    </main>
  );
}
