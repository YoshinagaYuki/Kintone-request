/**
 * 配送管理(App11)への転記(新規作成/更新)。
 *
 * 管理番号でApp11を検索し、あれば更新・なければ新規作成(冪等)。
 * 転記フィールドと機器コード付与ルールは shipping-mapping.ts(既存JS準拠・確定)。
 *
 * 設計: docs/kintone-numbering-design.md
 */

import {
  findRecords,
  registerRecord,
  updateRecord,
  type KintoneRawRecord,
} from "./client";
import type { KintoneRecord } from "./mapper";
import {
  SHIPPING_FIELD_MAPPING,
  SHIPPING_MANAGEMENT_NO_FIELD,
  EQUIPMENT_CODE_FIELDS,
  resolveEquipmentCode,
} from "./shipping-mapping";

const SHIPPING_APP_ID = Number(process.env.KINTONE_APP_ID_SHIPPING ?? "11");

/**
 * 機器コード付与(既存JSの applyDropdownCodeRule 相当)。
 * 配送機器フィールドに値がある場合、判定したコードを対応するドロップダウンへ設定する。
 */
function applyDropdownCodeRule(record: KintoneRecord): void {
  for (const { equipmentField, codeField } of EQUIPMENT_CODE_FIELDS) {
    const equipment = record[equipmentField]?.value;
    if (typeof equipment !== "string" || !equipment) continue;
    const code = resolveEquipmentCode(equipment);
    if (code) {
      record[codeField] = { value: code };
    }
  }
}

/**
 * App10のレコード内容を配送管理へ転記する。
 * @returns created: 新規作成なら true、更新なら false
 */
export async function upsertShippingRecord(
  managementNo: string,
  sourceRecord: KintoneRawRecord
): Promise<{ created: boolean; recordId: string }> {
  // 転記レコードを組み立て(App10に値がある項目のみ)
  const record: KintoneRecord = {
    [SHIPPING_MANAGEMENT_NO_FIELD]: { value: managementNo },
  };
  for (const { from, to } of SHIPPING_FIELD_MAPPING) {
    const value = sourceRecord[from]?.value;
    if (value === undefined || value === null || value === "") continue;
    record[to] = { value: Array.isArray(value) ? value.map(String) : String(value) };
  }

  // 機器コード付与(既存JSと同じルール)
  applyDropdownCodeRule(record);

  // 管理番号で検索 → あれば更新、なければ作成
  const existing = await findRecords(
    SHIPPING_APP_ID,
    `${SHIPPING_MANAGEMENT_NO_FIELD} = "${managementNo}"`,
    ["$id"]
  );

  if (existing.length > 0) {
    const recordId = String(existing[0].$id?.value ?? "");
    // 管理番号自体は検索キーのため更新対象から外す
    const { [SHIPPING_MANAGEMENT_NO_FIELD]: _omit, ...rest } = record;
    await updateRecord(SHIPPING_APP_ID, recordId, rest);
    return { created: false, recordId };
  }

  const { recordId } = await registerRecord(SHIPPING_APP_ID, record);
  return { created: true, recordId };
}
