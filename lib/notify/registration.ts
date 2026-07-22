import "server-only";

import { createAdminClient } from "../supabase/admin";

/**
 * 共通通知サービス(登録完了通知)。
 *
 *   kintone直接登録 ─┐
 *                    ├→ notifyRegistration() ─┬→ Google Chat(Webhook)
 *   申請システム登録 ─┘                        └→ LINE(既存GAS経由)
 *
 * ・どちらの経路からでも必ずこの関数を通す(kintone側は /api/notify/registration を呼ぶ)
 * ・二重通知防止: notification_logs.dedup_key(kintoneレコード単位)でユニーク制御
 * ・通知失敗は呼び出し元の処理(kintone登録・配送管理連携)を失敗させない
 * ・Webhook URLはコードに書かず環境変数から取得する
 */

export type RegistrationNotification = {
  /** 種別名(例: てずくーる) */
  formTypeName: string;
  managementNo?: string | null;
  rentalPlan?: string | null;
  agencyName?: string | null;
  staffName?: string | null;
  boothName?: string | null;
  /** コンテンツ(名称/数量) */
  contents?: { name: string; quantity?: string | null }[];
  /** 配送ブロック(ラベル→値) */
  delivery?: Record<string, string | null | undefined>;
  /** 集荷ブロック(ラベル→値) */
  pickup?: Record<string, string | null | undefined>;
  kintoneAppId?: number | null;
  kintoneRecordId?: string | null;
};

export type ChannelResult = { channel: string; ok: boolean; error?: string };

export type NotifyRegistrationResult = {
  /** 既に通知済みでスキップした場合 true */
  skipped: boolean;
  results: ChannelResult[];
  message: string;
};

const has = (v: string | null | undefined): v is string =>
  typeof v === "string" && v.trim().length > 0;

/** 入力されている項目だけを並べた通知本文を作る(Chat/LINE共通) */
export function buildRegistrationMessage(n: RegistrationNotification): string {
  const lines: string[] = [`【${n.formTypeName} 新規登録】`];

  const push = (label: string, value: string | null | undefined) => {
    if (has(value)) lines.push(`${label}：${value.trim()}`);
  };

  push("管理番号", n.managementNo);
  push("レンタルプラン", n.rentalPlan);
  push("取次店名", n.agencyName);
  push("担当者", n.staffName);
  push("イベントブース名", n.boothName);

  const contents = (n.contents ?? []).filter((c) => has(c?.name));
  if (contents.length > 0) {
    lines.push("", "■コンテンツ");
    for (const c of contents) {
      lines.push(has(c.quantity) ? `・${c.name}：${c.quantity}` : `・${c.name}`);
    }
  }

  const block = (title: string, data?: Record<string, string | null | undefined>) => {
    const entries = Object.entries(data ?? {}).filter(([, v]) => has(v));
    if (entries.length === 0) return;
    lines.push("", title);
    for (const [k, v] of entries) lines.push(`${k}：${String(v).trim()}`);
  };
  block("■配送", n.delivery);
  block("■集荷", n.pickup);

  return lines.join("\n");
}

/** Google Chat(Incoming Webhook) */
async function sendGoogleChat(message: string): Promise<ChannelResult | null> {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!url) return null; // 未設定はスキップ
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text: message }),
    });
    if (!res.ok) {
      return { channel: "Google Chat通知", ok: false, error: `HTTP ${res.status}` };
    }
    return { channel: "Google Chat通知", ok: true };
  } catch (err) {
    return {
      channel: "Google Chat通知",
      ok: false,
      error: err instanceof Error ? err.message : "不明なエラー",
    };
  }
}

/**
 * LINE(既存の Google Apps Script Webアプリ経由)。
 * 既存GASのLINEグループ通知をそのまま流用する。
 * GAS側は { text } または { message } を受け取り LINE へ push する想定。
 * 認証が必要な場合は LINE_GAS_TOKEN を送る(GAS側でトークン照合)。
 */
async function sendLine(message: string): Promise<ChannelResult | null> {
  const url = process.env.LINE_GAS_WEBHOOK_URL;
  if (!url) return null; // 未設定はスキップ
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        message, // GAS側の実装差異に備え両方のキーで送る
        token: process.env.LINE_GAS_TOKEN ?? undefined,
      }),
    });
    if (!res.ok) {
      return { channel: "LINE通知", ok: false, error: `HTTP ${res.status}` };
    }
    return { channel: "LINE通知", ok: true };
  } catch (err) {
    return {
      channel: "LINE通知",
      ok: false,
      error: err instanceof Error ? err.message : "不明なエラー",
    };
  }
}

/**
 * 登録完了を Google Chat / LINE へ通知する(共通入口)。
 * throw しない。二重通知は dedup_key で防止する。
 */
export async function notifyRegistration(
  notification: RegistrationNotification,
  options: { source: "app" | "kintone"; dedupKey: string }
): Promise<NotifyRegistrationResult> {
  const message = buildRegistrationMessage(notification);
  const supabase = createAdminClient();

  // 二重通知防止: 同一 dedup_key の記録があれば送信しない
  try {
    const { data: existing } = await supabase
      .from("notification_logs")
      .select("id, channel_results")
      .eq("dedup_key", options.dedupKey)
      .maybeSingle();
    if (existing) {
      console.info("[notify] 送信済みのためスキップしました:", options.dedupKey);
      return {
        skipped: true,
        results: (existing.channel_results ?? []) as ChannelResult[],
        message,
      };
    }
  } catch (err) {
    console.error("[notify] 送信済み確認に失敗:", err);
  }

  const results = (
    await Promise.all([sendGoogleChat(message), sendLine(message)])
  ).filter((r): r is ChannelResult => r !== null);

  if (results.length === 0) {
    console.warn(
      "[notify] 通知チャネルが未設定です(GOOGLE_CHAT_WEBHOOK_URL / LINE_GAS_WEBHOOK_URL)"
    );
  }

  // 送信ログ(dedup_key ユニーク。競合時は既に送信済みとみなす)
  try {
    await supabase.from("notification_logs").insert({
      dedup_key: options.dedupKey,
      source: options.source,
      kintone_app_id: notification.kintoneAppId ?? null,
      kintone_record_id: notification.kintoneRecordId ?? null,
      management_no: notification.managementNo ?? null,
      form_type_name: notification.formTypeName,
      message,
      channel_results: results,
    });
  } catch (err) {
    console.error("[notify] 送信ログの保存に失敗:", err);
  }

  return { skipped: false, results, message };
}

/** kintoneレコード単位の二重通知防止キー */
export function registrationDedupKey(
  appId: number | string,
  recordId: number | string
): string {
  return `kintone:${appId}:${recordId}`;
}
