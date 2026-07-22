/**
 * FMTパース結果(parsed_data)→ kintoneレコードへの変換。
 *
 * 変換ルールは form_types.field_mapping(jsonb)で定義し、コードは種別非依存。
 * 実際のフィールドコードは docs/kintone-fields-allmight.md 取得後に
 * docs/kintone-mapping-design.md で確定させる(手順6)。
 * レコード登録(API呼び出し)は手順7-8で実装。
 */

import { normalizeBillingMonth } from "../billing-month";

export type FieldMappingEntry = {
  /** FMT側のラベル(parsed_data のキー) */
  fmt_label: string;
  /** kintoneフィールドコード */
  kintone_code: string;
  /** kintoneフィールド型(変換ルールの決定に使用) */
  kintone_type: KintoneMappableType;
  /** true の場合、値が空ならエラー */
  required?: boolean;
  /** 特殊変換の名前(TRANSFORMS に実装。例: "billing_month_next")。指定時は型変換より優先 */
  transform?: string;
};

export type ConstantEntry = {
  /** kintoneフィールドコード */
  kintone_code: string;
  /** 固定値(例: 申請経路 = "Surely") */
  value: string;
};

/** form_types.field_mapping の形式 */
export type FieldMapping = {
  mappings: FieldMappingEntry[];
  constants?: ConstantEntry[];
};

export type KintoneMappableType =
  | "SINGLE_LINE_TEXT"
  | "MULTI_LINE_TEXT"
  | "RICH_TEXT"
  | "NUMBER"
  | "DATE"
  | "TIME"
  | "DATETIME"
  | "DROP_DOWN"
  | "RADIO_BUTTON"
  | "CHECK_BOX"
  | "MULTI_SELECT"
  | "LINK";

export type KintoneRecord = Record<string, { value: string | string[] }>;

export type MapResult =
  /** warnings: 送信を見送った項目の警告(承認は可能。承認画面に表示する) */
  | { ok: true; record: KintoneRecord; warnings: string[] }
  | { ok: false; errors: string[] };

/** 全角数字(U+FF10-FF19)を半角へ */
function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0)
  );
}

/** 全角数字・カンマ等を正規化して数値文字列にする */
function normalizeNumber(raw: string): string | null {
  const normalized = toHalfWidthDigits(raw)
    .replace(/[,、，]/g, "") // , 、 ,
    .replace(/円|個|件/g, "")
    .trim();
  if (normalized === "" || Number.isNaN(Number(normalized))) return null;
  return normalized;
}

/** 現在年(JST基準。サーバーがUTCでも日本時間の年を返す) */
function currentYearJST(): number {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCFullYear();
}

/**
 * 日付の表記ゆれを YYYY-MM-DD(kintone DATE形式)へ正規化する。
 *
 * 対応形式:
 *   年あり: 2026/7/1, 2026-07-01, 2026.7.1, 2026年7月1日, 20260701, 令和8年7月1日(元年対応)
 *   年なし: 7/1, 07-01, 7.1, 7月1日 → 現在年(JST)を補完
 * 全角数字は半角へ変換。実在しない日付(2/30等)は null(登録前エラー)。
 */
function normalizeDate(raw: string): string | null {
  const s = toHalfWidthDigits(raw).trim();

  let y: number;
  let mo: number;
  let d: number;

  const reiwa = s.match(/^令和(元|\d{1,2})年\s*(\d{1,2})月\s*(\d{1,2})日?$/);
  const withYear =
    s.match(/^(\d{4})[/\-.年]\s*(\d{1,2})[/\-.月]\s*(\d{1,2})日?$/) ??
    s.match(/^(\d{4})(\d{2})(\d{2})$/);
  const withoutYear = s.match(/^(\d{1,2})[/\-.月]\s*(\d{1,2})日?$/);

  if (reiwa) {
    // 令和N年 = 2018+N(令和元年=2019)
    y = 2018 + (reiwa[1] === "元" ? 1 : Number(reiwa[1]));
    mo = Number(reiwa[2]);
    d = Number(reiwa[3]);
  } else if (withYear) {
    y = Number(withYear[1]);
    mo = Number(withYear[2]);
    d = Number(withYear[3]);
  } else if (withoutYear) {
    // 年なしは現在年を補完
    y = currentYearJST();
    mo = Number(withoutYear[1]);
    d = Number(withoutYear[2]);
  } else {
    return null;
  }

  // 実在日チェック(2/30・13月・0日などを弾く)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }

  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * transform: "billing_month_next"
 * 「◯月分」の入力を翌月請求の文字列へ変換する。
 *   7月分 / 7月 / 07月分 → 7月分8月請求
 *   2026年7月分 → 2026年7月分8月請求(年表記は維持)
 *   12月分 → 12月分1月請求(年の繰り上げ表記は不要)
 */
function transformBillingMonthNext(
  raw: string,
  label: string
): { value: string } | { warning: string } {
  // 変換ロジックは lib/billing-month.ts に集約(重複実装しない)
  const result = normalizeBillingMonth(raw);
  if (!result.ok) {
    // 勝手に補完せず、送信もしない。承認画面で警告表示する
    return { warning: `「${label}」を請求月として判定できませんでした(入力値: ${raw})` };
  }
  return { value: result.value };
}

/** 特殊変換の一覧。追加時はここに登録し、field_mapping の transform で指定する */
const TRANSFORMS: Record<
  string,
  (raw: string, label: string) => { value: string } | { error: string } | { warning: string }
> = {
  billing_month_next: transformBillingMonthNext,
};

/** 「、」「,」「/」区切りを配列にする(CHECK_BOX / MULTI_SELECT 用) */
function splitMultiValue(raw: string): string[] {
  return raw
    .split(/[、,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function convertValue(
  entry: FieldMappingEntry,
  raw: string
): { value: string | string[] } | { error: string } {
  switch (entry.kintone_type) {
    case "NUMBER": {
      const n = normalizeNumber(raw);
      if (n === null)
        return { error: `「${entry.fmt_label}」を数値に変換できません: ${raw}` };
      return { value: n };
    }
    case "DATE": {
      const d = normalizeDate(raw);
      if (d === null)
        return { error: `「${entry.fmt_label}」を日付(YYYY-MM-DD)に変換できません: ${raw}` };
      return { value: d };
    }
    case "CHECK_BOX":
    case "MULTI_SELECT":
      return { value: splitMultiValue(raw) };
    default:
      // テキスト系・選択系・LINK はそのまま
      return { value: raw };
  }
}

/**
 * parsed_data と field_mapping から kintone レコードを組み立てる。
 * 変換不能・必須欠落はエラーとして返し、登録は行わせない。
 */
export function buildKintoneRecord(
  parsedData: Record<string, string>,
  mapping: FieldMapping
): MapResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const record: KintoneRecord = {};

  if (!mapping || !Array.isArray(mapping.mappings) || mapping.mappings.length === 0) {
    return {
      ok: false,
      errors: ["field_mapping が未設定です(docs/kintone-mapping-design.md 参照)"],
    };
  }

  for (const entry of mapping.mappings) {
    // 未入力の項目はkintoneへ送信しない(ダミー値・既定値による補完は行わない方針)
    const raw = (parsedData[entry.fmt_label] ?? "").trim();

    if (!raw) {
      if (entry.required) {
        errors.push(`必須項目「${entry.fmt_label}」が空です`);
      }
      continue; // 任意項目が空なら送信しない
    }

    // 特殊変換(transform)指定時は型変換より優先
    if (entry.transform) {
      const fn = TRANSFORMS[entry.transform];
      if (!fn) {
        errors.push(
          `未定義のtransformです: ${entry.transform}(${entry.fmt_label}。field_mappingの設定を確認してください)`
        );
        continue;
      }
      const transformed = fn(raw, entry.fmt_label);
      if ("error" in transformed) {
        errors.push(transformed.error);
        continue;
      }
      if ("warning" in transformed) {
        // 判定できない値は補完も送信もせず、警告として承認画面へ通知
        warnings.push(transformed.warning);
        continue;
      }
      record[entry.kintone_code] = { value: transformed.value };
      continue;
    }

    const converted = convertValue(entry, raw);
    if ("error" in converted) {
      errors.push(converted.error);
      continue;
    }
    record[entry.kintone_code] = { value: converted.value };
  }

  for (const constant of mapping.constants ?? []) {
    record[constant.kintone_code] = { value: constant.value };
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, record, warnings };
}
