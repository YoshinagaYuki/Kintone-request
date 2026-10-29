"use client";

import Link from "next/link";
import {InventoryQuickHold} from "./inventory-quick-hold";
import {adminSection} from "@/lib/admin-navigation";
import { usePathname } from "next/navigation";

/**
 * 管理画面の共通ナビゲーションバー(全 /admin/* ページ。ログイン画面では非表示)。
 * ・現在開いているページは青背景+白文字(active)
 * ・PCはフルラベル、スマホ(480px未満)はアイコン+短縮ラベルで1行表示
 * ・「➕ 新規申請」は /apply へ(種別が増えても申請画面側の選択で吸収)
 */

// 「フォーム設定」(/admin/form-settings)は構造化申請フォーム導入により通常運用では不要になったため
// ナビから非表示にしている。ルート・API・DB・データは当面残置(URL直開きは可能)。
// 【削除候補】旧FMT申請との互換が不要になった段階で /admin/form-settings 一式を完全撤去する。
const NAV_ITEMS = [
  { href: "/admin/requests", label: "申請一覧", shortLabel: "申請" },
  { href: "/admin/plans", label: "マスタ", shortLabel: "マスタ" },
  { href: "/admin/staff", label: "担当者", shortLabel: "担当者" },
  { href: "/admin/settings", label: "設定", shortLabel: "設定" },
] as const;
function activeNav(path:string,href:string){return href==='/admin/plans'?adminSection(path)==='master':href==='/admin/settings'?adminSection(path)==='settings':path===href||path.startsWith(href+'/');}

export function AdminHeader() {
  const pathname = usePathname();
  if (pathname === "/admin/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="relative flex h-[60px] items-center justify-between gap-2 px-3 xl:hidden">
        <Link href="/admin/inventory/allmight" className="shrink-0 text-xs font-bold text-slate-900"><span className="min-[380px]:hidden">管理</span><span className="hidden min-[380px]:inline">レンタル管理</span></Link>
        <div className="flex items-center gap-2"><Link href="/apply" className="flex min-h-11 items-center rounded-lg bg-indigo-600 px-2 text-sm font-medium text-white">＋ 新規申請</Link><InventoryQuickHold header model={{staff:[],version:0,business:pathname.includes('/tezukuru')?'tezukuru':'allmight'}}/>
        <details className="group"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border bg-white px-2 text-sm font-medium">メニュー ▾</summary><nav aria-label="スマホ管理メニュー" className="absolute left-3 right-3 top-[56px] z-50 grid max-h-[75dvh] grid-cols-2 gap-1 overflow-y-auto rounded-xl border bg-white p-2 shadow-xl">
          {[{href:'/admin/inventory/allmight',label:'オールマイト在庫'},{href:'/admin/inventory/tezukuru',label:'てずくーる!!在庫'},...NAV_ITEMS].map(item=><Link key={item.href} href={item.href} onClick={e=>{const d=e.currentTarget.closest('details');if(d)d.open=false;}} className={`flex min-h-11 items-center rounded-lg px-3 text-sm ${activeNav(pathname,item.href)?'bg-indigo-50 font-semibold text-indigo-700':'text-slate-700 hover:bg-slate-50'}`}>{item.label}</Link>)}
        </nav></details></div>
      </div>
      <div className="mx-auto hidden xl:flex min-h-[60px] max-w-[1900px] flex-wrap items-center justify-between gap-1.5 px-3 sm:gap-3 sm:px-6">
        <Link href="/admin/requests" className="mr-2 flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg></span><span className="hidden xl:inline">レンタル管理</span></Link>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5" aria-label="管理メニュー">
          <details className="group relative shrink-0" onMouseEnter={(e) => { e.currentTarget.open = true; }} onMouseLeave={(e) => { if (!e.currentTarget.contains(document.activeElement)) e.currentTarget.open = false; }} onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
            <summary className={`cursor-pointer list-none whitespace-nowrap rounded-lg p-2 text-sm font-medium ${pathname.startsWith("/admin/inventory/") ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>在庫管理表 ▾</summary>
            <div className="absolute left-0 top-[calc(100%+6px)] w-48 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl shadow-slate-900/10 before:absolute before:inset-x-0 before:-top-2 before:h-2 before:content-['']">
              <Link className="block rounded-xl px-3 py-3 text-sm text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-800" href="/admin/inventory/allmight">オールマイト</Link>
              <Link className="block rounded-xl px-3 py-3 text-sm text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-800" href="/admin/inventory/tezukuru">てずくーる!!</Link>
            </div>
          </details>
          {NAV_ITEMS.map((item) => {
            const active =
              activeNav(pathname,item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 font-medium transition-colors sm:gap-1.5 sm:px-2.5 ${
                  active
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                
                {/* PC: フルラベル / スマホ: 短縮ラベル(小さめ文字で1行維持) */}
                <span className="hidden text-sm min-[480px]:inline">{item.label}</span>
                <span className="text-xs min-[480px]:hidden">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* 右: かんたん仮押さえ・新規申請 */}
        <InventoryQuickHold header model={{staff:[],version:0,business:pathname.includes('/tezukuru')?'tezukuru':'allmight'}}/>
        <Link
          href="/apply"
          title="新規申請"
          className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-blue-600 px-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:gap-1.5 sm:px-2.5"
        >
          <span aria-hidden="true" className="text-lg font-normal">＋</span>
          <span className="hidden text-sm min-[480px]:inline">新規申請</span>
          <span className="text-xs min-[480px]:hidden">新規</span>
        </Link>
      </div>
    </header>
  );
}
