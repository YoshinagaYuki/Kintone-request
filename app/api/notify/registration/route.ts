import { NextRequest, NextResponse } from "next/server";
import { getRecord } from "@/lib/kintone/client";
import { notificationFromKintoneRecord } from "@/lib/notify/kintone-record";
import { notifyRegistration, registrationDedupKey } from "@/lib/notify/registration";

/**
 * 共通通知サービスの外部入口(kintoneカスタマイズJSから呼ぶ)。
 *
 *   POST /api/notify/registration
 *   Header: x-notify-token: <NOTIFY_API_TOKEN>
 *   Body:   { "appId": 49, "recordId": "160" }   ← IDだけでよい
 *
 * ・**通知内容はサーバー側がkintoneレコードを取得して組み立てる**ため、
 *   申請システム経由の通知と本文が100%一致する(kintone JS側に整形ロジックを持たせない)
 * ・二重通知は dedup_key(kintone:<appId>:<recordId>)で防止
 */
export async function POST(req: NextRequest) {
  const expected = process.env.NOTIFY_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "通知APIが未設定です(NOTIFY_API_TOKEN)" },
      { status: 503 }
    );
  }
  if (req.headers.get("x-notify-token") !== expected) {
    return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
  }

  // 受け付けるのは appId / recordId のみ。
  // 通知本文にあたる値は一切受け取らない(本文生成は buildRegistrationMessage() のみ)
  let body: {
    appId?: number | string;
    recordId?: number | string;
    // 旧キーも許容
    kintoneAppId?: number | string;
    kintoneRecordId?: number | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const appId = body.appId ?? body.kintoneAppId;
  const recordId = body.recordId ?? body.kintoneRecordId;
  if (!appId || !recordId) {
    return NextResponse.json(
      { error: "appId / recordId は必須です" },
      { status: 400 }
    );
  }

  // kintoneから現在のレコードを取得して通知内容を生成(申請システム経由と同一ロジック)
  let notification;
  try {
    const { record } = await getRecord(Number(appId), String(recordId));
    notification = notificationFromKintoneRecord(record, appId, {
      recordId: String(recordId),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `kintoneレコードの取得に失敗しました: ${
          err instanceof Error ? err.message : "不明なエラー"
        }`,
      },
      { status: 502 }
    );
  }

  // 採番完了ガード: 管理番号が未設定 = 採番が完了していない、とみなし通知しない。
  // (呼び出し元の実装ミスで採番前に叩かれても、通知が飛ばないようサーバー側で担保する)
  if (!notification.managementNo || !String(notification.managementNo).trim()) {
    return NextResponse.json(
      {
        ok: false,
        notified: false,
        error: "管理番号が未採番のため通知しません(採番完了後に再送してください)",
      },
      { status: 409 }
    );
  }

  const result = await notifyRegistration(notification, {
    source: "kintone",
    dedupKey: registrationDedupKey(appId, String(recordId)),
  });

  return NextResponse.json({
    ok: true,
    skipped: result.skipped,
    results: result.results,
  });
}
