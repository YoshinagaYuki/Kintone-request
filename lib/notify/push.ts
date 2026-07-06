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

/**
 * 全購読端末へPush通知を送る(申請通知・テスト通知の共通処理)。
 * throw せず、必ず統計を返す。
 */
export async function sendPushToAll(payload: PushPayload): Promise<PushSendResult> {
  const result: PushSendResult = {
    configured: false,
    subscriptions: 0,
    sent: 0,
    failed: 0,
    removed: 0,
  };

  console.info("[push] 通知送信を開始します:", payload.title);

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

  let subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[];
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth");
    if (error) throw new Error(error.message);
    subscriptions = data ?? [];
  } catch (err) {
    console.error(
      "[push] 購読情報の取得に失敗しました:",
      err instanceof Error ? err.message : err
    );
    return result;
  }

  result.subscriptions = subscriptions.length;
  console.info(`[push] 購読件数: ${subscriptions.length}件`);

  if (subscriptions.length === 0) {
    console.warn(
      "[push] 購読が0件です。管理画面で「通知を受け取る」を許可した端末があるか確認してください"
    );
    return result;
  }

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

export const pushNotifier: Notifier = {
  name: "web-push",

  // スキップ判定とログは sendPushToAll 側で行う(未設定でも必ずログを残すため)
  isConfigured() {
    return true;
  },

  async sendNewRequest(n: NewRequestNotification) {
    const value = (v: string) => (v && v.trim() ? v : "-");

    // 種別ごとに通知の見た目を切り替える(通知を見ただけで種別が分かるように)
    const isAllmight = n.formTypeName === "オールマイト";
    const title = isAllmight
      ? "📦 オールマイト 新規申請"
      : "🎨 てずくーる 新規申請";
    const icon = isAllmight
      ? "/icons/allmight-icon.png"
      : "/icons/tezukuru-icon.png";

    await sendPushToAll({
      title,
      body: [
        `取次店：${value(n.agencyName)}`,
        `会場：${value(n.boothName)}`,
        `納品：${value(n.deliveryDate)}`,
      ].join("\n"),
      icon,
      badge: icon,
      // タップで申請詳細(/admin/requests/{id})を開く
      url: n.adminUrl,
    });
  },
};
