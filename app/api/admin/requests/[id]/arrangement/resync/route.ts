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
  KINTONE_DELIVERY_ARRANGEMENT_CODE,
  KINTONE_PICKUP_ARRANGEMENT_CODE,
  KINTONE_DELIVERY_TIME_CODE,
  KINTONE_PICKUP_TIME_CODE,
} from "@/lib/allmight-arrangement";

/**
 * 手配種別の再同期(kintone同期が失敗した後のリカバリ)。
 * ・Supabase に保存済みの現在の手配種別を App10 の該当レコードへ反映する。
 * ・実行できるのは「利用中 かつ 担当事業にオールマイトを含む管理者」のみ(サーバー検証)。
 * ・対象はオールマイト(App10)かつ kintone登録済み(kintone_record_id あり)の申請のみ
 *   → 二重更新・他事業(App49)への誤更新を防止。
 * ・成功で sync_failed=false + 履歴 arrangement_synced、失敗で sync_failed=true + 履歴 arrangement_sync_failed。
 * ・既存の申請・承認・配送・通知処理には影響しない。
 */
async function POSTHandler(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from("requests")
    .select(
      "id, form_type_id, kintone_record_id, deleted_at, allmight_delivery_arrangement, allmight_pickup_arrangement, allmight_delivery_time, allmight_pickup_time, form_types(kintone_app_id)"
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
      { error: "再同期はオールマイト申請のみ可能です" },
      { status: 400 }
    );
  }

  // 担当事業にオールマイト(この申請の form_type_id)を含む管理者のみ
  const { data: biz } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id)
    .eq("form_type_id", request.form_type_id as string)
    .maybeSingle();
  if (!biz) {
    return NextResponse.json(
      { error: "オールマイト担当の管理者のみ再同期できます" },
      { status: 403 }
    );
  }

  const recordId = request.kintone_record_id as string | null;
  if (!recordId) {
    return NextResponse.json(
      { error: "この申請はまだkintoneへ登録されていません(承認時に反映されます)" },
      { status: 409 }
    );
  }

  const delivery = normalizeArrangement(request.allmight_delivery_arrangement as string | null);
  const pickup = normalizeArrangement(request.allmight_pickup_arrangement as string | null);
  const deliveryTime = normalizeArrangementTime(delivery, request.allmight_delivery_time as string | null);
  const pickupTime = normalizeArrangementTime(pickup, request.allmight_pickup_time as string | null);

  try {
    await updateRecord(10, recordId, {
      [KINTONE_DELIVERY_ARRANGEMENT_CODE]: { value: arrangementToKintone(delivery) },
      [KINTONE_PICKUP_ARRANGEMENT_CODE]: { value: arrangementToKintone(pickup) },
      // チャーターは時刻、通常配送は "" で kintone 側をクリア
      [KINTONE_DELIVERY_TIME_CODE]: { value: arrangementTimeToKintone(delivery, deliveryTime) },
      [KINTONE_PICKUP_TIME_CODE]: { value: arrangementTimeToKintone(pickup, pickupTime) },
    });
  } catch (err) {
    await admin
      .from("requests")
      .update({ allmight_arrangement_sync_failed: true })
      .eq("id", id);
    try {
      await admin.from("request_histories").insert({
        request_id: id,
        action: "arrangement_sync_failed",
        actor: me!.auth_user_id,
        detail: { error: err instanceof Error ? err.message : "不明なエラー", resync: true },
      });
    } catch {
      /* 履歴記録失敗はフラグ更新を妨げない(警告は維持) */
    }
    return NextResponse.json(
      { error: "kintoneへの再同期に失敗しました。時間をおいて再度お試しください。" },
      { status: 502 }
    );
  }

  // 競合対策: 再同期で送った値(読み取り時点のDB値)が、送信後の現在のDB値と一致しない場合
  // (他管理者が間に変更)、最新値が未反映のため未同期のまま(true)にして再同期を促す。
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

  await admin
    .from("requests")
    .update({ allmight_arrangement_sync_failed: diverged })
    .eq("id", id);
  try {
    await admin.from("request_histories").insert({
      request_id: id,
      action: diverged ? "arrangement_sync_failed" : "arrangement_synced",
      actor: me!.auth_user_id,
      detail: { delivery_arrangement: delivery, pickup_arrangement: pickup, delivery_time: deliveryTime, pickup_time: pickupTime, resync: true, diverged },
    });
  } catch {
    /* 履歴記録失敗はフラグ更新を妨げない */
  }

  return NextResponse.json({
    ok: true,
    ...(diverged
      ? { warning: "再同期中に別の変更が行われました。最新の内容で再度「再同期」してください。" }
      : {}),
  });
}

export const POST=withInventorySheetPush(POSTHandler);
