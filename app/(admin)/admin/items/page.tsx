import Link from "next/link";
import { inventoryEnabled } from "@/lib/inventory/access";
import { InventoryControls } from "@/components/admin/inventory-controls";
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

  const stockResult = inventoryEnabled()
    ? await supabase.from("inventory_stock").select("item_id,total_count,reserve_count").limit(1000)
    : null;
  const plans=inventoryEnabled()?await supabase.from("inventory_stock_schedule").select("item_id,effective_date,total_count,reserve_count").order("effective_date").limit(1000):null;
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">名称マスター(機器商品/コンテンツ)</h1>
      <p className="mt-3 text-sm text-gray-600">在庫数・内予備数は<Link className="text-blue-600 underline" href="/admin/inventory/allmight">在庫管理表</Link>で商品ごとに設定できます。背景スクリーンは大小共通の備品です。下の在庫設定で保有数を入力してください。</p>
      <ItemMasterManager items={items} />
      {stockResult && (stockResult.error || plans?.error || (plans?.data?.length??0)>=1000 || (stockResult.data?.length ?? 0) >= 1000
        ? <p role="alert" className="mt-4 text-red-700">在庫数を取得できませんでした。DB設定・件数を確認してください。</p>
        : <InventoryControls includeHolds={false} items={items.filter(i => i.category === "allmight" && i.is_active)} staff={[]} stocks={stockResult.data ?? []} plans={plans?.data??[]} />)}
    </main>
  );
}
