/**
 * オールマイト(App10)申請の構造化入力 → FMTテキスト生成。
 *
 * 【設計方針】てずくーる同様、専用フォームの入力を「正式なFMTラベル」でFMTへ組み立てて
 * /api/requests へ送る。kintoneフィールドコードへの変換は、承認時に form_types(App10) の
 * field_mapping(DB登録済み)に従って buildKintoneRecord が行うため、ここでは
 * fmt_label(ラベル)さえ正しければよい(コードは推測しない)。
 *
 * ・ここで使うラベルは「確定済み」の fmt_label のみ。
 * ・機器商品④/⑤ の kintoneコード逆転(レンタル機材_3/_2)は DB field_mapping 側で解決される。
 * ・金額・利用金額・利用日数は申請者から受け取らない(利用日数/利用金額はサーバー側計算)。
 * ・担当者(弊社担当者)は入力者情報として別入力し、承認時に確定値を parsed_data["担当者"] へ注入する。
 * ・空の項目は行を出力しない。
 *
 * 【共通ラベルの再利用】請求月・配送/集荷の郵便番号・受領者/引渡者・連絡先・伝票 to/cc・
 * 緊急時責任者は、てずくーると同じ正規ラベル(FMT_LABELS)を使う(表記の一本化)。
 * ただし住所は オールマイト既存の「配送先住所 / 集荷先住所」を維持する(App10 field_mapping 既定)。
 */

import { FMT_LABELS as SHARED } from "./tezukuru-fmt";

/** 機器商品は最大5枠 */
export const ALLMIGHT_MAX_EQUIPMENT = 5;

const CIRCLED = ["①", "②", "③", "④", "⑤"] as const;

/** 機器商品N の確定FMTラベル(1→機器商品①)。field_mappingのfmt_labelと一致させる */
export function equipmentLabel(i: number): string {
  return `機器商品${CIRCLED[i - 1] ?? ""}`;
}

/** 確定済み fmt_label(DBの field_mapping と一致) */
export const ALLMIGHT_FMT_LABELS = {
  // 画面表示は「イベントブース」。FMT では App10 field_mapping の fmt_label「イベントブース名」
  // (→ kintone コード「イベント実施場所」)へ確実に反映させるため、両ラベルで出力する。
  eventBooth: "イベントブース",
  eventBoothName: "イベントブース名",
  agencyName: "取次店名",
  usageStart: "利用開始日",
  usageEnd: "利用最終日",
  // 配送料(任意)。App10 field_mapping の fmt_label「内）配送料」= 配送費(NUMBER)に一致させる
  shippingFee: "内）配送料",
  deliveryDate: "配送日付",
  pickupDate: "集荷日付",
  // FMTラベルは App10 field_mapping の fmt_label に一致させる(「配送住所 / 集荷住所」)。
  // 申請フォームの画面表示ラベルは「配送先住所 / 集荷先住所」のままでよい(表示とFMTは分離)。
  deliveryAddress: "配送住所",
  pickupAddress: "集荷住所",
  // --- 以下は てずくーると共通の正規ラベルを使用(表記統一) ---
  billingMonth: SHARED.billingMonth, // 「◯月分として請求」
  deliveryPostal: SHARED.deliveryPostal, // 「配送郵便番号」
  deliveryReceiver: SHARED.deliveryReceiver, // 「当日受領者氏名」
  deliveryContact: SHARED.deliveryContact, // 「配送連絡先」
  pickupPostal: SHARED.pickupPostal, // 「集荷郵便番号」
  pickupHandover: SHARED.pickupHandover, // 「当日引渡者氏名」
  pickupContact: SHARED.pickupContact, // 「集荷連絡先」
  slipTo: SHARED.slipTo, // 「to」
  slipCc: SHARED.slipCc, // 「cc」
  emergencyName: SHARED.emergencyName, // 「責任者氏名」
  emergencyPhone: SHARED.emergencyPhone, // 「責任者電話番号」
} as const;

export type AllmightInput = {
  /** 機器商品(正式名称。最大5件。空は送らない) */
  equipments: string[];
  eventBooth: string;
  agencyName: string;
  /** ◯月分として請求(例「7月分」)。翌月請求変換は App10 field_mapping の transform で行う */
  billingMonth: string;
  /** 配送料(任意・数値。空なら行を出力しない)。kintone 配送費(NUMBER)へ登録 */
  shippingFee: string;
  usageStart: string; // 利用開始日 YYYY-MM-DD
  usageEnd: string; // 利用最終日 YYYY-MM-DD
  deliveryDate: string; // 配送日付
  deliveryPostal: string; // 配送郵便番号
  deliveryAddress: string; // 配送先住所
  deliveryReceiver: string; // 当日受領者氏名
  deliveryContact: string; // 配送連絡先
  pickupDate: string; // 集荷日付
  pickupPostal: string; // 集荷郵便番号
  pickupAddress: string; // 集荷先住所
  pickupHandover: string; // 当日引渡者氏名(集荷の受領者氏名)
  pickupContact: string; // 集荷連絡先
  slipTo: string; // 伝票番号連絡先 to(任意)
  slipCc: string; // 伝票番号連絡先 cc(任意)
  emergencyName: string; // 緊急時責任者 氏名(任意)
  emergencyPhone: string; // 緊急時責任者 電話番号(任意)
};

/** 入力済み(空でない)機器のみを返す */
export function validEquipments(equipments: string[]): string[] {
  return equipments.map((e) => (e ?? "").trim()).filter((e) => e !== "");
}

/**
 * 構造化入力からFMTテキストを生成する。空項目は行を出力しない。
 * 機器は詰めて 機器商品①..⑤ を割り当てる(App10は各枠が独立ドロップダウンでスロット固有制約なし)。
 */
export function buildAllmightFmt(input: AllmightInput): string {
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) lines.push(`${label}: ${v}`);
  };

  const items = validEquipments(input.equipments).slice(0, ALLMIGHT_MAX_EQUIPMENT);
  items.forEach((name, idx) => push(equipmentLabel(idx + 1), name));

  push(ALLMIGHT_FMT_LABELS.agencyName, input.agencyName);
  // ブースは両ラベルで出力(field_mapping がどちらの fmt_label でも kintone へ反映されるように)。
  // どちらも同じ「イベント実施場所」コードへ対応するため、登録値は1つに収束する。
  push(ALLMIGHT_FMT_LABELS.eventBooth, input.eventBooth);
  push(ALLMIGHT_FMT_LABELS.eventBoothName, input.eventBooth);
  push(ALLMIGHT_FMT_LABELS.billingMonth, input.billingMonth);
  push(ALLMIGHT_FMT_LABELS.shippingFee, input.shippingFee);
  push(ALLMIGHT_FMT_LABELS.usageStart, input.usageStart);
  push(ALLMIGHT_FMT_LABELS.usageEnd, input.usageEnd);

  // 配送ブロック
  push(ALLMIGHT_FMT_LABELS.deliveryDate, input.deliveryDate);
  push(ALLMIGHT_FMT_LABELS.deliveryPostal, input.deliveryPostal);
  push(ALLMIGHT_FMT_LABELS.deliveryAddress, input.deliveryAddress);
  push(ALLMIGHT_FMT_LABELS.deliveryReceiver, input.deliveryReceiver);
  // 電話番号は自動整形せず入力値をそのまま保持する(0800 等のハイフン位置を変えない)
  push(ALLMIGHT_FMT_LABELS.deliveryContact, input.deliveryContact);

  // 集荷ブロック
  push(ALLMIGHT_FMT_LABELS.pickupDate, input.pickupDate);
  push(ALLMIGHT_FMT_LABELS.pickupPostal, input.pickupPostal);
  push(ALLMIGHT_FMT_LABELS.pickupAddress, input.pickupAddress);
  push(ALLMIGHT_FMT_LABELS.pickupHandover, input.pickupHandover);
  push(ALLMIGHT_FMT_LABELS.pickupContact, input.pickupContact);

  // 伝票番号連絡先(任意)
  push(ALLMIGHT_FMT_LABELS.slipTo, input.slipTo);
  push(ALLMIGHT_FMT_LABELS.slipCc, input.slipCc);

  // 緊急時責任者(任意)
  push(ALLMIGHT_FMT_LABELS.emergencyName, input.emergencyName);
  push(ALLMIGHT_FMT_LABELS.emergencyPhone, input.emergencyPhone);

  return lines.join("\n");
}
