"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./status-badge";
import type { RequestStatus } from "@/types/request";

export type RequestListRow = {
  id: string;
  status: RequestStatus;
  management_no: string | null;
  created_at: string;
  form_type_name: string;
  applicant_name: string | null;
  applicant_phone: string | null;
  applicant_email: string | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CONFIRM_MESSAGE =
  "選択した申請を削除して大丈夫ですか？この操作は元に戻せません。";

/** 申請一覧(チェックボックス選択+一括削除つき)。表示・詳細リンクは従来どおり */
export function RequestsList({ rows }: { rows: RequestListRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function deleteSelected() {
    if (selected.size === 0 || busy) return; // 0件選択時は削除不可
    if (!window.confirm(CONFIRM_MESSAGE)) return; // キャンセル時は何もしない

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/requests", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "削除に失敗しました");
        return;
      }
      setMessage(`${body?.deleted ?? selected.size}件の申請を削除しました`);
      setSelected(new Set());
      router.refresh(); // 一覧を再取得
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* 削除操作バー */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={deleteSelected}
          disabled={selected.size === 0 || busy}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? "削除中..." : `削除${selected.size > 0 ? `(${selected.size}件)` : ""}`}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* PC: テーブル表示 */}
      <div className="mt-3 hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="すべて選択"
                  className="h-4 w-4 accent-blue-600"
                />
              </th>
              <th className="px-4 py-3">申請日時</th>
              <th className="px-4 py-3">種別</th>
              <th className="px-4 py-3">入力者</th>
              <th className="px-4 py-3">管理番号</th>
              <th className="px-4 py-3">ステータス</th>
              <th className="px-4 py-3"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  申請はありません
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className={`transition-colors hover:bg-blue-50/40 ${selected.has(row.id) ? "bg-red-50/50" : ""}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label="この申請を選択"
                    className="h-4 w-4 accent-blue-600"
                  />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-4 py-3">{row.form_type_name}</td>
                <td className="px-4 py-3">
                  <div className="text-gray-800">{row.applicant_name ?? "-"}</div>
                  {row.applicant_email && (
                    <div className="text-xs text-gray-500">{row.applicant_email}</div>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-600">
                  {row.management_no ?? "-"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/requests/${row.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    詳細
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* スマホ: カード表示 */}
      <div className="mt-3 space-y-3 sm:hidden">
        {rows.length === 0 && (
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
            申請はありません
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className={`flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${selected.has(row.id) ? "border-red-300 bg-red-50/50" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggle(row.id)}
              aria-label="この申請を選択"
              className="h-5 w-5 shrink-0 accent-blue-600"
            />
            <Link href={`/admin/requests/${row.id}`} className="min-w-0 flex-1 active:opacity-70">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{row.form_type_name}</span>
                <StatusBadge status={row.status} />
              </div>
              {row.applicant_name && (
                <div className="mt-1 text-xs text-gray-600">入力者: {row.applicant_name}</div>
              )}
              <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                <span>{formatDateTime(row.created_at)}</span>
                {row.management_no && (
                  <span className="font-mono">No. {row.management_no}</span>
                )}
              </div>
            </Link>
          </div>
        ))}
      </div>
    </>
  );
}
