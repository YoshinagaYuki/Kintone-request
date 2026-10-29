import{confirmationMapping,applyConfirmationShipping}from'../inventory/confirmation-shipping';
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
import {
  normalizeArrangement,
  arrangementToKintone,
  arrangementTimeToKintone,
  KINTONE_DELIVERY_ARRANGEMENT_CODE,
  KINTONE_PICKUP_ARRANGEMENT_CODE,
  KINTONE_DELIVERY_TIME_CODE,
  KINTONE_PICKUP_TIME_CODE,
} from "../allmight-arrangement";
import { normalizeRecordItems } from "../item-normalizer";
import { sendApprovalMail } from "../mail/application-mails";
import { notifyRegistration, registrationDedupKey } from "../notify/registration";
import { notificationFromKintoneRecord } from "../notify/kintone-record";

/** App10側の管理番号フィールドコード(docs/kintone-fields-allmight.md) */
const MANAGEMENT_NO_FIELD_APP10 = "管理番号";

export type RegisterResult =
  | { ok: true; recordId: string; managementNo: string; inventoryWarning?:string }
  | { ok: false; error: string };

async function registerRequestInternal(
  supabase: SupabaseClient,
  requestId: string,
  actor: string
): Promise<RegisterResult> {
  const { data: request, error: fetchError } = await supabase
    .from("requests")
    .select(
      "id, inventory_parent_request_id, parsed_data, status, kintone_record_id, form_type_id, form_type_version, applicant_name, applicant_email, approved_rental_plan_id, requested_rental_plan_id, approved_contents, company_staff_name_input, approved_staff_name, customer_requests, billing_type, dsp_handover_note, allmight_delivery_arrangement, allmight_pickup_arrangement, allmight_delivery_time, allmight_pickup_time, form_types(name, kintone_app_id, field_mapping)"
    )
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !request) {
    return { ok: false, error: "申請が見つかりません" };
  }

  const copy=await supabase.from('inventory_copy_requests').select('id').eq('id',requestId).maybeSingle();
  if(copy.error)return {ok:false,error:'コピー申請の連携設定を確認できませんでした'};
  if(copy.data&&(request.form_types as unknown as {kintone_app_id:number})?.kintone_app_id!==49){const {runInventoryCopy}=await import('@/lib/inventory/copy-runner');return runInventoryCopy(requestId,actor);}

  if (request.inventory_parent_request_id) {
    const { runInventoryExtension } = await import("@/lib/inventory/extensions/runner");
    return runInventoryExtension(requestId, actor);
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

  // 料金区分 → kintone「イベント種類」(ドロップダウン)。てずくーる(App49)のみ。
  // ・承認画面で管理者が選択した billing_type(paid/free)を正として送信する。
  // ・paid → 有償イベント / free → 無償イベント。それ以外の値は送信しない。
  // ・再実行時も保存済み billing_type を参照。未設定/不正なら推測せずエラー(管理者に選択を求める)。
  const EVENT_TYPE_BY_BILLING: Record<"paid" | "free", string> = {
    paid: "有償イベント",
    free: "無償イベント",
  };
  const billingTypeForKintone = (request.billing_type as string | null) ?? null;
  if (appId === 49) {
    if (billingTypeForKintone !== "paid" && billingTypeForKintone !== "free") {
      return {
        ok: false,
        error: "料金区分(有償／無償)を選択してください",
      };
    }
  }

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
    const mapped = buildKintoneRecord(parsedData, confirmationMapping(fieldMapping,parsedData));
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

    // DSP様共有事項 → kintone「補足欄」(App49/App10 共通のフィールドコード)。
    // ・管理者が承認時に入力した値(DB保存済み)を登録。改行はそのまま保持。
    // ・入力が空のときは「補足欄」を送らない(既存値を意図せず上書きしない)。
    // ・レコード新規作成時(!recordId)のみ設定。登録成功後の再実行ではこのブロックを通らない。
    {
      const dspNote = ((request.dsp_handover_note as string | null) ?? "").trim();
      if (dspNote) {
        mapped.record["補足欄"] = { value: dspNote };
      }
    }

    // イベント種類(有償/無償)をてずくーる(App49)のレコードへ反映。
    // 既存マッピングで設定済みでも、承認時に管理者が選んだ値を正として上書きする(二重設定・競合防止)。
    if (appId === 49 && (billingTypeForKintone === "paid" || billingTypeForKintone === "free")) {
      mapped.record["イベント種類"] = {
        value: EVENT_TYPE_BY_BILLING[billingTypeForKintone],
      };
    }

    // 手配種別(配送/集荷)をオールマイト(App10)のレコードへ反映。
    // 申請者は常に通常配送。管理者が申請詳細で変更した値(DB)を正として登録する。
    // 既存マッピングの定数があっても上書き(通常配送 / チャーター便)。
    if (appId === 10) {
      const deliveryArr = normalizeArrangement(
        request.allmight_delivery_arrangement as string | null
      );
      const pickupArr = normalizeArrangement(
        request.allmight_pickup_arrangement as string | null
      );
      mapped.record[KINTONE_DELIVERY_ARRANGEMENT_CODE] = {
        value: arrangementToKintone(deliveryArr),
      };
      mapped.record[KINTONE_PICKUP_ARRANGEMENT_CODE] = {
        value: arrangementToKintone(pickupArr),
      };
      // チャーター便の時刻。通常配送は "" で登録(空=時刻なし)。
      mapped.record[KINTONE_DELIVERY_TIME_CODE] = {
        value: arrangementTimeToKintone(
          deliveryArr,
          request.allmight_delivery_time as string | null
        ),
      };
      mapped.record[KINTONE_PICKUP_TIME_CODE] = {
        value: arrangementTimeToKintone(
          pickupArr,
          request.allmight_pickup_time as string | null
        ),
      };
    }

    if([10,49].includes(appId))applyConfirmationShipping(mapped.record,parsedData,fieldMapping);

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

  if(copy.data&&appId===49){try{const{finishTezukuruCopy}=await import('../inventory/tezukuru-copy');await finishTezukuruCopy(supabase,requestId,actor);}catch(e){const msg=message(e);await markFailed('inventory_copy',msg);return{ok:false,error:msg};}}
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
        // ラベルは事業で異なる(てずくーる=「イベントブース名」/ オールマイト=「イベントブース」)
        boothName: parsedData["イベントブース名"] ?? parsedData["イベントブース"] ?? "",
        agencyName: parsedData["取次店名"] ?? "",
        parsedData,
        staffName: parsedData["担当者"] ?? null, // 承認時に確定した正式名称
        customerRequests: (request.customer_requests as string | null) ?? null,
        billingType: (request.billing_type as string | null) ?? null, // 料金区分(てずくーる)
        kintoneAppId: appId, // 事業別メール(テンプレ/Drive URL/注文内容)の判定
      },
      new Date().toISOString()
    );
  } catch (err) {
    console.error("[register-request] 承認完了メール失敗:", err);
  }

  return { ok: true, recordId, managementNo };
}

export async function registerRequestToKintone(supabase:SupabaseClient,requestId:string,actor:string):Promise<RegisterResult>{
 const result=await registerRequestInternal(supabase,requestId,actor);if(!result.ok)return result;
 try{
  const kind=await supabase.from('requests').select('form_types(kintone_app_id)').eq('id',requestId).single();
  if(kind.error)throw Error('申請種別を確認できませんでした');
  const type=kind.data.form_types as unknown as {kintone_app_id:number}|null;
  if(![10,49].includes(type?.kintone_app_id??0))return result;
  const {createAdminClient}=await import('../supabase/admin');
  const {autoAssignRequest}=await import('../inventory/auto-assign-request');
  const allocation=await autoAssignRequest(createAdminClient(),requestId,actor);
  if(allocation.unassigned)return {...result,inventoryWarning:'auto_unassigned'};
 }catch{
  await supabase.from('request_histories').insert({request_id:requestId,action:'inventory_auto_assignment_failed',actor,detail:{message:'機器番号の自動割当を完了できませんでした。手動確認が必要です。'}});
  return {...result,inventoryWarning:'auto_unassigned'};
 }
 return result;
}
