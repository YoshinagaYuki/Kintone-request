import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PushPermission } from "@/components/admin/push-permission";
import { PushTestButton } from "@/components/admin/push-test-button";
import {
  RequestsList,
  type RequestListRow,
} from "@/components/admin/requests-list";
import {
  REQUEST_STATUSES,
  STATUS_LABELS,
  type RequestStatus,
} from "@/types/request";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  status: RequestStatus;
  management_no: string | null;
  created_at: string;
  form_types: { name: string } | null;
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const statusFilter = REQUEST_STATUSES.includes(status as RequestStatus)
    ? (status as RequestStatus)
    : null;

  const supabase = await createClient();
  let query = supabase
    .from("requests")
    .select("id, status, management_no, created_at, form_types(name)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  const rows: RequestListRow[] = ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    status: row.status,
    management_no: row.management_no,
    created_at: row.created_at,
    form_type_name: row.form_types?.name ?? "-",
  }));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      {/* 初回のみ通知許可バナー(許可済みなら購読を自動メンテナンス) */}
      <PushPermission />

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">申請一覧</h1>
        <div className="flex flex-wrap items-baseline gap-3">
          <PushTestButton />
          <p className="text-sm text-gray-500">
            {statusFilter ? `${STATUS_LABELS[statusFilter]}: ` : ""}
            {rows.length} 件{rows.length === 100 ? "(最新100件)" : ""}
          </p>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label="ステータスで絞り込み">
        <Link
          href="/admin/requests"
          className={`rounded-full border px-3 py-1 transition-colors ${!statusFilter ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}
        >
          すべて
        </Link>
        {REQUEST_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/requests?status=${s}`}
            className={`rounded-full border px-3 py-1 transition-colors ${statusFilter === s ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"}`}
          >
            {STATUS_LABELS[s]}
          </Link>
        ))}
      </nav>

      {error && (
        <p className="mt-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          一覧の取得に失敗しました: {error.message}
        </p>
      )}

      {/* 一覧(チェックボックス選択+一括削除つき) */}
      <RequestsList rows={rows} />
    </main>
  );
}
