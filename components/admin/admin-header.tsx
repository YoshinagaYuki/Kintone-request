'use client';
import Link from 'next/link';
import {useEffect,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {InventoryQuickHold} from './inventory-quick-hold';
import {adminSection} from '@/lib/admin-navigation';
const inventory=[{href:'/admin/inventory/allmight',label:'オールマイト'},{href:'/admin/inventory/tezukuru',label:'てずくーる!!'}];
const logistics=[{href:'/admin/warehouse-closures',label:'倉庫休業日'},{href:'/admin/shipping-days',label:'配送日数'}];
const daily=[{href:'/admin/requests',label:'申請一覧'},{href:'/admin/company-portals',label:'企業別URL'}];
const management=[{href:'/admin/plans',label:'商品・プラン'},{href:'/admin/staff',label:'担当者・確認設定'}];
function active(path:string,href:string){return href==='/admin/plans'?adminSection(path)==='master':href==='/admin/settings'?adminSection(path)==='settings':path===href||path.startsWith(href+'/');}
const linkClass='header-nav-link inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium';
function HeaderDropdown({label,items,path}:{label:string;items:{href:string;label:string}[];path:string}){
 const selected=items.some(i=>active(path,i.href));
 return <details className="header-dropdown group relative shrink-0" onToggle={e=>{if(e.currentTarget.open)e.currentTarget.closest('header')?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(d=>{if(d!==e.currentTarget)d.open=false;});}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}>
  <summary aria-current={selected?'page':undefined} className="header-nav-link flex h-10 cursor-pointer list-none items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium">{label}<span aria-hidden="true" className="text-[10px] opacity-60">▾</span></summary>
  <nav aria-label={`${label}の切り替え`} className="header-dropdown-panel absolute left-0 top-[calc(100%+8px)] w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl before:absolute before:inset-x-0 before:-top-3 before:h-3 before:content-['']">{items.map(i=><Link key={i.href} href={i.href} aria-current={active(path,i.href)?'page':undefined} onClick={e=>{const d=e.currentTarget.closest('details');if(d)d.open=false;}} className="block rounded-lg px-3 py-3 text-sm font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-800">{i.label}</Link>)}</nav>
 </details>;
}
export function AdminHeader(){
 const path=usePathname(),root=useRef<HTMLElement>(null);
 useEffect(()=>{function outside(e:Event){if(e.target instanceof Node&&!root.current?.contains(e.target))root.current?.querySelectorAll('details[open]').forEach(d=>d.removeAttribute('open'));}document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside);},[]);
 useEffect(()=>{root.current?.querySelectorAll('details[open]').forEach(d=>d.removeAttribute('open'));},[path]);
 if(path==='/admin/login')return null;
 const model={staff:[],version:0,business:path.includes('/tezukuru')?'tezukuru' as const:'allmight' as const};
 const menuLink=(i:{href:string;label:string})=><Link key={i.href} href={i.href} aria-current={active(path,i.href)?'page':undefined} className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-indigo-50" onClick={e=>{const d=e.currentTarget.closest('details');if(d)d.open=false;}}>{i.label}</Link>;
 return <header ref={root} className="rental-header sticky top-0 z-50 border-b backdrop-blur">
  <div className="rental-mobile relative flex h-[60px] items-center justify-between gap-2 px-3 xl:hidden">
   <Link href="/admin/inventory/allmight" className="shrink-0 text-xs font-bold"><span className="min-[380px]:hidden">管理</span><span className="hidden min-[380px]:inline">レンタル管理</span></Link>
   <div className="flex items-center gap-2"><InventoryQuickHold header model={model}/><Link href="/apply" aria-label="新規申請" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-white">＋ 新規申請</Link>
    <details onToggle={e=>{if(e.currentTarget.open)e.currentTarget.closest('header')?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(d=>{if(d!==e.currentTarget)d.open=false;});}} onKeyDown={e=>{if(e.key==='Escape'){e.currentTarget.open=false;e.currentTarget.querySelector('summary')?.focus();}}}><summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border px-3 text-sm font-medium">メニュー ▾</summary>
     <nav aria-label="スマホ管理メニュー" className="absolute left-3 right-3 top-[56px] z-50 max-h-[75dvh] overflow-y-auto rounded-xl border bg-white p-3 shadow-xl"><p className="px-3 pb-1 pt-1 text-[10px] font-bold tracking-wider text-slate-400">在庫・申請</p><div className="grid grid-cols-2 gap-1">{inventory.map(i=>menuLink({...i,label:`${i.label}在庫`}))}{daily.map(menuLink)}</div><div className="my-2 border-t border-slate-100"/><p className="px-3 pb-1 text-[10px] font-bold tracking-wider text-slate-400">管理・設定</p><div className="grid grid-cols-2 gap-1">{management.map(menuLink)}{logistics.map(menuLink)}{menuLink({href:'/admin/settings',label:'設定'})}</div></nav>
    </details>
   </div>
  </div>
  <div className="rental-desktop mx-auto hidden h-[60px] max-w-[1900px] items-center gap-5 px-6 xl:flex">
   <Link href="/admin/inventory/allmight" className="mr-1 flex shrink-0 items-center gap-2.5 text-sm font-bold"><span className="rental-brandmark flex h-8 w-8 items-center justify-center rounded-lg text-white"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span>レンタル管理</Link>
   <nav aria-label="管理メニュー" className="flex min-w-0 flex-1 items-center gap-0.5"><HeaderDropdown label="在庫管理表" items={inventory} path={path}/>{daily.map(i=><Link key={i.href} href={i.href} aria-current={active(path,i.href)?'page':undefined} className={linkClass}>{i.label}</Link>)}<span aria-hidden="true" className="mx-2 h-5 border-l border-white/15"/>{management.map(i=><Link key={i.href} href={i.href} aria-current={active(path,i.href)?'page':undefined} className={linkClass}>{i.label}</Link>)}<HeaderDropdown label="配送・倉庫" items={logistics} path={path}/><Link href="/admin/settings" aria-current={active(path,'/admin/settings')?'page':undefined} className={linkClass}>設定</Link></nav>
   <div className="header-create-actions flex shrink-0 items-center gap-2 border-l border-white/15 pl-4"><InventoryQuickHold header model={model}/><Link href="/apply" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-white">＋ 新規申請</Link></div>
  </div>
 </header>;
}
