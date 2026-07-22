export const REQUEST_STATUSES = [
  "pending",
  "approved",
  "registered",
  "register_failed",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: "確認待ち",
  approved: "承認済み(登録処理中)",
  registered: "kintone登録完了",
  register_failed: "kintone登録失敗",
  rejected: "差戻し",
};

export type HistoryAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "kintone_registered"
  | "kintone_failed"
  | "numbered"
  | "shipping_synced"
  | "notified"
  | "notify_failed"
  | "email_sent"
  | "email_failed";

export const ACTION_LABELS: Record<HistoryAction, string> = {
  submitted: "申請",
  approved: "承認",
  rejected: "差戻し",
  kintone_registered: "kintone登録",
  kintone_failed: "kintone連携失敗",
  numbered: "管理番号採番",
  shipping_synced: "配送管理連携",
  notified: "LINE WORKS通知",
  notify_failed: "通知失敗",
  email_sent: "メール送信",
  email_failed: "メール送信失敗",
};

/** レンタル状況(てずくーる) */
export const RENTAL_STATUSES = ["already_renting", "new_rental"] as const;
export type RentalStatus = (typeof RENTAL_STATUSES)[number];
export const RENTAL_STATUS_LABELS: Record<RentalStatus, string> = {
  already_renting: "すでに借りている",
  new_rental: "これから新規で借りる",
};

/** レンタルプランマスタ */
export type RentalPlan = {
  id: string;
  name: string;
  description: string;
  sort_order: number;
  is_active: boolean;
};

export type FormType = {
  id: string;
  slug: string;
  name: string;
  kintone_app_id: number;
  field_mapping: Record<string, string>;
  parser_config: ParserConfig;
  notify_config: Record<string, unknown>;
  fmt_template: string;
  input_guide: string;
  notes: string;
  complete_message: string;
  display_order: number;
  version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RequestRow = {
  id: string;
  form_type_id: string;
  form_type_version: number;
  raw_text: string;
  parsed_data: Record<string, string>;
  status: RequestStatus;
  reject_reason: string | null;
  kintone_record_id: string | null;
  management_no: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RequestHistoryRow = {
  id: string;
  request_id: string;
  action: HistoryAction;
  actor: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

/** 申請画面に表示する選択UI(FMT貼り付けとは別の項目。選択値はFMT行として注入される) */
export type SelectFieldConfig = {
  /** FMTラベル(mappings の fmt_label と一致させる) */
  label: string;
  /** 選択肢(kintone側の選択肢と完全一致させる) */
  options: string[];
  /** 必須選択 */
  required?: boolean;
};

/** FMTパース定義(form_types.parser_config)。FMT確定後に拡張する */
export type ParserConfig = {
  /** ラベルと値の区切り文字(既定 ":"。全角「:」も常に許容) */
  separator?: string;
  /** 必須ラベル。欠落していると申請エラー */
  required_labels?: string[];
  /** 画面選択UI定義(例: てずくーるのレンタルプラン)。種別追加時もSQLだけで設定可能 */
  select_fields?: SelectFieldConfig[];
  /**
   * ブロック見出し(《配送》等)ごとの短縮ラベル→正規ラベル対応。
   * 見出し行(《で始まる行)以降、次の見出しまでの行に適用される
   */
  block_aliases?: Record<string, Record<string, string>>;
  /** ブロックに依らないラベルの別名→正規ラベル対応(例: 緊急時責任者氏名→責任者氏名) */
  label_aliases?: Record<string, string>;
};
