import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * システム設定(system_settings テーブル)の読み取りヘルパ。
 *
 * ・値はすべて text 保存。数値は取得時にパースする。
 * ・コードへ直書きしないため、既定値は「DBに行が無い/空のときのフォールバック」としてのみ使う。
 * ・公開申請画面・メール生成・APIから共通利用する(単一の取得口)。
 */

export const SETTING_KEYS = {
  minimumOrderQuantity: "minimum_order_quantity",
  manualDriveUrl: "manual_drive_url",
  alwaysCcEmails: "always_cc_emails",
} as const;

/** DB未設定時のフォールバック(初期値)。運用値は system_settings 側で変更する */
export const SETTING_FALLBACKS = {
  minimum_order_quantity: 100,
  manual_drive_url: "",
  always_cc_emails: "",
} as const;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 常時CCの保存文字列(改行/カンマ区切り)をメール配列へパース(空要素は除去) */
export function parseEmailList(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(/[\r\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** メール配列を大文字小文字を無視して重複排除(先勝ち・元の表記を保持) */
export function dedupeEmails(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const key = e.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(e.trim());
  }
  return out;
}

/** 全設定を key→value のマップで取得 */
export async function getSystemSettings(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data } = await supabase.from("system_settings").select("key, value");
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key as string] = (row.value as string) ?? "";
  }
  return map;
}

/** 最小注文数量(整数)。未設定・不正値はフォールバック(初期値100) */
export async function getMinimumOrderQuantity(
  supabase: SupabaseClient
): Promise<number> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTING_KEYS.minimumOrderQuantity)
    .maybeSingle();
  const n = Number.parseInt((data?.value ?? "").toString().trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : SETTING_FALLBACKS.minimum_order_quantity;
}

/** Google Drive 共有リンク。未設定は空文字 */
export async function getManualDriveUrl(
  supabase: SupabaseClient
): Promise<string> {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTING_KEYS.manualDriveUrl)
    .maybeSingle();
  return (data?.value ?? SETTING_FALLBACKS.manual_drive_url).toString().trim();
}

/**
 * 常時CCメールアドレス一覧。未設定・取得失敗時は空配列(=常時CCなし)。
 * 取得失敗でメール本体を止めないよう、例外は握りつぶして空配列を返す。
 */
export async function getAlwaysCcEmails(
  supabase: SupabaseClient
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", SETTING_KEYS.alwaysCcEmails)
      .maybeSingle();
    if (error) {
      console.error("[system-settings] always_cc_emails 取得エラー:", error.message);
      return [];
    }
    return dedupeEmails(parseEmailList(data?.value as string | null));
  } catch (err) {
    console.error("[system-settings] always_cc_emails 取得で例外:", err);
    return [];
  }
}
