import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerRequestToKintone } from "@/lib/kintone/register-request";
import { getVersionedConfig, isKintoneReady } from "@/lib/form-types";
import type { FieldMapping } from "@/lib/kintone/mapper";
import type { ParserConfig } from "@/types/request";

/**
 * 承認: status=approved → kintone登録 → registered / register_failed。
 * レンタルプランを使う種別(てずくーる)は承認前にプラン確定が必須:
 *   ・body.rental_plan_id があればそれを approved_rental_plan_id に採用
 *   ・無ければ既存の approved/requested を採用。どちらも無ければ 409(承認不可)
 * middleware は /api を保護しないため、ここで認証チェックする。
 */
async function POSTHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: {
    rental_plan_id?: string | null;
    /** 承認画面で確定したコンテンツ正式名称 { "コンテンツ1": "..." } */
    contents?: Record<string, string> | null;
    /** 承認画面で確定した弊社担当者の正式名称 */
    staff_name?: string | null;
    /** 料金区分(てずくーるのみ): 'paid'|'free' */
    billing_type?: string | null;
    /** DSP様共有事項(倉庫への引き継ぎ)。任意。改行保持。空欄も可 */
    dsp_handover_note?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* body なしも許容 */
  }

  const { data: request } = await supabase
    .from("requests")
    .select(
      "id, status, deleted_at, form_type_id, form_type_version, parsed_data, requested_rental_plan_id, approved_rental_plan_id, company_staff_name_input, form_types(field_mapping, parser_config, kintone_app_id)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }
  // 削除済み(ゴミ箱)は承認不可
  if (request.deleted_at) {
    return NextResponse.json(
      { error: "この申請は削除済みです。復元してから承認してください。" },
      { status: 409 }
    );
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: `このステータス(${request.status})では承認できません` },
      { status: 409 }
    );
  }

  const formType = request.form_types as unknown as {
    field_mapping?: FieldMapping;
    parser_config?: ParserConfig;
    kintone_app_id?: number;
  } | null;

  // 事業判定は表示名ではなく kintone_app_id(49=てずくーる)で行う。
  // てずくーるのみ料金区分(有償/無償)を必須にする。オールマイトは対象外。
  const isTezukuru = formType?.kintone_app_id === 49;
  if (isTezukuru) {
    const billingType = typeof body.billing_type === "string" ? body.billing_type : "";
    if (billingType !== "paid" && billingType !== "free") {
      return NextResponse.json({ error: "料金区分を選択してください" }, { status: 409 });
    }
    await supabase.from("requests").update({ billing_type: billingType }).eq("id", id);
  }

  // 設定駆動ガード: 申請時点version の field_mapping が空なら承認不可
  const versioned = await getVersionedConfig(
    supabase,
    request.form_type_id as string,
    request.form_type_version as number
  );
  if (!isKintoneReady(versioned?.field_mapping ?? formType?.field_mapping)) {
    return NextResponse.json(
      { error: "kintone登録は未設定です(この種別のマッピング確定後に承認できます)" },
      { status: 409 }
    );
  }

  // レンタルプラン確定(てずくーる)
  const usesRentalPlan = (formType?.parser_config?.select_fields ?? []).some(
    (sf) => sf.label === "レンタルプラン"
  );
  if (usesRentalPlan) {
    const desiredPlanId =
      (typeof body.rental_plan_id === "string" && body.rental_plan_id) ||
      (request.approved_rental_plan_id as string | null) ||
      (request.requested_rental_plan_id as string | null);

    // 旧申請(プランマスタ導入前)は parsed_data に既にレンタルプランを持つ → プラン確定は不要
    const legacyPlan = Boolean(
      (request.parsed_data as Record<string, string> | null)?.["レンタルプラン"]
    );

    if (desiredPlanId) {
      const { data: plan } = await supabase
        .from("rental_plans")
        .select("id, is_active")
        .eq("id", desiredPlanId)
        .maybeSingle();
      if (!plan || !plan.is_active) {
        return NextResponse.json(
          { error: "選択されたレンタルプランは利用できません" },
          { status: 400 }
        );
      }
      await supabase
        .from("requests")
        .update({ approved_rental_plan_id: plan.id })
        .eq("id", id);
    } else if (!legacyPlan) {
      return NextResponse.json(
        { error: "レンタルプランを選択してください(承認にはプランの確定が必要です)" },
        { status: 409 }
      );
    }
  }

  // コンテンツ確定(商品マスタの正式名称のみ許可)。申請原文は parsed_data に保持したまま
  if (body.contents && typeof body.contents === "object") {
    const entries = Object.entries(body.contents).filter(
      ([label, name]) => /^コンテンツ\d+$/.test(label) && typeof name === "string" && name.trim()
    );
    if (entries.length > 0) {
      const { data: masterRows } = await supabase
        .from("item_name_master")
        .select("name")
        .eq("is_active", true);
      const validNames = new Set((masterRows ?? []).map((r) => r.name as string));
      const invalid = entries.filter(([, name]) => !validNames.has(name));
      if (invalid.length > 0) {
        return NextResponse.json(
          {
            error: `商品マスタに存在しない(または無効な)コンテンツが指定されました: ${invalid
              .map(([l, n]) => `${l}=${n}`)
              .join(", ")}`,
          },
          { status: 400 }
        );
      }
      await supabase
        .from("requests")
        .update({ approved_contents: Object.fromEntries(entries) })
        .eq("id", id);
    }
  }

  // 弊社担当者の確定(担当者マスターに存在する有効な正式名称のみ許可)。
  // 申請に担当者入力がある場合は確定必須(申請原文は company_staff_name_input に保持)
  const staffInput = (request.company_staff_name_input as string | null)?.trim() ?? "";
  if (staffInput) {
    const staffName = (typeof body.staff_name === "string" ? body.staff_name : "").trim();
    if (!staffName) {
      return NextResponse.json(
        { error: "弊社担当者の正式名称を選択してください" },
        { status: 409 }
      );
    }
    const { data: staff } = await supabase
      .from("staff_members")
      .select("name, is_active")
      .eq("name", staffName)
      .maybeSingle();
    if (!staff || !staff.is_active) {
      return NextResponse.json(
        { error: "選択された担当者は担当者マスターに存在しないか、無効です" },
        { status: 400 }
      );
    }
    await supabase
      .from("requests")
      .update({ approved_staff_name: staff.name })
      .eq("id", id);
  }

  // DSP様共有事項(倉庫への引き継ぎ)。任意。両事業共通。
  // ・kintone 登録「前」にこの列へ保存するため、登録が失敗しても失われず再実行で再利用される。
  // ・改行はそのまま保持(前後の空白のみ除去)。空欄は null 保存(register 側で「補足欄」を送らない=既存値を上書きしない)。
  {
    const note =
      typeof body.dsp_handover_note === "string" ? body.dsp_handover_note.trim() : "";
    await supabase
      .from("requests")
      .update({ dsp_handover_note: note ? note : null })
      .eq("id", id);
  }

  // 連携処理の所有トークン(解除は自処理のみ=他処理のロックを誤って解除しない)
  const processingToken = crypto.randomUUID();

  // 承認を記録(競合防止: pending かつ 未削除 のときだけ approved に遷移する。
  // 削除と承認が同時に起きても、削除が先に確定していればここで 0 件更新となり、
  // kintone 登録へ進まない=削除済みの申請が登録されることを防ぐ)。
  const { data: approvedRow, error: updateError } = await supabase
    .from("requests")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      processing_at: new Date().toISOString(), // 連携中=削除不可の目印(登録完了/失敗で自処理が解除)
      processing_token: processingToken, // 自処理の所有トークン(他処理が誤解除しないため)
    })
    .eq("id", id)
    .eq("status", "pending")
    .is("deleted_at", null)
    .is("processing_at", null) // 既に処理中なら承認しない(二重処理防止)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json(
      { error: `承認の記録に失敗しました: ${updateError.message}` },
      { status: 500 }
    );
  }
  if (!approvedRow) {
    // pending でない or 削除済みに変化 → 承認を中止(kintone登録へ進まない)
    return NextResponse.json(
      { error: "承認できませんでした。申請の状態が変わっています(削除済み/承認済みの可能性)。画面を更新してください。" },
      { status: 409 }
    );
  }

  await supabase.from("request_histories").insert({
    request_id: id,
    action: "approved",
    actor: user.id,
    ...(isTezukuru ? { detail: { billing_type: body.billing_type } } : {}),
  });

  // kintone登録(共通処理。成功時に承認完了メールも送信される)
  const result = await registerRequestToKintone(supabase, id, user.id);

  // 連携処理の終了(成功/失敗問わず)で processing_at を解除。自処理のトークン一致時のみ解除する
  // (他処理が設定したロックを誤解除しない)。
  await supabase
    .from("requests")
    .update({ processing_at: null, processing_token: null })
    .eq("id", id)
    .eq("processing_token", processingToken);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, recordId: result.recordId });
}

export const POST=withInventorySheetPush(POSTHandler);
