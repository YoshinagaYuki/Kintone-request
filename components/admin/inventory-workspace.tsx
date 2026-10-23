import Link from "next/link";
import { capacityOn, matchCapacityItem, type Occupancy } from "@/lib/inventory/availability";
import type { ganttEntry } from "@/lib/inventory/gantt";
import { InventoryCancel } from "./inventory-cancel";
import { createClient } from "@/lib/supabase/server";
import { inventoryEnabled } from "@/lib/inventory/access";
import { InventoryControls, type StockRow } from "./inventory-controls";
export async function InventoryWorkspace({ start, end, dates, requests, incomplete }: { start: string; end: string; dates: string[]; requests: NonNullable<ReturnType<typeof ganttEntry>>[]; incomplete: boolean }) {
  if (!inventoryEnabled()) return null;
  const db = await createClient();
  const [items, staff, stocks, holds] = await Promise.all([
    db.from("item_name_master").select("id,name,aliases").eq("category", "allmight").eq("is_active", true).order("sort_order").limit(1000),
    db.from("staff_members").select("id,name").eq("is_active", true).order("sort_order").limit(1000),
    db.from("inventory_stock").select("item_id,total_count,reserve_count").limit(1000),
    db.from("inventory_holds").select("id,item_id,store_name,quantity,start_date,end_date,item_name_master(name),staff_members(name),inventory_hold_links(request_id,requests(status,deleted_at))").is("cancelled_at", null).lte("start_date", end).gte("end_date", start).order("start_date").limit(1000),
  ]);
  if ([items, staff, stocks, holds].some(r => r.error || (r.data?.length ?? 0) >= 1000)) return <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">在庫・仮押さえを完全に取得できませんでした。DB設定または表示対象件数を確認してください。</p>;
  type Linked = { request_id: string; requests: {status: string; deleted_at: string|null}|null };
  type Hold = { item_id: string; inventory_hold_links: Linked[]|Linked|null; id: string; store_name: string; quantity: number; start_date: string; end_date: string; item_name_master: { name: string } | null; staff_members: { name: string } | null };
  const allHolds = (holds.data ?? []) as unknown as Hold[];
  const linksFor = (h: Hold) => Array.isArray(h.inventory_hold_links) ? h.inventory_hold_links : h.inventory_hold_links ? [h.inventory_hold_links] : [];
  const unlinked = allHolds.filter(h => !linksFor(h).some(l => l.requests && !l.requests.deleted_at && l.requests.status !== "rejected"));
  const occupancies: Occupancy[] = unlinked.map(h => ({item_id:h.item_id,from:h.start_date,to:h.end_date,quantity:h.quantity}));
  let unknown = incomplete;
  for(const r of requests) for(const name of r.items) {
    const item = matchCapacityItem(name, items.data ?? []);
    if(!item) unknown = true;
    else occupancies.push({item_id:item.id,from:r.from,to:r.to,quantity:1});
  }
  const capacityItems = (items.data ?? []).map(i => ({...i,...(stocks.data ?? []).find(s=>s.item_id===i.id)}));
  return <>
    <h2 className="mb-2 text-lg font-bold">日別の残数（参考）</h2>
    <p className="mb-2 text-sm text-gray-600">通常利用枠から申請・未紐付けの仮押さえを差し引きます。申請は配送〜集荷、仮押さえは利用期間を含みます。同日再出庫・返却点検の余裕日は含みません。</p>
    {unknown && <p role="alert" className="mb-2 text-amber-800">日付・商品などが未確認の申請があるため残数を確定表示できません。要確認として表示します。</p>}
    <div className="mb-6 overflow-auto rounded border"><table className="w-full text-xs"><thead><tr><th className="sticky left-0 min-w-64 border bg-gray-100 p-2">商品 / 総在庫・内予備</th>{dates.map(d=><th className="min-w-16 border bg-gray-100 p-2" key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>{capacityItems.map(i=><tr key={i.id}><th className="sticky left-0 border bg-white p-2 text-left">{i.name}<br/>{i.total_count==null?"在庫数未設定":`在庫 ${i.total_count} / 内予備 ${i.reserve_count}`}</th>{dates.map(d=>{const c=capacityOn(d,i,occupancies);return <td key={d} className={`border p-2 text-center ${!unknown&&c.remaining!=null&&c.remaining<0?"bg-red-100 font-bold text-red-800":""}`}>{unknown?"要確認":c.remaining==null?"未設定":c.remaining<0?`${-c.remaining}超過`:`残${c.remaining}`}<span className="block text-gray-600">予定{c.used}</span></td>;})}</tr>)}</tbody></table></div>
    <InventoryControls items={items.data ?? []} staff={staff.data ?? []} stocks={(stocks.data ?? []) as StockRow[]} />
    <h2 className="mb-2 text-lg font-bold">仮押さえ</h2>
    <div className="mb-6 overflow-auto rounded border"><table className="w-full text-xs"><thead><tr><th className="sticky left-0 min-w-64 border bg-gray-100 p-2">商品・店舗・担当者</th>{dates.map(d => <th className="min-w-16 border bg-gray-100 p-2" key={d}>{d.slice(5)}</th>)}</tr></thead><tbody>
      {unlinked.map(h => <tr key={h.id}><th className="sticky left-0 border bg-white p-2 text-left font-normal">{h.item_name_master?.name ?? "商品不明"} × {h.quantity}<br/>{h.store_name}<br/>{h.staff_members?.name ?? "担当者不明"}<br/>{linksFor(h).length ? <Link className="text-blue-600 underline" href={`/admin/requests/${linksFor(h)[0].request_id}`}>紐付け先を確認</Link> : <InventoryCancel id={h.id} />}</th>{dates.map(d => <td className={`border p-2 text-center ${d >= h.start_date && d <= h.end_date ? "bg-yellow-100" : ""}`} key={d}>{d >= h.start_date && d <= h.end_date ? "仮" : ""}</td>)}</tr>)}
    </tbody></table>{unlinked.length === 0 && <p className="p-4 text-sm text-gray-600">この期間の仮押さえはありません。</p>}</div>
  </>;
}
