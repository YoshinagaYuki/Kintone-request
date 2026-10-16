"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ARRANGEMENT_OPTIONS,
  ARRANGEMENT_LABELS,
  normalizeArrangement,
  isValidTime,
  type ArrangementValue,
} from "@/lib/allmight-arrangement";

/**
 * 手配種別(配送/集荷)の表示・編集(オールマイト申請詳細)。
 * ・編集可(canEdit=オールマイト担当の管理者)のときはプルダウン+保存。
 * ・「チャーター」を選んだときだけ時刻(HH:MM)入力を表示し、保存時は必須。配送/集荷は独立。
 * ・不可のときは表示のみ(チャーター時は時刻も表示)。
 * ・保存は /api/admin/requests/[id]/arrangement(サーバーでも権限・事業・時刻を検証)。
 */
export function ArrangementEditor({
  requestId,
  deliveryDefault,
  pickupDefault,
  deliveryTimeDefault = null,
  pickupTimeDefault = null,
  canEdit,
  kintoneRegistered,
  syncFailed = false,
}: {
  requestId: string;
  deliveryDefault: string | null;
  pickupDefault: string | null;
  /** チャーター時の配送時刻 "HH:MM"(なければ null) */
  deliveryTimeDefault?: string | null;
  /** チャーター時の集荷時刻 "HH:MM"(なければ null) */
  pickupTimeDefault?: string | null;
  canEdit: boolean;
  kintoneRegistered: boolean;
  /** 直近のkintone同期が失敗しているか(警告・再同期ボタン表示用) */
  syncFailed?: boolean;
}) {
  const router = useRouter();
  const [delivery, setDelivery] = useState<ArrangementValue>(normalizeArrangement(deliveryDefault));
  const [pickup, setPickup] = useState<ArrangementValue>(normalizeArrangement(pickupDefault));
  const [deliveryTime, setDeliveryTime] = useState<string>(deliveryTimeDefault ?? "");
  const [pickupTime, setPickupTime] = useState<string>(pickupTimeDefault ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function resync() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/arrangement/resync`, {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "再同期に失敗しました");
        return;
      }
      setNotice("kintoneへ再同期しました。");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  // 同期失敗の警告(編集不可の閲覧者にも表示)。編集可能なら再同期ボタンも出す。
  const syncWarning = syncFailed ? (
    <div className="mb-3 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
      <p className="font-semibold">⚠ kintoneへの同期に失敗しています</p>
      <p className="mt-1">
        手配種別の変更がkintone(App10)へ反映できていません。保存済みの内容で再同期してください。
      </p>
      {canEdit && (
        <button
          onClick={resync}
          disabled={busy}
          className="mt-2 rounded-md bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:bg-gray-300"
        >
          {busy ? "再同期中..." : "kintoneへ再同期"}
        </button>
      )}
    </div>
  ) : null;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    // チャーター選択時は時刻(HH:MM)必須。配送/集荷は独立に検証。
    if (delivery === "charter" && !isValidTime(deliveryTime)) {
      setBusy(false);
      setError("配送の時間を HH:MM(24時間)で入力してください(チャーター便)。");
      return;
    }
    if (pickup === "charter" && !isValidTime(pickupTime)) {
      setBusy(false);
      setError("集荷の時間を HH:MM(24時間)で入力してください(チャーター便)。");
      return;
    }
    try {
      const res = await fetch(`/api/admin/requests/${requestId}/arrangement`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          delivery_arrangement: delivery,
          pickup_arrangement: pickup,
          // 通常配送のときはサーバー側で null 化されるが、明示的に送って意図を伝える
          delivery_time: delivery === "charter" ? deliveryTime : null,
          pickup_time: pickup === "charter" ? pickupTime : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "保存に失敗しました");
        return;
      }
      setNotice(
        data?.warning
          ? data.warning
          : kintoneRegistered
            ? "手配種別を保存し、kintoneへ同期しました。"
            : "手配種別を保存しました。"
      );
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    const dArr = normalizeArrangement(deliveryDefault);
    const pArr = normalizeArrangement(pickupDefault);
    return (
      <div>
        {syncWarning && <div className="p-4 pb-0">{syncWarning}</div>}
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">配送の手配種別</th>
              <td className="px-4 py-2">
                {ARRANGEMENT_LABELS[dArr]}
                {dArr === "charter" && deliveryTimeDefault ? `(${deliveryTimeDefault})` : ""}
              </td>
            </tr>
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">集荷の手配種別</th>
              <td className="px-4 py-2">
                {ARRANGEMENT_LABELS[pArr]}
                {pArr === "charter" && pickupTimeDefault ? `(${pickupTimeDefault})` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }

  const selectClass =
    "mt-1 w-full max-w-xs rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-blue-500 focus:outline-none";
  const timeClass =
    "mt-2 w-full max-w-xs rounded-md border border-gray-300 bg-white p-2 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="p-4">
      {syncWarning}
      {error && (
        <p className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-md border border-green-300 bg-green-50 p-2 text-sm text-green-700">{notice}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">配送の手配種別</label>
          <select value={delivery} onChange={(e) => setDelivery(e.target.value as ArrangementValue)} className={selectClass}>
            {ARRANGEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {delivery === "charter" && (
            <div>
              <label className="mt-2 block text-xs font-medium text-gray-600">配送時間(チャーター便) <span className="text-red-600">*</span></label>
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className={timeClass}
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">集荷の手配種別</label>
          <select value={pickup} onChange={(e) => setPickup(e.target.value as ArrangementValue)} className={selectClass}>
            {ARRANGEMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {pickup === "charter" && (
            <div>
              <label className="mt-2 block text-xs font-medium text-gray-600">集荷時間(チャーター便) <span className="text-red-600">*</span></label>
              <input
                type="time"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className={timeClass}
              />
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        申請者には常に「通常配送」で表示され、ここでの変更は申請者に影響しません。チャーター便は時間(HH:MM)が必須です。
        {kintoneRegistered ? "保存するとkintone(登録済みレコード)へも反映されます。" : "承認・kintone登録時にこの値で登録されます。"}
      </p>
      <button
        onClick={save}
        disabled={busy}
        className="mt-3 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        {busy ? "保存中..." : "手配種別を保存"}
      </button>
    </div>
  );
}
