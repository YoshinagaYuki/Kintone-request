"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function InventoryExtensionForm({requestId,currentEnd,nextDay,currentNumber}:{requestId:string;currentEnd:string;nextDay:string;currentNumber:string|null}) {
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [operationId,setOperationId]=useState("");
  const [end,setEnd]=useState("");const [pickup,setPickup]=useState("");const [confirmed,setConfirmed]=useState(false);
  return <details className="my-4 rounded border bg-white p-4"><summary className="cursor-pointer font-bold">延長を登録</summary>
    <p className="my-3 text-sm">現在の利用終了日：{currentEnd}。延長分は{nextDay}から別申請として承認・採番します。新規納品は不要、配送先・集荷先情報は空欄とし、集荷日だけ設定します。</p>
    <p className="my-3 text-sm text-amber-800">元の管理番号{currentNumber}は、kintoneと配送管理の集荷を「手配不要」に切り替えます。運送会社へ手配済みの場合は、実際の旧集荷取消も確認してください。</p>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={async e=>{e.preventDefault();if(!confirmed)return;setBusy(true);setError("");const f=new FormData(e.currentTarget);const id=operationId||crypto.randomUUID();setOperationId(id);try{const res=await fetch(`/api/admin/requests/${requestId}/extend`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,usage_end:end,pickup_date:pickup,billing_month:Number(f.get("billing_month"))})});const b=await res.json();if(b.childId){router.push(`/admin/requests/${b.childId}`);router.refresh();return;}if(!res.ok)throw new Error(b.error||"延長の作成に失敗しました");}catch(e){setError(e instanceof Error?e.message:"通信に失敗しました。再度実行すると同じ延長を確認します");}finally{setBusy(false);}}}>
      <label>延長後の利用終了日<input className="block w-full rounded border p-2" type="date" required min={nextDay} max="2100-12-31" value={end} onChange={e=>setEnd(e.target.value)} /></label>
      <label>新しい集荷日<input className="block w-full rounded border p-2" type="date" required min={end||nextDay} max="2100-12-31" value={pickup} onChange={e=>setPickup(e.target.value)} /></label>
      <label>請求対象月<select className="block w-full rounded border p-2" name="billing_month" defaultValue={Number(nextDay.slice(5,7))}>{Array.from({length:12},(_,i)=><option value={i+1} key={i}>{i+1}月分</option>)}</select></label>
      <label className="text-sm sm:col-span-3"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required /> 商品は返却前で、上記内容で延長を承認します。</label>
      <button className="rounded bg-purple-700 p-2 text-white disabled:opacity-50" disabled={busy||!confirmed}>{busy?"延長を連携中…":"延長を確定・新番号を発行"}</button>
      {error&&<p role="alert" className="text-red-700 sm:col-span-3">{error}</p>}
    </form>
  </details>;
}
