import { contentLabel, quantityLabel, FMT_LABELS, MAX_PRODUCTS } from "../tezukuru-fmt";

/**
 * メール差込用「注文内容」ブロックの自動生成。
 *
 * parsed_data(FMTラベル→値)から、実際の申請内容を展開する。固定文字列は使わない。
 * ・弊社担当者は parsed_data ではなく確定値(承認時)/申請入力を別途渡す。
 * ・お客様からの要望は requests.customer_requests(parsed_data外)を別途渡す。
 * ・任意項目が空なら、その項目自体を出力しない。
 */
export type OrderDetailsInput = {
  parsedData: Record<string, string>;
  /** 弊社担当者(承認確定値 or 申請入力)。無ければ表示しない */
  staffName?: string | null;
  /** お客様からの要望(requests.customer_requests)。無ければ表示しない */
  customerRequests?: string | null;
};

function val(data: Record<string, string>, label: string): string {
  return (data[label] ?? "").trim();
}

/** 商品行「・{正式名称} × {数量}」を最大10組ぶん(スロット位置は保持) */
function productLines(data: Record<string, string>): string[] {
  const lines: string[] = [];
  for (let i = 1; i <= MAX_PRODUCTS; i++) {
    const name = val(data, contentLabel(i));
    if (!name) continue;
    const qty = val(data, quantityLabel(i));
    lines.push(qty ? `・${name} × ${qty}` : `・${name}`);
  }
  return lines;
}

/**
 * 注文内容ブロックを組み立てる(プレーンテキスト)。空項目は行を省略する。
 * 出力順は要望の項目順に従う。
 */
export function buildOrderDetails(input: OrderDetailsInput): string {
  const d = input.parsedData ?? {};
  const out: string[] = [];
  const add = (label: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) out.push(`${label}: ${v}`);
  };

  // 商品名・数量
  const products = productLines(d);
  if (products.length > 0) {
    out.push("【商品】");
    out.push(...products);
    out.push("");
  }

  // 基本情報
  add("取次店名", val(d, FMT_LABELS.agencyName));
  add("イベントブース名", val(d, FMT_LABELS.boothName));
  add("請求月", val(d, FMT_LABELS.billingMonth));
  add("配送料", val(d, FMT_LABELS.shippingFee));

  // 配送
  add("配送日", val(d, FMT_LABELS.deliveryDate));
  add("配送郵便番号", val(d, FMT_LABELS.deliveryPostal));
  add("配送住所", val(d, FMT_LABELS.deliveryAddress));
  add("配送受領者", val(d, FMT_LABELS.deliveryReceiver));
  add("配送連絡先", val(d, FMT_LABELS.deliveryContact));

  // 集荷
  add("集荷日", val(d, FMT_LABELS.pickupDate));
  add("集荷郵便番号", val(d, FMT_LABELS.pickupPostal));
  add("集荷住所", val(d, FMT_LABELS.pickupAddress));
  add("当日引渡者", val(d, FMT_LABELS.pickupHandover));
  add("集荷連絡先", val(d, FMT_LABELS.pickupContact));

  // 伝票番号連絡先
  add("伝票番号連絡先 To", val(d, FMT_LABELS.slipTo));
  add("伝票番号連絡先 CC", val(d, FMT_LABELS.slipCc));

  // 弊社担当者(確定値 or 申請入力)
  add("弊社担当者", input.staffName ?? "");

  // 緊急時責任者
  add("緊急時責任者", val(d, FMT_LABELS.emergencyName));
  add("緊急時責任者電話番号", val(d, FMT_LABELS.emergencyPhone));

  // お客様からの要望
  add("お客様からの要望", input.customerRequests ?? "");

  return out.join("\n").trim();
}
