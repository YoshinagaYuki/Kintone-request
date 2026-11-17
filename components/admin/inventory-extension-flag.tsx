"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {BoardBooking} from '@/lib/inventory/board';
export function InventoryExtensionFlag({booking}:{booking:BoardBooking}){
 const router=useRouter();const [possible,setPossible]=useState(!!booking.extensionPossible),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(!booking.managementNo||booking.status==='blocked')return null;
 return <section className={`mb-3 rounded-xl border p-3 ${possible?'border-amber-300 bg-amber-50':'border-slate-200 bg-slate-50'}`}><button type="button" aria-pressed={possible} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/api/admin/inventory/extension-flags',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:booking.key,possible:!possible,previous:possible})});const d=await r.json();if(!r.ok)throw Error(d.error||'保存できませんでした');setPossible(d.possible);router.refresh();}catch(e){setError(e instanceof Error?e.message:'保存できませんでした');}finally{setBusy(false);}}} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${possible?'border-amber-400 bg-amber-100 text-amber-950':'border-slate-300 bg-white text-slate-700'}`}>{busy?'保存中…':possible?'✓ 延長の可能性あり':'＋ 延長の可能性あり'}</button><p className="mt-2 text-xs leading-5 text-slate-600">利用終了日の翌日から1か月間を薄いグレーで確保し、別のレンタルは登録できません。解除すると空きに戻ります。利用日・集荷日は変更しません。</p>{error&&<p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}</section>;
}
