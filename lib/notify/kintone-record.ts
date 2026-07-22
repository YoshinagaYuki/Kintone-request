import "server-only";

import type { KintoneRawRecord } from "../kintone/client";
import type { RegistrationNotification } from "./registration";

/**
 * kintoneレコード → 通知内容(RegistrationNotification)への変換。
 *
 * **申請システム登録・kintone直接登録の両方がこの関数を通る**ため、
 * 通知本文は必ず同一になる(値の取得元も同じkintoneレコード)。
 *
 * アプリごとのフィールドコード差分のみここで吸収する。
 */

type AppFieldMap = {
  formTypeName: string;
  /** レンタルプラン(単一) */
  rentalPlanField?: string;
  /** 機器/コンテンツのスロット [名称フィールド, 数量フィールド?] */
  itemSlots: [string, string?][];
};

/** アプリID → フィールド構成 */
const APP_FIELD_MAPS: Record<string, AppFieldMap> = {
  // てずくーる(App49): レンタルプラン + コンテンツ1〜10(数量つき)
  "49": {
    formTypeName: "てずくーる",
    rentalPlanField: "レンタル機材",
    itemSlots: [
      ["コンテンツ", "数値"],
      ["コンテンツ_0", "数値_0"],
      ["コンテンツ_1", "数値_1"],
      ["コンテンツ_2", "数値_2"],
      ["コンテンツ_3", "数値_3"],
      ["コンテンツ_4", "数値_4"],
      ["コンテンツ_5", "数値_5"],
      ["コンテンツ_6", "数値_6"],
      ["コンテンツ_7", "数値_7"],
      ["コンテンツ_8", "数値_8"],
    ],
  },
  // オールマイト(App10): 機器商品①〜⑤(④⑤はコード逆転)
  "10": {
    formTypeName: "オールマイト",
    itemSlots: [
      ["レンタル機材"],
      ["レンタル機材_0"],
      ["レンタル機材_1"],
      ["レンタル機材_3"],
      ["レンタル機材_2"],
    ],
  },
};

/** 未知のアプリ用(共通フィールドのみ) */
const DEFAULT_MAP: AppFieldMap = { formTypeName: "kintone", itemSlots: [] };

const str = (record: KintoneRawRecord, code: string): string => {
  const v = record?.[code]?.value;
  if (v === null || v === undefined) return "";
  return Array.isArray(v) ? v.map(String).join("、") : String(v);
};

/** kintoneレコードから通知内容を組み立てる(両経路共通) */
export function notificationFromKintoneRecord(
  record: KintoneRawRecord,
  appId: number | string,
  overrides?: { formTypeName?: string; managementNo?: string | null; recordId?: string }
): RegistrationNotification {
  const map = APP_FIELD_MAPS[String(appId)] ?? DEFAULT_MAP;

  const contents = map.itemSlots
    .map(([nameField, qtyField]) => ({
      name: str(record, nameField),
      quantity: qtyField ? str(record, qtyField) : null,
    }))
    .filter((c) => c.name.trim().length > 0);

  return {
    formTypeName: overrides?.formTypeName ?? map.formTypeName,
    managementNo: overrides?.managementNo ?? str(record, "管理番号"),
    rentalPlan: map.rentalPlanField ? str(record, map.rentalPlanField) : null,
    agencyName: str(record, "文字列__1行__1"),
    staffName: str(record, "文字列__1行__0"),
    boothName: str(record, "イベント実施場所"),
    contents,
    delivery: {
      日付: str(record, "納品_日付"),
      郵便番号: str(record, "郵便番号"),
      住所: str(record, "納品_住所"),
      受領者氏名: str(record, "納品_担当者"),
      連絡先: str(record, "納品_電話番号"),
    },
    pickup: {
      日付: str(record, "集荷_日付"),
      郵便番号: str(record, "郵便番号_0"),
      住所: str(record, "集荷_住所"),
      当日引渡者氏名: str(record, "集荷_担当者"),
      連絡先: str(record, "集荷_電話番号"),
    },
    kintoneAppId: Number(appId),
    kintoneRecordId: overrides?.recordId ?? str(record, "レコード番号") ?? null,
  };
}
