import "server-only";

/**
 * LINE WORKS Bot 通知クライアント。
 *
 * Phase1では後回し(ユーザー指示)。承認フロー実装時もこのスタブを呼び、
 * 実装まで no-op とする。通知失敗が業務フローを止めない設計(system-design.md §6.2)。
 *
 * TODO: Service Account + JWT 認証でトークルームへメッセージ送信
 */
export async function notifyApproved(_params: {
  formTypeName: string;
  kintoneRecordId: string;
}): Promise<void> {
  // no-op(未実装)
  console.info("[lineworks] 通知は未実装のためスキップしました");
}
