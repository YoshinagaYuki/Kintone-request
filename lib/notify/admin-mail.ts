import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mail/mailer";
import { dedupeEmails, EMAIL_RE } from "@/lib/system-settings";
import { newRequestSubject, newRequestBody } from "./new-request-mail-content";
import type { NewRequestNotification } from "./notify";

/**
 * 管理者向け新規申請メール通知(事業別)。
 * 対象: 当該事業の担当管理者で、利用中(active)かつ email_notify_enabled=true かつ有効なメールを登録。
 * ・常時CCは付けない(skipAlwaysCc)。申請者向けメールとは分離。
 * ・DB不備・対象0件でも全員送信フォールバックはしない。
 * ・送信失敗は申請を失敗させず、ログに記録する(throw しない)。
 */
export async function sendAdminNewRequestMail(n: NewRequestNotification): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: biz, error: e1 } = await admin
      .from("admin_user_businesses")
      .select("admin_user_id")
      .eq("form_type_id", n.formTypeId);
    if (e1) throw new Error(e1.message);
    const ids = Array.from(new Set((biz ?? []).map((r) => r.admin_user_id as string)));
    if (ids.length === 0) {
      console.info("[admin-mail] 担当管理者が0件のため送信しません");
      return;
    }

    const { data: admins, error: e2 } = await admin
      .from("admin_users")
      .select("email")
      .in("id", ids)
      .eq("status", "active")
      .eq("email_notify_enabled", true);
    if (e2) throw new Error(e2.message);

    const emails = dedupeEmails(
      (admins ?? [])
        .map((a) => ((a.email as string | null) ?? "").trim())
        .filter((e) => EMAIL_RE.test(e))
    );
    if (emails.length === 0) {
      console.info("[admin-mail] 対象(利用中+メールON+有効メール)が0件のため送信しません");
      return;
    }

    const subject = newRequestSubject(n);
    const text = newRequestBody(n);
    for (const to of emails) {
      try {
        const r = await sendMail({ to, subject, text, skipAlwaysCc: true });
        if ("error" in r) console.error("[admin-mail] 送信失敗:", to, r.error);
      } catch (err) {
        console.error("[admin-mail] 送信例外:", to, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error(
      "[admin-mail] 管理者メール通知に失敗しました:",
      err instanceof Error ? err.message : err
    );
  }
}
