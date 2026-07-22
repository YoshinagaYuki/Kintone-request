"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RentalPlanRow = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

/** レンタルプランマスターのCRUD(管理画面) */
export function RentalPlanManager({ plans }: { plans: RentalPlanRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newOrder, setNewOrder] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "", sort_order: 0 });

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
    const ok = await call("/api/admin/plans", "POST", {
      name: newName,
      description: newDesc,
      sort_order: newOrder,
    });
    if (ok) {
      setNewName("");
      setNewDesc("");
      setNewOrder(0);
    }
  }

  async function saveEdit(id: string) {
    const ok = await call(`/api/admin/plans/${id}`, "PATCH", edit);
    if (ok) setEditingId(null);
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
        className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600">プラン名 *</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
            placeholder="てずくーる！！_週末"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">説明</label>
          <input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
            placeholder="週末レンタル"
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

      <p className="mt-3 text-xs text-gray-500">
        プラン名はkintoneの「レンタル機材」選択肢と一致させてください。承認時にこのプラン名がkintoneへ登録されます。
      </p>

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">プラン名</th>
              <th className="px-4 py-2">説明</th>
              <th className="px-4 py-2">表示順</th>
              <th className="px-4 py-2">有効</th>
              <th className="px-4 py-2"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {plans.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  プランが登録されていません
                </td>
              </tr>
            )}
            {plans.map((row) =>
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
                      value={edit.description}
                      onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={edit.sort_order}
                      onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })}
                      className="w-20 rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2 text-gray-400">-</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button onClick={() => saveEdit(row.id)} disabled={busy} className="mr-2 font-medium text-blue-600 hover:underline">
                      保存
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:underline">
                      キャンセル
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className={row.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-gray-600">{row.description || "-"}</td>
                  <td className="px-4 py-2">{row.sort_order}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => call(`/api/admin/plans/${row.id}`, "PATCH", { is_active: !row.is_active })}
                      disabled={busy}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.is_active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                      }`}
                    >
                      {row.is_active ? "有効" : "無効"}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      onClick={() => {
                        setEditingId(row.id);
                        setEdit({ name: row.name, description: row.description, sort_order: row.sort_order });
                      }}
                      className="mr-2 font-medium text-blue-600 hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`「${row.name}」を削除します。利用済みの場合は削除できません(無効化してください)。`)) {
                          call(`/api/admin/plans/${row.id}`, "DELETE");
                        }
                      }}
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
    </div>
  );
}
