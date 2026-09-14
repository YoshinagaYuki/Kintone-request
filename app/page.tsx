import { redirect } from "next/navigation";

/**
 * ルート(/)は管理画面の申請一覧へ誘導する。
 * これまで app/page.tsx が無く、/ アクセスや PWA 起動直後に一瞬 404 になり得たため、
 * 常に有効なページ(申請一覧)へリダイレクトする。
 */
export default function RootPage() {
  redirect("/admin/requests");
}
