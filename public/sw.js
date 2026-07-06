/**
 * Service Worker: Web Push通知の受信・表示・タップ遷移。
 * ペイロード: { title, body, url }
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    /* 不正なペイロードは既定値で表示 */
  }

  const title = data.title || "📦 オールマイト";
  const options = {
    body: data.body || "新しい申請があります",
    // ALLMIGHTアイコン(PWAアイコンと統一)。ペイロード指定があればそれを優先
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || data.icon || "/icons/icon-192.png",
    image: data.image || "/icons/icon-512.png",
    tag: data.tag || "request",
    renotify: data.renotify !== undefined ? data.renotify : true,
    requireInteraction:
      data.requireInteraction !== undefined ? data.requireInteraction : true,
    data: { url: data.url || "/admin/requests" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin/requests";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (_) {
              /* クロスオリジン等で失敗したら新規で開く */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
