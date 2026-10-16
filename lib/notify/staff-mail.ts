import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendMail } from "@/lib/mail/mailer";
import { EMAIL_RE } from "@/lib/system-settings";
import { newRequestSubject, newRequestBody } from "./new-request-mail-content";
import type { NewRequestNotification } from "./notify";

/**
 * 担当者向け新規申請メール通知。
 * 送信条件(すべて満たす場合のみ):
 *   ・申請の弊社担当者名が staff_members.name と「完全一致」(trim後の厳密一致。ファジー禁止)
 *   ・公開中(is_active=true)で、その完全一致が「ちょうど1件」(同名複数は送らない)
 *   ・email_notify_enabled=true
 *   ・有効なメールアドレスが登録済み
 * 未入力・不一致・同名複数・OFF・メール未登録 → 送信しない。
 * ・常時CCは付けない(skipAlwaysCc)。
 * ・送信失敗は申請を失敗させず、ログに記録する(throw しない)。
 */
export async function sendStaffNewRequestMail(n: NewRequestNotification): Promise<void> {
  const nameInput = (n.staffNameInput ?? "").trim();
  if (!nameInput) {
    console.info("[staff-mail] 担当者未入力のため送信しません");
    return;
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("staff_members")
      .select("name, email, email_notify_enabled")
      .eq("is_active", true);
    if (error) throw new Error(error.message);

    // 完全一致(trim後の厳密一致)。ファジーマッチはしない。
    const matches = (data ?? []).filter(
      (s) => ((s.name as string | null) ?? "").trim() === nameInput
    );
    if (matches.length !== 1) {
      console.info(`[staff-mail] 完全一致が ${matches.length} 件のため送信しません(1件のみ送信)`);
      return;
    }

    const staff = matches[0];
    if (staff.email_notify_enabled !== true) {
      console.info("[staff-mail] 担当者のメール通知がOFFのため送信しません");
      return;
    }
    const email = ((staff.email as string | null) ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      console.info("[staff-mail] 有効なメールアドレス未登録のため送信しません");
      return;
    }

    try {
      const r = await sendMail({
        to: email,
        subject: newRequestSubject(n),
        text: newRequestBody(n),
        skipAlwaysCc: true,
      });
      if ("error" in r) console.error("[staff-mail] 送信失敗:", r.error);
    } catch (err) {
      console.error("[staff-mail] 送信例外:", err instanceof Error ? err.message : err);
    }
  } catch (err) {
    console.error(
      "[staff-mail] 担当者メール通知に失敗しました:",
      err instanceof Error ? err.message : err
    );
  }
}
