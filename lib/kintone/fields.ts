/**
 * kintone フォームフィールド一覧の取得(GET /k/v1/app/form/fields.json)。
 *
 * 注意: APIトークンをログ・エラーメッセージに含めないこと。
 * ここでは取得のみ。レコード登録は手順7-8で実装する。
 */

export type KintoneField = {
  /** フィールドコード */
  code: string;
  /** フィールド名(ラベル) */
  label: string;
  /** フィールド型(SINGLE_LINE_TEXT, NUMBER, DROP_DOWN 等) */
  type: string;
  /** 必須フラグ */
  required: boolean;
  /** 選択肢(DROP_DOWN / RADIO_BUTTON / CHECK_BOX / MULTI_SELECT のみ) */
  options: string[];
  /** サブテーブル内フィールドの場合、親テーブルのフィールドコード */
  subtableCode?: string;
};

export type FetchFieldsResult = {
  fields: KintoneField[];
  revision: string;
};

type RawProperty = {
  code: string;
  label: string;
  type: string;
  required?: boolean;
  options?: Record<string, { label: string; index: string }>;
  fields?: Record<string, RawProperty>; // SUBTABLE
};

function toField(prop: RawProperty, subtableCode?: string): KintoneField {
  const options = prop.options
    ? Object.values(prop.options)
        .sort((a, b) => Number(a.index) - Number(b.index))
        .map((o) => o.label)
    : [];

  return {
    code: prop.code,
    label: prop.label,
    type: prop.type,
    required: prop.required === true,
    options,
    ...(subtableCode ? { subtableCode } : {}),
  };
}

export async function fetchFormFields(params: {
  domain: string; // 例: xxxx.cybozu.com(スキームなし)
  appId: number;
  apiToken: string;
}): Promise<FetchFieldsResult> {
  const domain = params.domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = `https://${domain}/k/v1/app/form/fields.json?app=${params.appId}&lang=ja`;

  const res = await fetch(url, {
    headers: { "X-Cybozu-API-Token": params.apiToken },
  });

  if (!res.ok) {
    // トークンは絶対に含めない
    let message = "";
    try {
      const body = (await res.json()) as { code?: string; message?: string };
      message = [body.code, body.message].filter(Boolean).join(" / ");
    } catch {
      /* noop */
    }
    throw new Error(
      `kintoneフィールド一覧の取得に失敗しました (HTTP ${res.status}${message ? `: ${message}` : ""})`
    );
  }

  const body = (await res.json()) as {
    properties: Record<string, RawProperty>;
    revision: string;
  };

  const fields: KintoneField[] = [];
  for (const prop of Object.values(body.properties)) {
    if (prop.type === "SUBTABLE" && prop.fields) {
      fields.push(toField(prop));
      for (const child of Object.values(prop.fields)) {
        fields.push(toField(child, prop.code));
      }
    } else {
      fields.push(toField(prop));
    }
  }

  // フィールドコード順で安定化
  fields.sort((a, b) =>
    (a.subtableCode ?? a.code).localeCompare(b.subtableCode ?? b.code, "ja") ||
    a.code.localeCompare(b.code, "ja")
  );

  return { fields, revision: body.revision };
}
