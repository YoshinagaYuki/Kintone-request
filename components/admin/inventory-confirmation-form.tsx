"use client";
import{useEffect,useState}from'react';
import{useRouter}from'next/navigation';
import{AllmightApplyForm,type AllmightInitialValues}from'../apply/allmight-apply-form';
import{postInventorySave}from'@/lib/inventory/save-client';
type Defaults={formTypeId:string;version:number;baseline:string;initialValues:AllmightInitialValues;deliveryRequired:boolean;pickupRequired:boolean;staff:{id:string;name:string}[];lines:{name:string;number:number|null}[]};
export function InventoryConfirmationForm({bookingKey,onBack}:{bookingKey:string;onBack:()=>void}){
 const router=useRouter(),[data,setData]=useState<Defaults|null>(null),[error,setError]=useState(''),[id]=useState(()=>crypto.randomUUID()),[saved,setSaved]=useState(''),[conflict,setConflict]=useState<{latestBaseline:string;latest:{name:string;number:number|null;store:string;start:string;end:string}[];deliveryRequired:boolean;pickupRequired:boolean}|null>(null);
 useEffect(()=>{let stopped=false;fetch(`/api/admin/inventory/confirmations?key=${encodeURIComponent(bookingKey)}`).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(stopped)return;if(d.existingRequestId)setSaved(d.existingRequestId);else setData(d);}).catch(e=>{if(!stopped)setError(e.message)});return()=>{stopped=true};},[bookingKey]);
 async function submit(payload:Record<string,unknown>){
  const {response,data:result}=await postInventorySave('/api/admin/inventory/confirmations',{id,key:bookingKey,baseline:data!.baseline,payload});
  if(!response.ok){if(result.code==='target_changed')setConflict(result);throw Error(result.error);}setSaved(result.requestId);
  if(result.status!=='registered'){
   if(!['pending','register_failed'].includes(result.status))throw Error('申請は保存済みです。処理状況を下のリンクから確認してください');
   const approval=await fetch(`/api/admin/requests/${result.requestId}/${result.status==='pending'?'approve':'retry'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({staff_name:payload.company_staff_name})});const a=await approval.json();
   if(!approval.ok)throw Error(`${a.error||'kintone連携を完了できませんでした'}。申請・入力は保存済みです。下の「保存済み申請」を開き、同じ申請から再試行してください。`);
   router.push(`/admin/requests${a.inventoryWarning?'?inventory=unassigned':''}`);
  }else router.push('/admin/requests');router.refresh();
 }
 return <div className="space-y-3 [&_input]:min-h-11 [&_input]:text-base [&_select]:min-h-11 [&_select]:text-base [&_textarea]:text-base [&_button]:min-h-11"><section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm"><h3 className="font-semibold text-indigo-950">仮押さえから本登録</h3><p className="mt-2 text-xs text-indigo-900">申請情報を入力して本登録すると、通常の申請承認と同じ処理でkintoneへの書き込み・管理番号の発行を行います。確保済みの機器番号を引き継ぎます。</p>{data&&<ul className="mt-2 space-y-1 text-xs">{data.lines.map((l,i)=><li key={i}>{i+1}. {l.name} · {l.number?`${l.number}号`:'承認時に空き番号を自動選択'}</li>)}</ul>}</section>{error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{conflict&&<section className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs"><p className="font-semibold">仮押さえの最新内容</p><ul className="my-2 space-y-1">{conflict.latest.map((r,i)=><li key={i}>{r.name} · {r.number?`${r.number}号`:'未割当'} · {r.store} · {r.start}〜{r.end}</li>)}</ul><p>入力中の申請情報は残しています。最新の商品・機器番号・配送条件を引き継いで続けます。</p><button type="button" className="mt-2 rounded border bg-white p-2" onClick={()=>{setData(d=>d?{...d,baseline:conflict.latestBaseline,lines:conflict.latest,deliveryRequired:conflict.deliveryRequired,pickupRequired:conflict.pickupRequired}:d);setConflict(null);}}>最新内容を確認して続ける</button></section>}{saved&&<a className="block rounded-lg border p-3 text-sm text-indigo-700 underline" href={`/admin/requests/${saved}`}>保存済み申請を開く（重複して新規作成しません）</a>}{!data&&!saved&&!error&&<p>仮押さえを確認しています…</p>}{data&&<AllmightApplyForm formTypeId={data.formTypeId} productOptions={data.lines.map(l=>l.name)} initialValues={data.initialValues} inventory={{deliveryRequired:data.deliveryRequired,pickupRequired:data.pickupRequired,staff:data.staff,equipments:data.lines.map(l=>l.name),onBack,onSubmit:submit}}/>}</div>;
}
