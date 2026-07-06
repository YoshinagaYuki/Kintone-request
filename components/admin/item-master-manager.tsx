"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ItemRow = {
  id: string;
  category: "allmight" | "tezukuru";
  name: string;
  aliases: string[];
  sort_order: number;
  is_active: boolean;
};

const CATEGORY_LABELS: Record<ItemRow["category"], string> = {
  allmight: "オールマイト",
  tezukuru: "てずくーる",
};

/** 別名入力(改行/カンマ区切り)→配列 */
function parseAliases(text: string): string[] {
  return text
    .split(/[\n,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 名称正規化マスターのCRUD(管理画面) */
export function ItemMasterManager({ items }: { items: ItemRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ItemRow["category"]>("all");

  // 新規作成
  const [newCategory, setNewCategory] = useState<ItemRow["category"]>("allmight");
  const [newName, setNewName] = useState("");
  const [newAliases, setNewAliases] = useState("");
  const [newOrder, setNewOrder] = useState(0);

  // 行編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    category: "allmight" as ItemRow["category"],
    name: "",
    aliases: "",
    sort_order: 0,
  });

  const visible = items.filter((i) => filter === "all" || i.category === filter);

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
    const ok = await call("/api/admin/items", "POST", {
      category: newCategory,
      name: newName,
      aliases: parseAliases(newAliases),
      sort_order: newOrder,
    });
    if (ok) {
      setNewName("");
      setNewAliases("");
      setNewOrder(0);
    }
  }

  async function saveEdit(id: string) {
    const ok = await call(`/api/admin/items/${id}`, "PATCH", {
      category: edit.category,
      name: edit.name,
      aliases: parseAliases(edit.aliases),
      sort_order: edit.sort_order,
    });
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
        className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[auto_1fr_1fr_auto_auto] sm:items-end"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600">種別 *</label>
          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as ItemRow["category"])}
            className="mt-1 rounded-md border border-gray-300 p-2 text-sm"
          >
            <option value="allmight">オールマイト</option>
            <option value="tezukuru">てずくーる</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">正式名称 *</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
            placeholder="スティックキャッチ（大）"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">
            別名/ゆらぎ表記(カンマ・改行区切り)
          </label>
          <input
            value={newAliases}
            onChange={(e) => setNewAliases(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
            placeholder="スティックキャッチ大, スティックキャッチ(大)"
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

      {/* 種別フィルタ */}
      <div className="mt-4 flex gap-2 text-sm">
        {(["all", "allmight", "tezukuru"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 ${
              filter === f
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {f === "all" ? "すべて" : CATEGORY_LABELS[f]}
          </button>
        ))}
      </div>

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">種別</th>
              <th className="px-4 py-2">正式名称</th>
              <th className="px-4 py-2">別名/ゆらぎ表記</th>
              <th className="px-4 py-2">表示順</th>
              <th className="px-4 py-2">有効</th>
              <th className="px-4 py-2"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  登録がありません
                </td>
              </tr>
            )}
            {visible.map((row) =>
              editingId === row.id ? (
                <tr key={row.id} className="bg-blue-50/40">
                  <td className="px-4 py-2">
                    <select
                      value={edit.category}
                      onChange={(e) =>
                        setEdit({ ...edit, category: e.target.value as ItemRow["category"] })
                      }
                      className="rounded-md border border-gray-300 p-1.5 text-sm"
                    >
                      <option value="allmight">オールマイト</option>
                      <option value="tezukuru">てずくーる</option>
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={edit.name}
                      onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={edit.aliases}
                      onChange={(e) => setEdit({ ...edit, aliases: e.target.value })}
                      className="w-full rounded-md border border-gray-300 p-1.5 text-sm"
                      placeholder="カンマ区切り"
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
                    <button
                      onClick={() => saveEdit(row.id)}
                      disabled={busy}
                      className="mr-2 font-medium text-blue-600 hover:underline"
                    >
                      保存
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-gray-500 hover:underline">
                      キャンセル
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={row.id} className={row.is_active ? "" : "bg-gray-50 text-gray-400"}>
                  <td className="whitespace-nowrap px-4 py-2">{CATEGORY_LABELS[row.category]}</td>
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {row.aliases.length > 0 ? row.aliases.join("、") : "-"}
                  </td>
                  <td className="px-4 py-2">{row.sort_order}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => call(`/api/admin/items/${row.id}`, "PATCH", { is_active: !row.is_active })}
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
                        setEdit({
                          category: row.category,
                          name: row.name,
                          aliases: row.aliases.join(", "),
                          sort_order: row.sort_order,
                        });
                      }}
                      className="mr-2 font-medium text-blue-600 hover:underline"
                    >
                      編集
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`「${row.name}」を削除します。よろしいですか?`)) {
                          call(`/api/admin/items/${row.id}`, "DELETE");
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

      <p className="mt-3 text-xs text-gray-500">
        申請の機器商品/コンテンツ名は、kintone登録前にこのマスターで正式名称へ自動補正されます
        (完全一致・別名一致・軽微な表記ゆれのみ。曖昧な場合は入力値のまま登録し履歴に警告が残ります)。
      </p>
    </div>
  );
}
