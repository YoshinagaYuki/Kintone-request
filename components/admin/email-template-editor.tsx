"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EmailTemplateRow = { key: "application" | "approval"; subject: string; body: string };

const TABS: { key: EmailTemplateRow["key"]; label: string }[] = [
  { key: "application", label: "申請完了メール" },
  { key: "approval", label: "承認完了メール" },
];

const PLACEHOLDERS = [
  "{{applicant_name}}",
  "{{management_no}}",
  "{{form_type_name}}",
  "{{booth_name}}",
  "{{agency_name}}",
  "{{submitted_at}}",
  "{{approved_at}}",
  "{{order_details}}",
  "{{manual_drive_url}}",
];

/** メールテンプレート編集(タブ: 申請完了 / 承認完了)。本文はDB保存 */
export function EmailTemplateEditor({ templates }: { templates: EmailTemplateRow[] }) {
  const router = useRouter();
  const [active, setActive] = useState<EmailTemplateRow["key"]>("application");
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>(() =>
    Object.fromEntries(templates.map((t) => [t.key, { subject: t.subject, body: t.body }]))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const current = drafts[active] ?? { subject: "", body: "" };

  function update(patch: Partial<{ subject: string; body: string }>) {
    setDrafts((prev) => ({ ...prev, [active]: { ...prev[active], ...patch } }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: active, subject: current.subject, body: current.body }),
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

  return (
    <div className="mt-6">
      {/* タブ */}
      <div className="flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setActive(t.key);
              setSaved(false);
              setError(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          保存しました。
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">件名</label>
          <input
            type="text"
            value={current.subject}
            onChange={(e) => update({ subject: e.target.value })}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">本文</label>
          <textarea
            value={current.body}
            onChange={(e) => update({ body: e.target.value })}
            rows={20}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-xs leading-relaxed focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold text-gray-600">差込プレースホルダ</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <code key={p} className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-700 ring-1 ring-gray-200">
                {p}
              </code>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {"{{order_details}}"} は商品・数量・配送先・配送日・担当者・電話番号・住所を自動展開します。
            {"{{manual_drive_url}}"} は承認完了メールで有効です(システム設定のリンク)。
          </p>
        </div>

        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {busy ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
