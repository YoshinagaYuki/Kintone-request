/**
 * 汎用の名称マッチング(担当者氏名・その他の候補選択に再利用)。
 *
 * 正規化・類似度は商品名マッチング(item-normalizer.ts)の実装を再利用し、
 * 同じロジックを重複実装しない。氏名向けに以下を追加で考慮する:
 *   ・姓と名の間の空白(全角/半角)を無視した比較
 *   ・名字だけ/名前だけの入力(部分一致)
 *   ・同一名字が複数いる場合は自動確定しない(重複姓チェック)
 *   ・上位候補と次点が僅差(AMBIGUOUS_SCORE_MARGIN以内)なら曖昧として手動選択必須
 */

import {
  normalizeForCompare,
  similarity,
  AUTO_SELECT_THRESHOLD,
} from "./item-normalizer";

/** 上位候補と次点の一致率がこの差以内(かつ両方が閾値以上)なら曖昧扱い */
export const AMBIGUOUS_SCORE_MARGIN = 0.05;

export type NameCandidate = {
  /** 正式名称(kintoneへ登録する値) */
  name: string;
  /** 読み仮名など、照合に使う別表記(任意)。ひらがな入力の照合に使う */
  readings?: string[];
};

/** 候補の照合対象文字列(正式名称 + 読み仮名) */
function candidateForms(c: NameCandidate): string[] {
  return [c.name, ...(c.readings ?? [])].filter(Boolean);
}

/** 候補に対する最大類似度 */
function bestScore(input: string, c: NameCandidate): number {
  return Math.max(...candidateForms(c).map((f) => similarity(input, f)));
}

export type NameMatchResult = {
  /** 自動選択された正式名称(確定できなければ空 = 選択してください) */
  suggested: string;
  /** 自動選択された候補の一致率(0〜1)。参考表示用。未選択時は0 */
  score: number;
  /** 曖昧で手動選択が必要か */
  ambiguous: boolean;
  /** 曖昧時の該当候補名(警告表示用) */
  ambiguousCandidates: string[];
  /** 曖昧の理由(表示用) */
  reason?: "duplicate_surname" | "close_scores";
};

/** 姓名の区切りとみなす空白を除いた正規化文字列 */
function normalizeName(s: string): string {
  return normalizeForCompare(s); // normalizeForCompare が空白を除去するため姓名間空白も吸収される
}

/** 入力が「名字だけ(姓のみ)」とみなせるか: いずれかの候補の姓の部分と一致 */
function looksLikeSurnameOnly(input: string, candidates: NameCandidate[]): string | null {
  const nInput = normalizeName(input);
  if (!nInput) return null;
  for (const c of candidates) {
    // 正式名称・読み仮名の姓部分(空白区切りの先頭)が入力と一致するか
    for (const form of candidateForms(c)) {
      const parts = form.split(/[\s　]+/).filter(Boolean);
      if (parts.length >= 2) {
        const surname = normalizeName(parts[0]);
        if (surname && surname === nInput) return nInput;
      }
    }
  }
  return null;
}

/**
 * 入力氏名に最も近い担当者を判定する。
 * ・完全一致 → 即確定
 * ・名字だけの入力で同一姓が複数 → 曖昧(手動選択必須)
 * ・最上位<50% → 未選択
 * ・最上位と次点が僅差(両方50%以上) → 曖昧(手動選択必須)
 */
export function matchStaffName(
  input: string,
  candidates: NameCandidate[]
): NameMatchResult {
  const empty: NameMatchResult = {
    suggested: "",
    score: 0,
    ambiguous: false,
    ambiguousCandidates: [],
  };
  const raw = (input ?? "").trim();
  if (!raw || candidates.length === 0) return empty;

  // スコア算出(降順)
  const scored = candidates
    .map((c) => ({ name: c.name, score: bestScore(raw, c) }))
    .sort((a, b) => b.score - a.score);

  // 完全一致は即確定(重複姓でも完全一致なら確定してよい)
  const exact = candidates.find((c) =>
    candidateForms(c).some((f) => normalizeName(f) === normalizeName(raw))
  );
  if (exact)
    return { suggested: exact.name, score: 1, ambiguous: false, ambiguousCandidates: [] };

  // 名字だけの入力 → 同一姓が複数なら曖昧(重複姓チェックを優先)
  const surname = looksLikeSurnameOnly(raw, candidates);
  if (surname) {
    const sameSurname = candidates.filter((c) =>
      candidateForms(c).some((f) => {
        const parts = f.split(/[\s　]+/).filter(Boolean);
        return parts.length >= 2 && normalizeName(parts[0]) === surname;
      })
    );
    if (sameSurname.length >= 2) {
      return {
        suggested: "",
        score: 0,
        ambiguous: true,
        ambiguousCandidates: sameSurname.map((c) => c.name),
        reason: "duplicate_surname",
      };
    }
    if (sameSurname.length === 1) {
      return {
        suggested: sameSurname[0].name,
        score: bestScore(raw, sameSurname[0]),
        ambiguous: false,
        ambiguousCandidates: [],
      };
    }
  }

  const top = scored[0];
  if (!top || top.score < AUTO_SELECT_THRESHOLD) return empty;

  // 上位と次点が僅差(両方が閾値以上) → 曖昧
  const second = scored[1];
  if (
    second &&
    second.score >= AUTO_SELECT_THRESHOLD &&
    top.score - second.score <= AMBIGUOUS_SCORE_MARGIN
  ) {
    return {
      suggested: "",
      score: 0,
      ambiguous: true,
      ambiguousCandidates: scored
        .filter((s) => top.score - s.score <= AMBIGUOUS_SCORE_MARGIN && s.score >= AUTO_SELECT_THRESHOLD)
        .map((s) => s.name),
      reason: "close_scores",
    };
  }

  return { suggested: top.name, score: top.score, ambiguous: false, ambiguousCandidates: [] };
}
