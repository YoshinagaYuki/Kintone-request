/**
 * サイトの公開URL(招待メール・パスワード再設定メールのリンク基準)。
 *
 * ・NEXT_PUBLIC_SITE_URL を最優先。無ければ APP_BASE_URL、最後に localhost。
 * ・固定の localhost や Vercel URL をコードへ直書きしない(環境変数で管理)。
 * ・末尾スラッシュは除去する。
 */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

/** 招待・パスワード再設定後の遷移先(本人がパスワードを設定する画面) */
export function getSetPasswordUrl(): string {
  return `${getSiteUrl()}/auth/set-password`;
}
