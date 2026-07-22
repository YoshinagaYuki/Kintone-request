"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus, RentalStatus } from "@/types/request";

export type ApprovePlanOption = { id: string; name: string };

export function ApproveActions({
  requestId,
  status,
  previewOk,
  usesRentalPlan = false,
  planSelectionRequired = false,
  rentalStatus = null,
  requestedPlanName = null,
  defaultPlanId = "",
  plans = [],
}: {
  requestId: string;
  status: RequestStatus;
  previewOk: boolean;
  /** レンタルプランを使う種別(てずくーる)か */
  usesRentalPlan?: boolean;
  /** プラン選択を必須にするか(旧申請で既にプラン確定済みなら false) */
  planSelectionRequired?: boolean;
  rentalStatus?: RentalStatus | null;
  /** 申請者が選択したプラン名(new_rental時) */
  requestedPlanName?: string | null;
  /** 選択初期値(承認済みプラン or 申請プラン) */
  defaultPlanId?: string;
  /** 有効なプラン一覧 */
  plans?: ApprovePlanOption[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState(defaultPlanId);

  async function post(
    action: "approve" | "retry",
    payload?: Record<string, unknown>
  ) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/${action}`, {
        method: "POST",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "処理に失敗しました");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
      router.refresh();
    }
  }

  function handleApprove() {
    if (submitting) return;

    // レンタルプランを使う種別: プラン確定 + 確認アラート
    if (usesRentalPlan) {
      if (planSelectionRequired && !planId) {
        setError("レンタルプランを選択してください。");
        return;
      }
      const planName = planId
        ? plans.find((p) => p.id === planId)?.name ?? "(不明)"
        : requestedPlanName ?? "(申請時のプラン)";
      const confirmMessage =
        rentalStatus === "new_rental"
          ? `申請者が選択したレンタルプランは『${requestedPlanName ?? planName}』です。\n承認するプラン: 『${planName}』\nこの内容で承認しますか？`
          : `レンタルプラン『${planName}』で登録し承認します。よろしいですか？`;
      if (!window.confirm(confirmMessage)) return;
      void post("approve", planId ? { rental_plan_id: planId } : {});
      return;
    }

    if (!window.confirm("承認してkintoneへ登録します。よろしいですか?")) return;
    void post("approve");
  }

  return (
    <div className="mt-8">
      {error && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* レンタルプラン確定(てずくーる・承認前) */}
      {usesRentalPlan && status === "pending" && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-semibold text-blue-900">レンタルプランの確定</p>
          {rentalStatus === "already_renting" ? (
            <p className="mt-1 text-xs text-blue-800">
              申請者は「すでに借りている」を選択しています。承認するプランを選択してください。
            </p>
          ) : (
            <p className="mt-1 text-xs text-blue-800">
              申請者が選択したプラン: <b>{requestedPlanName ?? "(なし)"}</b>
              {" "}必要に応じて変更できます。
            </p>
          )}
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="mt-2 w-full max-w-sm rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">選択してください</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {status === "pending" && (
        <button
          onClick={handleApprove}
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
          onClick={() => {
            if (window.confirm("kintone登録を再実行します。よろしいですか?")) {
              void post("retry");
            }
          }}
          disabled={submitting}
          className="rounded-md bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "再実行中..." : "kintone登録を再実行"}
        </button>
      )}
    </div>
  );
}
