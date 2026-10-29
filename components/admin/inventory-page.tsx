import{InventoryQuickHold}from'@/components/admin/inventory-quick-hold';
import{InventoryHoldList}from'@/components/admin/inventory-hold-list';
import{InventoryPeriodForm}from'@/components/admin/inventory-period-form';
import{InventoryDeliveries}from'@/components/admin/inventory-deliveries';
import{deliveryRows}from'@/lib/inventory/deliveries';
import{createClient}from'@/lib/supabase/server';
import{loadInventoryModel}from'@/lib/inventory/model';
import Link from "next/link";
import {shiftMonth} from "@/lib/inventory/calendar";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";
import { addDays, validDate } from "@/lib/inventory/gantt";

const PRESETS = { quarter: ["3ヶ月", 3], half: ["6ヶ月", 6], year: ["12ヶ月", 12] } as const;
export async function InventoryPage({ searchParams,business='allmight' }: {business?:'allmight'|'tezukuru'; searchParams: Promise<{ start?: string; end?: string; period?: string; product?:string }> }) {
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  const start = validDate(params.start) && params.start >= "2000-01-01" && params.start <= "2100-01-01" ? params.start : today;
  const period = params.period && Object.hasOwn(PRESETS, params.period) ? params.period as keyof typeof PRESETS : "quarter";
  let defaultEnd: string;
  {
    const d = new Date(`${start}T00:00:00Z`), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + PRESETS[period][1]);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); defaultEnd = addDays(d.toISOString().slice(0, 10), -1);
  }
  const end = validDate(params.end) ? params.end : defaultEnd;
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (count < 1 || count > 366) return <main className="p-8"><p>表示期間は開始日以降、最大366日で指定してください。</p><Link href={`/admin/inventory/${business}`}>期間をリセット</Link></main>;
  const scrollStart=shiftMonth(start,-1);
  const historyDays=Math.round((Date.parse(start)-Date.parse(scrollStart))/86400000);
  const dates = Array.from({ length: count+historyDays }, (_, i) => addDays(scrollStart, i));
  let model;try{model=await loadInventoryModel(await createClient(),'',business);}catch(e){return <main className="p-6"><p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{e instanceof Error?e.message:"在庫を取得できませんでした"}</p></main>;}
  return <main className="inventory-workspace mx-auto w-full max-w-[1900px] px-4 py-4 sm:px-6">
    <div className="inventory-page-heading mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{business==='tezukuru'?'てずくーる!!':'オールマイト'} 在庫管理表</h1>
    <p className="mt-1 text-xs text-slate-500">貸出・仮押さえ・返却予定を、ひとつのスケジュールで。</p>
    </div><div className="inventory-toolbar"><div className="inventory-quick-actions"><InventoryDeliveries rows={deliveryRows(model.records,model.items)} today={today}/><InventoryHoldList model={model} today={today}/><InventoryQuickHold model={model} today={today}/></div><InventoryPeriodForm start={start} period={period} end={validDate(params.end)?params.end:undefined} product={params.product} presets={Object.entries(PRESETS).map(([key,[label]])=>({key,label}))}/></div></div>
    <InventoryWorkspace model={model} start={start} end={end} dates={dates} product={params.product} period={period} customEnd={validDate(params.end)?params.end:undefined}/>

  </main>;
}

