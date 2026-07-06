/**
 * 共通通知モジュール(チャネル非依存)。
 *
 * ・通知方式は Notifier インターフェースで抽象化(Google Chat に依存しない)
 * ・方式の追加は notifiers 配列への登録のみ(例: LINE WORKS, メール等)
 * ・未設定(isConfigured=false)のチャネルはスキップ
 * ・送信失敗は呼び出し元へ伝播させず、ログのみ出力(申請保存を失敗させない)
 */

import { pushNotifier } from "./push";

/** 申請受付通知の内容 */
export type NewRequestNotification = {
  /** 申請種別名(例: オールマイト) */
  formTypeName: string;
  /** 取次店名 */
  agencyName: string;
  /** イベントブース名 */
  boothName: string;
  /** 配送日 */
  deliveryDate: string;
  /** 集荷日 */
  pickupDate: string;
  /** 管理画面URL(申請詳細) */
  adminUrl: string;
};

/** 通知チャネルの共通インターフェース */
export type Notifier = {
  /** チャネル名(ログ用) */
  name: string;
  /** 環境変数等が設定済みか(falseならスキップ) */
  isConfigured: () => boolean;
  /** 申請受付通知を送信 */
  sendNewRequest: (notification: NewRequestNotification) => Promise<void>;
};

/** 有効な通知チャネル一覧。方式追加(メール・LINE WORKS等)はここに登録するだけ */
const notifiers: Notifier[] = [pushNotifier];

/**
 * 申請受付を全チャネルへ通知する。
 * 失敗しても throw しない(ログのみ)。
 */
export async function notifyNewRequest(
  notification: NewRequestNotification
): Promise<void> {
  for (const notifier of notifiers) {
    if (!notifier.isConfigured()) {
      continue; // 未設定チャネルはスキップ
    }
    try {
      await notifier.sendNewRequest(notification);
    } catch (err) {
      console.error(
        `[notify] ${notifier.name} への通知に失敗しました:`,
        err instanceof Error ? err.message : err
      );
    }
  }
}
