import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToAll } from "@/lib/notify/push";

/**
 * テスト通知の送信(管理者用)。
 * 申請通知と同じ経路(sendPushToAll)で全購読端末へ送り、診断統計を返す。
 */
export async function POST() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = await sendPushToAll({
    title: "📦 オールマイト",
    body: `テスト通知です。\n送信日時: ${new Date().toLocaleString("ja-JP")}`,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    image: "/icons/icon-512.png",
    tag: "request-test",
    renotify: true,
    requireInteraction: true,
    url: `${baseUrl}/admin/requests`,
  });

  return NextResponse.json(result);
}
