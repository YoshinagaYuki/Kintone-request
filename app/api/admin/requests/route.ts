import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";

const MAX_DELETE = 100;

/**
 * 申請の一括「論理削除」(ゴミ箱へ移動)。管理者のみ。
 * body: { ids: string[] } → 削除件数を返す。
 *
 * 【仕様】
 * ・物理削除は廃止。requests.deleted_at を設定する論理削除(履歴は保持される)。
 * ・担当事業(admin_user_businesses)の申請のみ削除可。対象外はスキップ。
 * ・削除と履歴(action='deleted')は RPC で原子的に実行(soft_delete_request)。
 * ・承認・採番・kintone登録・通知・メールには一切触れない。
 */
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "削除対象が選択されていません" }, { status: 400 });
  }
  if (ids.length > MAX_DELETE) {
    return NextResponse.json(
      { error: `一度に削除できるのは${MAX_DELETE}件までです` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 担当事業(この管理者が操作できる form_type_id の集合)
  const { data: bizRows } = await admin
    .from("admin_user_businesses")
    .select("form_type_id")
    .eq("admin_user_id", me!.id);
  const allowedForms = (bizRows ?? []).map((r) => r.form_type_id as string);
  const allowedSet = new Set(allowedForms);

  // 事前チェック: 対象に「存在しない / 担当事業外」が1件でもあれば全件拒否(部分削除しない)
  const { data: targets } = await admin
    .from("requests")
    .select("id, form_type_id, status, processing_at")
    .in("id", ids);
  const foundIds = new Set((targets ?? []).map((r) => r.id as string));
  const missing = ids.filter((id) => !foundIds.has(id));
  const forbidden = (targets ?? []).filter((r) => !allowedSet.has(r.form_type_id as string));
  if (missing.length > 0 || forbidden.length > 0) {
    return NextResponse.json(
      {
        error:
          "担当事業外または存在しない申請が含まれているため、削除を中止しました(全件実行していません)。",
      },
      { status: 403 }
    );
  }

  // 事前チェック: 処理中(承認〜登録完了前 / 外部連携進行中)が1件でも含まれれば全件拒否
  const staleMs = Date.now() - 15 * 60 * 1000;
  const processing = (targets ?? []).filter((r) => {
    const p = r.processing_at as string | null;
    return (
      r.status === "approved" ||
      (p !== null && new Date(p).getTime() > staleMs)
    );
  });
  if (processing.length > 0) {
    return NextResponse.json(
      {
        error:
          "承認処理中・kintone連携中の申請が含まれているため、削除を中止しました。完了後に再度お試しください。",
      },
      { status: 409 }
    );
  }

  // 全件を単一トランザクションで論理削除(all-or-nothing)。1件でも不整合なら全ロールバック。
  const { data: rpc, error } = await admin.rpc("soft_delete_requests_bulk", {
    p_ids: ids,
    p_allowed_form_ids: allowedForms,
    p_actor: me!.auth_user_id ?? "system",
    p_deleted_by: me!.auth_user_id ?? null,
    p_editor: me!.email ?? null,
  });

  if (error) {
    // RPC 内の例外(担当外・既削除・存在しない等)→ 全件未実行
    console.error("[api/admin/requests] bulk soft delete aborted:", error.message);
    return NextResponse.json(
      {
        error:
          "削除を中止しました。対象の状態が変化した(既に削除済み/承認済み等)可能性があります。画面を更新してください。",
      },
      { status: 409 }
    );
  }

  const res = (rpc ?? {}) as { ok?: boolean; deleted?: number };
  return NextResponse.json({ ok: true, deleted: res.deleted ?? 0 });
}
