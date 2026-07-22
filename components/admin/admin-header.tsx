"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 管理画面の共通ナビゲーションバー(全 /admin/* ページ。ログイン画面では非表示)。
 * ・現在開いているページは青背景+白文字(active)
 * ・PCはフルラベル、スマホ(480px未満)はアイコン+短縮ラベルで1行表示
 * ・「➕ 新規申請」は /apply へ(種別が増えても申請画面側の選択で吸収)
 */

const NAV_ITEMS = [
  { href: "/admin/requests", icon: "📋", label: "申請一覧", shortLabel: "申請" },
  { href: "/admin/plans", icon: "🏷️", label: "レンタルプラン", shortLabel: "プラン" },
  { href: "/admin/items", icon: "📦", label: "商品マスタ", shortLabel: "商品" },
  { href: "/admin/staff", icon: "👥", label: "担当者", shortLabel: "担当者" },
] as const;

export function AdminHeader() {
  const pathname = usePathname();
  if (pathname === "/admin/login") return null;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl flex-nowrap items-center justify-between gap-1.5 px-2 sm:gap-3 sm:px-4">
        {/* 左: 画面ナビ */}
        <nav className="flex flex-nowrap items-center gap-1 sm:gap-2" aria-label="管理メニュー">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={`inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 font-medium transition-colors sm:gap-1.5 sm:px-3 ${
                  active
                    ? "bg-blue-600 text-white"
                    : "bg-white text-gray-700 hover:bg-blue-50"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {/* PC: フルラベル / スマホ: 短縮ラベル(小さめ文字で1行維持) */}
                <span className="hidden text-sm min-[480px]:inline">{item.label}</span>
                <span className="text-xs min-[480px]:hidden">{item.shortLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* 右: 新規申請 */}
        <Link
          href="/apply"
          title="新規申請"
          className="inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-blue-600 px-1.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 sm:gap-1.5 sm:px-3"
        >
          <span aria-hidden="true">➕</span>
          <span className="hidden text-sm min-[480px]:inline">新規申請</span>
          <span className="text-xs min-[480px]:hidden">新規</span>
        </Link>
      </div>
    </header>
  );
}
