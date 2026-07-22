import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * メール送信の共通抽象(Google Workspace SMTP / nodemailer)。
 *
 * ・SMTP認証情報は環境変数のみで管理し、ソースへ直書きしない
 * ・送信結果を返し、呼び出し側で「送信できたか」を判定する(申請保存は失敗させない)
 * ・未設定時は送信せず skipped を返す(ログにも本文/宛先を出さない)
 *
 * 環境変数:
 *   SMTP_HOST   例: smtp.gmail.com
 *   SMTP_PORT   例: 465(SSL) / 587(STARTTLS)
 *   SMTP_USER   Google Workspace のユーザー(例: contact@unity-corp.jp)
 *   SMTP_PASS   アプリパスワード等
 *   MAIL_FROM   送信元(例: 申請受付 <contact@unity-corp.jp>)
 */

export type MailInput = {
  to: string;
  subject: string;
  /** プレーンテキスト本文(HTMLは埋め込まない) */
  text: string;
};

export type MailResult =
  | { sent: true; provider: string }
  | { sent: false; skipped: true }
  | { sent: false; error: string };

/** 制御文字を除去(ヘッダインジェクション対策) */
function sanitizeHeader(v: string): string {
  return v.replace(/[\r\n]+/g, " ").trim();
}

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  if (!cachedTransporter) {
    const port = Number(process.env.SMTP_PORT || "465");
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465=SSL, それ以外(587)はSTARTTLS
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const to = sanitizeHeader(input.to);
  const subject = sanitizeHeader(input.subject);
  const text = input.text;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { sent: false, error: "宛先メールアドレスが不正です" };
  }

  const from = process.env.MAIL_FROM;
  const transporter = getTransporter();
  if (!transporter || !from) {
    // 未設定: 送信せずスキップ(開発環境等)。宛先・本文はログに出さない
    console.info("[mail] SMTPが未設定のためメール送信をスキップしました");
    return { sent: false, skipped: true };
  }

  try {
    await transporter.sendMail({ from, to, subject, text });
    return { sent: true, provider: "smtp" };
  } catch (err) {
    // エラーメッセージに宛先が含まれ得るためログには出さず、呼び出し元へ返す
    return {
      sent: false,
      error: err instanceof Error ? err.message : "メール送信で不明なエラー",
    };
  }
}

/** メール送信が設定済みか(完了画面の文言判定用に使える) */
export function isMailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
  );
}
