'use client';
import type {DriveLibraries} from '@/lib/mail/drive-links';
import {useState} from 'react';
export function DriveLibraryEditor({libraries,onChange}:{libraries:DriveLibraries;onChange:(value:DriveLibraries)=>void}){
 const[business,setBusiness]=useState<'allmight'|'tezukuru'>('tezukuru');
 return <section id="drive-links" className="min-w-0 scroll-mt-24 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:col-span-2">
  <h2 className="text-base font-semibold">ドライブ資料リンク</h2><p className="mt-1 text-xs leading-6 text-slate-600">資料名と共有URLを登録してください。メール編集画面で候補から複数選んで本文に追加できます。事業ごとに別々に管理します。</p>
  <div className="mt-3 flex flex-wrap gap-2">{(['tezukuru','allmight'] as const).map(b=><button type="button" key={b} aria-pressed={business===b} onClick={()=>setBusiness(b)} className={`rounded-full border px-4 py-2 text-sm ${business===b?'border-emerald-700 bg-emerald-700 text-white':'bg-white'}`}>{b==='allmight'?'オールマイト':'てずくーる'}（{libraries[b].length}件）</button>)}</div>
  <div className="mt-4 space-y-3">{libraries[business].map((link,i)=><div key={link.id} className="min-w-0 rounded-xl border bg-white p-4">
   <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-emerald-800">資料 {i+1}</span><button type="button" className="px-2 py-1 text-xs text-rose-700" onClick={()=>onChange({...libraries,[business]:libraries[business].filter(l=>l.id!==link.id)})}>削除</button></div>
   <label className="mt-2 block text-xs font-medium">資料名<input aria-label={`資料${i+1}の名前`} value={link.name} maxLength={80} onChange={e=>onChange({...libraries,[business]:libraries[business].map(l=>l.id===link.id?{...l,name:e.target.value}:l)})} placeholder="例：取扱説明書、設営写真、運営マニュアル" className="mt-1 block w-full rounded-lg border p-3 text-sm"/></label>
   <label className="mt-3 block text-xs font-medium">共有URL<input type="url" aria-label={`資料${i+1}の共有URL`} value={link.url} onChange={e=>onChange({...libraries,[business]:libraries[business].map(l=>l.id===link.id?{...l,url:e.target.value}:l)})} placeholder="https://drive.google.com/..." className="mt-1 block w-full rounded-lg border p-3 text-sm"/></label>
  </div>)}</div>
  <button type="button" disabled={libraries[business].length>=30} className="mt-3 rounded-lg border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-800 disabled:opacity-50" onClick={()=>onChange({...libraries,[business]:[...libraries[business],{id:crypto.randomUUID().replaceAll('-','_'),name:'',url:''}]})}>＋ ドライブ資料を追加</button>
  <p className="mt-2 text-xs leading-6 text-slate-500">メールで使用中の資料は、先に本文から外すと削除できます。編集後は下の「保存」を押してください。</p>
 </section>;
}
