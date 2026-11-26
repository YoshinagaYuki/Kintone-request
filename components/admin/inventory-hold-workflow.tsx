"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {BoardBooking} from '@/lib/inventory/board';
import type {InventoryRecord} from '@/lib/inventory/model';
import {holdWorkflow} from '@/lib/inventory/hold-workflow';
const day=(n:number)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(n);
export function InventoryHoldWorkflow({booking,records,version,onSaved}:{booking:BoardBooking;records:InventoryRecord[];version:number;onSaved:()=>void}){
 const router=useRouter();const linked=records.filter(r=>!r.deleted&&(r.booking.key===booking.key||!!booking.bundleKey&&r.booking.bundleKey===booking.bundleKey));
 const info=holdWorkflow(linked.map(r=>r.booking));const phase=info.phase;const[busy,setBusy]=useState(false),[error,setError]=useState(''),[cancelling,setCancelling]=useState(false);
 if(booking.status==='registered')return <p className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">本登録</p>;
 if(booking.status!=='hold')return null;
 async function save(cancel=false){setBusy(true);setError('');try{const res=await fetch('/api/admin/inventory/hold-workflow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:booking.key,version,phase,cancel})});const body=await res.json();if(!res.ok)throw Error(body.error||'保存できませんでした');router.refresh();onSaved();}catch(e){setError(e instanceof Error?e.message:'保存できませんでした');}finally{setBusy(false);}}
 return <section className="mt-4 border-t pt-3" aria-label="仮押さえの期限とキャンセル">{info.phase==='hold'&&<p className={`mb-2 text-xs ${info.overdue?'font-semibold text-red-700':'text-slate-500'}`}>{info.overdue?'2週間経過 · キャンセル確認：':''}{info.opened===null?'登録日不明（期限判定なし）':`登録 ${day(info.opened)} · 確認期限 ${day(info.due!)}`}</p>}<fieldset disabled={busy} className="space-y-3"><button type="button" onClick={()=>setCancelling(v=>!v)} className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700">この仮押さえをキャンセル</button>{cancelling&&<div className="rounded-lg border border-red-200 bg-white p-3"><p className="text-xs leading-5 text-red-800">「{booking.store}」の同じ案件の商品すべて（{linked.length}台）をキャンセルし、在庫を解放します。記録は履歴に残ります。</p><div className="mt-2 flex gap-2"><button type="button" onClick={()=>void save(true)} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white">キャンセルを確定</button><button type="button" onClick={()=>setCancelling(false)} className="rounded-lg border px-3 py-2 text-xs">戻る</button></div></div>}</fieldset>{error&&<p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}</section>;
}
