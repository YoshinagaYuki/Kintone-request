"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {filterHoldCandidates,type HoldCandidate} from "@/lib/inventory/matching";
export function InventoryMatchPicker({ requestId, candidates, selected,items,masterLabel,initialItemId="" }: { requestId: string; candidates: HoldCandidate[]; selected: string[];items:{id:string;name:string}[];masterLabel:string;initialItemId?:string }) {
  const router = useRouter(); const [ids,setIds]=useState(selected); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [saved,setSaved]=useState(false);
  const [itemId,setItemId]=useState(initialItemId);
  const visible=filterHoldCandidates(candidates,itemId,ids);
  return <section className="my-6 rounded border bg-white p-4"><h2 className="font-bold">仮押さえとの紐付け</h2><p className="my-2 text-sm text-gray-600">利用日のずれが前後7日以内の候補です。担当者・店舗・商品を確認して選択してください。</p>
    <label className="my-3 block text-sm font-medium">{masterLabel}で絞り込み<select aria-label={`${masterLabel}で絞り込み`} value={itemId} onChange={e=>setItemId(e.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border bg-white px-3"><option value="">すべての商品</option>{items.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="text-xs text-slate-500">選択済みの仮押さえは、絞り込みを変えても表示・保持します。</p>
    <label className="my-2 block"><input type="checkbox" disabled={busy} checked={ids.length===0} onChange={()=>{setIds([]);setSaved(false);}} /> なし（新規案件として進める）</label>
    {visible.map(c=><label className="my-2 block rounded border p-2 text-sm" key={c.id}><input type="checkbox" disabled={busy} checked={ids.includes(c.id)} onChange={e=>{setIds(e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id));setSaved(false);}} /> {c.staff_name} ／ {c.store_name}<span className="block pl-5 text-gray-600">{c.item_name} × {c.quantity}：{c.start_date}〜{c.end_date}</span></label>)}
    {visible.length===0&&<p className="my-2 text-sm">近い日付の仮押さえ候補はありません。</p>}
    <button disabled={busy} className="mt-2 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50" onClick={async()=>{setBusy(true);setError("");setSaved(false);try{const r=await fetch(`/api/admin/requests/${requestId}/inventory-links`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({hold_ids:ids})});const b=await r.json();if(!r.ok)throw new Error(b.error);setSaved(true);router.refresh();}catch(e){setError(e instanceof Error?e.message:"保存できませんでした");}finally{setBusy(false);}}}>紐付けを保存</button>
    {error&&<p role="alert" className="mt-2 text-red-700">{error}</p>}{saved&&<p role="status" className="mt-2 text-green-700">保存しました</p>}
  </section>;
}
