import { contentLabel, quantityLabel, FMT_LABELS, MAX_PRODUCTS } from "../tezukuru-fmt";
import { equipmentLabel, ALLMIGHT_MAX_EQUIPMENT, ALLMIGHT_FMT_LABELS } from "../allmight-fmt";
import { formatPhoneNumber } from "../phone";

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
  /** 料金区分(てずくーる承認時)。'paid'|'free'|null。null は表示しない */
  billingType?: string | null;
  /** 事業判定(kintone_app_id)。10=オールマイト / 49=てずくーる。未指定・不明はてずくーる扱い */
  kintoneAppId?: number | null;
};

function val(data: Record<string, string>, label: string): string {
  return (data[label] ?? "").trim();
}

/**
 * 商品行を返す。
 * ・てずくーる(49/不明): コンテンツ①〜⑩ × 数量①〜⑩(スロット位置保持・従来どおり)。
 * ・オールマイト(10): 機器商品①〜⑤(数量なし)。空欄はスキップ。数量補完なし。重複排除しない。
 */
function productLines(data: Record<string, string>, isAllmight: boolean): string[] {
  const lines: string[] = [];
  if (isAllmight) {
    for (let i = 1; i <= ALLMIGHT_MAX_EQUIPMENT; i++) {
      const name = val(data, equipmentLabel(i));
      if (!name) continue; // 空欄はスキップ。数量は補完しない。重複もそのまま。
      lines.push(`・${name}`);
    }
    return lines;
  }
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
  // 事業判定: 10=オールマイトのみ true。不明なIDをオールマイトと誤判定しない(=てずくーる扱い)。
  const isAllmight = input.kintoneAppId === 10;
  const out: string[] = [];
  const add = (label: string, value: string) => {
    const v = (value ?? "").trim();
    if (v) out.push(`${label}: ${v}`);
  };

  // 商品名(・数量)
  const products = productLines(d, isAllmight);
  if (products.length > 0) {
    out.push("【商品】");
    out.push(...products);
    out.push("");
  }

  // 基本情報
  add("取次店名", val(d, FMT_LABELS.agencyName));
  add("イベントブース名", val(d, FMT_LABELS.boothName));
  add("請求月", val(d, FMT_LABELS.billingMonth));
  // 配送料ラベルは事業別(てずくーる=「配送料」/ オールマイト=「内）配送料」)
  add("配送料", val(d, isAllmight ? ALLMIGHT_FMT_LABELS.shippingFee : FMT_LABELS.shippingFee));

  // 配送
  add("配送日", val(d, FMT_LABELS.deliveryDate));
  add("配送郵便番号", val(d, FMT_LABELS.deliveryPostal));
  add("配送住所", val(d, FMT_LABELS.deliveryAddress));
  add("配送受領者", val(d, FMT_LABELS.deliveryReceiver));
  add("配送連絡先", formatPhoneNumber(val(d, FMT_LABELS.deliveryContact), val(d, FMT_LABELS.deliveryAddress)));

  // 集荷
  add("集荷日", val(d, FMT_LABELS.pickupDate));
  add("集荷郵便番号", val(d, FMT_LABELS.pickupPostal));
  add("集荷住所", val(d, FMT_LABELS.pickupAddress));
  add("当日引渡者", val(d, FMT_LABELS.pickupHandover));
  add("集荷連絡先", formatPhoneNumber(val(d, FMT_LABELS.pickupContact), val(d, FMT_LABELS.pickupAddress)));

  // 伝票番号連絡先
  add("伝票番号連絡先 To", val(d, FMT_LABELS.slipTo));
  add("伝票番号連絡先 CC", val(d, FMT_LABELS.slipCc));

  // 弊社担当者(確定値 or 申請入力)
  add("弊社担当者", input.staffName ?? "");

  // 緊急時責任者
  add("緊急時責任者", val(d, FMT_LABELS.emergencyName));
  add("緊急時責任者電話番号", formatPhoneNumber(val(d, FMT_LABELS.emergencyPhone), val(d, FMT_LABELS.deliveryAddress)));

  // 料金区分(てずくーる承認時。有償/無償)
  if (input.billingType === "paid") add("料金区分", "有償");
  else if (input.billingType === "free") add("料金区分", "無償");

  // SNS宣伝(てずくーる。希望する/希望しない)
  add("SNS宣伝", val(d, FMT_LABELS.snsPromotion));

  // お客様からの要望
  add("お客様からの要望", input.customerRequests ?? "");

  return out.join("\n").trim();
}
