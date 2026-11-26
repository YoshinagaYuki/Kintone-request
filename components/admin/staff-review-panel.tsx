'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {reviewLabels,type ReviewState} from '@/lib/staff-review/model';
export function StaffReviewPanel({requestId,state,revision,staffName,reason,error}:{requestId:string;state:ReviewState;revision:number;staffName?:string;reason?:string;error?:string}){
 const router=useRouter();const[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[override,setOverride]=useState(false),[note,setNote]=useState(''),[url,setUrl]=useState('');
 if(state==='not_required')return null;
 async function act(action:'resend'|'link'|'override'){
  setBusy(true);setMessage('');setUrl('');
  try{const res=await fetch(`/api/admin/requests/${requestId}/staff-review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,revision,reason:note,role:state==='returned'?'requester':'reviewer'})});const d=await res.json();if(!res.ok)throw Error(d.error);
   if(action==='link'){setUrl(d.url);setMessage('URLを再発行しました。以前のURLは無効です。メールは送信していません。');}
   else if(action==='override'){setOverride(false);setMessage('管理者が代理承認しました。下の本登録手続きへ進んでください。');}
   else setMessage(d.sent?'メールを再送しました。以前のURLは無効です。':'送信できませんでした。宛先・メール設定を確認してください。');
   router.refresh();
  }catch(e){setMessage(e instanceof Error?e.message:'処理できませんでした');}finally{setBusy(false);}
 }
 const approved=state==='approved';
 return <section className={`review-workflow my-5 overflow-hidden rounded-2xl border ${approved?'border-emerald-200':state==='returned'?'border-rose-200':'border-amber-200'} bg-white`}>
  <div className={`p-5 ${approved?'bg-emerald-50':state==='returned'?'bg-rose-50':'bg-amber-50'}`}><p className="text-xs font-semibold text-slate-500">本登録までの進み具合</p><ol className="mt-3 grid grid-cols-3 gap-2 text-xs">{['申請受付','担当者確認','管理者の最終承認'].map((label,i)=><li key={label} className={`rounded-lg border px-3 py-2 ${i===0||i===1&&approved?'border-emerald-200 bg-emerald-50 text-emerald-800':i===(approved?2:1)?'border-indigo-300 bg-white font-bold text-indigo-800':'border-slate-200 text-slate-500'}`}><span className="mr-1">{i===0||i===1&&approved?'✓':i+1}</span>{label}</li>)}</ol>
   <h2 className="mt-4 text-lg font-bold text-slate-900">{approved&&reason?'管理者が代理承認済み':reviewLabels[state]}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{approved?'次は管理者の最終確認です。下の承認欄で内容を確認し、本登録してください。':state==='returned'?'申請者へ修正を依頼しています。修正を待つか、社内で内容を確認して代理承認できます。':`${staffName??'担当者'}さんの確認を待っています。お急ぎの場合は管理者が代理承認できます。`}</p>
  </div>
  {approved&&<a href="#request-approval" className="mx-5 mt-4 inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">本登録の最終確認へ進む ↓</a>}
  {reason&&<div className="mx-5 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-semibold">{approved?'確認記録':'差し戻し理由'}</p><p className="mt-1 whitespace-pre-wrap">{reason}</p></div>}
  {error&&<p role="alert" className="mx-5 mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">メールを届けられていません：{error}</p>}
  {!approved&&<div className="grid gap-4 p-5 lg:grid-cols-2"><div className="rounded-xl border border-slate-200 p-4"><h3 className="text-sm font-semibold">{state==='returned'?'申請者に修正をお願いする':'担当者に確認をお願いする'}</h3><p className="mt-1 text-xs leading-6 text-slate-500">メールで送り直すか、確認URLをコピーして直接お渡しください。</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void act('resend')} className="rounded-lg border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50">メールを再送</button><button type="button" disabled={busy} onClick={()=>void act('link')} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 disabled:opacity-50">確認URLを再発行</button></div>
   {url&&<div className="mt-3 rounded-lg bg-slate-50 p-3"><label className="text-xs font-medium">有効期限30日の確認URL<input aria-label="再発行した確認URL" value={url} readOnly className="mt-1 w-full rounded-lg border bg-white p-2 text-sm"/></label><button type="button" className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" onClick={()=>void navigator.clipboard.writeText(url).then(()=>setMessage('URLをコピーしました。必要な方にお渡しください。')).catch(()=>setMessage('URLを選択してコピーしてください。'))}>URLをコピー</button><p className="mt-2 text-xs text-slate-500">このリンクから申請内容を閲覧できます。宛先を確認してお渡しください。</p></div>}
  </div><div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"><h3 className="text-sm font-semibold text-indigo-950">社内で確認済みの場合</h3><p className="mt-1 text-xs leading-6 text-slate-600">担当者の返答を待たず、管理者が代理で承認できます。操作した人と理由が履歴に残ります。</p>{!override?<button type="button" disabled={busy} onClick={()=>setOverride(true)} className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">管理者が代理承認する</button>:<div className="mt-3"><label className="text-xs font-semibold">代理承認の理由（必須）<textarea aria-label="代理承認の理由" value={note} maxLength={1000} onChange={e=>setNote(e.target.value)} placeholder="例：営業担当へ電話で確認済みのため" rows={2} className="mt-1 w-full rounded-lg border bg-white p-3 text-sm"/></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy||!note.trim()} onClick={()=>void act('override')} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">代理承認して本登録手続きへ</button><button type="button" disabled={busy} onClick={()=>setOverride(false)} className="rounded-lg border bg-white px-3 py-2 text-sm">戻る</button></div><p className="mt-2 text-xs leading-5 text-slate-500">この操作だけではKintone登録・完了メール送信は行いません。続けて本登録の最終確認を行います。</p></div>}</div></div>}
  {message&&<p role="status" className="mx-5 mb-5 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-900">{message}</p>}
 </section>;
}
