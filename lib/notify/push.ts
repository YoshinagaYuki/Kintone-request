/**
 * Web Push(PWA)通知チャネル。
 *
 * ・購読情報は push_subscriptions テーブル(通知を許可した管理者の端末のみ)
 * ・VAPID鍵未設定時は送信をスキップ(ログに明示)
 * ・失効した購読(HTTP 404/410)は自動削除
 * ・送信失敗しても throw しない(申請保存に影響させない)
 * ・診断用に 開始/購読件数/成功/失敗 をログ出力し、統計を返す
 */

import webpush from "web-push";
import { createAdminClient } from "../supabase/admin";
import type { Notifier, NewRequestNotification } from "./notify";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  /** 通知アイコン(未指定時はSW側の既定アイコン) */
  icon?: string;
  /** バッジアイコン(未指定時はSW側の既定アイコン) */
  badge?: string;
  /** 大きい画像(Androidのビッグピクチャー表示) */
  image?: string;
  /** 通知のグルーピングタグ */
  tag?: string;
  /** 同一tagでも再通知するか */
  renotify?: boolean;
  /** ユーザーが操作するまで通知を残すか */
  requireInteraction?: boolean;
};

export type PushSendResult = {
  /** VAPID鍵が設定されているか */
  configured: boolean;
  /** 購読件数 */
  subscriptions: number;
  /** 送信成功件数 */
  sent: number;
  /** 送信失敗件数(失効削除を除く) */
  failed: number;
  /** 失効により削除した購読件数 */
  removed: number;
};

type PushSubscriptionRow = { id: string; endpoint: string; p256dh: string; auth: string };

const emptyResult = (): PushSendResult => ({
  configured: false,
  subscriptions: 0,
  sent: 0,
  failed: 0,
  removed: 0,
});

/**
 * 購読配列へ実際に配信して統計を返す(共通処理)。VAPID未設定・0件でも throw せず統計を返す。
 */
async function deliverPush(
  subscriptions: PushSubscriptionRow[],
  payload: PushPayload,
  label: string
): Promise<PushSendResult> {
  const result = emptyResult();
  console.info("[push] 通知送信を開始します:", label, payload.title);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn(
      "[push] VAPID鍵が未設定のため送信をスキップしました" +
        "(NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を .env.local に設定してください)"
    );
    return result;
  }
  result.configured = true;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    publicKey,
    privateKey
  );

  result.subscriptions = subscriptions.length;
  console.info(`[push] 対象購読件数: ${subscriptions.length}件 (${label})`);
  if (subscriptions.length === 0) return result;

  const body = JSON.stringify(payload);
  const supabase = createAdminClient();

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body
        );
        result.sent++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // 失効した購読は削除(端末側で解除された等)
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          result.removed++;
          console.warn(`[push] 失効した購読を削除しました (HTTP ${statusCode})`);
        } else {
          result.failed++;
          console.error(
            "[push] 送信失敗:",
            statusCode ? `HTTP ${statusCode}` : "",
            err instanceof Error ? err.message : err
          );
        }
      }
    })
  );

  console.info(
    `[push] 送信結果: 成功 ${result.sent}件 / 失敗 ${result.failed}件 / 失効削除 ${result.removed}件`
  );
  return result;
}

/**
 * 全購読端末へPush通知を送る(手動テスト通知用)。throw せず、必ず統計を返す。
 */
export async function sendPushToAll(payload: PushPayload): Promise<PushSendResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (error) throw new Error(error.message);
    return await deliverPush(data ?? [], payload, "全員");
  } catch (err) {
    console.error(
      "[push] 購読情報の取得に失敗しました:",
      err instanceof Error ? err.message : err
    );
    return emptyResult();
  }
}

/**
 * 指定事業(form_type_id)の担当管理者のうち、【利用中かつPush通知ON】の端末のみへ送る。
 *   admin_user_businesses(担当事業) ⋈ admin_users(status=active, push_notify_enabled=true)
 *     ⋈ push_subscriptions(user_id=auth_user_id)
 * ・該当0件・DB設定不備でも「全員送信フォールバックはしない」(0件で返す+ログ)。
 * ・throw せず、必ず統計を返す。
 */
export async function sendPushToBusiness(
  formTypeId: string,
  payload: PushPayload
): Promise<PushSendResult> {
  if (!formTypeId) {
    console.warn("[push] form_type_id が空のため事業別Push送信をスキップしました");
    return emptyResult();
  }
  try {
    const supabase = createAdminClient();

    // 1) 当該事業の担当管理者
    const { data: biz, error: e1 } = await supabase
      .from("admin_user_businesses")
      .select("admin_user_id")
      .eq("form_type_id", formTypeId);
    if (e1) throw new Error(e1.message);
    const adminIds = Array.from(new Set((biz ?? []).map((r) => r.admin_user_id as string)));
    if (adminIds.length === 0) {
      console.info("[push] 事業別: 担当管理者が0件のため送信しません");
      return emptyResult();
    }

    // 2) 利用中 + Push通知ON の管理者の auth_user_id
    const { data: admins, error: e2 } = await supabase
      .from("admin_users")
      .select("auth_user_id")
      .in("id", adminIds)
      .eq("status", "active")
      .eq("push_notify_enabled", true);
    if (e2) throw new Error(e2.message);
    const authIds = Array.from(new Set((admins ?? []).map((a) => a.auth_user_id as string)));
    if (authIds.length === 0) {
      console.info("[push] 事業別: 対象(利用中+Push ON)管理者が0件のため送信しません");
      return emptyResult();
    }

    // 3) 対象管理者の購読端末
    const { data: subs, error: e3 } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", authIds);
    if (e3) throw new Error(e3.message);

    return await deliverPush(subs ?? [], payload, `事業別(${formTypeId})`);
  } catch (err) {
    console.error(
      "[push] 事業別Push送信に失敗しました:",
      err instanceof Error ? err.message : err
    );
    return emptyResult();
  }
}

export const pushNotifier: Notifier = {
  name: "web-push",

  // スキップ判定とログは sendPushToAll 側で行う(未設定でも必ずログを残すため)
  isConfigured() {
    return true;
  },

  async sendNewRequest(n: NewRequestNotification) {
    // 通知クリックで管理画面(申請一覧)を開く
    let url = "/admin/requests";
    try {
      url = `${new URL(n.adminUrl).origin}/admin/requests`;
    } catch {
      /* adminUrlが相対等の場合は既定値のまま */
    }

    // ALLMIGHTアイコンで統一(PWAアイコンと同一。2026-07-06仕様)
    await sendPushToAll({
      title: "📦 オールマイト",
      body: "新しい申請があります",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      image: "/icons/icon-512.png",
      tag: "request",
      renotify: true,
      requireInteraction: true,
      url,
    });
  },
};
