"use client";
import {createContext,useContext,useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';
import {readFormDraft} from "@/lib/form-draft-storage";
const Owner=createContext('public');
export function DraftOwnerProvider({value,children}:{value:string;children:React.ReactNode}){return <Owner.Provider value={value}>{children}</Owner.Provider>;}
type Setters<T>={[K in keyof T]:Dispatch<SetStateAction<T[K]>>};
export function useFormDraft<T extends Record<string,unknown>>(key:string,value:T,setters:Setters<T>,enabled=true,baseline=''){
 const owner=useContext(Owner),storageKey=`rental-draft:v1:${owner}:${key}`;
 const [status,setStatus]=useState(''),[readyFor,setReadyFor]=useState('');
 const ready=readyFor===storageKey;
 const latest=useRef({value,setters}),initial=useRef(value),cleared=useRef(false),loaded=useRef('');
 latest.current={value,setters};
 const serialized=JSON.stringify(value);
 useEffect(()=>{
  if(!enabled)return;
  if(loaded.current===storageKey)return;
  loaded.current=storageKey;
  cleared.current=false;
  initial.current=latest.current.value;
  try{
   const raw=localStorage.getItem(storageKey);
   if(raw){const savedValues=readFormDraft(raw,baseline);
    if(savedValues){
     const current=latest.current;
     for(const field of Object.keys(current.value) as (keyof T)[]){
      const saved=savedValues[String(field)];const original=current.value[field];
      if(saved!==undefined&&typeof saved===typeof original&&Array.isArray(saved)===Array.isArray(original))current.setters[field](saved as T[keyof T]);
     }
     setStatus('前回の入力を復元しました');
    }else{localStorage.removeItem(storageKey);setStatus('元の申請が更新されたか、保存期限を過ぎたため最新の内容を表示しています');}
   }
  }catch{setStatus('このブラウザでは下書きを保存できません。画面を閉じる前に登録してください');}
  setReadyFor(storageKey);
 },[storageKey,enabled,baseline]);
 useEffect(()=>{
  if(!enabled||!ready)return;
  function save(){
   if(cleared.current)return;
   try{
    if(JSON.stringify(latest.current.value)===JSON.stringify(initial.current)){localStorage.removeItem(storageKey);return;}
    localStorage.setItem(storageKey,JSON.stringify({version:1,at:Date.now(),baseline,value:latest.current.value}));
    setStatus(s=>s.startsWith('前回')?s:'入力内容をこの端末に自動保存しています');
   }catch{setStatus('下書きを保存できません。画面を閉じる前に登録してください');}
  }
  save();window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',save);
  return()=>{window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',save);};
 },[serialized,storageKey,enabled,ready,baseline]);
 function clear(){cleared.current=true;try{localStorage.removeItem(storageKey);}catch{}setStatus('');}
 function reset(){clear();for(const field of Object.keys(initial.current) as (keyof T)[])latest.current.setters[field](initial.current[field]);cleared.current=false;}
 function discard(){if(!window.confirm('保存した下書きを破棄して、最初の内容に戻しますか？'))return false;reset();return true;}
 return {clear,discard,reset,status,ready,restart:()=>{cleared.current=false;}};
}
export function DraftNotice({draft}:{draft:{status:string;discard:()=>void}}){return <aside className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs leading-6 text-indigo-950"><div><p role="status" className="font-semibold">{draft.status||'入力途中でも、戻ってから続きができます'}</p><p className="text-indigo-700">同じ端末・ブラウザで7日間保存。もう一度この入力画面を開くと再開できます。</p></div></aside>}
