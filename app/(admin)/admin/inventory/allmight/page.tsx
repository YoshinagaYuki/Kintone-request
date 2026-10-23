import Link from "next/link";
import { InventoryWorkspace } from "@/components/admin/inventory-workspace";
import { createClient } from "@/lib/supabase/server";
import { addDays, ganttEntry, validDate, type InventoryRequest } from "@/lib/inventory/gantt";

export const dynamic = "force-dynamic";
const PRESETS = { week: ["1週間", 7], fortnight: ["2週間", 14], month: ["1ヶ月", 1], quarter: ["3ヶ月", 3], half: ["6ヶ月", 6] } as const;
export default async function Page({ searchParams }: { searchParams: Promise<{ start?: string; end?: string; period?: string }> }) {
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
  const start = validDate(params.start) && params.start >= "2000-01-01" && params.start <= "2100-01-01" ? params.start : today;
  const period = params.period && Object.hasOwn(PRESETS, params.period) ? params.period as keyof typeof PRESETS : "week";
  let defaultEnd: string;
  if (period === "week" || period === "fortnight") defaultEnd = addDays(start, PRESETS[period][1] - 1);
  else {
    const d = new Date(`${start}T00:00:00Z`), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + PRESETS[period][1]);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last)); defaultEnd = addDays(d.toISOString().slice(0, 10), -1);
  }
  const end = validDate(params.end) ? params.end : defaultEnd;
  const count = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (count < 1 || count > 366) return <main className="p-8"><p>表示期間は開始日以降、最大366日で指定してください。</p><Link href="/admin/inventory/allmight">期間をリセット</Link></main>;
  const dates = Array.from({ length: count }, (_, i) => addDays(start, i));
  const db = await createClient();
  // PostgRESTの既定上限で黙って欠落しないよう、明示した上限+1件までページ取得する。
  const rows: InventoryRequest[] = [];
  let failed = false;
  for (let offset = 0; offset < 5001; offset += 500) {
    const { data, error } = await db.from("requests")
      .select("id,status,management_no,parsed_data,approved_staff_name,company_staff_name_input,form_types!inner(kintone_app_id)")
      .eq("form_types.kintone_app_id", 10).is("deleted_at", null).neq("status", "rejected")
      .order("id").range(offset, Math.min(offset + 499, 5000));
    if (error) { failed = true; break; }
    rows.push(...(data ?? []) as InventoryRequest[]);
    if (!data || data.length < 500) break;
  }
  const entries = rows.map(ganttEntry);
  const invalid = entries.filter(e => !e || !e.items.length).length;
  const visible = entries.filter(e => e && e.to >= start && e.from <= end);
  return <main className="mx-auto w-full max-w-[1600px] px-4 py-8">
    <h1 className="text-2xl font-bold">オールマイト 在庫管理表</h1>
    <p className="mt-2 text-sm text-gray-600">既存申請の参照表示です。在庫数・仮押さえは設定完了後に表示します。日別残数は参考表示です。延長・シート同期は準備中です。利用期間は配送・集荷を含む在庫拘束期間とは異なります。</p>
    <form className="my-5 flex flex-wrap items-end gap-3">
      <label>開始日<input className="block rounded border p-2" type="date" name="start" defaultValue={start} required /></label>
      <label>表示期間<select className="block rounded border p-2" name="period" defaultValue={period}>{Object.entries(PRESETS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>終了日（任意・優先）<input className="block rounded border p-2" type="date" name="end" defaultValue={validDate(params.end) ? params.end : ""} /></label>
      <button className="rounded bg-blue-600 px-4 py-2 text-white">表示</button>
    </form>
    <InventoryWorkspace start={start} end={end} dates={dates} requests={entries.filter((e): e is NonNullable<typeof e> => e !== null)} incomplete={failed || rows.length > 5000 || invalid > 0} />
    <p className="mb-3 text-sm">青：申請待ち　緑：登録完了　黄：承認済み・連携確認　配：配送日　集：集荷日</p>
    {failed || rows.length > 5000 ? <p role="alert" className="rounded bg-red-50 p-4 text-red-800">{failed ? "申請を取得できませんでした。再読み込みしてください。" : "申請が5,000件を超えたため表示を停止しました。期間検索の拡張が必要です。"}</p> : <>
      {invalid > 0 && <p role="status" className="mb-3 text-amber-800">利用日付または商品が未設定・不正の申請 {invalid} 件は表示できません。申請一覧で確認してください。</p>}
      <div className="overflow-auto rounded border">
        <table className="w-full border-collapse text-xs"><caption className="p-2 text-left">{start} 〜 {end}（商品・申請の各枠ごとに表示。台数・残数は未集計）</caption>
          <thead><tr><th className="sticky left-0 z-10 min-w-64 border bg-gray-100 p-2">商品 / 管理番号・店舗・担当者</th>{dates.map(date => <th className="min-w-16 border bg-gray-100 p-2" key={date}>{date.slice(5)}</th>)}</tr></thead>
          <tbody>{visible.flatMap(entry => entry ? entry.items.map((item, i) => <tr key={`${entry.id}-${i}`}>
            <th className="sticky left-0 z-10 border bg-white p-2 text-left font-normal"><strong>{item}</strong><br/><Link className="text-blue-700 underline" href={`/admin/requests/${entry.id}`}>{entry.management_no || "番号未発行"}：{entry.store}</Link><br/>{entry.staff}</th>
            {dates.map(date => { const usage = date >= entry.start && date <= entry.end; return <td className={`border p-1 text-center ${usage ? entry.status === "registered" ? "bg-green-100" : entry.status === "pending" ? "bg-blue-100" : "bg-amber-100" : ""}`} key={date}>
              <Link className="block min-h-7 focus:outline focus:outline-blue-600" href={`/admin/requests/${entry.id}`} aria-label={`${item} ${entry.store} ${date}${usage ? " 利用" : ""}`}>
                {date === entry.delivery && <span className="block font-bold">配</span>}{usage && "利用"}{date === entry.pickup && <span className="block font-bold">集</span>}
              </Link></td>; })}
          </tr>) : [])}</tbody>
        </table>
        {visible.length === 0 && <p className="p-6 text-gray-600">この期間に表示できる申請はありません。</p>}
      </div>
    </>}
  </main>;
}
