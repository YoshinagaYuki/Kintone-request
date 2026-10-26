import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";
import { parseFmt } from "@/lib/parser/fmt-parser";
import { getMinimumOrderQuantity } from "@/lib/system-settings";
import { contentLabel, quantityLabel, MAX_PRODUCTS } from "@/lib/tezukuru-fmt";
import type { ParserConfig } from "@/types/request";

/**
 * 管理者による申請内容の編集(承認前の修正)。
 *
 * 【安全対策】
 * ・サーバー側で「利用中の管理者」かつ「担当事業(form_type_id)を持つ」ことを検証。
 * ・編集できるのは status='pending' かつ kintone未登録(kintone_record_id=null)のみ。
 *   → 承認済み・登録済みは編集不可(API側でも必ず確認)。
 * ・保存は UPDATE ... where id=? and status='pending' の件数で楽観ロック(承認との競合を防止)。
 * ・raw_text と parsed_data を再生成して同時更新(古い parsed_data / FMT を残さない)。
 * ・変更差分(項目・変更前・変更後)を request_histories(action='edited')に記録。
 * ・申請者の元の入力は履歴(before)に残る。メール再送はしない(ここでは送信処理を呼ばない)。
 * ・手配種別・時刻(allmight_*)はこのAPIでは変更しない(既存の手配種別管理機能を維持)。
 */

const MAX_BODY_LENGTH = 40000;
const MAX_NAME = 100;
const MAX_PHONE = 30;
const MAX_EMAIL = 254;
const MAX_CUSTOMER_REQUESTS = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function PATCHHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ errors: ["権限がありません"] }, { status: 403 });
  }

  let body: {
    raw_text?: string;
    structured?: boolean;
    applicant_name?: string;
    applicant_phone?: string;
    applicant_email?: string;
    company_staff_name?: string;
    rental_status?: string | null;
    rental_plan_id?: string | null;
    customer_requests?: string | null;
    sns_promotion_requested?: boolean | null;
    /** 編集開始時に読み込んだ updated_at(楽観ロック用トークン) */
    expected_updated_at?: string | null;
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

  const expectedUpdatedAt =
    typeof body.expected_updated_at === "string" ? body.expected_updated_at : null;
  if (!expectedUpdatedAt) {
    return NextResponse.json(
      { errors: ["編集トークンが不正です。画面を再読み込みしてください。"] },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select(
      "id, status, kintone_record_id, deleted_at, form_type_id, form_type_version, is_structured, parsed_data, applicant_name, applicant_phone, applicant_email, company_staff_name_input, customer_requests, sns_promotion_requested, rental_status, requested_rental_plan_id, form_types(name, kintone_app_id, parser_config)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    return NextResponse.json({ errors: ["申請が見つかりません。"] }, { status: 404 });
  }

  // 削除済み(ゴミ箱)は編集不可
  if (request.deleted_at) {
    return NextResponse.json(
      { errors: ["この申請は削除済みです。復元してから編集してください。"] },
      { status: 409 }
    );
  }

  // 未承認(pending)かつ kintone未登録のみ編集可(API側で必ず確認)
  if (request.status !== "pending" || request.kintone_record_id) {
    return NextResponse.json(
      { errors: ["この申請は承認・登録済みのため編集できません。"] },
      { status: 409 }
    );
  }

  // 担当事業(この申請の form_type_id)を持つ管理者のみ編集可
  const { data: biz } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id)
    .eq("form_type_id", request.form_type_id as string)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json(
      { errors: ["この事業の担当管理者のみ編集できます。"] },
      { status: 403 }
    );
  }

  const formType = request.form_types as unknown as {
    name: string;
    kintone_app_id: number;
    parser_config: ParserConfig | null;
  } | null;
  const isTezukuru = formType?.kintone_app_id === 49;

  // ---- 入力検証(/api/requests と同じルール) ----
  const errors: string[] = [];
  const raw_text = typeof body.raw_text === "string" ? body.raw_text : "";
  const applicant_name = (body.applicant_name ?? "").toString().trim();
  const applicant_phone = (body.applicant_phone ?? "").toString().trim();
  const applicant_email = (body.applicant_email ?? "").toString().trim();
  const company_staff_name = (body.company_staff_name ?? "").toString().trim();
  const rental_status = body.rental_status ?? null;
  const rental_plan_id = body.rental_plan_id ?? null;
  const customer_requests = (body.customer_requests ?? "").toString();

  if (!raw_text.trim()) errors.push("申請内容を入力してください。");
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
  if (customer_requests.length > MAX_CUSTOMER_REQUESTS) errors.push("要望・連絡事項が長すぎます。");

  const snsPromotionRequested =
    typeof body.sns_promotion_requested === "boolean" ? body.sns_promotion_requested : null;
  if (isTezukuru && snsPromotionRequested === null) {
    errors.push("SNSでの宣伝について、希望する/希望しないを選択してください。");
  }
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  // ---- レンタルプラン(てずくーる)処理 + FMT再生成 ----
  const parserConfig = (formType?.parser_config ?? {}) as ParserConfig;
  const usesRentalPlan = (parserConfig.select_fields ?? []).some(
    (sf) => sf.label === "レンタルプラン"
  );
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
      const { data: plan } = await admin
        .from("rental_plans")
        .select("id, name, is_active")
        .eq("id", rental_plan_id)
        .maybeSingle();
      if (!plan || !plan.is_active) {
        return NextResponse.json({ errors: ["選択されたレンタルプランは利用できません。"] }, { status: 400 });
      }
      requestedPlanId = plan.id;
      effectiveRawText = `レンタルプラン: ${plan.name}\n${raw_text}`;
    } else {
      effectiveConfig.required_labels = (parserConfig.required_labels ?? []).filter(
        (l) => l !== "レンタルプラン"
      );
    }
  }

  const result = parseFmt(effectiveRawText, effectiveConfig);
  if (!result.ok) {
    return NextResponse.json({ errors: result.errors }, { status: 400 });
  }

  // 商品・数量のサーバー側検証(てずくーると同一ルール)。allmight はこれらのラベルが無く素通り。
  const minQty = await getMinimumOrderQuantity(admin);
  const productErrors: string[] = [];
  for (let i = 1; i <= MAX_PRODUCTS; i++) {
    const name = (result.data[contentLabel(i)] ?? "").trim();
    const qtyRaw = (result.data[quantityLabel(i)] ?? "").trim();
    if (!name && !qtyRaw) continue;
    if (name && !qtyRaw) { productErrors.push(`商品${i}の数量を入力してください。`); continue; }
    if (!name && qtyRaw) { productErrors.push(`商品${i}が未選択です(数量のみ入力されています)。`); continue; }
    if (!/^\d+$/.test(qtyRaw)) { productErrors.push(`商品${i}の数量は整数で入力してください。`); continue; }
    if (Number.parseInt(qtyRaw, 10) < minQty) productErrors.push(`商品${i}の数量は${minQty}以上で入力してください。`);
  }
  if (productErrors.length > 0) {
    return NextResponse.json({ errors: productErrors }, { status: 400 });
  }

  // スロット固有制約(てずくーる)
  const { data: slotItems } = await admin
    .from("item_name_master")
    .select("name, excluded_slots").is("inventory_role",null)
    .eq("category", "tezukuru")
    .eq("is_active", true);
  const excludedBy = new Map<string, number[]>(
    (slotItems ?? []).map((r) => [
      r.name as string,
      Array.isArray(r.excluded_slots) ? (r.excluded_slots as number[]) : [],
    ])
  );
  const slotErrors: string[] = [];
  for (let i = 1; i <= MAX_PRODUCTS; i++) {
    const name = (result.data[contentLabel(i)] ?? "").trim();
    if (!name) continue;
    const ex = excludedBy.get(name);
    if (ex && ex.includes(i)) {
      slotErrors.push(`商品${i}に「${name}」は選択できません(このスロットでは取り扱いがありません)。`);
    }
  }
  if (slotErrors.length > 0) {
    return NextResponse.json({ errors: slotErrors }, { status: 400 });
  }

  const newParsed = result.data;

  // ---- 保存(原子的: 申請更新 + 編集履歴を RPC で1トランザクション実行) ----
  // ・UPDATE と request_histories INSERT のどちらかが失敗すれば両方ロールバック(履歴保存を保証)。
  // ・RPC 内で updated_at(楽観ロック)と status/kintone を検証し、競合は 'conflict' を返す。
  // ・変更差分(before/after)は RPC 内でロックした更新前の実データから生成する
  //   (API提供の before を信用しない)。ここでは編集者 email のみ渡す。
  const { data: rpc, error: rpcErr } = await admin.rpc("edit_request_atomic", {
    p_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_raw_text: effectiveRawText,
    p_parsed_data: newParsed,
    p_applicant_name: applicant_name,
    p_applicant_phone: applicant_phone,
    p_applicant_email: applicant_email,
    p_company_staff_name_input: company_staff_name,
    p_customer_requests: customer_requests.trim() || null,
    p_is_structured: body.structured === true ? true : request.is_structured === true,
    p_set_sns: isTezukuru,
    p_sns_promotion_requested: snsPromotionRequested,
    p_set_rental: usesRentalPlan,
    p_rental_status: usesRentalPlan ? rental_status : null,
    p_requested_rental_plan_id: usesRentalPlan ? requestedPlanId : null,
    p_actor: me!.auth_user_id ?? "system",
    p_editor: me!.email ?? null,
  });

  if (rpcErr) {
    return NextResponse.json(
      { errors: [`保存に失敗しました: ${rpcErr.message}`] },
      { status: 500 }
    );
  }
  const res = (rpc ?? {}) as { ok?: boolean; code?: string };
  if (!res.ok) {
    if (res.code === "not_found") {
      return NextResponse.json({ errors: ["申請が見つかりません。"] }, { status: 404 });
    }
    if (res.code === "not_editable") {
      return NextResponse.json(
        { errors: ["この申請は承認・登録済みのため編集できません。"] },
        { status: 409 }
      );
    }
    // conflict(編集開始後に他の管理者が保存/承認した)
    return NextResponse.json(
      {
        errors: [
          "他の管理者がこの申請を更新したため保存できませんでした。画面を再読み込みして最新内容を確認してください。",
        ],
      },
      { status: 409 }
    );
  }

  const okRes = (rpc ?? {}) as { changed?: number };
  return NextResponse.json({ ok: true, changed: okRes.changed ?? 0 });
}

export const PATCH=withInventorySheetPush(PATCHHandler);
