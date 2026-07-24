import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * メールテンプレート(email_templates)の取得と差込レンダリング。
 *
 * ・本文はDB保存(管理画面「メールテンプレート」で編集)。コードへ直書きしない。
 * ・{{placeholder}} 形式の差込に対応。未知のプレースホルダは空文字へ置換する。
 */

export type EmailTemplateKey = "application" | "approval";

export type EmailTemplate = { subject: string; body: string };

/** DB取得失敗/未登録時の最小フォールバック(空テンプレは送らないための保険) */
const FALLBACK: Record<EmailTemplateKey, EmailTemplate> = {
  application: {
    subject: "【{{form_type_name}}】申請を受け付けました",
    body: "{{applicant_name}} 様\n\n申請を受け付けました。\n\n{{order_details}}",
  },
  approval: {
    subject: "【株式会社ユニティ】ご注文承認のお知らせ",
    body: "{{applicant_name}} 様\n\nご申請が承認されました。\n\n{{order_details}}",
  },
};

export async function getEmailTemplate(
  supabase: SupabaseClient,
  key: EmailTemplateKey
): Promise<EmailTemplate> {
  const { data } = await supabase
    .from("email_templates")
    .select("subject, body")
    .eq("key", key)
    .maybeSingle();
  const subject = (data?.subject ?? "").toString();
  const body = (data?.body ?? "").toString();
  if (!subject.trim() && !body.trim()) return FALLBACK[key];
  return {
    subject: subject.trim() ? subject : FALLBACK[key].subject,
    body: body.trim() ? body : FALLBACK[key].body,
  };
}

/**
 * {{key}} を vars[key] で置換する。未定義キーは空文字。
 * 値内に {{...}} が含まれても再帰置換しない(単純一括置換)。
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}
