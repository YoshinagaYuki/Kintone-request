"use client";
import {useEffect,useRef,useState} from 'react';
import type {InventoryBusiness} from '@/lib/inventory/business';
import type {DeliveryCompletion} from '@/lib/inventory/delivery-completion';
import {deliveryWeek,deliveriesInWeek,type DeliveryRow} from '@/lib/inventory/deliveries';
function dateLabel(date:string){return `${Number(date.slice(5,7))}/${Number(date.slice(8))}`;}
export function InventoryDeliveries({rows,today,business}:{rows:DeliveryRow[];today:string;business:InventoryBusiness}){
 const dialog=useRef<HTMLDialogElement>(null);const list=useRef<HTMLDivElement>(null);const[week,setWeek]=useState(0);const{monday,friday}=deliveryWeek(today,week);const deliveries=deliveriesInWeek(rows,today,week);

 const [opened,setOpened]=useState(false),[reload,setReload]=useState(0);
 const [completions,setCompletions]=useState<Record<string,DeliveryCompletion>>({});
 const [loadedFor,setLoadedFor]=useState(''),[loadError,setLoadError]=useState('');
 const [pending,setPending]=useState<Set<string>>(new Set()),[saveErrors,setSaveErrors]=useState<Record<string,string>>({});
 const rangeKey=`${business}:${monday}:${friday}`,ready=loadedFor===rangeKey&&!loadError;
 const completedCount=deliveries.filter(row=>completions[row.key]?.completed).length;
 useEffect(()=>{
  if(!opened)return;
  const controller=new AbortController();
  setLoadedFor('');setLoadError('');
  const params=new URLSearchParams({business,from:monday,to:friday});
  fetch(`/api/admin/inventory/deliveries?${params}`,{cache:'no-store',signal:controller.signal}).then(async response=>{
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'配送完了の記録を確認できませんでした。');
   if(!Array.isArray(body.completions)||body.completions.some((c:DeliveryCompletion)=>!c||typeof c.key!=='string'||typeof c.completed!=='boolean'))throw Error('配送完了の記録を確認できませんでした。');
   if(controller.signal.aborted)return;
   setCompletions(Object.fromEntries(body.completions.map((c:DeliveryCompletion)=>[c.key,c])));setSaveErrors({});setLoadedFor(rangeKey);
  }).catch(error=>{if(!controller.signal.aborted)setLoadError(error instanceof Error?error.message:'配送完了の記録を確認できませんでした。');});
  return()=>controller.abort();
 },[opened,business,monday,friday,reload,rangeKey]);
 async function saveCompletion(row:DeliveryRow,completed:boolean){
  if(!ready||pending.has(row.key))return;
  setPending(previous=>new Set(previous).add(row.key));setSaveErrors(previous=>({...previous,[row.key]:''}));
  try{
   const response=await fetch('/api/admin/inventory/deliveries',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({business,key:row.key,completed})});
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'配送完了を保存できませんでした。');
   if(body.completion?.key!==row.key||typeof body.completion?.completed!=='boolean')throw Error('保存結果を確認できませんでした。一覧を開き直してください。');
   setCompletions(previous=>({...previous,[row.key]:body.completion}));
  }catch(error){setSaveErrors(previous=>({...previous,[row.key]:error instanceof Error?error.message:'保存できませんでした。再度お試しください。'}));}
  finally{setPending(previous=>{const next=new Set(previous);next.delete(row.key);return next;});}
 }
 return <><button type="button" onClick={()=>{setWeek(0);setLoadedFor('');setOpened(true);dialog.current?.showModal();list.current?.scrollTo({top:0});}} className="inventory-action"><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h3M8 18h7"/></svg>今週の納品予定<span className="inventory-action-count">{deliveriesInWeek(rows,today).length}件</span></button>
 <dialog ref={dialog} onClose={()=>setOpened(false)} aria-labelledby="weekly-delivery-title" className="inventory-list-dialog inventory-stable-list max-w-xl" onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}}>
 <div className="inventory-list-header"><div className="flex items-center justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 id="weekly-delivery-title" className="text-base font-semibold">{week===0?'今週':week===1?'来週':'週間'}の納品予定</h2><span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">全コンテンツ</span></div><p className="mt-1 text-xs text-slate-500">{monday.slice(0,4)}年 <span className="whitespace-nowrap">{dateLabel(monday)}（月）〜 {dateLabel(friday)}（金）</span></p></div><button type="button" onClick={()=>dialog.current?.close()} className="shrink-0 whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50">閉じる</button></div><div className="mt-4 flex items-center justify-between gap-2"><div className="flex gap-1.5"><button type="button" onClick={()=>setWeek(w=>w-1)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50">前の週</button><button type="button" disabled={week===0} onClick={()=>setWeek(0)} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50 disabled:opacity-40">今週</button></div><button type="button" onClick={()=>setWeek(w=>w+1)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700">次の週分を表示 →</button></div></div>
 <div key={week} ref={list} aria-live="polite" className="inventory-list-body bg-slate-50/70"><p className="mb-3 text-xs text-slate-500">納品予定 {deliveries.length}件{ready?` · 未完了 ${deliveries.length-completedCount}件 / 完了 ${completedCount}件`:loadError?'':' · 完了の記録を確認中…'}</p>{loadError&&<div role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800"><p>{loadError}</p><button type="button" onClick={()=>{setLoadedFor('');setReload(value=>value+1);}} className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-2 font-medium">再読み込み</button></div>}{!deliveries.length?<p className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-slate-500">この週の月〜金に納品予定はありません。</p>:<ul className="space-y-3">{deliveries.map(row=><li key={row.key} data-delivered={ready&&!!completions[row.key]?.completed} className="inventory-case-card"><div className="mb-3 flex items-start justify-between gap-3"><h3 className="min-w-0 break-words text-sm font-semibold leading-6">{row.managementNo?<span>{row.managementNo}</span>:<span className="text-red-600">未記載</span>}<span className="mx-1 text-slate-400">：</span>{row.store||'店舗名未記載'}</h3><span className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">{dateLabel(row.date)}（{'日月火水木金土'[new Date(`${row.date}T00:00:00Z`).getUTCDay()]}）納品</span></div><dl className="space-y-2 text-xs"><div className="flex gap-3"><dt className="w-16 shrink-0 text-slate-500">コンテンツ</dt><dd className="flex flex-wrap gap-1.5">{row.contents.map(c=><span key={c.name} className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">{c.name}{c.quantity>1?` × ${c.quantity}台`:''}</span>)}</dd></div><div className="flex gap-3"><dt className="w-16 shrink-0 text-slate-500">担当者</dt><dd className="py-0.5 text-slate-700">{row.staff.join('・')||'未記載'}</dd></div></dl><div className="inventory-delivery-progress mt-3 border-t border-slate-100 pt-2"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" aria-label={`${row.managementNo||'管理番号未記載'} ${row.store||'店舗名未記載'}の配送完了`} checked={!!completions[row.key]?.completed} disabled={!ready||pending.has(row.key)} onChange={event=>void saveCompletion(row,event.target.checked)} className="h-5 w-5 shrink-0 accent-emerald-600 disabled:opacity-40"/><span>{pending.has(row.key)?'保存中…':'配送完了'}</span>{ready&&completions[row.key]?.completedAt&&<time dateTime={completions[row.key].completedAt!} className="ml-auto text-[10px] font-normal text-slate-500">{new Date(completions[row.key].completedAt!).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} に記録</time>}</label>{saveErrors[row.key]&&<p role="alert" className="mt-1 text-xs leading-6 text-rose-700">{saveErrors[row.key]}</p>}</div></li>)}</ul>}</div></dialog></>;
}
