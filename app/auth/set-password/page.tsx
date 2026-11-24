"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { passwordLinkToken } from "@/lib/auth/password-links";

/**
 * パスワード設定画面(招待メール/パスワード再設定メールのリンクから開く)。
 * ・レンタル専用リンクのワンタイムトークンを明示検証してセッションを確立する。
 * ・本人が新しいパスワードを設定 → account/activate で invited→active に更新 → 管理画面へ。
 * ・セッションが無い(期限切れ/無効リンク)場合は分かりやすいエラーと再送依頼の案内を表示。
 */
export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const verification = useRef<Promise<boolean> | null>(null);

  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    function verifyLink() {
      // Cache the one-time verification across React Strict Mode's effect replay.
      if (!verification.current) {
        verification.current = (async () => {
          const sourceHash = window.location.hash;
          const token = passwordLinkToken(sourceHash);
          if (!token) return false;
          try {
            const { data, error } = await supabase.auth.verifyOtp(token);
            return !error && Boolean(data.session);
          } catch {
            return false;
          } finally {
            if (window.location.hash === sourceHash) window.history.replaceState(null, '', window.location.pathname);
          }
        })();
      }
      const current = verification.current;
      current.then((valid) => {
        if (mounted && verification.current === current) {
          setHasSession(valid);
          setReady(true);
        }
      });
    }
    function onNewLink() {
      verification.current = null;
      setReady(false);
      setHasSession(false);
      setPassword("");
      setConfirm("");
      setError(null);
      setDone(false);
      verifyLink();
    }
    verifyLink();
    window.addEventListener('hashchange', onNewLink);
    return () => {
      mounted = false;
      window.removeEventListener('hashchange', onNewLink);
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!ready || !hasSession || submitting) return;
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
    try {
      const response = await fetch("/api/admin/account/activate", { method: "POST" });
      if (!response.ok) throw new Error("activation failed");
    } catch {
      setError("パスワードは保存されましたが、管理者の有効化を確認できませんでした。もう一度設定を押すか、管理者へお問い合わせください。");
      setSubmitting(false);
      return;
    }
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
      <p className="mb-2 text-sm font-semibold text-blue-700">レンタル管理システム</p>
      <h1 className="text-xl font-bold">パスワードの設定</h1>

      {done ? (
        <p className="mt-6 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          パスワードを設定しました。管理画面へ移動します…
        </p>
      ) : !ready ? (
        <p className="mt-6 text-sm text-gray-600" role="status">リンクを確認しています…</p>
      ) : !hasSession ? (
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
            <label htmlFor="new-password" className="block text-sm font-medium">新しいパスワード</label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
              placeholder="8文字以上"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium">新しいパスワード(確認)</label>
            <input
              id="confirm-password"
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
            disabled={submitting || !hasSession || !ready}
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
