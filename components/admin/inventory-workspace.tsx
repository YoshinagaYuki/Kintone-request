import { InventoryCancel } from "./inventory-cancel";
import { createClient } from "@/lib/supabase/server";
import { inventoryEnabled } from "@/lib/inventory/access";
import { InventoryControls, type StockRow } from "./inventory-controls";
export async function InventoryWorkspace({ start, end, dates }: { start: string; end: string; dates: string[] }) {
  if (!inventoryEnabled()) return null;
  const db = await createClient();
  const [items, staff, stocks, holds] = await Promise.all([
    db.from("item_name_master").select("id,name").eq("category", "allmight").eq("is_active", true).order("sort_order").limit(1000),
    db.from("staff_members").select("id,name").eq("is_active", true).order("sort_order").limit(1000),
    db.from("inventory_stock").select("item_id,total_count,reserve_count").limit(1000),
    db.from("inventory_holds").select("id,store_name,quantity,start_date,end_date,item_name_master(name),staff_members(name)").is("cancelled_at", null).lte("start_date", end).gte("end_date", start).order("start_date").limit(1000),
  ]);
  if ([items, staff, stocks, holds].some(r => r.error || (r.data?.length ?? 0) >= 1000)) return <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">在庫・仮押さえを完全に取得できませんでした。DB設定または表示対象件数を確認してください。</p>;
  type Hold = { id: string; store_name: string; quantity: number; start_date: string; end_date: string; item_name_master: { name: string } | null; staff_members: { name: string } | null };
  return <>
    <InventoryControls items={items.data ?? []} staff={staff.data ?? []} stocks={(stocks.data ?? []) as StockRow[]} />
    <h2 className="mb-2 text-lg font-bold">仮押さえ</h2>
    <div className="mb-6 overflow-auto rounded border"><table className="w-full text-xs"><thead><tr><th className="sticky left-0 min-w-64 border bg-gray-100 p-2">商品・店舗・担当者</th>{dates.map(d => <th className="min-w-16 border bg-gray-100 p-2" key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>
      {((holds.data ?? []) as unknown as Hold[]).map(h => <tr key={h.id}><th className="sticky left-0 border bg-white p-2 text-left font-normal">{h.item_name_master?.name ?? "商品不明"} × {h.quantity}<br/>{h.store_name}<br/>{h.staff_members?.name ?? "担当者不明"}<br/><InventoryCancel id={h.id} /></th>{dates.map(d => <td className={`border p-2 text-center ${d >= h.start_date && d <= h.end_date ? "bg-yellow-100" : ""}`} key={d}>{d >= h.start_date && d <= h.end_date ? "仮" : ""}</td>)}</tr>)}
    </tbody></table>{holds.data?.length === 0 && <p className="p-4 text-sm text-gray-600">この期間の仮押さえはありません。</p>}</div>
  </>;
}
