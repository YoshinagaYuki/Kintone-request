/**
 * 申請の kintone 連携パイプライン(approve / retry 共通)。
 *
 * [1] App10(オールマイト)へレコード登録
 * [2] App50(採番マスタ)で管理番号を採番(revision競合リトライ)
 * [3] App10 の管理番号フィールドを更新
 * [4] App11(配送管理)へ同じ管理番号で新規作成/更新
 *
 * 各ステップは冪等(再実行時は完了済みステップをスキップ):
 *   [1] kintone_record_id が既にあればスキップ
 *   [2][3] App10の管理番号が既に入っていればスキップ(既存画面JSと同じガード)
 *   [4] 管理番号で検索して upsert
 *
 * 失敗時: status=register_failed + 履歴 kintone_failed(step/エラー内容) → 画面から再実行可。
 * 設計: docs/kintone-numbering-design.md
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildKintoneRecord, type FieldMapping } from "./mapper";
import { registerRecord, getRecord, updateRecord } from "./client";
import { issueManagementNumber } from "./numbering";
import { upsertShippingRecord } from "./shipping";
import { notifyApproved } from "../lineworks/client";
import { getVersionedConfig, isKintoneReady } from "../form-types";
import { applyAllmightPricing } from "../allmight/pricing";
import { normalizeRecordItems } from "../item-normalizer";
import { sendApprovalMail } from "../mail/application-mails";
import { notifyRegistration, registrationDedupKey } from "../notify/registration";
import { notificationFromKintoneRecord } from "../notify/kintone-record";

/** App10側の管理番号フィールドコード(docs/kintone-fields-allmight.md) */
const MANAGEMENT_NO_FIELD_APP10 = "管理番号";

export type RegisterResult =
  | { ok: true; recordId: string; managementNo: string }
  | { ok: false; error: string };

export async function registerRequestToKintone(
  supabase: SupabaseClient,
  requestId: string,
  actor: string
): Promise<RegisterResult> {
  const { data: request, error: fetchError } = await supabase
    .from("requests")
    .select(
      "id, parsed_data, status, kintone_record_id, form_type_id, form_type_version, applicant_name, applicant_email, approved_rental_plan_id, requested_rental_plan_id, approved_contents, company_staff_name_input, approved_staff_name, form_types(name, kintone_app_id, field_mapping)"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { ok: false, error: "申請が見つかりません" };
  }

  const formType = request.form_types as unknown as {
    name: string;
    kintone_app_id: number;
    field_mapping: FieldMapping;
  } | null;

  if (!formType) {
    return { ok: false, error: "案件種別が見つかりません" };
  }

  // レンタルプランをkintoneへ反映(承認プラン優先。既に借りている申請でも承認時に確定した値を使う)
  const parsedData = { ...((request.parsed_data ?? {}) as Record<string, string>) };
  const planId =
    (request.approved_rental_plan_id as string | null) ??
    (request.requested_rental_plan_id as string | null);
  if (planId) {
    const { data: plan } = await supabase
      .from("rental_plans")
      .select("name")
      .eq("id", planId)
      .maybeSingle();
    if (plan?.name) parsedData["レンタルプラン"] = plan.name;
  }

  // 承認画面で確定したコンテンツ正式名称をkintone登録値に反映
  // (申請原文ではなく商品マスタの正式名称を登録。数量との対応はラベルで保たれる)
  const approvedContents = (request.approved_contents ?? {}) as Record<string, string>;
  for (const [label, name] of Object.entries(approvedContents)) {
    if (name && name.trim()) parsedData[label] = name;
  }

  // 弊社担当者: 申請原文ではなく承認確定した正式名称を kintone「担当者」へ登録。
  // サーバー側検証: 申請に担当者入力がある場合、承認済み担当者が担当者マスターに存在し有効であること
  const staffInputForKintone = (request.company_staff_name_input as string | null)?.trim() ?? "";
  if (staffInputForKintone) {
    const approvedStaff = (request.approved_staff_name as string | null)?.trim() ?? "";
    if (!approvedStaff) {
      return {
        ok: false,
        error: "弊社担当者が未確定です(承認画面で正式名称を選択してください)",
      };
    }
    const { data: staffRow } = await supabase
      .from("staff_members")
      .select("name, is_active")
      .eq("name", approvedStaff)
      .maybeSingle();
    if (!staffRow || !staffRow.is_active) {
      return {
        ok: false,
        error: "確定した担当者が担当者マスターに存在しないか無効です",
      };
    }
    // App49「担当者」= 文字列__1行__0(FMTラベル「担当者」経由でマッピング)
    parsedData["担当者"] = staffRow.name;
  }

  // kintone AppID は form_types(現行)から取得
  const appId = formType.kintone_app_id;

  // field_mapping は「申請時点の version」の定義を使用する
  // (FMT・マッピング改訂後も過去申請が壊れない。履歴が無い場合のみ現行へフォールバック)
  const versioned = await getVersionedConfig(
    supabase,
    request.form_type_id as string,
    request.form_type_version as number
  );
  const fieldMapping = versioned?.field_mapping ?? formType.field_mapping;

  if (!isKintoneReady(fieldMapping)) {
    return {
      ok: false,
      error: "kintone登録は未設定です(この種別のマッピング確定後に実行できます)",
    };
  }

  const addHistory = async (
    action: string,
    detail: Record<string, unknown> | null
  ) => {
    await supabase.from("request_histories").insert({
      request_id: requestId,
      action,
      actor,
      detail,
    });
  };

  const markFailed = async (step: string, errorMessage: string) => {
    await supabase
      .from("requests")
      .update({ status: "register_failed" })
      .eq("id", requestId);
    await addHistory("kintone_failed", { step, error: errorMessage });
  };

  const message = (err: unknown) =>
    err instanceof Error ? err.message : "不明なエラー";

  // ---- [1] App10へレコード登録(未登録の場合のみ) ----
  let recordId = request.kintone_record_id as string | null;

  if (!recordId) {
    const mapped = buildKintoneRecord(parsedData, fieldMapping);
    if (!mapped.ok) {
      const msg = `マッピングエラー: ${mapped.errors.join(" / ")}`;
      await markFailed("mapping", msg);
      return { ok: false, error: msg };
    }

    // 名称正規化(機器商品/コンテンツの表記ゆれを正式名称へ補正)。
    // オールマイトの料金計算は機器名を使うため、必ず applyAllmightPricing より前に実行する
    const normalized = await normalizeRecordItems(supabase, formType.name, mapped.record);
    normalized.warnings.forEach((w) => console.warn("[item-normalize]", w));
    normalized.corrections.forEach((c) => console.info("[item-normalize]", c));

    // オールマイトのみ: API登録ではkintone JSが発火しないため、
    // 利用日数・利用金額①〜⑤をサーバー側で計算して補完(計算/配送費/調整額には触れない)
    let pricingWarnings: string[] = [];
    if (formType.name === "オールマイト") {
      pricingWarnings = applyAllmightPricing(mapped.record).warnings;
      pricingWarnings.forEach((w) => console.warn("[pricing]", w));
    }

    try {
      const result = await registerRecord(appId, mapped.record);
      recordId = result.recordId;
    } catch (err) {
      const msg = message(err);
      await markFailed("app10_register", msg);
      return { ok: false, error: msg };
    }

    // 再実行時の二重登録を防ぐため、登録直後にIDを保存
    await supabase
      .from("requests")
      .update({ kintone_record_id: recordId })
      .eq("id", requestId);
    await addHistory("kintone_registered", {
      kintone_record_id: recordId,
      ...(pricingWarnings.length > 0 ? { pricing_warnings: pricingWarnings } : {}),
      ...(normalized.warnings.length > 0 ? { name_warnings: normalized.warnings } : {}),
      ...(normalized.corrections.length > 0
        ? { name_corrections: normalized.corrections }
        : {}),
    });
  }

  // ---- [2][3] 採番 + App10の管理番号更新(未採番の場合のみ) ----
  let managementNo = "";
  try {
    const { record: app10Record } = await getRecord(appId, recordId);
    managementNo = String(app10Record[MANAGEMENT_NO_FIELD_APP10]?.value ?? "");

    if (!managementNo) {
      managementNo = await issueManagementNumber();
      await updateRecord(appId, recordId, {
        [MANAGEMENT_NO_FIELD_APP10]: { value: managementNo },
      });
      await addHistory("numbered", { management_no: managementNo });
    }

    await supabase
      .from("requests")
      .update({ management_no: managementNo })
      .eq("id", requestId);

    // ---- [4] 配送管理(App11)へ upsert ----
    const shipping = await upsertShippingRecord(managementNo, app10Record);
    await addHistory("shipping_synced", {
      management_no: managementNo,
      shipping_record_id: shipping.recordId,
      created: shipping.created,
    });
  } catch (err) {
    const msg = message(err);
    await markFailed(managementNo ? "shipping" : "numbering", msg);
    return { ok: false, error: msg };
  }

  // ---- 完了 ----
  const { error: updateError } = await supabase
    .from("requests")
    .update({ status: "registered" })
    .eq("id", requestId);
  if (updateError) {
    console.error("[register-request] requests更新失敗:", updateError.message);
  }

  // LINE WORKS通知(no-opスタブ)。失敗してもフローは止めない
  try {
    await notifyApproved({ formTypeName: formType.name, kintoneRecordId: recordId });
  } catch (err) {
    console.error("[register-request] LINE WORKS通知失敗:", err);
  }

  // 共通通知サービス(Google Chat / LINE)。
  // 【通知条件】ここに到達するのは kintone登録・採番・配送管理連携が **すべて成功** した場合のみ
  //   (いずれかが失敗した場合は上の catch で markFailed → return し、通知は行わない)
  // 通知内容は **kintoneレコードから生成**するため、kintone直接登録時と本文が100%一致する。
  // 【分離】通知の成否は登録処理の成否に影響させない(結果は履歴に保存し画面に表示)
  try {
    const { record: latestRecord } = await getRecord(appId, recordId);
    const notifyResult = await notifyRegistration(
      notificationFromKintoneRecord(latestRecord, appId, {
        formTypeName: formType.name,
        managementNo,
        recordId,
      }),
      { source: "app", dedupKey: registrationDedupKey(appId, recordId) }
    );
    if (!notifyResult.skipped) {
      const allOk = notifyResult.results.every((r) => r.ok);
      await addHistory(allOk ? "notified" : "notify_failed", {
        results: notifyResult.results,
      });
    }
  } catch (err) {
    console.error("[register-request] 共通通知に失敗:", err);
  }

  // 承認完了メール(入力者宛)。kintone登録=承認完了 の時点で一度だけ送信。
  // approval_email_sent_at で二重送信を防止(retry再実行・再読み込みでも重複しない)
  try {
    await sendApprovalMail(
      supabase,
      requestId,
      {
        applicant_name: (request.applicant_name as string | null) ?? null,
        applicant_email: (request.applicant_email as string | null) ?? null,
        management_no: managementNo,
        formTypeName: formType.name,
        boothName: parsedData["イベントブース名"] ?? "",
        agencyName: parsedData["取次店名"] ?? "",
      },
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[register-request] 承認完了メール失敗:", err);
  }

  return { ok: true, recordId, managementNo };
}
