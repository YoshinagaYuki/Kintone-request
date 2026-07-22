"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestStatus, RentalStatus } from "@/types/request";

export type ApprovePlanOption = { id: string; name: string };

/** 承認画面で確定するコンテンツ1件 */
export type ApproveContentSlot = {
  /** FMTラベル(例: コンテンツ1)。数量ラベルとの対応はこのキーで保たれる */
  label: string;
  /** 申請時の入力原文 */
  original: string;
  /** 自動選択された正式名称(低類似度なら空 = 選択してください) */
  suggested: string;
  /** 対応する数量(表示用) */
  quantity: string;
};

export function ApproveActions({
  requestId,
  status,
  previewOk,
  confirmWarnings = [],
  usesRentalPlan = false,
  planSelectionRequired = false,
  rentalStatus = null,
  requestedPlanName = null,
  defaultPlanId = "",
  plans = [],
  contentSlots = [],
  itemOptions = [],
}: {
  requestId: string;
  status: RequestStatus;
  previewOk: boolean;
  /** 未入力の「確認が必要な項目」。承認時の確認ダイアログにも表示する */
  confirmWarnings?: string[];
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
  /** 承認時に確定するコンテンツ欄(申請に入力があったものだけ) */
  contentSlots?: ApproveContentSlot[];
  /** 商品マスタの正式名称(有効なもののみ) */
  itemOptions?: string[];
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState(defaultPlanId);
  /** 成功後にボタンを「登録完了」で固定し、再送信を防ぐ(router.refresh 反映前の二重押下対策) */
  const [done, setDone] = useState(false);
  /** コンテンツ確定値(ラベル → 正式名称) */
  const [contents, setContents] = useState<Record<string, string>>(() =>
    Object.fromEntries(contentSlots.map((s) => [s.label, s.suggested]))
  );

  /** 未選択のコンテンツがある間は登録できない */
  const unselectedContents = contentSlots.filter((s) => !contents[s.label]);

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
      if (!res.ok) {
        setError(body?.error ?? "処理に失敗しました");
      } else {
        setDone(true); // 成功: ボタンを「登録完了」に固定(二重登録防止)
      }
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSubmitting(false);
      router.refresh();
    }
  }

  /** 未入力の要確認項目を確認ダイアログ先頭に添える */
  const warningBlock =
    confirmWarnings.length > 0
      ? `【確認が必要な項目】\n${confirmWarnings.map((l) => `⚠ ${l}が未入力です。`).join("\n")}\n\n`
      : "";

  function handleApprove() {
    if (submitting || done) return; // 二重登録防止

    // コンテンツは正式名称が確定するまで登録させない
    if (unselectedContents.length > 0) {
      setError(
        `コンテンツの正式名称を選択してください(未選択: ${unselectedContents
          .map((s) => s.label)
          .join("、")})`
      );
      return;
    }

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
      if (!window.confirm(warningBlock + confirmMessage)) return;
      void post("approve", { ...(planId ? { rental_plan_id: planId } : {}), contents });
      return;
    }

    if (!window.confirm(warningBlock + "承認してkintoneへ登録します。よろしいですか?")) return;
    void post("approve", { contents });
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

      {/* コンテンツの正式名称を確定(商品マスタから選択) */}
      {contentSlots.length > 0 && status === "pending" && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">
            コンテンツの確定(商品マスタの正式名称)
          </p>
          <p className="mt-1 text-xs text-gray-500">
            申請内容から自動選択しています。誤りがあれば選び直してください。
            未選択の項目があると登録できません。
          </p>
          <div className="mt-3 space-y-3">
            {contentSlots.map((slot) => (
              <div key={slot.label} className="sm:flex sm:items-center sm:gap-3">
                <div className="sm:w-40 sm:shrink-0">
                  <span className="text-sm font-medium text-gray-700">{slot.label}</span>
                  {slot.quantity && (
                    <span className="ml-2 text-xs text-gray-500">数量: {slot.quantity}</span>
                  )}
                </div>
                <div className="mt-1 flex-1 sm:mt-0">
                  <select
                    value={contents[slot.label] ?? ""}
                    onChange={(e) => {
                      setContents((prev) => ({ ...prev, [slot.label]: e.target.value }));
                      setError(null);
                    }}
                    className={`w-full rounded-md border p-2.5 text-sm focus:outline-none ${
                      contents[slot.label]
                        ? "border-gray-300 bg-white focus:border-blue-500"
                        : "border-red-400 bg-red-50"
                    }`}
                  >
                    <option value="">選択してください</option>
                    {itemOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-0.5 text-xs text-gray-500">
                    申請入力：{slot.original || "(なし)"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {status === "pending" && (
        <button
          onClick={handleApprove}
          disabled={submitting || done || !previewOk || unselectedContents.length > 0}
          className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "登録中…" : done ? "登録完了" : "承認してkintoneへ登録"}
        </button>
      )}

      {/* 登録完了後は登録ボタンを出さない(二重登録防止) */}
      {status === "registered" && (
        <button
          disabled
          className="cursor-not-allowed rounded-md bg-green-600 px-6 py-2.5 text-sm font-semibold text-white opacity-80"
        >
          登録完了
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
            if (submitting || done) return;
            if (window.confirm("kintone登録を再実行します。よろしいですか?")) {
              void post("retry");
            }
          }}
          disabled={submitting || done}
          className="rounded-md bg-orange-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {submitting ? "登録中…" : done ? "登録完了" : "kintone登録を再実行"}
        </button>
      )}
    </div>
  );
}
