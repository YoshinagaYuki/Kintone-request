"use client";

import { useState, useId, useRef } from "react";
import {emailFields,readableTemplate,storedTemplate,previewTemplate} from '@/lib/mail/template-fields';
import { useRouter } from "next/navigation";

export type EmailTemplateRow = { key: "application" | "approval"; subject: string; body: string };
export type BusinessKey = "tezukuru" | "allmight";

export type EmailTemplatesByBusiness = Record<BusinessKey, EmailTemplateRow[]>;

const BUSINESS_TABS: { key: BusinessKey; label: string }[] = [
  { key: "tezukuru", label: "てずくーる" },
  { key: "allmight", label: "オールマイト" },
];

const TABS: { key: EmailTemplateRow["key"]; label: string }[] = [
  { key: "application", label: "申請完了メール" },
  { key: "approval", label: "本登録完了メール" },
];



/** メールテンプレート編集(事業切替: てずくーる/オールマイト × 申請完了/承認完了)。本文はDB保存 */
export function EmailTemplateEditor({ templates,driveUrls }: { templates: EmailTemplatesByBusiness;driveUrls:Record<BusinessKey,string> }) {
  const router = useRouter();
  const bodyRef=useRef<HTMLTextAreaElement>(null);
  const[drives,setDrives]=useState(driveUrls);
  const fieldPrefix = useId();
  const [business, setBusiness] = useState<BusinessKey>("tezukuru");
  const [active, setActive] = useState<EmailTemplateRow["key"]>("application");
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>(() => {
    const d: Record<string, { subject: string; body: string }> = {};
    (Object.keys(templates) as BusinessKey[]).forEach((b) => {
      templates[b].forEach((t) => {
        d[`${b}:${t.key}`] = { subject: t.subject, body: t.body };
      });
    });
    return d;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const slot = `${business}:${active}`;
  const current = drafts[slot] ?? { subject: "", body: "" };

  function update(patch: Partial<{ subject: string; body: string }>) {
    setDrafts((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
    setSaved(false);
  }
  function resetMsg() {
    setSaved(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      if(active==='approval'&&drives[business]!==driveUrls[business]){const settings=await fetch('/api/admin/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({[business==='allmight'?'manual_drive_url_allmight':'manual_drive_url']:drives[business]})});
      if(!settings.ok){const d=await settings.json();throw Error(d.error||'ドライブURLを保存できません');}}
      const res = await fetch("/api/admin/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: active, business, subject: current.subject, body: current.body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "保存に失敗しました");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch(e) {
      setError(e instanceof Error?e.message:"通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-editor mt-6">
      {/* 事業切替 */}
      <div className="flex flex-wrap gap-2">
        {BUSINESS_TABS.map((b) => (
          <button
            key={b.key}
            aria-pressed={business === b.key}
            onClick={() => {
              setBusiness(b.key);
              resetMsg();
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              business === b.key
                ? "border-blue-600 bg-blue-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {business === "allmight" && (
        <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-800">
          オールマイト専用テンプレートです。未入力のままだと汎用の既定文面で送信されます(てずくーるの文面は使われません)。
        </p>
      )}

      {/* テンプレ種別タブ */}
      <div className="mt-4 flex gap-2 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-pressed={active === t.key}
            onClick={() => {
              setActive(t.key);
              resetMsg();
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      {saved && (
        <p role="status" className="mt-4 rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
          保存しました。
        </p>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label htmlFor={`${fieldPrefix}-subject`} className="block text-sm font-medium text-gray-700">件名</label>
          <input
            type="text"
            id={`${fieldPrefix}-subject`}
            value={readableTemplate(current.subject)}
            onChange={(e) => update({ subject: storedTemplate(e.target.value) })}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`${fieldPrefix}-body`} className="block text-sm font-medium text-gray-700">本文</label>
          <textarea
            ref={bodyRef} id={`${fieldPrefix}-body`}
            value={readableTemplate(current.body)}
            onChange={(e) => update({ body: storedTemplate(e.target.value) })}
            rows={20}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm leading-relaxed focus:border-blue-500 focus:outline-none"
          />
        </div>

        <section className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4"><h3 className="text-sm font-semibold">本文に入れる項目</h3><p className="mt-1 text-xs leading-6 text-slate-500">項目を選ぶと本文のカーソル位置に追加します。送信時に実際の内容へ置き換わります。</p><div className="mt-3 flex flex-wrap gap-2">{emailFields.filter(f=>active==='approval'||!['manual_drive_url','approved_at','management_no'].includes(f.key)).map(f=><button type="button" key={f.key} className="rounded-lg border bg-white px-3 py-2 text-xs font-medium text-indigo-800" onClick={()=>{const el=bodyRef.current,text=readableTemplate(current.body),start=el?.selectionStart??text.length,end=el?.selectionEnd??text.length,marker=`【${f.label}】`;update({body:storedTemplate(text.slice(0,start)+marker+text.slice(end))});bodyRef.current?.focus();}}>{f.label}を追加</button>)}</div></section>
        {active==='approval'&&<section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4"><h3 className="text-sm font-semibold">{business==='allmight'?'オールマイト':'てずくーる'}のドライブ資料</h3><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={/\{\{\s*manual_drive_url\s*\}\}/.test(current.body)} onChange={e=>update({body:e.target.checked?`${current.body}\n\n資料・マニュアル\n{{manual_drive_url}}`:current.body.replace(/\{\{\s*manual_drive_url\s*\}\}/g,'')})}/>本登録メールの本文にドライブリンクを入れる</label><label className="mt-3 block text-xs text-slate-600">共有リンク<input type="url" aria-label="この事業のドライブ共有リンク" value={drives[business]} onChange={e=>{setDrives(v=>({...v,[business]:e.target.value}));setSaved(false);}} placeholder="https://drive.google.com/..." className="mt-1 block w-full rounded-lg border bg-white p-3 text-sm"/></label><p className="mt-2 text-xs leading-6 text-slate-500">選択している事業だけに保存します。もう一方の事業のリンクは変わりません。</p></section>}
        <section className="rounded-xl border bg-white p-4"><h3 className="text-sm font-semibold">送信イメージ（サンプル）</h3><p className="mt-3 border-b pb-3 text-sm font-semibold">{previewTemplate(current.subject,business,drives[business])}</p><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{previewTemplate(current.body,business,drives[business])}</p></section>

        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          {busy ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );
}
