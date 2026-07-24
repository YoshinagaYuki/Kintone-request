import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail, type MailResult } from "./mailer";
import { getEmailTemplate, renderTemplate } from "./templates";
import { buildOrderDetails } from "./order-details";
import { getManualDriveUrl } from "../system-settings";

/**
 * 申請完了メール / 承認完了メール。
 * ・本文は email_templates(DB・管理画面で編集可)から取得し、差込で生成(コード直書きしない)
 * ・{{order_details}} は parsed_data から実際の申請内容(商品/数量/配送先/配送日/担当者/電話/住所)を展開
 * ・{{manual_drive_url}} は system_settings の Google Drive 共有リンクを差込
 * ・二重送信防止: application_email_sent_at / approval_email_sent_at を確認し、送信成功時に記録
 * ・送信失敗は *_email_error に記録し、履歴にも残す(申請/承認処理自体は失敗させない)
 * ・本文はプレーンテキスト(HTML/スクリプトは埋め込まない)
 */

type ApplicantContext = {
  applicant_name: string | null;
  applicant_email: string | null;
  management_no: string | null;
  formTypeName: string;
  boothName: string;
  agencyName: string;
  /** メール差込用: 申請内容(FMTラベル→値)。注文内容の自動展開に使う */
  parsedData?: Record<string, string> | null;
  /** 弊社担当者(承認確定値 or 申請入力)。注文内容へ表示 */
  staffName?: string | null;
  /** お客様からの要望(requests.customer_requests)。注文内容へ表示 */
  customerRequests?: string | null;
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

async function recordHistory(
  supabase: SupabaseClient,
  requestId: string,
  action: "email_sent" | "email_failed",
  detail: Record<string, unknown>
) {
  await supabase.from("request_histories").insert({
    request_id: requestId,
    action,
    actor: "system",
    detail,
  });
}

/** テンプレート共通の差込変数を組み立てる */
function baseVars(ctx: ApplicantContext, dateVarName: string, isoDate: string) {
  const orderDetails = buildOrderDetails({
    parsedData: ctx.parsedData ?? {},
    staffName: ctx.staffName ?? null,
    customerRequests: ctx.customerRequests ?? null,
  });
  return {
    applicant_name: ctx.applicant_name ?? "ご担当者",
    management_no: ctx.management_no ?? "確認中(社内処理後に採番されます)",
    form_type_name: ctx.formTypeName,
    booth_name: ctx.boothName,
    agency_name: ctx.agencyName,
    order_details: orderDetails || "(申請内容の詳細はありません)",
    [dateVarName]: formatDateTime(isoDate),
  } as Record<string, string>;
}

/**
 * 申請完了メール(申請登録直後)。二重送信は application_email_sent_at で防止。
 */
export async function sendApplicationMail(
  supabase: SupabaseClient,
  requestId: string,
  ctx: ApplicantContext,
  submittedAt: string
): Promise<MailResult> {
  if (!ctx.applicant_email) return { sent: false, skipped: true };

  // 既送信チェック(二重送信防止)
  const { data: current } = await supabase
    .from("requests")
    .select("application_email_sent_at")
    .eq("id", requestId)
    .maybeSingle();
  if (current?.application_email_sent_at) return { sent: false, skipped: true };

  const template = await getEmailTemplate(supabase, "application");
  const vars = baseVars(ctx, "submitted_at", submittedAt);
  const subject = renderTemplate(template.subject, vars);
  const text = renderTemplate(template.body, vars);

  const result = await sendMail({ to: ctx.applicant_email, subject, text });

  if (result.sent) {
    await supabase
      .from("requests")
      .update({ application_email_sent_at: new Date().toISOString(), application_email_error: null })
      .eq("id", requestId);
    await recordHistory(supabase, requestId, "email_sent", { kind: "application" });
  } else if ("error" in result) {
    await supabase
      .from("requests")
      .update({ application_email_error: result.error })
      .eq("id", requestId);
    await recordHistory(supabase, requestId, "email_failed", {
      kind: "application",
      error: result.error,
    });
  }
  return result;
}

/**
 * 承認完了メール(kintone登録まで完了=承認完了 の時点)。
 * 二重送信は approval_email_sent_at で防止(再読み込み・retry再実行でも一度だけ)。
 */
export async function sendApprovalMail(
  supabase: SupabaseClient,
  requestId: string,
  ctx: ApplicantContext,
  approvedAt: string
): Promise<MailResult> {
  if (!ctx.applicant_email) return { sent: false, skipped: true };

  const { data: current } = await supabase
    .from("requests")
    .select("approval_email_sent_at")
    .eq("id", requestId)
    .maybeSingle();
  if (current?.approval_email_sent_at) return { sent: false, skipped: true };

  const template = await getEmailTemplate(supabase, "approval");
  const vars = baseVars(ctx, "approved_at", approvedAt);
  vars.manual_drive_url = await getManualDriveUrl(supabase);
  const subject = renderTemplate(template.subject, vars);
  const text = renderTemplate(template.body, vars);

  const result = await sendMail({ to: ctx.applicant_email, subject, text });

  if (result.sent) {
    await supabase
      .from("requests")
      .update({ approval_email_sent_at: new Date().toISOString(), approval_email_error: null })
      .eq("id", requestId);
    await recordHistory(supabase, requestId, "email_sent", { kind: "approval" });
  } else if ("error" in result) {
    await supabase
      .from("requests")
      .update({ approval_email_error: result.error })
      .eq("id", requestId);
    await recordHistory(supabase, requestId, "email_failed", {
      kind: "approval",
      error: result.error,
    });
  }
  return result;
}
