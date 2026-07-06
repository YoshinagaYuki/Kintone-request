"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type StaffRow = {
  id: string;
  name: string;
  company: string;
  sort_order: number;
  is_active: boolean;
};

/** 担当者マスターのCRUD(管理画面) */
export function StaffManager({ staff }: { staff: StaffRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 新規作成フォーム
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newOrder, setNewOrder] = useState(0);

  // 行編集(1行ずつ)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; company: string; sort_order: number }>({
    name: "",
    company: "",
    sort_order: 0,
  });

  async function call(path: string, method: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "処理に失敗しました");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("通信エラーが発生しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/admin/staff", "POST", {
      name: newName,
      company: newCompany,
      sort_order: newOrder,
    });
    if (ok) {
      setNewName("");
      setNewCompany("");
      setNewOrder(0);
    }
  }

  async function saveEdit(id: string) {
    const ok = await call(`/api/admin/staff/${id}`, "PATCH", edit);
    if (ok) setEditingId(null);
  }

  async function toggleActive(row: StaffRow) {
    await call(`/api/admin/staff/${row.id}`, "PATCH", { is_active: !row.is_active });
  }

  async function remove(row: StaffRow) {
    if (!window.confirm(`「${row.name}」を削除します。よろしいですか?`)) return;
    await call(`/api/admin/staff/${row.id}`, "DELETE");
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* 新規追加 */}
      <form
        onSubmit={create}
        className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600">氏名 *</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="mt-1 rounded-md border border-gray-300 p-2 text-sm"
            placeholder="吉永 勇樹"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">所属会社</label>
          <input
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 p-2 text-sm"
            placeholder="株式会社ユニティ"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">表示順</label>
          <input
            type="number"
            value={newOrder}
            onChange={(e) => setNewOrder(Number(e.target.value))}
            className="mt-1 w-20 rounded-md border border-gray-300 p-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          追加
        </button>
      </form>

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">氏名</th>
              <th className="px-4 py-2">所属会社</th>
              <th className="px-4 py-2">表示順</th>
              <th className="px-4 py-2">公開</th>
              <th className="px-4 py-2"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  担当者が登録されていません
                </td>
              </tr>
            )}
            {staff.map((row) =>
              editingId === row.id ? (
                <tr key={row.id} className="bg-blue-50/40">
                  <td className="px-4 py-2">
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={edit.company}
                      onChange={(e) => setEdit({ ...edit, company: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={edit.sort_order}
                      onChange={(e) =>
                        setEdit({ ...edit, sort_order: Number(e.target.value) })
                      }
                      className="w-20 rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2 text-gray-400">-</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => saveEdit(row.id)}
                      disabled={busy}
                      className="mr-2 font-medium text-blue-600 hover:underline"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-gray-500 hover:underline"
                    >
                      キャンセル
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className={row.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2">{row.company || "-"}</td>
                  <td className="px-4 py-2">{row.sort_order}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(row)}
                      disabled={busy}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {row.is_active ? "公開中" : "非公開"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setEditingId(row.id);
                        setEdit({
                          name: row.name,
                          company: row.company,
                          sort_order: row.sort_order,
                        });
                      }}
                      className="mr-2 font-medium text-blue-600 hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => remove(row)}
                      disabled={busy}
                      className="font-medium text-red-600 hover:underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        公開中の担当者が申請画面のプルダウンに表示順で表示されます(表示例: 氏名（所属会社）)。
        選択された氏名は「担当者:氏名」としてFMTに自動追加され、kintoneの担当者フィールドへ登録されます。
      </p>
    </div>
  );
}
