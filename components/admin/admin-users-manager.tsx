"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatJstDateTime, formatRelativeJa } from "@/lib/format-time";

export type AdminUserRow = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string;
  role: "admin" | "master";
  status: "invited" | "active" | "disabled";
  invited_at: string | null;
  activated_at: string | null;
  last_login_at: string | null;
};

const STATUS_LABEL: Record<AdminUserRow["status"], string> = {
  invited: "招待中",
  active: "利用中",
  disabled: "停止中",
};
const STATUS_CLASS: Record<AdminUserRow["status"], string> = {
  invited: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  disabled: "bg-gray-200 text-gray-600",
};
const ROLE_LABEL: Record<AdminUserRow["role"], string> = {
  admin: "管理者",
  master: "マスター",
};

export function AdminUsersManager({
  users,
  currentAuthUserId,
  currentRole,
}: {
  users: AdminUserRow[];
  currentAuthUserId: string;
  currentRole: "admin" | "master";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 相対時間の基準(ハイドレーション差異回避のためマウント後に確定)
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // 検索・フィルター
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "master" | "admin">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "invited" | "active" | "disabled">("all");

  // 招待ダイアログ
  const [inviteOpen, setInviteOpen] = useState(false);

  // 氏名インライン編集
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const activeMasters = users.filter((u) => u.role === "master" && u.status === "active");
  const isLastActiveMaster = (u: AdminUserRow) =>
    u.role === "master" && u.status === "active" && activeMasters.length <= 1;

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (kw) {
        const hay = `${u.display_name} ${u.email}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [users, q, roleFilter, statusFilter]);

  const filtersActive = q.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";

  async function call(path: string, method: string, body?: unknown, okMsg?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "処理に失敗しました");
        return false;
      }
      if (okMsg) setNotice(okMsg);
      router.refresh();
      return true;
    } catch {
      setError("通信エラーが発生しました");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEdit(u: AdminUserRow) {
    setEditingId(u.id);
    setEditName(u.display_name);
  }
  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) {
      setError("氏名は空にできません");
      return;
    }
    const ok = await call(`/api/admin/admin-users/${id}`, "PATCH", { display_name: name }, "氏名を変更しました。");
    if (ok) setEditingId(null);
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">{notice}</p>
      )}

      {/* ツールバー: 招待ボタン + 検索 + フィルター */}
      <div className="flex flex-wrap items-end gap-2">
        <button
          onClick={() => setInviteOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          ＋ 管理者を招待
        </button>
        <div className="min-w-[220px] flex-1">
          <label className="block text-xs font-medium text-gray-600">管理者を検索</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="氏名・メールアドレス"
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">権限</label>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="mt-1 rounded-md border border-gray-300 p-2 text-sm"
          >
            <option value="all">すべて</option>
            <option value="master">マスター</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600">状態</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="mt-1 rounded-md border border-gray-300 p-2 text-sm"
          >
            <option value="all">すべて</option>
            <option value="invited">招待中</option>
            <option value="active">利用中</option>
            <option value="disabled">停止中</option>
          </select>
        </div>
        {filtersActive && (
          <button
            onClick={() => {
              setQ("");
              setRoleFilter("all");
              setStatusFilter("all");
            }}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
          >
            絞り込み解除
          </button>
        )}
      </div>

      {/* 一覧 */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">氏名 / メール</th>
              <th className="px-4 py-2">権限</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2">招待日時</th>
              <th className="px-4 py-2">最終ログイン</th>
              <th className="px-4 py-2"><span className="sr-only">操作</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {filtersActive ? "条件に一致する管理者がいません" : "管理者が登録されていません"}
                </td>
              </tr>
            )}
            {filtered.map((u) => {
              const isSelf = u.auth_user_id === currentAuthUserId;
              const protectMaster = isLastActiveMaster(u);
              return (
                <tr key={u.id} className={u.status === "disabled" ? "bg-gray-50 text-gray-400" : ""}>
                  {/* 氏名 / メール */}
                  <td className="px-4 py-2">
                    {editingId === u.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-40 rounded-md border border-gray-300 p-1.5 text-sm"
                        />
                        <button onClick={() => saveEdit(u.id)} disabled={busy} className="text-xs font-medium text-blue-600 hover:underline">
                          保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-gray-800">
                          {u.display_name || "(未設定)"} {isSelf && <span className="text-xs text-blue-600">(自分)</span>}
                          <button
                            onClick={() => startEdit(u)}
                            className="ml-2 text-xs font-normal text-blue-600 hover:underline"
                          >
                            編集
                          </button>
                        </div>
                        <div className="break-all text-xs text-gray-500">{u.email}</div>
                      </>
                    )}
                  </td>

                  {/* 権限(masterのみ変更可) */}
                  <td className="px-4 py-2">
                    {currentRole === "master" && !isSelf ? (
                      <select
                        value={u.role}
                        disabled={busy || (u.role === "master" && protectMaster)}
                        onChange={(e) =>
                          call(`/api/admin/admin-users/${u.id}`, "PATCH", { role: e.target.value }, "権限を変更しました。")
                        }
                        title={u.role === "master" && protectMaster ? "最後のマスターは降格できません" : undefined}
                        className="rounded-md border border-gray-300 p-1 text-xs disabled:opacity-60"
                      >
                        <option value="admin">管理者</option>
                        <option value="master">マスター</option>
                      </select>
                    ) : (
                      ROLE_LABEL[u.role]
                    )}
                  </td>

                  {/* 状態 */}
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[u.status]}`}>
                      {STATUS_LABEL[u.status]}
                    </span>
                  </td>

                  {/* 招待日時 */}
                  <td className="px-4 py-2 text-xs">{u.invited_at ? formatJstDateTime(u.invited_at) : "-"}</td>

                  {/* 最終ログイン(日時+相対) */}
                  <td className="px-4 py-2 text-xs">
                    {u.last_login_at ? (
                      <>
                        <div>{formatJstDateTime(u.last_login_at)}</div>
                        <div className="text-gray-400">
                          {now === null ? "" : formatRelativeJa(u.last_login_at, now)}
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-400">ログインなし</span>
                    )}
                  </td>

                  {/* 操作 */}
                  <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
                    {u.status === "invited" && (
                      <button
                        onClick={() => call(`/api/admin/admin-users/${u.id}/resend`, "POST", undefined, "招待を再送しました。")}
                        disabled={busy}
                        className="mr-2 font-medium text-blue-600 hover:underline"
                      >
                        招待再送
                      </button>
                    )}
                    {u.status === "active" && (
                      <button
                        onClick={() => call(`/api/admin/admin-users/${u.id}/reset-password`, "POST", undefined, "パスワード再設定メールを送信しました。")}
                        disabled={busy}
                        className="mr-2 font-medium text-blue-600 hover:underline"
                      >
                        パスワード再設定
                      </button>
                    )}
                    {u.status === "disabled" ? (
                      <button
                        onClick={() => call(`/api/admin/admin-users/${u.id}`, "PATCH", { status: "active" }, "利用を再開しました。")}
                        disabled={busy}
                        className="font-medium text-green-700 hover:underline"
                      >
                        利用再開
                      </button>
                    ) : (
                      <button
                        onClick={() => call(`/api/admin/admin-users/${u.id}`, "PATCH", { status: "disabled" }, "利用を停止しました。")}
                        disabled={busy || isSelf || protectMaster}
                        title={isSelf ? "自分自身は停止できません" : protectMaster ? "最後のマスターは停止できません" : undefined}
                        className="font-medium text-red-600 hover:underline disabled:text-gray-300 disabled:no-underline"
                      >
                        利用停止
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        招待された方には Supabase Auth からメールが届きます。メール内リンクからご本人がパスワードを設定すると「利用中」になります。
        パスワードは管理者が直接設定せず、再設定用URLを本人へ送る方式です。
      </p>

      {inviteOpen && (
        <InviteDialog
          currentRole={currentRole}
          onClose={() => setInviteOpen(false)}
          onSuccess={() => {
            setInviteOpen(false);
            setNotice("招待メールを送信しました。");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** 招待ダイアログ(氏名・メール・権限すべて必須。二重送信防止) */
function InviteDialog({
  currentRole,
  onClose,
  onSuccess,
}: {
  currentRole: "admin" | "master";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "master">("admin");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!name.trim()) return setError("氏名を入力してください。");
    if (!email.trim()) return setError("メールアドレスを入力してください。");
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/admin-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: name.trim(), email: email.trim(), role }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "招待に失敗しました。");
        setSubmitting(false);
        return; // 入力内容は保持
      }
      onSuccess();
    } catch {
      setError("通信エラーが発生しました。");
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-gray-800">管理者を招待</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">氏名 <span className="text-red-600">*</span></label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="山田 太郎" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">メールアドレス <span className="text-red-600">*</span></label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="new-admin@unity-corp.jp" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">権限 <span className="text-red-600">*</span></label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "master")}
              className={inputClass}
            >
              <option value="admin">管理者</option>
              {currentRole === "master" && <option value="master">マスター</option>}
            </select>
            {currentRole !== "master" && (
              <p className="mt-1 text-xs text-gray-500">マスター権限の付与はマスターのみ可能です。</p>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
              キャンセル
            </button>
            <button type="submit" disabled={submitting} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300">
              {submitting ? "送信中..." : "招待メールを送信"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
