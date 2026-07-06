"use client";

import { useState } from "react";

type PushSendResult = {
  configured: boolean;
  subscriptions: number;
  sent: number;
  failed: number;
  removed: number;
};

/** テスト通知ボタン(申請通知と同じ経路で送信し、診断結果を表示) */
export function PushTestButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sendTest() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/push-test", { method: "POST" });
      const body = (await res.json().catch(() => null)) as PushSendResult | null;

      if (!res.ok || !body) {
        setResult("テスト送信に失敗しました(サーバーログを確認してください)");
        return;
      }
      if (!body.configured) {
        setResult("VAPID鍵が未設定です(.env.local の NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を設定して再起動してください)");
        return;
      }
      if (body.subscriptions === 0) {
        setResult("購読が0件です。この端末で「通知を受け取る」を許可してから再度お試しください");
        return;
      }
      setResult(
        `購読 ${body.subscriptions}件 / 成功 ${body.sent}件 / 失敗 ${body.failed}件` +
          (body.removed > 0 ? ` / 失効削除 ${body.removed}件` : "")
      );
    } catch {
      setResult("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={sendTest}
        disabled={busy}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:bg-gray-100"
      >
        {busy ? "送信中..." : "テスト通知を送る"}
      </button>
      {result && <span className="text-xs text-gray-600">{result}</span>}
    </span>
  );
}
