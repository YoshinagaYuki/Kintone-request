import type { ParserConfig } from "@/types/request";

export type ParseResult =
  | { ok: true; data: Record<string, string> }
  | { ok: false; errors: string[] };

const MAX_LENGTH = 20000;

/**
 * FMT(定型テキスト)のパースと形式チェック。
 *
 * 仮実装: 「ラベル: 値」の行形式を想定し、半角/全角コロンの両方を許容する。
 * ラベルにマッチしない行は無視する(原文は raw_text として全文保存される)。
 *
 * TODO: FMTのフォーマット確定後、form_types.parser_config と合わせて調整する
 *       (requirements.md「未確定事項」参照)
 */
export function parseFmt(rawText: string, config: ParserConfig = {}): ParseResult {
  const errors: string[] = [];
  const text = rawText ?? "";

  if (text.trim().length === 0) {
    return { ok: false, errors: ["FMTが入力されていません。"] };
  }
  if (text.length > MAX_LENGTH) {
    return { ok: false, errors: [`FMTが長すぎます(${MAX_LENGTH}文字以内)。`] };
  }

  const separators = [config.separator ?? ":", ":"];
  const blockAliases = config.block_aliases ?? {};
  const labelAliases = config.label_aliases ?? {};
  const data: Record<string, string> = {};

  // 現在のブロック(《配送》《集荷》等)の短縮ラベル対応表。見出し行ごとに切替
  let currentBlock: Record<string, string> | null = null;

  for (const line of text.split(/\r?\n/)) {
    // trim() は半角/全角スペース(U+3000)・タブを除去する(インデントは無視)
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 見出し行(《…》)はパース対象外。既知のブロックならエイリアス表を切替、未知の見出しなら解除
    if (trimmed.startsWith("《")) {
      currentBlock = null;
      for (const [blockKey, aliasMap] of Object.entries(blockAliases)) {
        if (trimmed.startsWith(blockKey)) {
          currentBlock = aliasMap;
          break;
        }
      }
      continue;
    }

    let sepIndex = -1;
    let sepLength = 0;
    for (const sep of separators) {
      const idx = trimmed.indexOf(sep);
      if (idx > 0 && (sepIndex === -1 || idx < sepIndex)) {
        sepIndex = idx;
        sepLength = sep.length;
      }
    }
    if (sepIndex === -1) continue;

    let label = trimmed.slice(0, sepIndex).trim();
    const value = trimmed.slice(sepIndex + sepLength).trim();

    // ブロック内の短縮ラベル(日付→配送日付 等)→ 全体別名(緊急時責任者氏名→責任者氏名 等)の順で正規化
    if (currentBlock && currentBlock[label]) {
      label = currentBlock[label];
    } else if (labelAliases[label]) {
      label = labelAliases[label];
    }

    if (label && !(label in data)) {
      data[label] = value;
    }
  }

  for (const label of config.required_labels ?? []) {
    if (!data[label]) {
      errors.push(`必須項目「${label}」が見つからないか、値が空です。`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, data };
}
