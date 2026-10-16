import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getCurrentAdmin,
  isActiveAdmin,
  recordAdminAudit,
  findInvalidFormTypeIds,
  setAdminBusinessAndNotify,
} from "@/lib/admin-users";
import { getSetPasswordUrl } from "@/lib/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 既存 auth ユーザーをメールで検索(service_role)。
 * 削除済み管理者(admin_users 行は無いが auth.users は残る)の再招待で、既存IDを得るために使う。
 * listUsers をページングして照合(上限ページで打ち切り)。見つからなければ null。
 */
async function findAuthUserByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string } | null> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return { id: hit.id };
    if (users.length < perPage) break; // 最終ページ
  }
  return null;
}

/** 管理者一覧(active管理者のみ閲覧) */
export async function GET() {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  const { data } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: true });

  // 担当事業(form_type_ids)を各管理者へ付与。
  // admin_user_businesses は RLSポリシー無し = service_role 経由でのみ取得(直接SELECT不可)。
  const svc = createAdminClient();
  const { data: biz } = await svc
    .from("admin_user_businesses")
    .select("admin_user_id, form_type_id");
  const byAdmin = new Map<string, string[]>();
  for (const row of biz ?? []) {
    const key = row.admin_user_id as string;
    const arr = byAdmin.get(key) ?? [];
    arr.push(row.form_type_id as string);
    byAdmin.set(key, arr);
  }
  const users = (data ?? []).map((u) => ({
    ...u,
    form_type_ids: byAdmin.get(u.id as string) ?? [],
  }));
  return NextResponse.json({ users });
}

/**
 * 管理者の招待(active管理者のみ)。Supabase Auth の招待メールを送信し、
 * 本人がリンク先(/auth/set-password)で自分でパスワードを設定する。
 * master 権限の付与は master のみ可能。
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: {
    email?: string;
    display_name?: string;
    role?: string;
    form_type_ids?: string[];
    push_notify_enabled?: boolean;
    email_notify_enabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.display_name ?? "").trim();
  if (!displayName) {
    return NextResponse.json({ error: "氏名を入力してください" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }
  // 新規招待の権限は常に一般管理者(admin)に固定。master 付与は不可(マスターは指定2名で固定)。
  if (body.role === "master") {
    return NextResponse.json(
      { error: "マスター権限を付与することはできません(新規は一般管理者で固定)" },
      { status: 403 }
    );
  }
  const role = "admin" as const;

  // 担当事業・通知設定は master のみ設定可能(クライアント値を信用せずサーバーで判定)
  const wantsBusinessOrNotify =
    Array.isArray(body.form_type_ids) ||
    typeof body.push_notify_enabled === "boolean" ||
    typeof body.email_notify_enabled === "boolean";
  if (wantsBusinessOrNotify && me!.role !== "master") {
    return NextResponse.json(
      { error: "担当事業・通知設定の変更は master のみ可能です" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // 担当事業の form_type_id を検証(不正IDは拒否)
  const formTypeIds = Array.isArray(body.form_type_ids)
    ? body.form_type_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (formTypeIds.length > 0) {
    const invalid = await findInvalidFormTypeIds(admin, formTypeIds);
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "担当事業の指定が不正です" },
        { status: 400 }
      );
    }
  }

  // 既存の管理者ユーザーがいれば重複作成しない(招待再送を案内)
  const { data: existing } = await admin
    .from("admin_users")
    .select("id, status")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録されています(招待再送をご利用ください)" },
      { status: 409 }
    );
  }

  // Supabase Auth: 招待メール送信(アカウント作成 + メール送信)。
  // 過去に削除された管理者(admin_users 行は削除済みだが auth.users は残存)の再招待にも対応する:
  //   inviteUserByEmail が「既に登録済み」で失敗した場合は、既存 auth ユーザーを探し、
  //   パスワード設定(回復)リンクを送って admin_users 行を作り直す。
  let authUserId: string;
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: getSetPasswordUrl(), data: displayName ? { name: displayName } : undefined }
  );
  if (!inviteError && invited?.user) {
    authUserId = invited.user.id;
  } else {
    // 既存 auth ユーザーを検索(ページング)
    const existingAuthUser = await findAuthUserByEmail(admin, email);
    if (!existingAuthUser) {
      return NextResponse.json(
        { error: `招待メールの送信に失敗しました: ${inviteError?.message ?? "不明なエラー"}` },
        { status: 502 }
      );
    }
    authUserId = existingAuthUser.id;
    // 本人がパスワードを再設定して有効化できるよう、回復リンクを送る
    const { error: recoverError } = await admin.auth.resetPasswordForEmail(email, {
      redirectTo: getSetPasswordUrl(),
    });
    if (recoverError) {
      return NextResponse.json(
        { error: `再招待メールの送信に失敗しました: ${recoverError.message}` },
        { status: 502 }
      );
    }
  }

  const { data: createdRow, error: upsertError } = await admin
    .from("admin_users")
    .upsert(
      {
        auth_user_id: authUserId,
        email,
        display_name: displayName,
        role,
        status: "invited",
        invited_at: new Date().toISOString(),
        // master が指定した場合のみ通知設定を反映(未指定は列既定 true のまま)
        ...(typeof body.push_notify_enabled === "boolean"
          ? { push_notify_enabled: body.push_notify_enabled }
          : {}),
        ...(typeof body.email_notify_enabled === "boolean"
          ? { email_notify_enabled: body.email_notify_enabled }
          : {}),
      },
      { onConflict: "auth_user_id" }
    )
    .select("id")
    .single();
  if (upsertError || !createdRow) {
    return NextResponse.json(
      { error: `管理者レコードの作成に失敗しました: ${upsertError?.message ?? "不明なエラー"}` },
      { status: 500 }
    );
  }

  // 担当事業を設定(master が指定した場合)。
  // 失敗時は「成功」にせず明示エラーを返す。管理者レコードは作成済みのため、
  // 再招待(重複作成)ではなく一覧からの編集で修復してもらう。
  if (Array.isArray(body.form_type_ids)) {
    // 通知設定は上の upsert で確定済みのため、ここでは担当事業のみ置換(push/email は null=据え置き)
    const bizResult = await setAdminBusinessAndNotify(
      admin,
      createdRow.id,
      formTypeIds,
      null,
      null
    );
    if (!bizResult.ok) {
      await recordAdminAudit(admin, {
        actorUserId: me!.auth_user_id,
        targetUserId: authUserId,
        action: "invite_business_failed",
        metadata: { error: bizResult.error },
      });
      return NextResponse.json(
        {
          error:
            "管理者は作成しましたが、担当事業の保存に失敗しました。再招待は不要です。管理者一覧の「担当/通知 編集」から担当事業を設定してください。",
        },
        { status: 500 }
      );
    }
  }

  await recordAdminAudit(admin, {
    actorUserId: me!.auth_user_id,
    targetUserId: authUserId,
    action: "invite",
    metadata: {
      email,
      role,
      ...(Array.isArray(body.form_type_ids) ? { form_type_ids: formTypeIds } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
