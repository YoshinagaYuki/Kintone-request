/**
 * 名称正規化(オールマイト機器商品/てずくーるコンテンツ共通)。
 *
 * item_name_master の正式名称・別名に基づき、申請者の表記ゆれ入力を
 * kintone登録前に正式名称へ補正する。オールマイトは料金計算にも機器名を使うため、
 * applyAllmightPricing() より前に実行すること(register-request.ts で担保)。
 *
 * 補正ルール(勝手に全然違う名称へ変換しない・曖昧な場合は補正しない):
 *   1. 正式名称と完全一致 → そのまま
 *   2. 別名(aliases)と一致(空白・括弧・記号を無視した比較を含む) → 正式名称
 *   3. 正規化文字列が正式名称と一致 → 正式名称(例: スティックキャッチ大 → （大）)
 *   4. 編集距離1以内で候補が一意 → 正式名称(例: しゃかしゃかキーホルダ)
 *   5. 入力(5文字以上・正式名称の6割以上)が正式名称の前方一致で候補が一意 → 正式名称(例: ぬりえトート)
 *   6. 上記以外 → 入力値のまま登録し、警告として返す(履歴に記録される)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KintoneRecord } from "./kintone/mapper";

export type ItemMasterEntry = {
  name: string;
  aliases: string[];
};

/** 種別ごとの正規化対象(kintoneフィールドコード) */
const TARGETS: Record<string, { category: string; fields: string[] }> = {
  "オールマイト": {
    category: "allmight",
    fields: [
      "レンタル機材",
      "レンタル機材_0",
      "レンタル機材_1",
      "レンタル機材_2",
      "レンタル機材_3",
    ],
  },
  "てずくーる": {
    category: "tezukuru",
    fields: [
      "コンテンツ",
      "コンテンツ_0",
      "コンテンツ_1",
      "コンテンツ_2",
      "コンテンツ_3",
      "コンテンツ_4",
      "コンテンツ_5",
      "コンテンツ_6",
      "コンテンツ_7",
      "コンテンツ_8",
    ],
  },
};

/**
 * 比較用正規化。表記ゆれを吸収する:
 * 全角英数→半角 / 英字小文字化 / 空白・括弧・記号除去 / カタカナ→ひらがな / 長音符除去
 */
export function normalizeForCompare(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0)
    )
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[()（）\[\]【】・.。、,，!！?？~〜_\-–—]/g, "")
    // カタカナ → ひらがな(ひらがな/カタカナ表記ゆれの吸収)
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    // 長音符の軽微な違いを無視
    .replace(/[ーｰ]/g, "");
}

/** 2-gram の集合(1文字語はその文字自身) */
function bigrams(s: string): string[] {
  if (s.length <= 1) return s ? [s] : [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/**
 * 類似度(0〜1)。Dice係数ベース + 部分一致・略称を優遇。
 * 例: 「シャカキー」↔「しゃかしゃかキーホルダー」が高スコアになる
 */
export function similarity(a: string, b: string): number {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (!x || !y) return 0;
  if (x === y) return 1;

  // 部分一致(略称の入力を想定)
  if (y.includes(x) || x.includes(y)) {
    const ratio = Math.min(x.length, y.length) / Math.max(x.length, y.length);
    return Math.max(0.75, ratio); // 部分一致は最低0.75を保証
  }

  const bx = bigrams(x);
  const by = bigrams(y);
  if (bx.length === 0 || by.length === 0) return 0;
  const pool = [...by];
  let hit = 0;
  for (const g of bx) {
    const i = pool.indexOf(g);
    if (i >= 0) {
      hit++;
      pool.splice(i, 1);
    }
  }
  return (2 * hit) / (bx.length + by.length);
}

/** この値未満は「自動選択しない(選択してください)」とする閾値 */
export const AUTO_SELECT_THRESHOLD = 0.5;

export type ItemSuggestion = { name: string; score: number };

/**
 * 入力値に最も近い正式名称を1つ提案する。
 * ・完全一致 / 別名一致は score=1
 * ・それ以外は類似度で判定し、AUTO_SELECT_THRESHOLD 未満なら null(未選択)
 */
export function suggestItemName(
  input: string,
  entries: ItemMasterEntry[]
): ItemSuggestion | null {
  const raw = (input ?? "").trim();
  if (!raw || entries.length === 0) return null;

  // 完全一致 / 別名一致(正規化込み)を最優先
  const exact = normalizeItemName(raw, entries);
  if (exact.matched) return { name: exact.name, score: 1 };

  let best: ItemSuggestion | null = null;
  for (const e of entries) {
    const candidates = [e.name, ...(e.aliases ?? [])];
    const score = Math.max(...candidates.map((c) => similarity(raw, c)));
    if (!best || score > best.score) best = { name: e.name, score };
  }
  if (!best || best.score < AUTO_SELECT_THRESHOLD) return null;
  return best;
}

/** レーベンシュタイン距離(閾値1で使う想定の素朴な実装) */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 99;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

export type NormalizeResult =
  | { matched: true; name: string; corrected: boolean }
  | { matched: false };

/** 入力値を正式名称へ正規化する(補正不可なら matched: false) */
export function normalizeItemName(
  input: string,
  entries: ItemMasterEntry[]
): NormalizeResult {
  const raw = input.trim();
  if (!raw) return { matched: false };

  // 1. 正式名称と完全一致
  for (const e of entries) {
    if (e.name === raw) return { matched: true, name: e.name, corrected: false };
  }

  // 2. 別名と一致(素の比較 + 正規化比較)
  const nRaw = normalizeForCompare(raw);
  for (const e of entries) {
    for (const alias of e.aliases) {
      if (alias === raw || normalizeForCompare(alias) === nRaw) {
        return { matched: true, name: e.name, corrected: true };
      }
    }
  }

  // 3. 正規化文字列が正式名称と一致
  for (const e of entries) {
    if (normalizeForCompare(e.name) === nRaw) {
      return { matched: true, name: e.name, corrected: true };
    }
  }

  // 4. 編集距離1以内・候補が一意(曖昧なら補正しない)
  const close = entries.filter((e) => levenshtein(normalizeForCompare(e.name), nRaw) <= 1);
  if (close.length === 1) {
    return { matched: true, name: close[0].name, corrected: true };
  }

  // 5. 前方一致(入力5文字以上・正式名称の6割以上をカバー・候補が一意)
  if (nRaw.length >= 5) {
    const prefix = entries.filter((e) => {
      const nName = normalizeForCompare(e.name);
      return nName.startsWith(nRaw) && nRaw.length / nName.length >= 0.6;
    });
    if (prefix.length === 1) {
      return { matched: true, name: prefix[0].name, corrected: true };
    }
  }

  return { matched: false };
}

/**
 * kintoneレコード内の機器/コンテンツ名を正規化する。
 * 対象外の種別(TARGETS未定義)は何もしない。マスター取得失敗時も登録は止めない。
 */
export async function normalizeRecordItems(
  supabase: SupabaseClient,
  formTypeName: string,
  record: KintoneRecord
): Promise<{ corrections: string[]; warnings: string[] }> {
  const corrections: string[] = [];
  const warnings: string[] = [];

  const target = TARGETS[formTypeName];
  if (!target) return { corrections, warnings };

  let entries: ItemMasterEntry[];
  try {
    const { data, error } = await supabase
      .from("item_name_master")
      .select("name, aliases")
      .eq("category", target.category)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    entries = (data ?? []).map((row) => ({
      name: row.name as string,
      aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    }));
  } catch (err) {
    warnings.push(
      `名称マスターの取得に失敗したため補正をスキップしました: ${err instanceof Error ? err.message : err}`
    );
    return { corrections, warnings };
  }

  if (entries.length === 0) return { corrections, warnings };

  for (const field of target.fields) {
    const value = record[field]?.value;
    if (typeof value !== "string" || !value) continue;

    const result = normalizeItemName(value, entries);
    if (!result.matched) {
      warnings.push(
        `名称マスターに一致しないため入力値のまま登録しました: 「${value}」(${field})`
      );
      continue;
    }
    if (result.corrected) {
      record[field] = { value: result.name };
      corrections.push(`「${value}」→「${result.name}」に補正しました(${field})`);
    }
  }

  return { corrections, warnings };
}
