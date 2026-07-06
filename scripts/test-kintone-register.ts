/**
 * 手順7: kintoneテスト登録スクリプト。
 *
 * サンプルFMT(または --fmt で指定したファイル)を parser → mapper に通し、
 * kintoneレコードを組み立てて表示する。既定は dry-run(登録しない)。
 * --execute を付けた場合のみ実際に kintone へ1件登録する。
 *
 * 実行:
 *   npm run test:kintone-register                  # dry-run(表示のみ)
 *   npm run test:kintone-register -- --execute     # 実際に登録
 *   npm run test:kintone-register -- --fmt sample.txt [--execute]
 *
 * 前提:
 *   ・.env.local に Supabase / kintone の環境変数が設定済み
 *   ・supabase/migrations 適用済み + docs/kintone-mapping-design.md §5 のSQL反映済み
 *   ・本番の承認画面(approve API)には未接続(手順8)
 *
 * APIトークン等の秘密情報は一切ログ出力しない。
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal, requireEnv } from "./load-env";
import { parseFmt } from "../lib/parser/fmt-parser";
import { buildKintoneRecord, type FieldMapping } from "../lib/kintone/mapper";
import { registerRecord } from "../lib/kintone/client";
import type { ParserConfig } from "../types/request";

const SAMPLE_FMT = `
機器商品: スティックキャッチ（大）
イベントブース名: テスト申請(allmight-request 手順7)
取次店名: テスト取次店
金額: 35,000円
配送日付: 2026/07/18
配送郵便番号: 150-0001
配送住所: 東京都渋谷区神宮前1-1-1
当日受領者氏名: テスト受領者
配送連絡先: 090-0000-0000
集荷日付: 2026/07/21
集荷郵便番号: 150-0001
集荷住所: 東京都渋谷区神宮前1-1-1
当日引渡者氏名: テスト引渡者
集荷連絡先: 090-0000-0000
伝票通知to: test-to@example.com
伝票通知cc: test-cc@example.com
責任者氏名: テスト責任者
責任者電話番号: 03-0000-0000
配送料: 3300円(テスト・備考転記確認用)
`;

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function main() {
  loadEnvLocal();

  const execute = process.argv.includes("--execute");
  const fmtPath = getArg("--fmt");
  const slug = getArg("--slug") ?? process.env.FORM_TYPE_SLUG;

  // 1. form_types から field_mapping / parser_config を取得(反映済みかの検証も兼ねる)
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let query = supabase
    .from("form_types")
    .select("slug, name, kintone_app_id, field_mapping, parser_config")
    .eq("is_active", true);
  if (slug) query = query.eq("slug", slug);

  const { data: formTypes, error } = await query;
  if (error) {
    console.error("form_types の取得に失敗しました:", error.message);
    process.exit(1);
  }
  if (!formTypes || formTypes.length === 0) {
    console.error("form_types が見つかりません。migrations と seed を適用してください。");
    process.exit(1);
  }
  if (formTypes.length > 1) {
    console.error(
      `form_types が複数あります。--slug で指定してください: ${formTypes.map((f) => f.slug).join(", ")}`
    );
    process.exit(1);
  }

  const formType = formTypes[0];
  const fieldMapping = formType.field_mapping as FieldMapping;
  const parserConfig = (formType.parser_config ?? {}) as ParserConfig;

  if (!fieldMapping?.mappings?.length) {
    console.error(
      `form_types(${formType.slug}) の field_mapping が空です。` +
        "docs/kintone-mapping-design.md §5 のSQLを実行してください。"
    );
    process.exit(1);
  }

  console.log(`種別: ${formType.name} / kintone AppID: ${formType.kintone_app_id}`);
  console.log(`マッピング: ${fieldMapping.mappings.length} 項目 + 固定値 ${fieldMapping.constants?.length ?? 0} 件`);

  // 2. FMT → parsed_data
  const fmtText = fmtPath ? readFileSync(fmtPath, "utf8") : SAMPLE_FMT;
  const parsed = parseFmt(fmtText, parserConfig);
  if (!parsed.ok) {
    console.error("FMTパースエラー:");
    parsed.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }
  console.log(`FMTパース: ${Object.keys(parsed.data).length} 項目`);

  // 3. parsed_data → kintoneレコード
  const mapped = buildKintoneRecord(parsed.data, fieldMapping);
  if (!mapped.ok) {
    console.error("マッピングエラー:");
    mapped.errors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  console.log("\n=== 組み立てたkintoneレコード ===");
  console.log(JSON.stringify(mapped.record, null, 2));

  // 4. 登録(--execute のときのみ)
  if (!execute) {
    console.log("\ndry-run のため登録していません。登録するには --execute を付けてください。");
    return;
  }

  console.log("\nkintone へテスト登録します...");
  const { recordId } = await registerRecord(formType.kintone_app_id, mapped.record);
  console.log(`登録成功: レコードID = ${recordId}`);
  console.log("kintone上で内容を確認し、不要ならテストレコードを削除してください。");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
