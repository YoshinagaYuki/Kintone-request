import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/admin/status-badge";
import { ApproveActions } from "@/components/admin/approve-actions";
import { buildKintoneRecord, type FieldMapping } from "@/lib/kintone/mapper";
import { getVersionedConfig, isKintoneReady } from "@/lib/form-types";
import {
  ACTION_LABELS,
  type HistoryAction,
  type RequestStatus,
} from "@/types/request";

export const dynamic = "force-dynamic";

type Detail = {
  id: string;
  raw_text: string;
  parsed_data: Record<string, string>;
  status: RequestStatus;
  reject_reason: string | null;
  kintone_record_id: string | null;
  management_no: string | null;
  form_type_id: string;
  form_type_version: number;
  created_at: string;
  form_types: {
    name: string;
    kintone_app_id: number;
    field_mapping: FieldMapping;
  } | null;
};

type History = {
  id: string;
  action: HistoryAction;
  actor: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

const HISTORY_DOT: Partial<Record<HistoryAction, string>> = {
  kintone_failed: "bg-red-500",
  notify_failed: "bg-red-400",
  rejected: "bg-gray-400",
  kintone_registered: "bg-green-500",
  numbered: "bg-green-500",
  shipping_synced: "bg-green-500",
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

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <h2 className="border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("requests")
    .select(
      "id, raw_text, parsed_data, status, reject_reason, kintone_record_id, management_no, form_type_id, form_type_version, created_at, form_types(name, kintone_app_id, field_mapping)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();
  const request = data as unknown as Detail;

  const { data: historiesData } = await supabase
    .from("request_histories")
    .select("id, action, actor, detail, created_at")
    .eq("request_id", id)
    .order("created_at", { ascending: true });

  const histories = (historiesData ?? []) as History[];
  const parsedEntries = Object.entries(request.parsed_data ?? {});
  const shippingSynced = histories.some((h) => h.action === "shipping_synced");

  // 申請時点の version の定義を使用(FMT改訂後も過去申請の表示・承認が壊れない)
  const versioned = await getVersionedConfig(
    supabase,
    request.form_type_id,
    request.form_type_version
  );
  const fieldMapping =
    versioned?.field_mapping ?? request.form_types?.field_mapping ?? null;

  // kintone登録が設定済みか(設定駆動: field_mapping が空の種別は未設定 = 承認不可)
  const kintoneReady = isKintoneReady(fieldMapping);

  // kintone登録予定データ(承認・再実行と同じ buildKintoneRecord を使用)
  const showPreview =
    kintoneReady &&
    (request.status === "pending" ||
      request.status === "approved" ||
      request.status === "register_failed");
  const preview =
    showPreview && fieldMapping
      ? buildKintoneRecord(request.parsed_data ?? {}, fieldMapping)
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <Link
        href="/admin/requests"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
      >
        ← 申請一覧へ戻る
      </Link>

      {/* ヘッダー */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          申請詳細({request.form_types?.name ?? "-"})
        </h1>
        <StatusBadge status={request.status} />
      </div>
      <p className="mt-1 text-sm text-gray-500">
        申請日時: {formatDateTime(request.created_at)}
        <span className="ml-3">定義Version: {request.form_type_version}</span>
      </p>

      {/* kintone連携サマリー */}
      {request.kintone_record_id && (
        <div
          className={`mt-5 overflow-hidden rounded-lg border shadow-sm ${
            request.status === "registered"
              ? "border-green-300 bg-green-50"
              : "border-orange-300 bg-orange-50"
          }`}
        >
          <div
            className={`grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 ${
              request.status === "registered" ? "divide-green-200" : "divide-orange-200"
            }`}
          >
            <div className="px-4 py-3">
              <p className="text-xs text-gray-600">管理番号</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-gray-900">
                {request.management_no ?? "未採番"}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-gray-600">kintoneレコードID</p>
              <p className="mt-0.5 font-mono text-lg font-bold text-gray-900">
                {request.kintone_record_id}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-gray-600">配送管理連携</p>
              <p
                className={`mt-0.5 text-lg font-bold ${shippingSynced ? "text-green-700" : "text-orange-700"}`}
              >
                {shippingSynced ? "✓ 完了" : "未完了"}
              </p>
            </div>
          </div>
          <p
            className={`border-t px-4 py-2 text-xs ${
              request.status === "registered"
                ? "border-green-200 text-green-800"
                : "border-orange-200 text-orange-800"
            }`}
          >
            {request.status === "registered"
              ? "kintone登録・管理番号採番・配送管理連携まで自動実行済みです。"
              : "連携が未完了です。エラーを確認のうえ、下の「再実行」ボタンで再開してください。"}
          </p>
        </div>
      )}

      {request.reject_reason && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <span className="font-semibold text-red-700">差戻し理由: </span>
          {request.reject_reason}
        </div>
      )}

      {/* パース結果 */}
      <SectionCard title="パース結果">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {parsedEntries.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-gray-500">パース済み項目はありません</td>
                </tr>
              )}
              {parsedEntries.map(([label, value]) => (
                <tr key={label}>
                  <th className="w-36 bg-gray-50 px-4 py-2 text-left align-top font-medium text-gray-600 sm:w-48">
                    {label}
                  </th>
                  <td className="whitespace-pre-wrap break-words px-4 py-2">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* kintone登録予定データ */}
      {preview && (
        <SectionCard
          title={`kintone登録予定データ(AppID: ${request.form_types?.kintone_app_id})`}
        >
          {preview.ok ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs text-gray-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">フィールドコード</th>
                    <th className="px-4 py-2 font-medium">登録値</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {Object.entries(preview.record).map(([code, { value }]) => (
                    <tr key={code}>
                      <th className="w-40 bg-gray-50 px-4 py-2 text-left align-top font-mono text-xs font-medium text-gray-600 sm:w-56">
                        {code}
                      </th>
                      <td className="whitespace-pre-wrap break-words px-4 py-2">
                        {Array.isArray(value) ? value.join("、") : value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="m-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <p className="font-semibold">登録予定データを組み立てられません:</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </SectionCard>
      )}

      {/* kintone登録が未設定の種別(例: てずくーる)は承認操作を無効化 */}
      {!kintoneReady &&
      (request.status === "pending" || request.status === "register_failed") ? (
        <div className="mt-6 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          <p className="font-semibold">kintone登録は未設定</p>
          <p className="mt-1">
            {request.form_types?.name ?? "この種別"}
            のkintoneマッピングが未確定のため、承認(kintone登録)はまだ実行できません。
            マッピング確定後に form_types の field_mapping を設定すると有効化されます。
          </p>
        </div>
      ) : (
        <ApproveActions
          requestId={request.id}
          status={request.status}
          previewOk={preview?.ok ?? false}
        />
      )}

      {/* FMT原文 */}
      <SectionCard title="FMT原文">
        <pre className="overflow-x-auto whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
          {request.raw_text}
        </pre>
      </SectionCard>

      {/* 操作履歴(タイムライン) */}
      <SectionCard title="操作履歴">
        <ol className="p-4">
          {histories.length === 0 && (
            <li className="text-sm text-gray-500">履歴はありません</li>
          )}
          {histories.map((h, i) => (
            <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
              {/* 縦線 */}
              {i < histories.length - 1 && (
                <span
                  className="absolute left-[5px] top-4 h-full w-px bg-gray-200"
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ${HISTORY_DOT[h.action] ?? "bg-blue-400"}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium">{ACTION_LABELS[h.action]}</span>
                  <span className="text-xs text-gray-500">
                    {formatDateTime(h.created_at)} / {h.actor}
                  </span>
                </div>
                {h.detail && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-600">
                    {JSON.stringify(h.detail, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      {/* TODO: 差戻し(reject)ボタンは別途実装(FR-14) */}
    </main>
  );
}
