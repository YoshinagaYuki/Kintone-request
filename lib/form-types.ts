/**
 * 種別定義のバージョン解決(system-design.md §3.1b / バージョン基準の処理ルール)。
 *
 * 申請は requests.form_type_version に申請時点の version を保持しており、
 * 承認・登録予定データ表示は現行の form_types ではなく、
 * 申請時点の form_type_versions の定義で処理する(FMT改訂で過去申請が壊れない)。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldMapping } from "./kintone/mapper";
import type { ParserConfig } from "@/types/request";

export type VersionedConfig = {
  fmt_template: string;
  parser_config: ParserConfig;
  field_mapping: FieldMapping;
  notify_config: Record<string, unknown>;
};

/**
 * 指定バージョンの種別定義を取得する。
 * 履歴が見つからない場合は null(呼び出し側で現行定義へフォールバック)。
 */
export async function getVersionedConfig(
  supabase: SupabaseClient,
  formTypeId: string,
  version: number | null | undefined
): Promise<VersionedConfig | null> {
  if (!formTypeId || !version) return null;

  const { data } = await supabase
    .from("form_type_versions")
    .select("fmt_template, parser_config, field_mapping, notify_config")
    .eq("form_type_id", formTypeId)
    .eq("version", version)
    .maybeSingle();

  return (data as VersionedConfig | null) ?? null;
}

/** field_mapping が設定済み(= kintone登録が有効)か */
export function isKintoneReady(mapping: FieldMapping | null | undefined): boolean {
  return (mapping?.mappings?.length ?? 0) > 0;
}
