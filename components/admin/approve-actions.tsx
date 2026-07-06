"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus } from "@/types/request";

export function ApproveActions({
  requestId,
  status,
  previewOk,
}: {
  requestId: string;
  status: RequestStatus;
  previewOk: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "approve" | "retry", confirmMessage: string) {
    if (submitting) return;
    if (!window.confirm(confirmMessage)) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/requests/${requestId}/${action}`, {
        method: "POST",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "処理に失敗しました");
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
      router.refresh(); // 失敗時もステータス・履歴を最新化
    }
  }

  return (
    <div className="mt-8">
      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {status === "pending" && (
        <button
          onClick={() =>
            call("approve", "承認してkintoneへ登録します。よろしいですか?")
          }
          disabled={submitting || !previewOk}
          className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "登録中..." : "承認してkintoneへ登録"}
        </button>
      )}
      {status === "pending" && !previewOk && (
        <p className="mt-2 text-sm text-red-600">
          登録予定データにエラーがあるため承認できません(上記エラーを確認してください)
        </p>
      )}

      {status === "register_failed" && (
        <button
          onClick={() => call("retry", "kintone登録を再実行します。よろしいですか?")}
          disabled={submitting}
          className="rounded-md bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "再実行中..." : "kintone登録を再実行"}
        </button>
      )}
    </div>
  );
}
