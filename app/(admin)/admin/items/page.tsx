import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  ItemMasterManager,
  type ItemRow,
} from "@/components/admin/item-master-manager";

export const dynamic = "force-dynamic";

/** 名称正規化マスター管理(CRUD)。middleware により認証必須 */
export default async function ItemsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("item_name_master")
    .select("id, category, name, aliases, sort_order, is_active")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true });

  const items = (data ?? []).map((row) => ({
    ...row,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
  })) as ItemRow[];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">名称マスター(機器商品/コンテンツ)</h1>
      <ItemMasterManager items={items} />
    </main>
  );
}
