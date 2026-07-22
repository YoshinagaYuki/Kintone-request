"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_FMT_TEMPLATE,
  DEFAULT_INPUT_GUIDE,
  DEFAULT_NOTES,
} from "@/lib/form-defaults";

export type FormSettingRow = {
  id: string;
  name: string;
  is_active: boolean;
  version: number;
  fmt_template: string;
  notes: string;
  input_guide: string;
  updated_at: string;
};

type FieldKey = "fmt_template" | "notes" | "input_guide";

const DEFAULTS: Record<FieldKey, string> = {
  fmt_template: DEFAULT_FMT_TEMPLATE,
  input_guide: DEFAULT_INPUT_GUIDE,
  notes: DEFAULT_NOTES,
};

const FIELD_LABELS: Record<FieldKey, string> = {
  fmt_template: "FMTテンプレート本文",
  input_guide: "案内文章",
  notes: "注意事項",
};

/**
 * 申請フォーム設定の編集(FMTテンプレート/注意事項/案内文章)。
 * ・form_types 一覧から編集対象を選択(将来フォームが増えても対応)
 * ・各項目に「初期値へ戻す」(確認ダイアログあり)
 * ・FMTには コピー / 初期値へ戻す / 保存 の3ボタン
 * ・改行・全角スペース・インデントを保持。空欄保存も可能
 */
export function FormSettingsEditor({ forms }: { forms: FormSettingRow[] }) {
  const router = useRouter();
  const [activeId, setActiveId] = useState(forms[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [drafts, setDrafts] = useState<Record<string, Record<FieldKey, string>>>(() =>
    Object.fromEntries(
      forms.map((f) => [
        f.id,
        {
          fmt_template: f.fmt_template ?? "",
          notes: f.notes ?? "",
          input_guide: f.input_guide ?? "",
        },
      ])
    )
  );

  const current = forms.find((f) => f.id === activeId) ?? null;
  const draft = drafts[activeId];

  function setField(field: FieldKey, value: string) {
    setDrafts((prev) => ({ ...prev, [activeId]: { ...prev[activeId], [field]: value } }));
    setMessage(null);
    setError(null);
  }

  /** 指定項目を初期値へ戻す(確認ダイアログあり。保存するまではDBに反映されない) */
  function resetField(field: FieldKey) {
    if (
      !window.confirm(
        `「${FIELD_LABELS[field]}」を初期値へ戻します。\n編集中の内容は失われます。よろしいですか？`
      )
    ) {
      return;
    }
    setField(field, DEFAULTS[field]);
    setMessage(`「${FIELD_LABELS[field]}」を初期値へ戻しました。保存すると反映されます。`);
  }

  /** 3項目すべてを初期値へ戻す */
  function resetAll() {
    if (
      !window.confirm(
        "FMTテンプレート・案内文章・注意事項をすべて初期値へ戻します。\n編集中の内容は失われます。よろしいですか？"
      )
    ) {
      return;
    }
    setDrafts((prev) => ({ ...prev, [activeId]: { ...DEFAULTS } }));
    setMessage("すべて初期値へ戻しました。保存すると反映されます。");
    setError(null);
  }

  async function copyTemplate() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.fmt_template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました(ブラウザの権限をご確認ください)");
    }
  }

  async function save() {
    if (!current || !draft || busy) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/form-settings/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "保存に失敗しました");
        return;
      }
      setMessage("保存しました。公開申請画面へ即時反映されます。");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  if (!current || !draft) {
    return (
      <p className="mt-6 rounded-lg border border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
        編集できる申請フォームがありません
      </p>
    );
  }

  const textareaClass =
    "mt-1 w-full rounded-md border border-gray-300 bg-white p-3 font-mono text-sm leading-relaxed focus:border-blue-500 focus:outline-none";
  const subButton =
    "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

  return (
    <div className="mt-6">
      {/* ① フォーム種別の選択(form_types 一覧から選択。将来フォームが増えても対応) */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">
          編集するフォーム種別
        </label>
        <select
          value={activeId}
          onChange={(e) => {
            setActiveId(e.target.value);
            setMessage(null);
            setError(null);
          }}
          className="mt-1 w-full max-w-sm rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
        >
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.is_active ? "" : "(非公開)"}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          定義Version: {current.version} / 最終更新:{" "}
          {new Date(current.updated_at).toLocaleString("ja-JP")}
          {!current.is_active && " / この種別は現在 非公開(新規申請に表示されません)"}
        </p>
      </div>

      <div className="mt-6 space-y-6">
        {/* 案内文章 */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-gray-800">案内文章</label>
            <button type="button" onClick={() => resetField("input_guide")} className={subButton}>
              初期値へ戻す
            </button>
          </div>
          <p className="text-xs text-gray-500">
            申請画面のテンプレート上部に表示される説明文です。
          </p>
          <textarea
            value={draft.input_guide}
            onChange={(e) => setField("input_guide", e.target.value)}
            rows={4}
            className={textareaClass}
          />
        </div>

        {/* ③ FMTテンプレート: コピー / 初期値へ戻す / 保存 */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-gray-800">
              FMTテンプレート本文
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={copyTemplate} className={subButton}>
                {copied ? "コピーしました" : "コピー"}
              </button>
              <button type="button" onClick={() => resetField("fmt_template")} className={subButton}>
                初期値へ戻す
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-gray-300"
              >
                {busy ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            申請者が「テンプレートをコピー」でコピーする本文です。改行・全角スペース・インデントはそのまま保持されます。
          </p>
          <textarea
            value={draft.fmt_template}
            onChange={(e) => setField("fmt_template", e.target.value)}
            rows={20}
            spellCheck={false}
            className={textareaClass}
          />
          <p className="mt-1 text-xs text-amber-700">
            ※ ラベル(「取次店名:」等)を変更するとFMT解析に影響します。項目名の変更時はマッピング設定もあわせてご確認ください。
          </p>
        </div>

        {/* 注意事項 */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-semibold text-gray-800">注意事項</label>
            <button type="button" onClick={() => resetField("notes")} className={subButton}>
              初期値へ戻す
            </button>
          </div>
          <p className="text-xs text-gray-500">
            申請画面の黄色の注意事項ボックスに表示されます。
          </p>
          <textarea
            value={draft.notes}
            onChange={(e) => setField("notes", e.target.value)}
            rows={6}
            className={textareaClass}
          />
        </div>
      </div>

      {/* 保存 / すべて初期値へ戻す */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {busy ? "保存中..." : "保存する"}
        </button>
        <button
          onClick={resetAll}
          disabled={busy}
          className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          すべて初期値へ戻す
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
