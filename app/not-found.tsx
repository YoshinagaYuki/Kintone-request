import Link from "next/link";

/**
 * 共通の not-found 画面(存在しないURL向け)。
 * 生の Next.js 404 の代わりに、申請一覧へ戻れる分かりやすい画面を表示する。
 * ※ データ取得中に「存在しない」と判定しないよう、各ページは loading 境界と
 *   取得完了後の判定でこの画面を出さない設計にしている。
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-lg font-bold text-gray-800">ページが見つかりません</h1>
      <p className="mt-2 text-sm text-gray-600">
        お探しのページは移動または削除された可能性があります。
      </p>
      <Link
        href="/admin/requests"
        className="mt-6 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
      >
        申請一覧へ戻る
      </Link>
    </main>
  );
}
