/**
 * 管理画面(/admin/*)共通のローディング境界。
 *
 * 【目的】申請一覧など force-dynamic のサーバーコンポーネントはデータ取得完了まで
 * レンダリングを待つ。この loading.tsx(Suspense境界)が無いと、Next.js のソフト遷移や
 * 初回描画時に一瞬 not-found(404)へ解決してしまうことがあった。
 * 境界を用意することで、取得中は必ずこのローディング表示になり、404を見せない。
 */
export default function AdminLoading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10" aria-busy="true">
      <div className="h-7 w-40 animate-pulse rounded bg-gray-200" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 animate-pulse rounded-full bg-gray-100" />
        ))}
      </div>
      <div className="mt-6 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 w-full animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-gray-400">読み込み中…</p>
    </main>
  );
}
