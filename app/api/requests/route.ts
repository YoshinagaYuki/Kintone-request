import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFmt } from "@/lib/parser/fmt-parser";
import { notifyNewRequest } from "@/lib/notify/notify";
import type { ParserConfig } from "@/types/request";

const MAX_BODY_LENGTH = 30000;

// 簡易レート制限(インメモリ)。サーバーレス本番環境では Upstash 等に置き換える
const RATE_LIMIT = 10; // 件 / 窓
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

/**
 * 申請受付。ペイロード: { form_type_id, raw_text }
 * ・form_type_id: 選択種別(is_active を検証)
 * ・選択種別の現行 parser_config でパースし、申請時点の version を保存する
 * ・秘匿slug運用は廃止(/apply 単一URL)。レート制限+形式チェックで保護
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { errors: ["送信回数が多すぎます。しばらく待ってから再度お試しください。"] },
      { status: 429 }
    );
  }

  let body: { form_type_id?: string; raw_text?: string };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        { errors: ["送信データが大きすぎます。"] },
        { status: 413 }
      );
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ errors: ["不正なリクエストです。"] }, { status: 400 });
  }

  const { form_type_id, raw_text } = body;
  if (typeof form_type_id !== "string" || typeof raw_text !== "string") {
    return NextResponse.json({ errors: ["不正なリクエストです。"] }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 選択種別の解決(公開中のもののみ)
  const { data: formType } = await supabase
    .from("form_types")
    .select("id, name, version, parser_config")
    .eq("id", form_type_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!formType) {
    return NextResponse.json(
      { errors: ["申請種別が正しくありません。"] },
      { status: 400 }
    );
  }

  // FMT形式チェック + パース(現行versionの parser_config)
  const result = parseFmt(raw_text, (formType.parser_config ?? {}) as ParserConfig);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  // pending で保存(申請時点の version を保持。kintoneへは直接登録しない)
  const { data: request, error: insertError } = await supabase
    .from("requests")
    .insert({
      form_type_id: formType.id,
      form_type_version: formType.version,
      raw_text,
      parsed_data: result.data,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !request) {
    console.error("[api/requests] insert failed:", insertError);
    return NextResponse.json(
      { errors: ["保存に失敗しました。時間をおいて再度お試しください。"] },
      { status: 500 }
    );
  }

  const { error: historyError } = await supabase.from("request_histories").insert({
    request_id: request.id,
    action: "submitted",
    actor: "surely",
  });
  if (historyError) {
    console.error("[api/requests] history insert failed:", historyError);
  }

  // 担当者へ通知(共通通知モジュール。未設定チャネルはスキップ、失敗しても申請保存は成功のまま)
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  await notifyNewRequest({
    formTypeName: formType.name,
    agencyName: result.data["取次店名"] ?? "",
    boothName: result.data["イベントブース名"] ?? "",
    deliveryDate: result.data["配送日付"] ?? "",
    pickupDate: result.data["集荷日付"] ?? "",
    adminUrl: `${baseUrl}/admin/requests/${request.id}`,
  });

  // 内部IDは返さない(Surely側に識別子を見せない方針)
  return NextResponse.json({ ok: true }, { status: 201 });
}
