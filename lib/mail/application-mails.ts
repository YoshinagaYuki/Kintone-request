import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMail, type MailResult } from "./mailer";

/**
 * 申請完了メール / 承認完了メール。
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

function line(label: string, value: string | null): string {
  return `${label}: ${value && value.trim() ? value : "(未入力)"}`;
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

  const subject = `【${ctx.formTypeName}】申請を受け付けました`;
  const text = [
    `${ctx.applicant_name ?? "ご担当者"} 様`,
    "",
    "この度は申請いただきありがとうございます。以下の内容で申請を受け付けました。",
    "",
    line("管理番号", ctx.management_no ?? "確認中(社内処理後に採番されます)"),
    line("イベントブース名", ctx.boothName),
    line("取次店名", ctx.agencyName),
    line("申請日時", formatDateTime(submittedAt)),
    "",
    "現在は「確認待ち」の状態です。社内で内容を確認のうえ、あらためてご連絡いたします。",
    "",
    "※このメールは自動送信です。ご返信いただいてもお答えできない場合があります。",
  ].join("\n");

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

  const subject = `【${ctx.formTypeName}】申請が承認されました`;
  const text = [
    `${ctx.applicant_name ?? "ご担当者"} 様`,
    "",
    "ご申請いただいた内容が承認されました。",
    "",
    line("管理番号", ctx.management_no),
    line("イベントブース名", ctx.boothName),
    line("取次店名", ctx.agencyName),
    line("承認日時", formatDateTime(approvedAt)),
    "",
    "今後の詳細については、必要に応じて担当者よりご連絡いたします。",
    "",
    "※このメールは自動送信です。ご返信いただいてもお答えできない場合があります。",
  ].join("\n");

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
