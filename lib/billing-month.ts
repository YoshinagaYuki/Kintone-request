/**
 * 請求月の正規化(システム全体で唯一の実装)。
 *
 * 入力の表記ゆれ(全角/半角・「月」「月分」「請求」「として請求」等)を吸収して月を抽出し、
 * kintone登録値を必ず「M月分N月請求」(N = 翌月)へ統一する。
 *
 *   7月 / ７月 / 7 / ７ / 7月分 / ７月分 / 7月請求 / 7月分として請求 → 7月分8月請求
 *   12月 → 12月分1月請求(12月の翌月は1月)
 *
 * ・数字は必ず半角で出力する
 * ・1〜12以外・月を抽出できない場合は ok:false(勝手に補完しない)
 * ・すでに「7月分8月請求」形式の場合はそのまま通す
 */

export type BillingMonthResult =
  | { ok: true; sourceMonth: number; billingMonth: number; value: string }
  | { ok: false; error: string };

/** 全角英数字 → 半角 */
function toHalfWidth(s: string): string {
  return s.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

export function normalizeBillingMonth(input: string | null | undefined): BillingMonthResult {
  const raw = (input ?? "").toString();
  const s = toHalfWidth(raw)
    .replace(/[\s　]+/g, "") // 半角/全角スペース除去
    .trim();

  if (!s) return { ok: false, error: "請求月が未入力です" };

  // 既に「M月分N月請求」形式(年つきも可) → 月を再計算せずそのまま採用
  const already = s.match(/^(?:\d{4}年)?(\d{1,2})月分(\d{1,2})月請求$/);
  if (already) {
    const m = Number(already[1]);
    const n = Number(already[2]);
    if (m >= 1 && m <= 12 && n >= 1 && n <= 12) {
      return { ok: true, sourceMonth: m, billingMonth: n, value: s };
    }
    return { ok: false, error: "請求月を判定できません" };
  }

  // 「◯月分として請求」「◯月分」「◯月請求」「◯月」「◯」など先頭の月数字を抽出。
  // 年が付く場合(2026年7月分)も月だけを取り出す
  const withYear = s.match(/^(?:\d{4}年)?(\d{1,2})(?:月|月分|月請求|月分として請求|ヶ月)?(?:として請求|請求|分)?$/);
  const monthStr = withYear?.[1] ?? s.match(/(\d{1,2})\s*月/)?.[1] ?? null;

  if (!monthStr) {
    return { ok: false, error: "請求月を判定できません" };
  }

  const sourceMonth = Number(monthStr);
  if (!Number.isInteger(sourceMonth) || sourceMonth < 1 || sourceMonth > 12) {
    return { ok: false, error: "請求月を判定できません(1〜12で入力してください)" };
  }

  const billingMonth = sourceMonth === 12 ? 1 : sourceMonth + 1;
  return {
    ok: true,
    sourceMonth,
    billingMonth,
    value: `${sourceMonth}月分${billingMonth}月請求`,
  };
}
