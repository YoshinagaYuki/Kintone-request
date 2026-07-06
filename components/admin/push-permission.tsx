"use client";

import { useEffect, useState } from "react";

/**
 * Web Push通知の許可バナー(管理画面)。
 *
 * ・初回(permission=default)のみ「通知を受け取りますか?」を表示
 * ・許可済みの場合はバナーを出さず、購読が無ければ自動で再購読(端末変更・購読失効対策)
 * ・「あとで」はこの端末では再表示しない(localStorage)
 * ・iPhone Safari は「ホーム画面に追加」したPWAでのみ通知が使える
 */

const DISMISS_KEY = "push-banner-dismissed";

/** VAPID公開鍵(base64url)→ ArrayBuffer(PushSubscriptionOptionsInit.applicationServerKey 互換) */
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  // TSのlibバージョン差異(Uint8Array<ArrayBufferLike>)の影響を受けないよう、
  // 明示的に ArrayBuffer を確保して返す
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}

async function subscribeAndRegister(): Promise<boolean> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) {
    console.warn("[push] NEXT_PUBLIC_VAPID_PUBLIC_KEY が未設定です");
    return false;
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidPublicKey),
    }));

  const res = await fetch("/api/admin/push-subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  return res.ok;
}

export function PushPermission() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return; // 非対応環境(iOS Safariの非PWA表示など)では何もしない
    }

    if (Notification.permission === "granted") {
      // 許可済み: 購読が消えていれば静かに再登録(UPSERT)
      subscribeAndRegister().catch(() => {});
      return;
    }

    if (
      Notification.permission === "default" &&
      !localStorage.getItem(DISMISS_KEY)
    ) {
      setVisible(true); // 初回のみバナー表示
    }
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setVisible(false);
        return;
      }
      const ok = await subscribeAndRegister();
      if (!ok) {
        setError("通知の登録に失敗しました。再読み込みして再度お試しください。");
        return;
      }
      setVisible(false);
    } catch {
      setError("通知の登録に失敗しました。再読み込みして再度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
      <div className="text-sm">
        <p className="font-semibold text-blue-900">通知を受け取りますか?</p>
        <p className="mt-0.5 text-blue-800">
          新しい申請が届いたとき、この端末へプッシュ通知でお知らせします。
        </p>
        {error && <p className="mt-1 text-red-600">{error}</p>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={enable}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {busy ? "設定中..." : "通知を受け取る"}
        </button>
        <button
          onClick={dismiss}
          disabled={busy}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          あとで
        </button>
      </div>
    </div>
  );
}
