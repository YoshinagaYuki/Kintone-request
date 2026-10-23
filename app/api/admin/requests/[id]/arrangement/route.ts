import {withInventorySheetPush} from "@/lib/inventory/sheet-push";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";
import { updateRecord } from "@/lib/kintone/client";
import {
  normalizeArrangement,
  arrangementToKintone,
  normalizeArrangementTime,
  arrangementTimeToKintone,
  isValidTime,
  KINTONE_DELIVERY_ARRANGEMENT_CODE,
  KINTONE_PICKUP_ARRANGEMENT_CODE,
  KINTONE_DELIVERY_TIME_CODE,
  KINTONE_PICKUP_TIME_CODE,
  type ArrangementValue,
} from "@/lib/allmight-arrangement";

/**
 * オールマイト申請の手配種別(配送/集荷)を変更する。
 * ・変更できるのは「利用中の管理者」かつ「担当事業にオールマイトを含む」管理者のみ(サーバー検証)。
 * ・対象はオールマイト(App10)申請のみ。てずくーるには影響しない。
 * ・申請者からの直接操作は不可(/api/admin 配下・管理者認証必須)。
 * ・保存後、既に kintone 登録済み(kintone_record_id あり)なら updateRecord で App10 を同期。
 *   未登録なら承認時の登録で反映される。同期失敗は保存を失敗させず警告として返す。
 * ・変更は request_histories(action=arrangement_changed)に記録する。
 */
function parseArrangement(v: unknown): ArrangementValue | null {
  return v === "normal" || v === "charter" ? v : null;
}

async function PATCHHandler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: {
    delivery_arrangement?: unknown;
    pickup_arrangement?: unknown;
    delivery_time?: unknown;
    pickup_time?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const delivery = parseArrangement(body.delivery_arrangement);
  const pickup = parseArrangement(body.pickup_arrangement);
  if (!delivery || !pickup) {
    return NextResponse.json(
      { error: "手配種別の値が不正です(通常配送 / チャーター)" },
      { status: 400 }
    );
  }
  // 時刻フィールドは「キーが存在するか」で省略を判定する(古い画面/APIで省略された場合に
  // 保存済み時刻を意図せず消さないため)。
  const hasDeliveryTime = Object.prototype.hasOwnProperty.call(body, "delivery_time");
  const hasPickupTime = Object.prototype.hasOwnProperty.call(body, "pickup_time");

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select(
      "id, form_type_id, kintone_record_id, deleted_at, allmight_delivery_time, allmight_pickup_time, form_types(kintone_app_id)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }
  if (request.deleted_at) {
    return NextResponse.json(
      { error: "この申請は削除済みです。復元してから操作してください。" },
      { status: 409 }
    );
  }

  const appId = (request.form_types as unknown as { kintone_app_id?: number } | null)
    ?.kintone_app_id;
  if (appId !== 10) {
    return NextResponse.json(
      { error: "手配種別の変更はオールマイト申請のみ可能です" },
      { status: 400 }
    );
  }

  // 担当事業にオールマイト(この申請の form_type_id)を含む管理者のみ変更可
  const { data: biz } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id)
    .eq("form_type_id", request.form_type_id as string)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json(
      { error: "オールマイト担当の管理者のみ変更できます" },
      { status: 403 }
    );
  }

  // チャーター便の時刻を解決する。
  // ・通常配送(normal): 常に null(時刻なし。kintone 側も空へクリア)。
  // ・チャーター(charter):
  //     キーあり → "HH:MM" 必須・形式検証。
  //     キーなし(省略) → 既存の保存値を維持(古い画面/APIで消えないように)。
  const resolveTime = (
    arrangement: ArrangementValue,
    hasKey: boolean,
    raw: unknown,
    existing: string | null,
    label: string
  ): { time: string | null } | { error: string } => {
    if (arrangement !== "charter") return { time: null };
    if (!hasKey) return { time: normalizeArrangementTime("charter", existing) };
    const t = typeof raw === "string" ? raw.trim() : "";
    if (!t) return { error: `${label}の時間を入力してください(チャーター便)。` };
    if (!isValidTime(t)) return { error: `${label}の時間は HH:MM(24時間)で入力してください。` };
    return { time: t };
  };

  const dTime = resolveTime(
    delivery,
    hasDeliveryTime,
    body.delivery_time,
    (request.allmight_delivery_time as string | null) ?? null,
    "配送"
  );
  if ("error" in dTime) return NextResponse.json({ error: dTime.error }, { status: 400 });
  const pTime = resolveTime(
    pickup,
    hasPickupTime,
    body.pickup_time,
    (request.allmight_pickup_time as string | null) ?? null,
    "集荷"
  );
  if ("error" in pTime) return NextResponse.json({ error: pTime.error }, { status: 400 });
  const deliveryTime = dTime.time;
  const pickupTime = pTime.time;

  // DBへ保存
  const { error: updErr } = await admin
    .from("requests")
    .update({
      allmight_delivery_arrangement: delivery,
      allmight_pickup_arrangement: pickup,
      allmight_delivery_time: deliveryTime,
      allmight_pickup_time: pickupTime,
    })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { error: `保存に失敗しました: ${updErr.message}` },
      { status: 500 }
    );
  }

  // 変更履歴(ベストエフォート。履歴保存の失敗で同期フラグ更新を妨げない=警告表示を維持)
  try {
    await admin.from("request_histories").insert({
      request_id: id,
      action: "arrangement_changed",
      actor: me!.auth_user_id,
      detail: {
        delivery_arrangement: delivery,
        pickup_arrangement: pickup,
        delivery_time: deliveryTime,
        pickup_time: pickupTime,
      },
    });
  } catch (err) {
    console.error("[arrangement] 履歴記録に失敗:", err instanceof Error ? err.message : err);
  }

  // 承認後(kintone登録済み)の場合は App10 を同期更新。未登録なら承認時に反映される。
  let kintoneSync: "synced" | "skipped" | "failed" = "skipped";
  const recordId = request.kintone_record_id as string | null;
  if (recordId) {
    try {
      await updateRecord(10, recordId, {
        [KINTONE_DELIVERY_ARRANGEMENT_CODE]: {
          value: arrangementToKintone(normalizeArrangement(delivery)),
        },
        [KINTONE_PICKUP_ARRANGEMENT_CODE]: {
          value: arrangementToKintone(normalizeArrangement(pickup)),
        },
        // チャーターは時刻、通常配送は "" で kintone 側をクリア
        [KINTONE_DELIVERY_TIME_CODE]: { value: arrangementTimeToKintone(delivery, deliveryTime) },
        [KINTONE_PICKUP_TIME_CODE]: { value: arrangementTimeToKintone(pickup, pickupTime) },
      });
      kintoneSync = "synced";
    } catch (err) {
      kintoneSync = "failed";
      try {
        await admin.from("request_histories").insert({
          request_id: id,
          action: "arrangement_sync_failed",
          actor: me!.auth_user_id,
          detail: { error: err instanceof Error ? err.message : "不明なエラー" },
        });
      } catch {
        /* 履歴記録失敗はフラグ更新を妨げない */
      }
    }
  }

  // 同期失敗フラグを決定。
  // 競合対策: 同期成功でも「送信した値」と「現在のDB値」が一致しない場合(他管理者が後から変更)、
  // 最新値が未反映のため未同期(true)として扱う → 警告・再同期で最新値を反映できる。
  // これにより「古い同期成功が最新の失敗フラグを誤って false にする」事象を防ぐ。
  let syncFailedFlag = kintoneSync === "failed";
  if (kintoneSync === "synced") {
    const { data: cur } = await admin
      .from("requests")
      .select(
        "allmight_delivery_arrangement, allmight_pickup_arrangement, allmight_delivery_time, allmight_pickup_time"
      )
      .eq("id", id)
      .maybeSingle();
    const diverged =
      normalizeArrangement(cur?.allmight_delivery_arrangement as string | null) !== delivery ||
      normalizeArrangement(cur?.allmight_pickup_arrangement as string | null) !== pickup ||
      normalizeArrangementTime(delivery, cur?.allmight_delivery_time as string | null) !== deliveryTime ||
      normalizeArrangementTime(pickup, cur?.allmight_pickup_time as string | null) !== pickupTime;
    syncFailedFlag = diverged;
  }
  await admin
    .from("requests")
    .update({ allmight_arrangement_sync_failed: syncFailedFlag })
    .eq("id", id);

  return NextResponse.json({
    ok: true,
    kintoneSync,
    ...(kintoneSync === "failed"
      ? { warning: "DBへ保存しましたが、kintoneへの同期に失敗しました。詳細画面の「再同期」からやり直してください。" }
      : {}),
  });
}

export const PATCH=withInventorySheetPush(PATCHHandler);
