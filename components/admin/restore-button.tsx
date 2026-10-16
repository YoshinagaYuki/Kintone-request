"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** 削除済み申請を復元するボタン(ゴミ箱・申請詳細で使用)。 */
export function RestoreButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (busy) return;
    if (!window.confirm("この申請を復元して通常の一覧へ戻しますか?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/restore`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "復元に失敗しました");
        return;
      }
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={restore}
        disabled={busy}
        className="rounded-md border border-green-400 bg-white px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        {busy ? "復元中..." : "復元する"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
