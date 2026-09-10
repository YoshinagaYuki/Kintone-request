"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * システム設定の編集(最小注文数量 / Google Drive 共有リンク / 常時CC)。
 * 値は system_settings に保存。コードへ直書きしない運用。
 */
export function SettingsEditor({
  minimumOrderQuantity,
  manualDriveUrl,
  alwaysCcEmails = [],
}: {
  minimumOrderQuantity: number;
  manualDriveUrl: string;
  alwaysCcEmails?: string[];
}) {
  const router = useRouter();
  const [minQty, setMinQty] = useState(String(minimumOrderQuantity));
  const [driveUrl, setDriveUrl] = useState(manualDriveUrl);
  // 常時CC(1アドレス1行の管理UI)。最低1行の空欄を表示
  const [ccEmails, setCcEmails] = useState<string[]>(
    alwaysCcEmails.length > 0 ? alwaysCcEmails : [""]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateCc(i: number, v: string) {
    setCcEmails((prev) => prev.map((e, idx) => (idx === i ? v : e)));
  }
  function addCc() {
    setCcEmails((prev) => [...prev, ""]);
  }
  function removeCc(i: number) {
    setCcEmails((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length > 0 ? next : [""];
    });
  }

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
          always_cc_emails: ccEmails.map((e) => e.trim()).filter((e) => e.length > 0),
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

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">常時CCメールアドレス</label>
        <p className="mt-1 text-xs text-gray-500">
          ここに登録したメールアドレスを、システムから送信するメール(申請完了・承認完了など)のCCへ自動追加します。空欄の場合は常時CCなし。
        </p>
        <div className="mt-3 space-y-2">
          {ccEmails.map((email, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => updateCc(i, e.target.value)}
                placeholder="seikyu@example.com"
                className="w-full max-w-md rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeCc(i)}
                className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addCc}
          className="mt-2 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          ＋ メールアドレスを追加
        </button>
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
