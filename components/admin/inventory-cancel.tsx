"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function InventoryCancel({ id }: { id: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [confirming, setConfirming] = useState(false);
  return <>{!confirming ? <button className="mt-1 text-red-700 underline" onClick={() => setConfirming(true)}>取消</button> : <><span className="block text-sm">この仮押さえを取り消します。履歴は残ります。</span><button type="button" className="mr-3 underline" disabled={busy} onClick={() => setConfirming(false)}>戻る</button><button className="mt-1 text-red-700 underline disabled:opacity-50" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try { const res = await fetch(`/api/admin/inventory/holds/${id}`, { method: "DELETE" }); const result = await res.json(); if (!res.ok) throw new Error(result.error || "取消に失敗しました"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "通信エラーが発生しました"); }
    finally { setBusy(false); }
  }}>取消を確定</button></>}{error && <span role="alert" className="block text-red-700">{error}</span>}</>;
}
