import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/admin/status-badge";
import { ApproveActions } from "@/components/admin/approve-actions";
import { buildKintoneRecord, type FieldMapping } from "@/lib/kintone/mapper";
import { getVersionedConfig, isKintoneReady } from "@/lib/form-types";
import { suggestItemName, type ItemMasterEntry } from "@/lib/item-normalizer";
import { matchStaffName } from "@/lib/name-matcher";
import type { ApproveContentSlot } from "@/components/admin/approve-actions";
import {
  ACTION_LABELS,
  RENTAL_STATUS_LABELS,
  type HistoryAction,
  type RequestStatus,
  type RentalStatus,
  type ParserConfig,
  type RentalPlan,
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
  applicant_name: string | null;
  applicant_phone: string | null;
  applicant_email: string | null;
  rental_status: RentalStatus | null;
  requested_rental_plan_id: string | null;
  approved_rental_plan_id: string | null;
  customer_requests: string | null;
  approved_contents: Record<string, string> | null;
  is_structured: boolean | null;
  company_staff_name_input: string | null;
  approved_staff_name: string | null;
  application_email_sent_at: string | null;
  approval_email_sent_at: string | null;
  application_email_error: string | null;
  approval_email_error: string | null;
  form_types: {
    name: string;
    kintone_app_id: number;
    field_mapping: FieldMapping;
    parser_config: ParserConfig;
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
      "id, raw_text, parsed_data, status, reject_reason, kintone_record_id, management_no, form_type_id, form_type_version, created_at, applicant_name, applicant_phone, applicant_email, rental_status, requested_rental_plan_id, approved_rental_plan_id, customer_requests, approved_contents, is_structured, company_staff_name_input, approved_staff_name, application_email_sent_at, approval_email_sent_at, application_email_error, approval_email_error, form_types(name, kintone_app_id, field_mapping, parser_config)"
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

  // 通知結果(共通通知サービスの結果。最新の notified/notify_failed 履歴から取得)
  const notifyHistory = [...histories]
    .reverse()
    .find((h) => h.action === "notified" || h.action === "notify_failed");
  const notifyResults = ((notifyHistory?.detail?.results ?? []) as {
    channel: string;
    ok: boolean;
    error?: string;
  }[]).filter((n) => typeof n?.channel === "string");

  // 登録失敗の最新エラー(赤色表示用)
  const lastFailure = [...histories]
    .reverse()
    .find((h) => h.action === "kintone_failed");
  const lastFailureMessage =
    typeof lastFailure?.detail?.error === "string" ? lastFailure.detail.error : null;

  // 「確認が必要な項目」(parser_config.confirm_labels): 未入力でも申請は通るが承認前に要確認
  const confirmLabelWarnings = (request.form_types?.parser_config?.confirm_labels ?? [])
    .filter((label) => !((request.parsed_data ?? {})[label] ?? "").trim())
    .map((label) => `${label}が未入力です。`);

  // レンタルプラン(てずくーる)関連
  const usesRentalPlan = (request.form_types?.parser_config?.select_fields ?? []).some(
    (sf) => sf.label === "レンタルプラン"
  );
  const { data: plansData } = usesRentalPlan
    ? await supabase
        .from("rental_plans")
        .select("id, name, description, sort_order, is_active")
        .order("sort_order", { ascending: true })
    : { data: [] };
  const allPlans = (plansData ?? []) as RentalPlan[];
  const activePlans = allPlans.filter((p) => p.is_active);
  const planName = (pid: string | null) =>
    pid ? allPlans.find((p) => p.id === pid)?.name ?? "(削除済みプラン)" : null;
  const requestedPlanName = planName(request.requested_rental_plan_id);
  const approvedPlanName = planName(request.approved_rental_plan_id);

  // コンテンツ確定用: 商品マスタ(有効な正式名称)と、申請入力からの自動選択
  const itemCategory =
    request.form_types?.name === "オールマイト" ? "allmight" : "tezukuru";
  const { data: itemData } = await supabase
    .from("item_name_master")
    .select("name, aliases, sort_order")
    .eq("category", itemCategory)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const itemEntries: ItemMasterEntry[] = (itemData ?? []).map((r) => ({
    name: r.name as string,
    aliases: Array.isArray(r.aliases) ? (r.aliases as string[]) : [],
  }));
  const itemOptions = itemEntries.map((e) => e.name);

  // 申請にコンテンツ入力があるスロットのみ対象(数量との対応はラベルで保持)。
  // 構造化フォーム由来(is_structured)は申請時に商品マスターの正式名称を選択済みのため、
  // 承認画面での再マッチング・再選択は行わない(申請時の値をそのまま登録する)。
  const parsed = (request.parsed_data ?? {}) as Record<string, string>;
  const approvedContents = (request.approved_contents ?? {}) as Record<string, string>;
  const contentSlots: ApproveContentSlot[] = request.is_structured
    ? []
    : Array.from({ length: 10 }, (_, i) => {
    const label = `コンテンツ${i + 1}`;
    const original = (parsed[label] ?? "").trim();
    if (!original) return null;
    // 承認済みの選択があればそれを、無ければ商品マスタから自動選択(低類似度は未選択)
    const suggested =
      approvedContents[label] ??
      suggestItemName(original, itemEntries)?.name ??
      "";
    return {
      label,
      original,
      suggested: itemOptions.includes(suggested) ? suggested : "",
      quantity: (parsed[`数量${i + 1}`] ?? "").trim(),
    };
  }).filter((s): s is ApproveContentSlot => s !== null);

  // 弊社担当者: 担当者マスター(有効)から自動照合(既存の商品照合ロジックを再利用)
  const { data: staffData } = await supabase
    .from("staff_members")
    .select("name, name_kana, is_active, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const staffOptions = (staffData ?? []).map((r) => r.name as string);
  const staffCandidates = (staffData ?? []).map((r) => ({
    name: r.name as string,
    readings: (r.name_kana as string | null)?.trim()
      ? [(r.name_kana as string).trim()]
      : [],
  }));
  const staffInputRaw = (request.company_staff_name_input ?? "").trim();
  const staffMatch = matchStaffName(staffInputRaw, staffCandidates);
  // 既に承認済みの確定値があればそれを初期選択に
  const staffSuggested = request.approved_staff_name
    ? staffOptions.includes(request.approved_staff_name)
      ? request.approved_staff_name
      : ""
    : staffMatch.suggested;

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
  // プレビュー用 parsed_data: レンタルプランは承認/申請プラン名で補完
  // (already_renting で未確定でも他項目の検証ができるよう、承認時に選択する旨のプレースホルダを入れる)
  const previewParsed: Record<string, string> = { ...(request.parsed_data ?? {}) };
  // 承認画面で選択済みのコンテンツ正式名称をプレビューへ反映
  for (const [label, name] of Object.entries(approvedContents)) {
    if (name) previewParsed[label] = name;
  }
  if (usesRentalPlan && !previewParsed["レンタルプラン"]) {
    previewParsed["レンタルプラン"] =
      approvedPlanName ?? requestedPlanName ?? "(承認時に選択)";
  }
  const preview =
    showPreview && fieldMapping
      ? buildKintoneRecord(previewParsed, fieldMapping)
      : null;

  // 「確認が必要な項目」= 未入力の confirm_labels + 変換できず送信を見送った項目(請求月など)
  const confirmWarnings = [
    ...confirmLabelWarnings,
    ...(preview?.ok ? preview.warnings : []),
  ];

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

      {/* 登録完了の成功メッセージ(ページ再読み込み後も登録済みなら表示・自動消去しない) */}
      {request.status === "registered" && (
        <div className="mt-5 rounded-lg border-2 border-green-400 bg-green-50 p-5 shadow-sm">
          <p className="text-lg font-bold text-green-800">✅ 登録が完了しました</p>
          <p className="mt-1 text-sm text-green-900">
            kintoneへの登録と配送管理連携が正常に完了しました。
          </p>
          <dl className="mt-3 space-y-1 text-sm text-green-900">
            <div className="flex gap-2">
              <dt className="w-40 shrink-0 text-green-700">管理番号</dt>
              <dd className="font-mono font-bold">{request.management_no ?? "未採番"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 shrink-0 text-green-700">kintoneレコードID</dt>
              <dd className="font-mono font-bold">{request.kintone_record_id ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-40 shrink-0 text-green-700">配送管理連携</dt>
              <dd className="font-bold">{shippingSynced ? "完了" : "未完了"}</dd>
            </div>
          </dl>
          {notifyResults.length > 0 && (
            <dl className="mt-3 space-y-1 border-t border-green-200 pt-3 text-sm text-green-900">
              {notifyResults.map((n) => (
                <div key={n.channel} className="flex gap-2">
                  <dt className="w-40 shrink-0 text-green-700">{n.channel}</dt>
                  <dd className={n.ok ? "font-bold" : "font-bold text-red-700"}>
                    {n.ok ? "成功" : `失敗${n.error ? `(${n.error})` : ""}`}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {/* 登録失敗(赤色。再試行はこの下の操作ボタンから) */}
      {request.status === "register_failed" && (
        <div className="mt-5 rounded-lg border-2 border-red-400 bg-red-50 p-5 shadow-sm">
          <p className="text-lg font-bold text-red-800">⛔ 登録に失敗しました</p>
          {lastFailureMessage && (
            <p className="mt-1 break-words text-sm text-red-900">{lastFailureMessage}</p>
          )}
          <p className="mt-2 text-sm text-red-900">
            下の「kintone登録を再実行」から再試行してください(登録済みの処理はスキップされます)。
          </p>
        </div>
      )}

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

      {/* 確認が必要な項目(未入力でも申請は可。承認前に承認者が確認する) */}
      {confirmWarnings.length > 0 &&
        (request.status === "pending" || request.status === "register_failed") && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">確認が必要な項目</p>
            <ul className="mt-2 space-y-1">
              {confirmWarnings.map((text) => (
                <li key={text}>⚠ {text}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">
              未入力でも承認できます。内容をご確認のうえ、必要に応じてkintone側で補記してください。
            </p>
          </div>
        )}

      {/* 入力者情報 */}
      <SectionCard title="入力者情報">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                氏名
              </th>
              <td className="px-4 py-2">{request.applicant_name ?? "-"}</td>
            </tr>
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                電話番号
              </th>
              <td className="px-4 py-2">
                {request.applicant_phone ? (
                  <a href={`tel:${request.applicant_phone}`} className="text-blue-600 hover:underline">
                    {request.applicant_phone}
                  </a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                メールアドレス
              </th>
              <td className="break-all px-4 py-2">
                {request.applicant_email ? (
                  <a href={`mailto:${request.applicant_email}`} className="text-blue-600 hover:underline">
                    {request.applicant_email}
                  </a>
                ) : (
                  "-"
                )}
              </td>
            </tr>
            <tr>
              <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                弊社担当者氏名
              </th>
              <td className="px-4 py-2">
                {staffInputRaw ? (
                  <span>
                    <span className="text-gray-500">申請入力: </span>
                    {staffInputRaw}
                    {request.approved_staff_name ? (
                      <span className="ml-2 inline-flex items-center rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        確定: {request.approved_staff_name}
                      </span>
                    ) : (
                      <span className="ml-2 inline-flex items-center rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        未確定(承認時に選択)
                      </span>
                    )}
                  </span>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </SectionCard>

      {/* レンタル情報(てずくーる) */}
      {usesRentalPlan && (
        <SectionCard title="レンタル情報">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                  レンタル状況
                </th>
                <td className="px-4 py-2">
                  {request.rental_status
                    ? RENTAL_STATUS_LABELS[request.rental_status]
                    : "-"}
                </td>
              </tr>
              <tr>
                <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                  申請時プラン
                </th>
                <td className="px-4 py-2">
                  {requestedPlanName ?? (request.rental_status === "already_renting" ? "(承認時に設定)" : "-")}
                </td>
              </tr>
              <tr>
                <th className="w-36 bg-gray-50 px-4 py-2 text-left font-medium text-gray-600 sm:w-48">
                  承認プラン
                </th>
                <td className="px-4 py-2 font-medium">
                  {approvedPlanName ?? "(未確定)"}
                </td>
              </tr>
            </tbody>
          </table>
        </SectionCard>
      )}

      {/* お客様からの要望(承認画面でも表示・改行保持) */}
      {request.customer_requests && (
        <SectionCard title="お客様からの要望">
          <p className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed">
            {request.customer_requests}
          </p>
        </SectionCard>
      )}

      {/* メール送信状況 */}
      {(request.application_email_error || request.approval_email_error) && (
        <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          <p className="font-semibold">メール送信エラー</p>
          {request.application_email_error && (
            <p className="mt-1">申請完了メール: {request.application_email_error}</p>
          )}
          {request.approval_email_error && (
            <p className="mt-1">承認完了メール: {request.approval_email_error}</p>
          )}
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
          confirmWarnings={confirmWarnings}
          usesRentalPlan={usesRentalPlan}
          planSelectionRequired={
            usesRentalPlan && !(request.parsed_data ?? {})["レンタルプラン"]
          }
          rentalStatus={request.rental_status}
          requestedPlanName={requestedPlanName}
          defaultPlanId={
            request.approved_rental_plan_id ?? request.requested_rental_plan_id ?? ""
          }
          plans={activePlans.map((p) => ({ id: p.id, name: p.name }))}
          contentSlots={contentSlots}
          itemOptions={itemOptions}
          staffInput={staffInputRaw}
          staffSuggested={staffSuggested}
          staffScore={staffMatch.score}
          staffAmbiguous={staffMatch.ambiguous}
          staffAmbiguousCandidates={staffMatch.ambiguousCandidates}
          staffOptions={staffOptions}
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
