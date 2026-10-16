/**
 * オールマイトの手配種別(配送/集荷)の共通定義。
 *
 * ・DBには 'normal'(通常配送)/ 'charter'(チャーター)で保存(null=未設定=通常配送扱い)。
 * ・申請者には表示・入力させない(常に通常配送)。管理者が申請詳細で配送/集荷を独立に変更する。
 * ・kintone(App10)登録値は docs/kintone-fields-allmight.md の正式な選択肢に合わせる:
 *     normal → 通常配送 / charter → チャーター便
 *   フィールドコード: 納品=手配種別 / 集荷=集荷_手配種別
 * ・クライアント/サーバー双方から使うため server-only にはしない。
 */

export type ArrangementValue = "normal" | "charter";

export const ARRANGEMENT_OPTIONS: { value: ArrangementValue; label: string }[] = [
  { value: "normal", label: "通常配送" },
  { value: "charter", label: "チャーター" },
];

export const ARRANGEMENT_LABELS: Record<ArrangementValue, string> = {
  normal: "通常配送",
  charter: "チャーター",
};

/** DB値(null/不正含む)を正規化。既定は通常配送 */
export function normalizeArrangement(v: string | null | undefined): ArrangementValue {
  return v === "charter" ? "charter" : "normal";
}

/** kintone(App10)ドロップダウンの正式値(通常配送 / チャーター便) */
export function arrangementToKintone(v: ArrangementValue): string {
  return v === "charter" ? "チャーター便" : "通常配送";
}

/** App10 フィールドコード(docs/kintone-fields-allmight.md) */
export const KINTONE_DELIVERY_ARRANGEMENT_CODE = "手配種別";
export const KINTONE_PICKUP_ARRANGEMENT_CODE = "集荷_手配種別";

/**
 * チャーター便の時刻フィールド(TIME, "HH:MM")。docs/kintone-fields-allmight.md(rev247)。
 * ※ 命名は非対称: 配送=納品_時間 / 集荷=集荷_時刻。
 */
export const KINTONE_DELIVERY_TIME_CODE = "納品_時間";
export const KINTONE_PICKUP_TIME_CODE = "集荷_時刻";

/** 24時間表記 "HH:MM"(00:00〜23:59)か */
export function isValidTime(v: string | null | undefined): boolean {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());
}

/**
 * 保存/送信用に時刻を正規化する。
 * ・手配種別が charter 以外(通常配送)のときは常に null(時刻なし)。
 * ・charter のときは "HH:MM" として妥当なら その値、そうでなければ null。
 */
export function normalizeArrangementTime(
  arrangement: ArrangementValue,
  time: string | null | undefined
): string | null {
  if (arrangement !== "charter") return null;
  const t = (time ?? "").trim();
  return isValidTime(t) ? t : null;
}

/**
 * kintone(TIME)へ送る値。charter かつ妥当な時刻なら "HH:MM"、それ以外は ""(クリア)。
 * 通常配送へ戻した場合に kintone 側の時刻を空欄へ戻すために "" を送る。
 */
export function arrangementTimeToKintone(
  arrangement: ArrangementValue,
  time: string | null | undefined
): string {
  const n = normalizeArrangementTime(arrangement, time);
  return n ?? "";
}
