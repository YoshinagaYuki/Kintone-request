"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * 処理状態(processing_at)の手動解除ボタン。
 * 異常終了が疑われる場合に、管理者が内容を確認のうえ明示的に解除する(自動解除はしない)。
 */
export function ClearProcessingButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    if (busy) return;
    if (
      !window.confirm(
        "処理状態を解除します。kintone連携が本当に停止している(異常終了している)ことを確認してから実行してください。解除してもkintone登録・メール送信は行われません。"
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/clear-processing`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "解除に失敗しました");
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
        onClick={clear}
        disabled={busy}
        className="rounded-md border border-orange-400 bg-white px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
      >
        {busy ? "解除中..." : "処理状態を解除"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
