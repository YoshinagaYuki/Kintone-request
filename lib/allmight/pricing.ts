/**
 * オールマイト専用: 利用日数・機器別利用金額(①〜⑤)の計算。
 *
 * **本モジュールが料金計算の唯一の正(Single Source of Truth)。**
 * kintone側JavaScriptには依存しない(2026-07-06方針確定。JS側の修正も不要)。
 * kintone登録直前に register-request.ts から applyAllmightPricing() が呼ばれる。
 *
 * 料金体系: 3日 / 14日 / 21日 / 1ヶ月 の4パック(旧28日価格を1ヶ月価格として使用)。
 * 1ヶ月判定は日付ベース(利用開始日の翌月同日-1日まで。翌月同日が無い月は翌月末日まで)。
 * 1ヶ月を超えた分は 1ヶ月料金 + 超過日数 × extra。
 *
 * 禁止: 計算フィールド「計算」/ 配送費 / 調整額 には直接値を入れない(kintoneの計算式に任せる)。
 * 対象: オールマイトのみ(呼び出し側で form_type.name === "オールマイト" を判定)。
 */

import type { KintoneRecord } from "../kintone/mapper";

/** 料金行。未確定のパックは undefined(候補から除外される) */
export type PricingRow = {
  /** 3日パック */
  d3?: number;
  /** 14日パック */
  d14?: number;
  /** 21日パック */
  d21?: number;
  /** 1ヶ月パック(旧28日パックの価格をそのまま使用) */
  month?: number;
  /** 超過1日あたり */
  extra?: number;
};

/**
 * 料金表(原本: 既存kintone JSの PRICING_TABLE。2026-07-06 全件転記・価格は原本のまま)。
 * 4番目の価格(旧28日)を「1ヶ月料金」(month)として使用する。
 *
 * ★注意: kintone選択肢の「kidsスペース」は原本料金表に存在しないため未登録
 *   (該当機器の申請は利用金額未設定+警告になる。価格が確定したら追加すること)。
 *   「スティックキャッチ（ペア）」は原本にあるため転記済み(現在のkintone選択肢には無い)。
 */
export const PRICING_TABLE: Record<string, PricingRow> = {
  "スティックキャッチ（ペア）": { d3: 140000, d14: 210000, d21: 280000, month: 350000, extra: 20000 },
  "スティックキャッチ（大）": { d3: 100000, d14: 150000, d21: 200000, month: 250000, extra: 15000 },
  "スティックキャッチ（小）": { d3: 80000, d14: 120000, d21: 160000, month: 200000, extra: 12000 },
  "クレーンゲーム": { d3: 50000, d14: 75000, d21: 100000, month: 125000, extra: 10000 },
  "イライラスティック": { d3: 100000, d14: 150000, d21: 200000, month: 250000, extra: 15000 },
  "ぬりえスタジアム": { d3: 120000, d14: 180000, d21: 240000, month: 300000, extra: 18000 },
  "あひるサンダー": { d3: 50000, d14: 75000, d21: 100000, month: 125000, extra: 10000 },
  "あひるサンダーv2": { d3: 40000, d14: 70000, d21: 90000, month: 100000, extra: 10000 },
  "イライラスティックver.2": { d3: 150000, d14: 225000, d21: 300000, month: 375000, extra: 20000 },
  "JET Cola": { d3: 70000, d14: 140000, d21: 210000, month: 350000, extra: 15000 },
};

/** YYYY-MM-DD を UTC epoch(ms)に変換(不正なら null) */
function isoToUtc(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}

/** 利用日数 = 利用最終日 - 利用開始日 + 1日(不正・逆転は null) */
export function calculateUsageDays(startISO: string, endISO: string): number | null {
  const start = isoToUtc(startISO);
  const end = isoToUtc(endISO);
  if (start === null || end === null || end < start) return null;
  return Math.round((end - start) / 86400000) + 1;
}

/**
 * 1ヶ月扱いの最終日(YYYY-MM-DD)。
 *   基本: 利用開始日の翌月同日 - 1日(7/4開始 → 8/3)
 *   翌月同日が存在しない場合: 翌月末日までを1ヶ月扱い(1/31開始 → 2/28(平年))
 */
export function oneMonthEndDate(startISO: string): string | null {
  const m = startISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  let ny = y;
  let nm = mo + 1;
  if (nm > 12) {
    nm = 1;
    ny += 1;
  }
  const lastDayNextMonth = new Date(Date.UTC(ny, nm, 0)).getUTCDate();

  let end: Date;
  if (d > lastDayNextMonth) {
    // 翌月同日が存在しない(例: 1/31 → 2/31)→ 翌月末日までを1ヶ月扱い
    end = new Date(Date.UTC(ny, nm - 1, lastDayNextMonth));
  } else {
    // 翌月同日の前日
    end = new Date(Date.UTC(ny, nm - 1, d) - 86400000);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
}

/** 利用期間が1ヶ月以内か(日付ベース判定) */
export function isWithinOneMonth(startISO: string, endISO: string): boolean {
  const limit = oneMonthEndDate(startISO);
  if (!limit) return false;
  return endISO <= limit; // ISO形式は文字列比較で日付比較になる
}

/**
 * 1ヶ月最終日を超えた日数(1ヶ月以内なら0、日付不正はnull)。
 * 例: 7/4開始(1ヶ月最終日=8/3)で 8/10 終了 → 7日超過
 */
export function oneMonthExcessDays(startISO: string, endISO: string): number | null {
  const limit = oneMonthEndDate(startISO);
  if (!limit) return null;
  if (endISO <= limit) return 0;
  const excess = calculateUsageDays(limit, endISO);
  return excess === null ? null : excess - 1; // limit当日は1ヶ月に含まれる
}

/**
 * 最安料金を計算する。
 * 候補:
 *   ・3日/14日/21日パック(日数内ならパック料金、超過なら パック料金 + 超過日数×extra)
 *   ・1ヶ月パック(1ヶ月以内ならパック料金、1ヶ月を超えたら 1ヶ月料金 + 超過日数×extra)
 * 定義されていないパックは候補から除外。候補が無ければ null(価格未確定)。
 */
export function calcBestPrice(
  row: PricingRow,
  days: number,
  monthExcessDays: number
): number | null {
  const candidates: number[] = [];

  const packs: [number, number | undefined][] = [
    [3, row.d3],
    [14, row.d14],
    [21, row.d21],
  ];
  for (const [packDays, price] of packs) {
    if (price === undefined) continue;
    if (days <= packDays) {
      candidates.push(price);
    } else if (row.extra !== undefined) {
      candidates.push(price + (days - packDays) * row.extra);
    }
  }

  if (row.month !== undefined) {
    if (monthExcessDays === 0) {
      candidates.push(row.month);
    } else if (row.extra !== undefined) {
      // 1ヶ月を超えた分は 1ヶ月料金 + 超過日数 × extra
      candidates.push(row.month + monthExcessDays * row.extra);
    }
  }

  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** 機器スロット(オールマイト。④⑤はkintoneコード逆転仕様に合わせて金額側は素直に対応) */
const EQUIPMENT_PRICE_SLOTS: { equipment: string; price: string }[] = [
  { equipment: "レンタル機材", price: "利用金額" },
  { equipment: "レンタル機材_0", price: "利用金額_0" },
  { equipment: "レンタル機材_1", price: "利用金額_1" },
  { equipment: "レンタル機材_2", price: "利用金額_2" },
  { equipment: "レンタル機材_3", price: "利用金額_3" },
];

/**
 * kintone登録レコードへ 利用日数・利用金額①〜⑤ を補完する(オールマイト専用)。
 * 「計算」「配送費」「調整額」には触れない。
 * 価格未確定の機器は利用金額を設定せず警告として返す(登録は継続)。
 */
export function applyAllmightPricing(record: KintoneRecord): { warnings: string[] } {
  const warnings: string[] = [];

  const start = typeof record["日付_0"]?.value === "string" ? (record["日付_0"].value as string) : "";
  const end = typeof record["日付_1"]?.value === "string" ? (record["日付_1"].value as string) : "";
  if (!start || !end) {
    warnings.push("利用開始日/利用最終日が無いため料金計算をスキップしました");
    return { warnings };
  }

  const days = calculateUsageDays(start, end);
  if (days === null) {
    warnings.push(`利用期間が不正なため料金計算をスキップしました(${start}〜${end})`);
    return { warnings };
  }

  // 利用日数(App10では文字列1行フィールド)
  record["利用日数"] = { value: String(days) };

  const excessDays = oneMonthExcessDays(start, end) ?? 0;

  for (const slot of EQUIPMENT_PRICE_SLOTS) {
    const equipment = record[slot.equipment]?.value;
    if (typeof equipment !== "string" || !equipment) continue; // 未使用スロット

    const row = PRICING_TABLE[equipment];
    if (!row) {
      warnings.push(`料金表に未登録の機器のため利用金額を未設定にしました: ${equipment}`);
      continue;
    }
    const price = calcBestPrice(row, days, excessDays);
    if (price === null) {
      warnings.push(
        `料金を確定できないため利用金額を未設定にしました: ${equipment}(${days}日)`
      );
      continue;
    }
    record[slot.price] = { value: String(price) };
  }

  return { warnings };
}
