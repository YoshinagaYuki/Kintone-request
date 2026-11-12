"use client";

import {useRef} from 'react';
import {MAX_RECIPIENTS} from '@/lib/email-recipients';

/** Keep the existing recipient storage format; render each address as an individual field. */
export function EmailRecipientFields({id,value,onChange,inputClass}:{id:string;value:string;onChange:(value:string)=>void;inputClass:string}){
 const container=useRef<HTMLDivElement>(null);
 const rows=value.split(/[,，、;；\r\n]+/);
 // New blank rows must survive controlled renders, including consecutive empty lines.
 const lines=/[,，、;；\r]/.test(value)?rows.map(v=>v.trim()):value.split('\n');
 function change(index:number,text:string){onChange(lines.map((line,i)=>i===index?text:line).join('\n'));}
 function add(){if(lines.length>=MAX_RECIPIENTS)return;onChange([...lines,''].join('\n'));requestAnimationFrame(()=>container.current?.querySelectorAll('input').item(lines.length)?.focus());}
 return <div ref={container} className="space-y-2">
  {lines.map((line,index)=><div key={index} className="flex items-center gap-2"><input id={index===0?id:`${id}-${index+1}`} aria-label={`メールアドレス${index+1}`} type="email" inputMode="email" autoComplete={index===0?'email':'off'} value={line} onChange={e=>change(index,e.target.value)} maxLength={254} placeholder="example@example.com" className={`${inputClass} min-w-0 flex-1`}/>{lines.length>1&&<button type="button" aria-label={`メールアドレス${index+1}を削除`} onClick={()=>onChange(lines.filter((_,i)=>i!==index).join('\n'))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600">×</button>}</div>)}
  <button type="button" onClick={add} disabled={lines.length>=MAX_RECIPIENTS} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40"><span aria-hidden="true">＋</span>メールアドレスを追加<span className="text-xs font-normal text-indigo-500">{lines.length}/{MAX_RECIPIENTS}</span></button>
 </div>;
}
