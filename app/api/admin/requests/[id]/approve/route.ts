import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { registerRequestToKintone } from "@/lib/kintone/register-request";
import { getVersionedConfig, isKintoneReady } from "@/lib/form-types";
import type { FieldMapping } from "@/lib/kintone/mapper";

/**
 * 承認: status=approved → kintone登録 → registered / register_failed。
 * middleware は /api を保護しないため、ここで認証チェックする。
 */
export async function POST(
  _req: NextRequest,
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

  // pending のみ承認可能
  const { data: request } = await supabase
    .from("requests")
    .select("id, status, form_type_id, form_type_version, form_types(field_mapping)")
    .eq("id", id)
    .maybeSingle();

  if (!request) {
    return NextResponse.json({ error: "申請が見つかりません" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json(
      { error: `このステータス(${request.status})では承認できません` },
      { status: 409 }
    );
  }

  // 設定駆動ガード: 申請時点version の field_mapping が空なら承認不可
  const formType = request.form_types as unknown as {
    field_mapping?: FieldMapping;
  } | null;
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

  // 承認を記録
  const { error: updateError } = await supabase
    .from("requests")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json(
      { error: `承認の記録に失敗しました: ${updateError.message}` },
      { status: 500 }
    );
  }

  await supabase.from("request_histories").insert({
    request_id: id,
    action: "approved",
    actor: user.id,
  });

  // kintone登録(共通処理)
  const result = await registerRequestToKintone(supabase, id, user.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, recordId: result.recordId });
}
