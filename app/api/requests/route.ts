import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFmt } from "@/lib/parser/fmt-parser";
import { notifyNewRequest } from "@/lib/notify/notify";
import { sendApplicationMail } from "@/lib/mail/application-mails";
import type { ParserConfig } from "@/types/request";

const MAX_BODY_LENGTH = 40000;
const MAX_NAME = 100;
const MAX_PHONE = 30;
const MAX_EMAIL = 254;
const MAX_CUSTOMER_REQUESTS = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 簡易レート制限(インメモリ)。サーバーレス本番環境では Upstash 等に置き換える
const RATE_LIMIT = 10;
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
 * 申請受付。ペイロード:
 *   { form_type_id, raw_text, applicant_name, applicant_phone, applicant_email,
 *     rental_status, rental_plan_id, customer_requests }
 * ・入力者情報は必須。メール形式チェック・文字数制限あり
 * ・レンタルプラン種別で new_rental の場合、サーバー側で有効プラン名を raw_text に注入
 *   already_renting の場合は レンタルプラン の必須チェックを緩和(承認時に社内で設定)
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { errors: ["送信回数が多すぎます。しばらく待ってから再度お試しください。"] },
      { status: 429 }
    );
  }

  let body: {
    form_type_id?: string;
    raw_text?: string;
    applicant_name?: string;
    applicant_phone?: string;
    applicant_email?: string;
    company_staff_name?: string;
    rental_status?: string | null;
    rental_plan_id?: string | null;
    customer_requests?: string | null;
  };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_LENGTH) {
      return NextResponse.json({ errors: ["送信データが大きすぎます。"] }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ errors: ["不正なリクエストです。"] }, { status: 400 });
  }

  const errors: string[] = [];
  const form_type_id = typeof body.form_type_id === "string" ? body.form_type_id : "";
  const raw_text = typeof body.raw_text === "string" ? body.raw_text : "";
  const applicant_name = (body.applicant_name ?? "").toString().trim();
  const applicant_phone = (body.applicant_phone ?? "").toString().trim();
  const applicant_email = (body.applicant_email ?? "").toString().trim();
  const company_staff_name = (body.company_staff_name ?? "").toString().trim();
  const rental_status = body.rental_status ?? null;
  const rental_plan_id = body.rental_plan_id ?? null;
  const customer_requests = (body.customer_requests ?? "").toString();

  if (!form_type_id) errors.push("申請種別が指定されていません。");
  if (!raw_text.trim()) errors.push("FMTを入力してください。");
  if (!applicant_name) errors.push("入力者氏名を入力してください。");
  else if (applicant_name.length > MAX_NAME) errors.push("氏名が長すぎます。");
  if (!applicant_phone) errors.push("入力者電話番号を入力してください。");
  else if (applicant_phone.length > MAX_PHONE) errors.push("電話番号が長すぎます。");
  if (!applicant_email) errors.push("入力者メールアドレスを入力してください。");
  else if (!EMAIL_RE.test(applicant_email) || applicant_email.length > MAX_EMAIL) {
    errors.push("メールアドレスの形式が正しくありません。");
  }
  if (!company_staff_name) errors.push("弊社担当者氏名を入力してください。");
  else if (company_staff_name.length > MAX_NAME) errors.push("弊社担当者氏名が長すぎます。");
  if (rental_status !== null && rental_status !== "already_renting" && rental_status !== "new_rental") {
    errors.push("レンタル状況が不正です。");
  }
  if (customer_requests.length > MAX_CUSTOMER_REQUESTS) {
    errors.push("要望・連絡事項が長すぎます。");
  }
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 種別の解決(公開中=is_active のもののみ。無効種別はサーバー側で拒否)
  const { data: formType } = await supabase
    .from("form_types")
    .select("id, name, version, parser_config")
    .eq("id", form_type_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!formType) {
    return NextResponse.json({ errors: ["申請種別が正しくありません。"] }, { status: 400 });
  }

  const parserConfig = (formType.parser_config ?? {}) as ParserConfig;
  const usesRentalPlan = (parserConfig.select_fields ?? []).some(
    (sf) => sf.label === "レンタルプラン"
  );

  // レンタルプラン処理(新規のみ: サーバーで有効プラン名を注入)
  let requestedPlanId: string | null = null;
  let effectiveRawText = raw_text;
  const effectiveConfig: ParserConfig = { ...parserConfig };

  if (usesRentalPlan) {
    if (rental_status !== "already_renting" && rental_status !== "new_rental") {
      return NextResponse.json({ errors: ["レンタル状況を選択してください。"] }, { status: 400 });
    }
    if (rental_status === "new_rental") {
      if (!rental_plan_id) {
        return NextResponse.json({ errors: ["レンタルプランを選択してください。"] }, { status: 400 });
      }
      const { data: plan } = await supabase
        .from("rental_plans")
        .select("id, name, is_active")
        .eq("id", rental_plan_id)
        .maybeSingle();
      if (!plan || !plan.is_active) {
        return NextResponse.json({ errors: ["選択されたレンタルプランは利用できません。"] }, { status: 400 });
      }
      requestedPlanId = plan.id;
      // 「レンタルプラン: <名称>」を先頭注入(FMT解析・kintoneマッピングは既存のまま流れる)
      effectiveRawText = `レンタルプラン: ${plan.name}\n${raw_text}`;
    } else {
      // すでに借りている: この時点ではプラン未確定 → 必須チェックを緩和
      effectiveConfig.required_labels = (parserConfig.required_labels ?? []).filter(
        (l) => l !== "レンタルプラン"
      );
    }
  }

  // FMT形式チェック + パース
  const result = parseFmt(effectiveRawText, effectiveConfig);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  const { data: request, error: insertError } = await supabase
    .from("requests")
    .insert({
      form_type_id: formType.id,
      form_type_version: formType.version,
      raw_text: effectiveRawText,
      parsed_data: result.data,
      status: "pending",
      applicant_name,
      applicant_phone,
      applicant_email,
      company_staff_name_input: company_staff_name,
      rental_status: usesRentalPlan ? rental_status : null,
      requested_rental_plan_id: requestedPlanId,
      customer_requests: customer_requests.trim() || null,
    })
    .select("id, created_at")
    .single();

  if (insertError || !request) {
    console.error("[api/requests] insert failed:", insertError?.message);
    return NextResponse.json(
      { errors: ["保存に失敗しました。時間をおいて再度お試しください。"] },
      { status: 500 }
    );
  }

  await supabase.from("request_histories").insert({
    request_id: request.id,
    action: "submitted",
    actor: "surely",
  });

  // 担当者向けPush通知(既存)。失敗しても申請保存は成功のまま
  const baseUrl = (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  await notifyNewRequest({
    formTypeName: formType.name,
    agencyName: result.data["取次店名"] ?? "",
    boothName: result.data["イベントブース名"] ?? "",
    deliveryDate: result.data["配送日付"] ?? "",
    pickupDate: result.data["集荷日付"] ?? "",
    adminUrl: `${baseUrl}/admin/requests/${request.id}`,
  });

  // 申請完了メール(入力者宛)。送信失敗でも申請は成功のまま
  const mailResult = await sendApplicationMail(
    supabase,
    request.id,
    {
      applicant_name,
      applicant_email,
      management_no: null, // 管理番号は承認時に採番
      formTypeName: formType.name,
      boothName: result.data["イベントブース名"] ?? "",
      agencyName: result.data["取次店名"] ?? "",
    },
    request.created_at
  );
  const mail = mailResult.sent ? "sent" : "skipped" in mailResult ? "pending" : "failed";

  return NextResponse.json({ ok: true, rid: request.id, mail }, { status: 201 });
}
