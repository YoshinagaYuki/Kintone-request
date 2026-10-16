import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin } from "@/lib/admin-users";
import { RestoreButton } from "@/components/admin/restore-button";

export const dynamic = "force-dynamic";

type TrashRow = {
  id: string;
  management_no: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
  applicant_name: string | null;
  form_type_id: string;
  form_types: { name: string } | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ゴミ箱(削除済み申請の一覧・復元)。
 * ・担当事業(admin_user_businesses)の削除済み申請のみ表示・復元可能。
 * ・復元は RestoreButton → POST /api/admin/requests/[id]/restore(サーバーで権限・原子性を担保)。
 */
export default async function TrashPage() {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  const admin = createAdminClient();

  // 担当事業
  const allowedForms = new Set<string>();
  if (me && me.status === "active") {
    const { data: biz } = await admin
      .from("admin_user_businesses")
      .select("form_type_id")
      .eq("admin_user_id", me.id);
    (biz ?? []).forEach((r) => allowedForms.add(r.form_type_id as string));
  }

  const { data } = await admin
    .from("requests")
    .select(
      "id, management_no, created_at, deleted_at, deleted_by, applicant_name, form_type_id, form_types(name)"
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);

  const all = (data ?? []) as unknown as TrashRow[];
  const rows = all.filter((r) => allowedForms.has(r.form_type_id));

  // 削除した管理者(deleted_by = auth_user_id)の表示名を解決
  const deleterIds = Array.from(new Set(rows.map((r) => r.deleted_by).filter(Boolean))) as string[];
  const nameByAuthId = new Map<string, string>();
  if (deleterIds.length > 0) {
    const { data: admins } = await admin
      .from("admin_users")
      .select("auth_user_id, name, email")
      .in("auth_user_id", deleterIds);
    (admins ?? []).forEach((a) =>
      nameByAuthId.set(
        a.auth_user_id as string,
        (a.name as string) || (a.email as string) || "(不明)"
      )
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold sm:text-2xl">ゴミ箱(削除済み申請)</h1>
        <p className="text-sm text-gray-500">{rows.length} 件</p>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        削除された申請は物理削除されず、ここから復元できます(管理番号・kintone連携は維持されます)。
      </p>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          削除済みの申請はありません。
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">申請番号</th>
                <th className="px-4 py-2 font-medium">事業</th>
                <th className="px-4 py-2 font-medium">申請者</th>
                <th className="px-4 py-2 font-medium">削除日時</th>
                <th className="px-4 py-2 font-medium">削除した管理者</th>
                <th className="px-4 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 font-mono">{r.management_no ?? "(未採番)"}</td>
                  <td className="px-4 py-2">{r.form_types?.name ?? "-"}</td>
                  <td className="px-4 py-2">{r.applicant_name ?? "-"}</td>
                  <td className="px-4 py-2">{fmt(r.deleted_at)}</td>
                  <td className="px-4 py-2">
                    {r.deleted_by ? nameByAuthId.get(r.deleted_by) ?? "(不明)" : "-"}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/admin/requests/${r.id}`} className="text-blue-600 hover:underline">
                        詳細
                      </Link>
                      <RestoreButton requestId={r.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
