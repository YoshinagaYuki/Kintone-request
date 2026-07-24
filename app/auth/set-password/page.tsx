"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * パスワード設定画面(招待メール/パスワード再設定メールのリンクから開く)。
 * ・リンクに含まれるトークンから Supabase がセッションを確立する(detectSessionInUrl)。
 * ・本人が新しいパスワードを設定 → account/activate で invited→active に更新 → 管理画面へ。
 * ・セッションが無い(期限切れ/無効リンク)場合は分かりやすいエラーと再送依頼の案内を表示。
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    // リンク経由のセッション確立を待つ(auth状態の変化 or 現在のセッション確認)
    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) setHasSession(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (mounted && session) setHasSession(true);
    });
    const t = setTimeout(() => mounted && setReady(true), 800);
    return () => {
      mounted = false;
      clearTimeout(t);
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.trim().length < 8 || /^\s*$/.test(password)) {
      setError("パスワードは8文字以上で、空白のみは使用できません。");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません。");
      return;
    }
    setSubmitting(true);
    const { error: updErr } = await supabase.auth.updateUser({ password });
    if (updErr) {
      setError(`パスワードの設定に失敗しました: ${updErr.message}`);
      setSubmitting(false);
      return;
    }
    // 本人アカウントを有効化(invited→active)
    await fetch("/api/admin/account/activate", { method: "POST" }).catch(() => null);
    setDone(true);
    setSubmitting(false);
    setTimeout(() => {
      router.push("/admin/requests");
      router.refresh();
    }, 1200);
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-bold">パスワードの設定</h1>

      {done ? (
        <p className="mt-6 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          パスワードを設定しました。管理画面へ移動します…
        </p>
      ) : !hasSession && ready ? (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">リンクが無効か、有効期限が切れています。</p>
          <p className="mt-1">
            お手数ですが、招待またはパスワード再設定メールの再送を管理者にご依頼ください。
            届いた最新のメールのリンクから再度お試しください。
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium">新しいパスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              placeholder="8文字以上"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">新しいパスワード(確認)</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || (!hasSession && ready)}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {submitting ? "設定中..." : "パスワードを設定"}
          </button>
          {!ready && <p className="text-xs text-gray-500">リンクを確認しています…</p>}
        </form>
      )}
    </main>
  );
}
