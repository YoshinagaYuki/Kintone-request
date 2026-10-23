import Link from "next/link";
import {importedBookings,type ImportedEntry} from "@/lib/inventory/sheet-import";
import { capacityOn, matchCapacityItem, type Occupancy } from "@/lib/inventory/availability";
import type { ganttEntry } from "@/lib/inventory/gantt";
import {InventoryBoard} from "./inventory-board";
import {layoutBoard,stockOn,type BoardBooking} from "@/lib/inventory/board";
import { createClient } from "@/lib/supabase/server";
import { inventoryEnabled } from "@/lib/inventory/access";
import { InventoryControls, type StockRow } from "./inventory-controls";
export async function InventoryWorkspace({ start, end, dates, requests, incomplete, product, period, customEnd }: { customEnd?:string;product?:string;period:string; start: string; end: string; dates: string[]; requests: NonNullable<ReturnType<typeof ganttEntry>>[]; incomplete: boolean }) {
  if (!inventoryEnabled()) return null;
  const db = await createClient();
  const [items, staff, stocks, holds, plans, imported] = await Promise.all([
    db.from("item_name_master").select("id,name,aliases").eq("category", "allmight").eq("is_active", true).order("sort_order").limit(1000),
    db.from("staff_members").select("id,name").eq("is_active", true).order("sort_order").limit(1000),
    db.from("inventory_stock").select("item_id,total_count,reserve_count").limit(1000),
    db.from("inventory_holds").select("id,item_id,store_name,quantity,start_date,end_date,item_name_master(name),staff_members(name),inventory_hold_links(request_id,requests(status,deleted_at))").is("cancelled_at", null).lte("start_date", end).gte("end_date", start).order("start_date").limit(1000),
    db.from("inventory_stock_schedule").select("item_id,effective_date,total_count,reserve_count").order("effective_date").limit(1000),
    db.from("inventory_sheet_entries").select("source_key,source_tab,source_cell,staff_name,store_name,management_no,start_date,end_date,request_id,item_id,state").lte("start_date",end).gte("end_date",start).limit(1000),
  ]);
  if ([items, staff, stocks, holds, plans, imported].some(r => r.error || (r.data?.length ?? 0) >= 1000)) return <p role="alert" className="my-4 rounded bg-red-50 p-4 text-red-800">在庫・仮押さえを完全に取得できませんでした。DB設定または表示対象件数を確認してください。</p>;
  type Linked = { request_id: string; requests: {status: string; deleted_at: string|null}|null };
  type Hold = { item_id: string; inventory_hold_links: Linked[]|Linked|null; id: string; store_name: string; quantity: number; start_date: string; end_date: string; item_name_master: { name: string } | null; staff_members: { name: string } | null };
  const allHolds = (holds.data ?? []) as unknown as Hold[];
  const linksFor = (h: Hold) => Array.isArray(h.inventory_hold_links) ? h.inventory_hold_links : h.inventory_hold_links ? [h.inventory_hold_links] : [];
  const unlinked = allHolds.filter(h => !linksFor(h).some(l => l.requests && !l.requests.deleted_at && l.requests.status !== "rejected"));
  const occupancies: Occupancy[] = unlinked.map(h => ({item_id:h.item_id,from:h.start_date,to:h.end_date,quantity:h.quantity}));
  const sourceBookings=importedBookings((imported.data??[]) as ImportedEntry[]);
  for(const e of (imported.data??[]) as ImportedEntry[])if(e.state==="hold"||e.state==="blocked")occupancies.push({item_id:e.item_id,from:e.start_date,to:e.end_date,quantity:1});
  let unknown = incomplete;
  for(const r of requests.filter(r=>r.from<=end&&r.to>=start)) for(const [slot,name] of r.items.entries()) {
    const item = matchCapacityItem(name, items.data ?? []);
    if(!item) unknown = true;
    else occupancies.push({item_id:item.id,from:r.from,to:r.to,quantity:1,group:`${r.inventory_root_id??r.id}:${slot}`});
  }
  const capacityItems = (items.data ?? []).map(i => ({...i,...(stocks.data ?? []).find(s=>s.item_id===i.id),schedule:(plans.data??[]).filter(p=>p.item_id===i.id)}));
  const selected=capacityItems.find(i=>i.id===product)??capacityItems[0];
  if(!selected)return <p className="my-4">商品マスタにオールマイトの商品を登録してください。</p>;
  if(unlinked.filter(h=>h.item_id===selected.id).reduce((n,h)=>n+h.quantity,0)>1000)return <><p role="alert" className="my-4 text-red-800">表示する仮押さえ台数が多すぎます。期間・台数を確認してください。</p><InventoryControls key={`controls:${selected.id}`} items={items.data??[]} staff={staff.data??[]} stocks={(stocks.data??[]) as StockRow[]} plans={plans.data??[]} initialItemId={selected.id}/></>;
  const bookings:BoardBooking[]=sourceBookings.filter(b=>(imported.data??[]).some(e=>e.source_key===b.id&&e.item_id===selected.id));
  for(const r of requests.filter(r=>r.from<=end&&r.to>=start))for(const [slot,name] of r.items.entries())if(matchCapacityItem(name,items.data??[])?.id===selected.id)bookings.push({id:r.id,group:`${r.inventory_root_id??r.id}:${slot}`,kind:"request",staff:r.staff,store:r.store,managementNo:r.management_no??"",status:r.status,from:r.from,to:r.to,start:r.start,end:r.end,delivery:r.delivery,pickup:r.pickup,href:`/admin/requests/${r.id}`,source:(imported.data??[]).filter(e=>e.request_id===r.id&&e.item_id===selected.id).map(e=>`${e.source_tab} ${e.source_cell}`).join("、")||undefined,extension:!!r.inventory_parent_request_id});
  for(const h of unlinked.filter(h=>h.item_id===selected.id))for(let i=0;i<h.quantity;i++)bookings.push({id:h.id,group:`hold:${h.id}:${i}`,kind:"hold",staff:h.staff_members?.name??"担当者未設定",store:h.store_name,managementNo:"",status:"hold",from:h.start_date,to:h.end_date,start:h.start_date,end:h.end_date,delivery:"",pickup:"",href:""});
  let lanes;try{lanes=layoutBoard(selected,dates,bookings);}catch(e){return <><p role="alert" className="my-4 text-red-800">{e instanceof Error?e.message:"在庫枠を表示できませんでした"}</p><InventoryControls key={`controls:${selected.id}`} items={items.data??[]} staff={staff.data??[]} stocks={(stocks.data??[]) as StockRow[]} plans={plans.data??[]} initialItemId={selected.id}/></>;}
  const stock=stockOn(selected,start);const lastStock=stockOn(selected,end);
  return <>
    <nav role="tablist" aria-label="コンテンツ切り替え" className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {capacityItems.map(i=><Link key={i.id} role="tab" aria-selected={i.id===selected.id} scroll={false} href={`?${new URLSearchParams({start,period,product:i.id,...(customEnd?{end:customEnd}:{})})}`} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition ${i.id===selected.id?"bg-slate-900 text-white shadow-sm":"text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{i.name}</Link>)}
    </nav>
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-semibold">{selected.name}</h2><p className="mt-1 text-xs text-slate-500">{start} 〜 {end} <span className="ml-2">{stock?`在庫 ${stock.total}台 ／ 内予備 ${stock.reserve}台`:"在庫数未設定"}</span>{stock&&lastStock&&(stock.total!==lastStock.total||stock.reserve!==lastStock.reserve)&&<span className="ml-2 text-amber-800">期間内に台数の変更予定あり</span>}</p></div><div className="flex flex-wrap gap-3 text-xs text-slate-600"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100"/>登録完了</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-amber-100"/>仮押さえ・連携確認</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-blue-100"/>申請待ち</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-violet-100"/>延長</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-slate-200"/>予備・対象外</span></div></div>
    <p className="mb-2 text-[11px] text-slate-500">旧シート取込済み。システムにない管理番号の案件は対象外です。</p>
    <InventoryBoard key={`board:${selected.id}`} item={selected} dates={dates} lanes={lanes} staff={staff.data??[]} />
    {unknown&&<p role="alert" className="my-2 rounded bg-amber-50 p-3 text-sm text-amber-900">日付・商品などが未確認の申請があります。残数の確認が必要です。</p>}
    <details className="my-4 rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-medium">日別残数を確認（システム登録分・参考）</summary><div className="mt-3 overflow-auto"><table className="text-xs"><thead><tr>{dates.map(d=><th className="min-w-20 border p-2" key={d}>{d.slice(5)}</th>)}</tr></thead><tbody><tr>{dates.map(d=>{const c=capacityOn(d,selected,occupancies);return <td key={d} className={`border p-2 text-center ${!unknown&&c.remaining!=null&&c.remaining<0?"bg-rose-100 text-rose-800":""}`}>{unknown?"要確認":c.remaining==null?"未設定":c.remaining<0?`${-c.remaining}台超過`:`参考残${c.remaining}`}<span className="block text-slate-500">予定{c.used}</span></td>;})}</tr></tbody></table></div><p className="mt-2 text-xs text-slate-500">申請は配送〜集荷、仮押さえは利用期間で計上します。システムにない管理番号の案件・未入力の返却点検期間は含みません。</p></details>
    <details className="my-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">在庫数・仮押さえの設定</summary><InventoryControls key={`controls:${selected.id}`} items={items.data??[]} staff={staff.data??[]} stocks={(stocks.data??[]) as StockRow[]} plans={plans.data??[]} initialItemId={selected.id} /></details>
  </>;
}
