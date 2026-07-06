/**
 * 管理番号の採番(既存の採番マスタ kintone App50 を利用)。
 *
 * キー="shipping" のレコードの「現在番号」を +1 して採番する。
 * revision(楽観ロック)で二重採番を防ぎ、競合時はリトライする。
 * 独自採番は行わない(オールマイト・てずくーる共通採番)。
 *
 * 設計: docs/kintone-numbering-design.md
 */

import { findRecords, updateRecord, isRevisionConflict } from "./client";

const NUMBERING_APP_ID = Number(process.env.KINTONE_APP_ID_NUMBERING ?? "50");

// App50のフィールドコード(既存JSと同じ。確定・2026-07-03)
const KEY_FIELD = "キー";
const CURRENT_NO_FIELD = "現在番号";
const KEY_VALUE = "shipping";

const MAX_RETRIES = 5;
const RETRY_WAIT_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 管理番号を1つ採番して返す。
 * 採番後に後続処理が失敗した場合、その番号は欠番になる(重複より欠番を許容)。
 */
export async function issueManagementNumber(): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const records = await findRecords(
      NUMBERING_APP_ID,
      `${KEY_FIELD} = "${KEY_VALUE}"`,
      ["$id", "$revision", CURRENT_NO_FIELD]
    );

    if (records.length === 0) {
      throw new Error(
        `採番マスタ(App${NUMBERING_APP_ID})に ${KEY_FIELD}="${KEY_VALUE}" のレコードがありません`
      );
    }

    const master = records[0];
    const recordId = String(master.$id?.value ?? "");
    const revision = String(master.$revision?.value ?? "");
    const current = Number(master[CURRENT_NO_FIELD]?.value ?? NaN);

    if (!recordId || !revision || Number.isNaN(current)) {
      throw new Error(
        `採番マスタの形式が不正です(${CURRENT_NO_FIELD} が数値ではないか、フィールドコードが違います)`
      );
    }

    const next = current + 1;

    try {
      await updateRecord(
        NUMBERING_APP_ID,
        recordId,
        { [CURRENT_NO_FIELD]: { value: String(next) } },
        revision
      );
      return String(next);
    } catch (err) {
      if (isRevisionConflict(err)) {
        // 他プロセスが先に採番 → 再取得してやり直し
        lastError = err;
        await sleep(RETRY_WAIT_MS * attempt);
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    `採番が${MAX_RETRIES}回競合しました。時間をおいて再実行してください` +
      (lastError instanceof Error ? `(${lastError.message})` : "")
  );
}
