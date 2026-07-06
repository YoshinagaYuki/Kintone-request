"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StaffCombobox } from "./staff-combobox";

/**
 * 申請フォーム(設定駆動)。
 * ・種別ラジオは is_active=true の form_types を自動描画(コード固定なし。件数が増えても変更不要)
 * ・テンプレート/入力説明/注意事項/完了メッセージ/選択UIはすべて form_types 由来
 * ・選択UI(select_fields)の値は「ラベル: 値」のFMT行として raw_text の先頭に注入される
 *   (パーサー・マッピング・バージョン管理は既存の仕組みをそのまま利用)
 * ・送信は { form_type_id, raw_text }
 */
export type SelectFieldDef = {
  label: string;
  options: string[];
  required?: boolean;
};

export type ApplyFormType = {
  id: string;
  name: string;
  fmt_template: string;
  input_guide: string;
  notes: string;
  select_fields: SelectFieldDef[];
};

/** 担当者マスター(staff_members)の選択肢 */
export type StaffOption = {
  id: string;
  name: string;
  company: string;
};

export function ApplyForm({
  formTypes,
  staffMembers,
}: {
  formTypes: ApplyFormType[];
  staffMembers: StaffOption[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState("");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [rawText, setRawText] = useState("");
  const [selectValues, setSelectValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = formTypes.find((f) => f.id === selectedId) ?? null;
  const selectedStaff = staffMembers.find((s) => s.id === selectedStaffId) ?? null;

  async function copyTemplate() {
    if (!selected?.fmt_template) return;
    try {
      await navigator.clipboard.writeText(selected.fmt_template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード不可の環境では何もしない */
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !selected) return; // 二重送信防止
    setSubmitting(true);
    setErrors([]);

    // 選択UIの値を「ラベル: 値」のFMT行として先頭に注入
    // (先頭のため、貼り付けFMT内に同ラベルがあっても選択値が優先される)
    const injectedLines: string[] = [];
    if (selectedStaff) {
      injectedLines.push(`担当者: ${selectedStaff.name}`); // 担当者マスター(両種別共通・必須)
    }
    for (const f of selected.select_fields ?? []) {
      if ((selectValues[f.label] ?? "") !== "") {
        injectedLines.push(`${f.label}: ${selectValues[f.label]}`);
      }
    }
    const fullText = [...injectedLines, rawText].join("\n");

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_type_id: selected.id,
          raw_text: fullText,
        }),
      });

      if (res.ok) {
        router.push(`/apply/complete?type=${selected.id}`);
        return;
      }

      const body = await res.json().catch(() => null);
      setErrors(
        body?.errors ?? ["送信に失敗しました。時間をおいて再度お試しください。"]
      );
    } catch {
      setErrors(["通信エラーが発生しました。時間をおいて再度お試しください。"]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      {/* 申請種別(form_types自動描画・URLで初期選択・切替可) */}
      <fieldset>
        <legend className="text-sm font-medium text-gray-700">
          申請種別 <span className="text-red-600">*</span>
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {formTypes.map((f) => (
            <label
              key={f.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                selectedId === f.id
                  ? "border-blue-600 bg-blue-50 text-blue-800"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <input
                type="radio"
                name="form_type"
                value={f.id}
                checked={selectedId === f.id}
                onChange={() => {
                  setSelectedId(f.id);
                  setSelectValues({}); // 種別切替時は選択UIをリセット
                  setErrors([]);
                }}
                className="h-4 w-4 accent-blue-600"
              />
              {f.name}
            </label>
          ))}
        </div>
      </fieldset>

      {selected && (
        <>
          {/* 担当者(staff_membersマスター・両種別共通・必須。氏名/所属会社で検索できるコンボボックス) */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">
              担当者 <span className="text-red-600">*</span>
            </label>
            <StaffCombobox
              staffMembers={staffMembers}
              value={selectedStaffId}
              onChange={setSelectedStaffId}
            />
          </div>

          {/* 選択UI(form_types.parser_config.select_fields 駆動。例: てずくーるのレンタルプラン) */}
          {(selected.select_fields ?? []).map((field) => (
            <div key={field.label} className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                {field.label}{" "}
                {field.required && <span className="text-red-600">*</span>}
              </label>
              <select
                value={selectValues[field.label] ?? ""}
                onChange={(e) =>
                  setSelectValues((prev) => ({
                    ...prev,
                    [field.label]: e.target.value,
                  }))
                }
                required={field.required}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">選択してください</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {/* 入力説明(form_types.input_guide) */}
          {selected.input_guide && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
              {selected.input_guide}
            </p>
          )}

          {/* FMTテンプレート(form_types.fmt_template) */}
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-blue-900">
                {selected.name} のFMTテンプレート
              </p>
              {selected.fmt_template && (
                <button
                  type="button"
                  onClick={copyTemplate}
                  className="shrink-0 rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  {copied ? "コピーしました" : "テンプレートをコピー"}
                </button>
              )}
            </div>
            {selected.fmt_template ? (
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-blue-100 bg-white p-2 text-xs leading-relaxed text-gray-700">
                {selected.fmt_template}
              </pre>
            ) : (
              <p className="mt-2 text-xs text-blue-800">
                テンプレート準備中です。担当者から案内されたFMTを貼り付けてください。
              </p>
            )}
          </div>

          {/* 注意事項(form_types.notes) */}
          {selected.notes && (
            <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-xs font-semibold text-yellow-800">注意事項</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-yellow-900">
                {selected.notes}
              </p>
            </div>
          )}
        </>
      )}

      <label className="mt-4 block text-sm font-medium text-gray-700">
        FMT貼り付け <span className="text-red-600">*</span>
      </label>
      <textarea
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={14}
        required
        placeholder="ここにFMTを貼り付けてください"
        className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none"
      />

      {errors.length > 0 && (
        <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="submit"
        disabled={
          submitting || !selected || !selectedStaff || rawText.trim().length === 0
        }
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitting ? "送信中..." : "申請する"}
      </button>
    </form>
  );
}
