/**
 * 配送管理(App11)への転記フィールド対応表(既存オールマイトJSの FIELDS_MAP 準拠・確定)。
 *
 * from: App10(オールマイト)のフィールドコード
 * to:   App11(配送管理)のフィールドコード
 */
export type ShippingFieldMapping = { from: string; to: string };

export const SHIPPING_FIELD_MAPPING: ShippingFieldMapping[] = [
  // レンタル機器(★App10側は④⑤でコードが逆転している点に注意。既存JS準拠)
  { from: "レンタル機材", to: "配送機器" },
  { from: "レンタル機材_0", to: "配送機器_0" },
  { from: "レンタル機材_1", to: "配送機器_1" },
  { from: "レンタル機材_3", to: "配送機器_2" },
  { from: "レンタル機材_2", to: "配送機器_3" },
  // 納品
  { from: "手配種別", to: "手配種別" },
  { from: "納品_日付", to: "納品_日付" },
  { from: "納品_住所", to: "納品_住所" },
  { from: "納品_担当者", to: "納品_担当者" },
  { from: "納品_電話番号", to: "納品_電話番号" },
  { from: "郵便番号", to: "郵便番号" },
  // 集荷
  { from: "集荷_手配種別", to: "集荷_手配種別" },
  { from: "集荷_日付", to: "集荷_日付" },
  { from: "集荷_住所", to: "集荷_住所" },
  { from: "集荷_担当者", to: "集荷_担当者" },
  { from: "集荷_電話番号", to: "集荷_電話番号" },
  { from: "郵便番号_0", to: "郵便番号_0" },
  // 連絡先・その他
  { from: "緊急連絡先", to: "緊急連絡先" },
  { from: "緊急連絡先_0", to: "緊急連絡先_0" },
  { from: "イベント実施場所", to: "イベント実施場所" },
  { from: "文字列__1行__0", to: "文字列__1行__0" },
  { from: "to_addr", to: "to_addr" },
  { from: "cc_addr", to: "cc_addr" },
  { from: "補足欄", to: "補足欄" },
];

/** App11側の管理番号フィールドコード */
export const SHIPPING_MANAGEMENT_NO_FIELD = "管理番号";

/**
 * 機器コード付与ルール(既存JSの applyDropdownCodeRule 準拠)。
 * App11の配送機器フィールドの値から機器コードを判定し、対応するドロップダウンへ設定する。
 */
export const EQUIPMENT_CODE_FIELDS: { equipmentField: string; codeField: string }[] = [
  { equipmentField: "配送機器", codeField: "ドロップダウン_7" },
  { equipmentField: "配送機器_0", codeField: "ドロップダウン_11" },
  { equipmentField: "配送機器_1", codeField: "ドロップダウン_10" },
  { equipmentField: "配送機器_2", codeField: "ドロップダウン_9" },
  { equipmentField: "配送機器_3", codeField: "ドロップダウン_8" },
];

/**
 * 機器名 → コードの判定ルール。
 * 上から順に判定するため、「ver.2」「v2」など長い名称を先に置くこと(既存JSと同じ挙動)。
 */
export const EQUIPMENT_CODE_RULES: { match: string; code: string }[] = [
  { match: "スティックキャッチ（大）", code: "STCB" },
  { match: "スティックキャッチ（小）", code: "STCS" },
  { match: "イライラスティックver.2", code: "IRS2" },
  { match: "イライラスティック", code: "IRS" },
  { match: "クレーンゲーム", code: "CLG" },
  { match: "あひるサンダーv2", code: "ATDv2" },
  { match: "あひるサンダー", code: "ATD" },
  { match: "JET Cola", code: "JTC" },
  { match: "てずくーる", code: "TZC" },
  { match: "シールLAB", code: "SLB" },
];

/** 機器名からコードを判定(完全一致 → 前方一致の順、ルール順を維持) */
export function resolveEquipmentCode(equipmentName: string): string | null {
  const name = equipmentName.trim();
  if (!name) return null;
  for (const rule of EQUIPMENT_CODE_RULES) {
    if (name === rule.match) return rule.code;
  }
  for (const rule of EQUIPMENT_CODE_RULES) {
    if (name.startsWith(rule.match)) return rule.code;
  }
  return null;
}
