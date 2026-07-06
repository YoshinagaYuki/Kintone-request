/**
 * kintone REST API クライアント。
 *
 * サーバーサイド専用(Route Handler / スクリプト)。クライアントコンポーネントから
 * import しないこと。tsxスクリプトからも使うため "server-only" は付けていない。
 *
 * 認証: 保有するAPIトークン(App10/App50/App11)をカンマ結合で送信(kintone仕様: 最大9個)。
 * 注意: APIトークンをログ・エラーメッセージに含めないこと。
 */

import type { KintoneRecord } from "./mapper";

export class KintoneApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "KintoneApiError";
    this.status = status;
    this.code = code;
  }
}

/** revision不一致(楽観ロック競合)かどうか */
export function isRevisionConflict(err: unknown): boolean {
  return err instanceof KintoneApiError && err.status === 409;
}

function getKintoneEnv(): { domain: string; apiTokens: string } {
  const domain = (process.env.KINTONE_DOMAIN ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  const apiTokens = [
    process.env.KINTONE_API_TOKEN,
    process.env.KINTONE_API_TOKEN_APP50,
    process.env.KINTONE_API_TOKEN_APP11,
    process.env.KINTONE_API_TOKEN_APP49,
  ]
    .filter(Boolean)
    .join(",");
  if (!domain || !apiTokens) {
    throw new Error(
      "KINTONE_DOMAIN / KINTONE_API_TOKEN が設定されていません(.env.local を確認してください)"
    );
  }
  return { domain, apiTokens };
}

async function kintoneApi<T>(
  method: "GET" | "POST" | "PUT",
  path: string,
  payload: Record<string, unknown>
): Promise<T> {
  const { domain, apiTokens } = getKintoneEnv();

  let url = `https://${domain}${path}`;
  const init: RequestInit = {
    method,
    headers: { "X-Cybozu-API-Token": apiTokens },
  };

  if (method === "GET") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        value.forEach((v, i) => params.set(`${key}[${i}]`, String(v)));
      } else {
        params.set(key, String(value));
      }
    }
    url += `?${params.toString()}`;
  } else {
    init.headers = { ...init.headers, "Content-Type": "application/json" };
    init.body = JSON.stringify(payload);
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    // トークンは絶対に含めない。フィールド単位のエラーは含める(原因特定用)
    let detail = "";
    let code: string | undefined;
    try {
      const body = (await res.json()) as {
        code?: string;
        message?: string;
        errors?: Record<string, { messages?: string[] }>;
      };
      code = body.code;
      const fieldErrors = body.errors
        ? Object.entries(body.errors)
            .map(([key, v]) => `${key}: ${(v.messages ?? []).join(", ")}`)
            .join(" / ")
        : "";
      detail = [body.code, body.message, fieldErrors].filter(Boolean).join(" | ");
    } catch {
      /* noop */
    }
    throw new KintoneApiError(
      `kintone API エラー (HTTP ${res.status}${detail ? `: ${detail}` : ""})`,
      res.status,
      code
    );
  }

  return (await res.json()) as T;
}

/** レコードを1件登録し、レコードIDを返す */
export async function registerRecord(
  appId: number,
  record: KintoneRecord
): Promise<{ recordId: string; revision: string }> {
  const body = await kintoneApi<{ id: string; revision: string }>(
    "POST",
    "/k/v1/record.json",
    { app: appId, record }
  );
  return { recordId: String(body.id), revision: String(body.revision) };
}

export type KintoneRawRecord = Record<string, { type?: string; value: unknown }>;

/** レコードを1件取得($revision を含む) */
export async function getRecord(
  appId: number,
  recordId: string
): Promise<{ record: KintoneRawRecord; revision: string }> {
  const body = await kintoneApi<{ record: KintoneRawRecord }>(
    "GET",
    "/k/v1/record.json",
    { app: appId, id: recordId }
  );
  const revision = String(
    (body.record.$revision?.value as string | undefined) ?? ""
  );
  return { record: body.record, revision };
}

/**
 * レコードを更新する。revision を渡すと楽観ロック
 * (不一致時は HTTP 409 → isRevisionConflict で判定可能)。
 */
export async function updateRecord(
  appId: number,
  recordId: string,
  record: KintoneRecord,
  revision?: string
): Promise<{ revision: string }> {
  const body = await kintoneApi<{ revision: string }>("PUT", "/k/v1/record.json", {
    app: appId,
    id: recordId,
    record,
    ...(revision ? { revision } : {}),
  });
  return { revision: String(body.revision) };
}

/** クエリでレコードを検索する */
export async function findRecords(
  appId: number,
  query: string,
  fields?: string[]
): Promise<KintoneRawRecord[]> {
  const body = await kintoneApi<{ records: KintoneRawRecord[] }>(
    "GET",
    "/k/v1/records.json",
    { app: appId, query, ...(fields ? { fields } : {}) }
  );
  return body.records;
}
