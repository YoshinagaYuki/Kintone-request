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
  staffInput = "",
  staffSuggested = "",
  staffScore = 0,
  staffAmbiguous = false,
  staffAmbiguousCandidates = [],
  staffOptions = [],
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
  /** 弊社担当者氏名: 申請入力原文 */
  staffInput?: string;
  /** 自動選択された正式名称(低一致率/曖昧なら空) */
  staffSuggested?: string;
  /** 自動選択された候補の一致率(0〜1)。参考表示用 */
  staffScore?: number;
  /** 同一名字・僅差など曖昧で手動選択が必要か */
  staffAmbiguous?: boolean;
  /** 曖昧時の候補名(警告表示用) */
  staffAmbiguousCandidates?: string[];
  /** 担当者マスターの正式名称(有効なもののみ) */
  staffOptions?: string[];
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

  /** 弊社担当者(確定値)。担当者項目がある(=staffInputあり)場合は選択必須 */
  const [staffName, setStaffName] = useState(staffSuggested);
  const staffRequired = staffInput.trim().length > 0;
  const staffUnselected = staffRequired && !staffName;

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

    // 弊社担当者が未確定なら登録させない
    if (staffUnselected) {
      setError("弊社担当者の正式名称を選択してください。");
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
      void post("approve", { ...(planId ? { rental_plan_id: planId } : {}), contents, staff_name: staffName });
      return;
    }

    if (!window.confirm(warningBlock + "承認してkintoneへ登録します。よろしいですか?")) return;
    void post("approve", { contents, staff_name: staffName });
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

      {/* 弊社担当者の正式名称を確定(担当者マスターから選択) */}
      {staffRequired && status === "pending" && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-gray-800">弊社担当者氏名の確定</p>
          {staffAmbiguous && (
            <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">⚠ 該当する担当者が複数います</p>
              <p className="mt-1">
                申請入力「{staffInput}」に該当する候補が複数あります。正しい担当者を選択してください。
              </p>
              {staffAmbiguousCandidates.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {staffAmbiguousCandidates.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">申請入力：{staffInput || "(なし)"}</p>
          {staffSuggested && staffScore > 0 && staffName === staffSuggested && (
            <p className="mt-1 text-xs text-gray-600">
              自動選択：<span className="font-medium">{staffSuggested}</span>
              <span className="ml-2 inline-flex items-center rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                一致率 {Math.round(staffScore * 100)}%
              </span>
              <span className="ml-2 text-gray-400">(参考値・誤りがあれば選び直してください)</span>
            </p>
          )}
          <select
            value={staffName}
            onChange={(e) => {
              setStaffName(e.target.value);
              setError(null);
            }}
            className={`mt-1 w-full max-w-sm rounded-md border p-2.5 text-sm focus:outline-none ${
              staffName ? "border-gray-300 bg-white focus:border-blue-500" : "border-red-400 bg-red-50"
            }`}
          >
            <option value="">選択してください</option>
            {staffOptions.map((name) => (
              <option key={name} value={name}>
                {name}
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
          disabled={submitting || done || !previewOk || unselectedContents.length > 0 || staffUnselected}
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
