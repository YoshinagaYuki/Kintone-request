/**
 * 新規申請の通知オーケストレーション。
 *
 * 第4段階で「事業別の振り分け」を導入:
 *   1) 事業別Push(担当事業一致 + 利用中 + Push通知ON の管理者端末のみ)
 *   2) 管理者メール(担当事業一致 + 利用中 + メール通知ON の管理者)
 *   3) 担当者メール(申請の担当者名が担当者マスターと完全一致・1件・公開中・通知ON・有効メール)
 *
 * ・各通知は独立して try/catch。失敗しても throw せず、申請受付は失敗させない(ログのみ)。
 * ・管理者/担当者メールには常時CCを付けない(mailer の skipAlwaysCc)。
 * ・Google Chat / LINE(登録完了通知)は別系統(notifyRegistration)で現状維持。
 */

import { sendPushToBusiness } from "./push";
import { sendAdminNewRequestMail } from "./admin-mail";
import { sendStaffNewRequestMail } from "./staff-mail";

/** 新規申請通知の内容 */
export type NewRequestNotification = {
  /** 申請事業(form_types.id)。通知振り分けのキー */
  formTypeId: string;
  /** 申請種別名(例: てずくーる) */
  formTypeName: string;
  /** 申請者名 */
  applicantName: string;
  /** 取次店名 */
  agencyName: string;
  /** イベントブース名 */
  boothName: string;
  /** 配送日 */
  deliveryDate: string;
  /** 集荷日 */
  pickupDate: string;
  /** 申請日時(ISO) */
  submittedAt: string;
  /** 管理画面URL(申請詳細) */
  adminUrl: string;
  /** 弊社担当者(申請入力の原文。担当者マスターとの完全一致判定に使用) */
  staffNameInput: string;
};

/** 通知チャネルの共通インターフェース(後方互換のため型は保持) */
export type Notifier = {
  name: string;
  isConfigured: () => boolean;
  sendNewRequest: (notification: NewRequestNotification) => Promise<void>;
};

function pushUrl(adminUrl: string): string {
  // 通知タップで該当申請(詳細)を開く。URLが不正なら申請一覧へ。
  try {
    // 絶対URLならそのまま使用
    new URL(adminUrl);
    return adminUrl;
  } catch {
    return "/admin/requests";
  }
}

/**
 * 新規申請を事業別に通知する。失敗しても throw しない(ログのみ)。
 */
export async function notifyNewRequest(n: NewRequestNotification): Promise<void> {
  // 1) 事業別Push
  try {
    await sendPushToBusiness(n.formTypeId, {
      title: `【${n.formTypeName}】新規申請`,
      body:
        [n.agencyName, n.boothName].filter((v) => v && v.trim()).join(" / ") ||
        "新しい申請があります",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      image: "/icons/icon-512.png",
      tag: "request",
      renotify: true,
      requireInteraction: true,
      url: pushUrl(n.adminUrl),
    });
  } catch (err) {
    console.error("[notify] 事業別Pushに失敗しました:", err instanceof Error ? err.message : err);
  }

  // 2) 管理者メール(事業別)
  try {
    await sendAdminNewRequestMail(n);
  } catch (err) {
    console.error("[notify] 管理者メールに失敗しました:", err instanceof Error ? err.message : err);
  }

  // 3) 担当者メール(完全一致1件)
  try {
    await sendStaffNewRequestMail(n);
  } catch (err) {
    console.error("[notify] 担当者メールに失敗しました:", err instanceof Error ? err.message : err);
  }
}
