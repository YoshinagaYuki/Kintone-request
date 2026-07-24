/**
 * てずくーる(App49)申請の構造化入力 → FMTテキスト生成。
 *
 * 【設計方針】申請UIを構造化フォームへ刷新しても、サーバー側の処理
 * (parseFmt → parsed_data → kintone mapper → 承認 → 通知 → 履歴)は一切変更しない。
 * そのため、フォームはここで定義する「正式なFMTラベル」でFMTテキストを組み立て、
 * 従来と同じ raw_text として送信する。ラベルは docs/kintone-mapping-tezukuru.md の
 * field_mapping の from ラベルと一致させること。
 *
 * ・空の項目は行を出力しない(任意項目は未入力なら送信されない)。
 * ・商品は「商品未選択 or 数量未入力」の行を出力しない(ペア成立行のみ)。
 * ・商品はスロット位置を保持する(詰めない)。画面の①〜⑩がそのまま
 *   kintoneのコンテンツ①〜⑩へ対応する(App49はスロット固有の選択肢制約があるため)。
 * ・担当者(弊社担当者)はFMTに含めない(入力者情報として別管理し、承認時に確定値を注入)。
 * ・レンタルプランはFMTに含めない(従来どおり select_fields としてサーバーで先頭注入)。
 */

/** 商品(コンテンツ)は最大10組 */
export const MAX_PRODUCTS = 10;

/** コンテンツN のFMTラベル(1→コンテンツ1) */
export function contentLabel(i: number): string {
  return `コンテンツ${i}`;
}
/** 数量N のFMTラベル(1→数量1) */
export function quantityLabel(i: number): string {
  return `数量${i}`;
}

export const FMT_LABELS = {
  agencyName: "取次店名",
  billingMonth: "◯月分として請求",
  shippingFee: "配送料",
  boothName: "イベントブース名",
  deliveryDate: "配送日付",
  deliveryPostal: "配送郵便番号",
  deliveryAddress: "配送住所",
  deliveryReceiver: "当日受領者氏名",
  deliveryContact: "配送連絡先",
  pickupDate: "集荷日付",
  pickupPostal: "集荷郵便番号",
  pickupAddress: "集荷住所",
  pickupHandover: "当日引渡者氏名",
  pickupContact: "集荷連絡先",
  slipTo: "to",
  slipCc: "cc",
  emergencyName: "責任者氏名",
  emergencyPhone: "責任者電話番号",
} as const;

export type ProductRow = { name: string; quantity: string };

export type TezukuruInput = {
  agencyName: string;
  boothName: string;
  billingMonth: string;
  shippingFee: string;
  products: ProductRow[];
  deliveryDate: string;
  deliveryPostal: string;
  deliveryAddress: string;
  deliveryReceiver: string;
  deliveryContact: string;
  pickupDate: string;
  pickupPostal: string;
  pickupAddress: string;
  pickupHandover: string;
  pickupContact: string;
  slipTo: string;
  slipCc: string;
  emergencyName: string;
  emergencyPhone: string;
};

/** 成立している(商品名・数量ともに入力された)商品行だけを返す */
export function validProducts(products: ProductRow[]): ProductRow[] {
  return products.filter((p) => p.name.trim() !== "" && p.quantity.trim() !== "");
}

/**
 * 構造化入力からFMTテキストを生成する。空の項目は行を出力しない。
 */
export function buildTezukuruFmt(input: TezukuruInput): string {
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) lines.push(`${label}: ${v}`);
  };

  push(FMT_LABELS.agencyName, input.agencyName);
  push(FMT_LABELS.billingMonth, input.billingMonth);
  push(FMT_LABELS.shippingFee, input.shippingFee);
  push(FMT_LABELS.boothName, input.boothName);

  // 商品(成立行のみ)。スロット位置を保持する(詰めない)。
  // 画面の i 番目 → コンテンツ(i+1)/数量(i+1) = kintoneスロット(i+1)。
  // App49はスロット固有の選択肢制約(例: シールは①のみ、粘土12色は④に無い)があるため、
  // 位置がずれると登録エラーになる。空行は出力しないが番号は詰めない。
  input.products.slice(0, MAX_PRODUCTS).forEach((p, idx) => {
    const name = (p.name ?? "").trim();
    const qty = (p.quantity ?? "").trim();
    if (!name || !qty) return; // ペア不成立行はスキップ(番号は詰めない)
    const n = idx + 1;
    push(contentLabel(n), name);
    push(quantityLabel(n), qty);
  });

  push(FMT_LABELS.deliveryDate, input.deliveryDate);
  push(FMT_LABELS.deliveryPostal, input.deliveryPostal);
  push(FMT_LABELS.deliveryAddress, input.deliveryAddress);
  push(FMT_LABELS.deliveryReceiver, input.deliveryReceiver);
  push(FMT_LABELS.deliveryContact, input.deliveryContact);

  push(FMT_LABELS.pickupDate, input.pickupDate);
  push(FMT_LABELS.pickupPostal, input.pickupPostal);
  push(FMT_LABELS.pickupAddress, input.pickupAddress);
  push(FMT_LABELS.pickupHandover, input.pickupHandover);
  push(FMT_LABELS.pickupContact, input.pickupContact);

  push(FMT_LABELS.slipTo, input.slipTo);
  push(FMT_LABELS.slipCc, input.slipCc);
  push(FMT_LABELS.emergencyName, input.emergencyName);
  push(FMT_LABELS.emergencyPhone, input.emergencyPhone);

  return lines.join("\n");
}
