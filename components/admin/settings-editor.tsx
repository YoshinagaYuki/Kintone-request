"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * システム設定の編集(最小注文数量 / Google Drive 共有リンク)。
 * 値は system_settings に保存。コードへ直書きしない運用。
 */
export function SettingsEditor({
  minimumOrderQuantity,
  manualDriveUrl,
}: {
  minimumOrderQuantity: number;
  manualDriveUrl: string;
}) {
  const router = useRouter();
  const [minQty, setMinQty] = useState(String(minimumOrderQuantity));
  const [driveUrl, setDriveUrl] = useState(manualDriveUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minimum_order_quantity: minQty,
          manual_drive_url: driveUrl,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "保存に失敗しました");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full max-w-md rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <form onSubmit={save} className="mt-6 space-y-6">
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          保存しました。
        </p>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">最小注文数量</label>
        <input
          type="number"
          min={1}
          step={1}
          value={minQty}
          onChange={(e) => setMinQty(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">
          1商品あたりの最小数量。これ未満の申請はエラーになります(現在の初期値: 100)。
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          Google Drive 共有リンク
        </label>
        <input
          type="url"
          value={driveUrl}
          onChange={(e) => setDriveUrl(e.target.value)}
          placeholder="https://drive.google.com/..."
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500">
          承認完了メールの {"{{manual_drive_url}}"} に差し込まれます。空欄も可。
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
      >
        {busy ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
