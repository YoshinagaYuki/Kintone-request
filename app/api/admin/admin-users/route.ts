import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin, isActiveAdmin, recordAdminAudit } from "@/lib/admin-users";
import { getSetPasswordUrl } from "@/lib/site-url";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  return NextResponse.json({ users: data ?? [] });
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

  let body: { email?: string; display_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const displayName = (body.display_name ?? "").trim();
  const role = body.role === "master" ? "master" : "admin";
  if (!displayName) {
    return NextResponse.json({ error: "氏名を入力してください" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "メールアドレスの形式が正しくありません" }, { status: 400 });
  }
  if (body.role !== "admin" && body.role !== "master") {
    return NextResponse.json({ error: "権限の値が不正です" }, { status: 400 });
  }
  if (role === "master" && me!.role !== "master") {
    return NextResponse.json(
      { error: "master 権限の付与は master のみ可能です" },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

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

  // Supabase Auth: 招待メール送信(アカウント作成 + メール送信)
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    email,
    { redirectTo: getSetPasswordUrl(), data: displayName ? { name: displayName } : undefined }
  );
  if (inviteError || !invited?.user) {
    return NextResponse.json(
      { error: `招待メールの送信に失敗しました: ${inviteError?.message ?? "不明なエラー"}` },
      { status: 502 }
    );
  }

  const { error: upsertError } = await admin.from("admin_users").upsert(
    {
      auth_user_id: invited.user.id,
      email,
      display_name: displayName,
      role,
      status: "invited",
      invited_at: new Date().toISOString(),
    },
    { onConflict: "auth_user_id" }
  );
  if (upsertError) {
    return NextResponse.json(
      { error: `管理者レコードの作成に失敗しました: ${upsertError.message}` },
      { status: 500 }
    );
  }

  await recordAdminAudit(admin, {
    actorUserId: me!.auth_user_id,
    targetUserId: invited.user.id,
    action: "invite",
    metadata: { email, role },
  });

  return NextResponse.json({ ok: true });
}
