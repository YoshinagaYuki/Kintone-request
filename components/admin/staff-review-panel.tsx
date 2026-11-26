"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {reviewLabels,type ReviewState} from '@/lib/staff-review/model';
export function StaffReviewPanel({requestId,state,reason,error}:{requestId:string;state:ReviewState;reason?:string;error?:string}){
 const router=useRouter();const[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 if(state==='not_required')return null;
 async function resend(){setBusy(true);setMessage('');try{const res=await fetch(`/api/admin/requests/${requestId}/staff-review`,{method:'POST'});const d=await res.json();if(!res.ok)throw Error(d.error);setMessage(d.sent?'確認メールを再送しました':'メールを送信できませんでした。メール設定・宛先を確認してください');router.refresh();}catch(e){setMessage(e instanceof Error?e.message:'再送できませんでした');}finally{setBusy(false);}}
 return <section className={`my-5 rounded-2xl border p-5 ${state==='approved'?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}><h2 className="font-semibold">{reviewLabels[state]}</h2><p className="mt-2 text-sm leading-6">{state==='approved'?'担当者の承認が完了しました。内容を確認してユニティ管理者の最終承認・本登録を行ってください。':state==='returned'?'申請者へ修正を依頼しています。再申請後に担当者が再確認します。':'担当者が専用ページで確認・承認するまで、本登録はできません。'}</p>{reason&&<p className="mt-2 whitespace-pre-wrap text-sm">差し戻し理由：{reason}</p>}{error&&<p className="mt-2 text-sm text-rose-700">メール送信の問題：{error}</p>}{state!=='approved'&&<button disabled={busy} onClick={()=>void resend()} className="mt-3 rounded-lg border bg-white px-4 py-2 text-sm font-semibold">{busy?'送信中…':state==='returned'?'申請者への修正依頼メールを再送':'担当者への確認メールを再送'}</button>}{message&&<p role="status" className="mt-2 text-sm">{message}</p>}</section>;
}
