/**
 * kintone AppID 10(オールマイト)のフォームフィールド一覧を取得し、
 * docs/kintone-fields-allmight.md に保存する。
 *
 * 実行: npm run fetch:kintone-fields
 * 必要な環境変数(.env.local): KINTONE_DOMAIN / KINTONE_APP_ID / KINTONE_API_TOKEN
 *
 * ・取得のみ。レコード登録は行わない(手順7-8で実装)
 * ・APIトークンは一切ログ出力しない
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fetchFormFields, type KintoneField } from "../lib/kintone/fields";
import { loadEnvLocal, requireEnv } from "./load-env";

// npm run 経由ではプロジェクトルートが cwd になる
const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, "docs", "kintone-fields-allmight.md");

/**
 * 別アプリの取得も可能:
 *   npm run fetch:kintone-fields -- --app 50 --token-env KINTONE_API_TOKEN_APP50 --out docs/kintone-fields-numbering.md
 */
function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

const SYSTEM_FIELD_TYPES = new Set([
  "RECORD_NUMBER",
  "CREATOR",
  "CREATED_TIME",
  "MODIFIER",
  "UPDATED_TIME",
  "STATUS",
  "STATUS_ASSIGNEE",
  "CATEGORY",
]);

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function buildMarkdown(
  fields: KintoneField[],
  meta: { appId: number; revision: string }
): string {
  const inputFields = fields.filter((f) => !SYSTEM_FIELD_TYPES.has(f.type));
  const systemFields = fields.filter((f) => SYSTEM_FIELD_TYPES.has(f.type));

  const row = (f: KintoneField) =>
    `| ${escapeCell(f.label)} | \`${f.code}\` | ${f.type}${f.subtableCode ? `(SUBTABLE: \`${f.subtableCode}\` 内)` : ""} | ${f.required ? "○" : ""} | ${escapeCell(f.options.join(" / "))} |`;

  const header = [
    "| フィールド名 | フィールドコード | 型 | 必須 | 選択肢 |",
    "|---|---|---|---|---|",
  ];

  return [
    `# kintone フィールド一覧(App ${meta.appId})`,
    "",
    `- kintone AppID: ${meta.appId}`,
    `- フォーム revision: ${meta.revision}`,
    `- 取得日時: ${new Date().toISOString()}`,
    `- 取得スクリプト: \`scripts/fetch-kintone-fields.ts\``,
    "",
    "手順6(登録マッピング設計)の材料。FMT項目との対応は `form_types.field_mapping` に定義する。",
    "",
    "## 入力フィールド",
    "",
    ...header,
    ...inputFields.map(row),
    "",
    "## システムフィールド(API登録時に値指定不可)",
    "",
    ...header,
    ...systemFields.map(row),
    "",
    "## マッピング設計メモ(手順6で記入)",
    "",
    "| FMT項目(ラベル) | kintoneフィールドコード | 変換ルール |",
    "|---|---|---|",
    "| (未定) | | |",
    "",
  ].join("\n");
}

async function main() {
  loadEnvLocal(ROOT);

  const domain = requireEnv("KINTONE_DOMAIN");
  const appId = Number(getArg("--app") ?? requireEnv("KINTONE_APP_ID"));
  const apiToken = requireEnv(getArg("--token-env") ?? "KINTONE_API_TOKEN");
  const outputPath = path.resolve(ROOT, getArg("--out") ?? DEFAULT_OUTPUT);

  if (!Number.isInteger(appId) || appId <= 0) {
    console.error("KINTONE_APP_ID が不正です(数値を設定してください)");
    process.exit(1);
  }

  console.log(`kintone (${domain}) AppID ${appId} のフィールド一覧を取得します...`);

  const { fields, revision } = await fetchFormFields({ domain, appId, apiToken });

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, buildMarkdown(fields, { appId, revision }), "utf8");

  console.log(`取得完了: ${fields.length} フィールド (revision: ${revision})`);
  console.log(`出力先: ${path.relative(ROOT, outputPath)}`);
}

main().catch((err: unknown) => {
  // エラーオブジェクトにトークンは含まれない(fields.ts側で保証)
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
