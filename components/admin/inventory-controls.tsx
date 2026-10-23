"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export type InventoryItem = { id: string; name: string };
export type StockRow = { item_id: string; total_count: number; reserve_count: number };
export function InventoryControls({ items, staff, stocks, includeHolds = true }: { includeHolds?: boolean; items: InventoryItem[]; staff: InventoryItem[]; stocks: StockRow[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [holdId, setHoldId] = useState("");
  const [selected, setSelected] = useState(items[0]?.id ?? "");
  const [stockId, setStockId] = useState(items[0]?.id ?? "");
  const [total, setTotal] = useState(String(stocks.find(s => s.item_id === items[0]?.id)?.total_count ?? ""));
  const [reserve, setReserve] = useState(String(stocks.find(s => s.item_id === items[0]?.id)?.reserve_count ?? ""));
  const inputClass = "block w-full rounded border p-2 text-sm";
  const options = items.map(i => <option key={i.id} value={i.id}>{i.name}</option>);
  async function submit(path: string, method: string, body: unknown) {
    setError(""); setMessage(""); setBusy(true);
    try {
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "保存できませんでした");
      setMessage("保存しました"); router.refresh(); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "通信に失敗しました"); return false; }
    finally { setBusy(false); }
  }
  return <section className="my-6 rounded border bg-white p-4">
    <h2 className="text-lg font-bold">{includeHolds ? "在庫数・仮押さえの登録" : "在庫数・内予備数"}</h2>
    {includeHolds && <p className="my-2 text-sm text-amber-800">仮押さえは利用期間を記録します。申請との紐付け・残数判定は未対応のため、在庫確保の可否は別途確認してください。</p>}
    {error && <p role="alert" className="my-2 text-red-700">{error}</p>}{message && <p role="status" className="my-2 text-green-700">{message}</p>}
    <details><summary className="cursor-pointer py-2 font-medium">商品ごとの在庫数・内予備数</summary>
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={async e => { e.preventDefault(); await submit("/api/admin/inventory/stock", "PUT", { item_id: stockId, total_count: Number(total), reserve_count: Number(reserve) }); }}>
        <label>商品<select className={inputClass} value={stockId} onChange={e => { const id = e.target.value; setStockId(id); const row = stocks.find(s => s.item_id === id); setTotal(String(row?.total_count ?? "")); setReserve(String(row?.reserve_count ?? "")); }}>{options}</select></label>
        <label>在庫数<input className={inputClass} type="number" min="0" max="100000" step="1" required value={total} onChange={e => setTotal(e.target.value)} /></label>
        <label>内予備数<input className={inputClass} type="number" min="0" max={total || "100000"} step="1" required value={reserve} onChange={e => setReserve(e.target.value)} /></label>
        <button disabled={busy || !stockId} className="self-end rounded bg-blue-600 p-2 text-white disabled:opacity-50">在庫数を保存</button>
      </form>
      <ul className="my-3 text-sm">{items.map(i => { const s = stocks.find(row => row.item_id === i.id); return <li key={i.id}>{i.name}：{s ? `在庫 ${s.total_count} / 内予備 ${s.reserve_count} / 通常利用枠 ${s.total_count - s.reserve_count}` : "未設定"}</li>; })}</ul>
    </details>
    {includeHolds && <details><summary className="cursor-pointer py-2 font-medium">仮押さえを追加</summary>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={async e => {
        e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); const id = holdId || crypto.randomUUID(); setHoldId(id);
        const ok = await submit("/api/admin/inventory/holds", "POST", { id, item_id: selected, staff_id: f.get("staff"), store_name: f.get("store"), quantity: Number(f.get("quantity")), start_date: f.get("start"), end_date: f.get("end"), note: f.get("note") });
        if (ok) { setHoldId(""); form.reset(); }
      }}>
        <label>商品<select className={inputClass} value={selected} onChange={e => { setSelected(e.target.value); setHoldId(""); }}>{options}</select></label>
        <label>担当者<select required name="staff" className={inputClass} defaultValue=""><option value="" disabled>選択してください</option>{staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>店舗名<input name="store" required maxLength={200} className={inputClass} /></label>
        <label>利用開始日<input name="start" type="date" min="2000-01-01" max="2100-12-31" required className={inputClass} /></label>
        <label>利用終了日<input name="end" type="date" min="2000-01-01" max="2100-12-31" required className={inputClass} /></label>
        <label>台数<input name="quantity" type="number" min="1" max="100000" step="1" defaultValue="1" required className={inputClass} /></label>
        <label className="sm:col-span-2">備考<textarea name="note" maxLength={2000} className={inputClass} /></label>
        <button disabled={busy || !selected} className="self-end rounded bg-blue-600 p-2 text-white disabled:opacity-50">仮押さえを登録</button>
      </form>
    </details>}
  </section>;
}
