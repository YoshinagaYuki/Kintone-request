"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RENTAL_STATUSES,
  RENTAL_STATUS_LABELS,
  type RentalPlan,
  type RentalStatus,
} from "@/types/request";

/**
 * 申請フォーム(設定駆動)。
 * ・種別ラジオは is_active=true の form_types を自動描画
 * ・担当者選択は機能オフ。代わりに入力者情報(氏名/電話/メール)をお客様が入力
 * ・レンタルプランを使う種別(てずくーる)は「レンタル状況」を選択:
 *     すでに借りている → プラン選択なし(社内で承認時に設定)
 *     これから新規で借りる → 有効なプランから選択(必須)
 * ・select_fields はFMT行として先頭注入(レンタルプランは専用UIで扱うため除外済み)
 * ・条件分岐で表示が変わっても入力済みFMTは保持される(state分離)
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
  /** レンタルプラン機能を使う種別か(てずくーる) */
  has_rental_plan?: boolean;
};

/**
 * 担当者マスター(staff_members)の選択肢。
 * 担当者選択は現在機能オフ(公開申請では非表示)だが、再開できるよう型/コンポーネントは残置。
 */
export type StaffOption = {
  id: string;
  name: string;
  company: string;
};

const MAX_CUSTOMER_REQUESTS = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ApplyForm({
  formTypes,
  rentalPlans,
}: {
  formTypes: ApplyFormType[];
  rentalPlans: RentalPlan[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(
    formTypes.length === 1 ? formTypes[0].id : ""
  );
  const [applicantName, setApplicantName] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [rentalStatus, setRentalStatus] = useState<RentalStatus | "">("");
  const [rentalPlanId, setRentalPlanId] = useState("");
  const [rawText, setRawText] = useState("");
  const [customerRequests, setCustomerRequests] = useState("");
  const [selectValues, setSelectValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = formTypes.find((f) => f.id === selectedId) ?? null;
  const usesRentalPlan = Boolean(selected?.has_rental_plan);
  const showPlanSelect = usesRentalPlan && rentalStatus === "new_rental";

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

  function validate(): string[] {
    const errs: string[] = [];
    if (!selected) errs.push("申請種別を選択してください。");
    if (!applicantName.trim()) errs.push("入力者氏名を入力してください。");
    if (!applicantPhone.trim()) errs.push("入力者電話番号を入力してください。");
    if (!applicantEmail.trim()) {
      errs.push("入力者メールアドレスを入力してください。");
    } else if (!EMAIL_RE.test(applicantEmail.trim())) {
      errs.push("メールアドレスの形式が正しくありません。");
    }
    if (usesRentalPlan) {
      if (!rentalStatus) errs.push("レンタル状況を選択してください。");
      if (rentalStatus === "new_rental" && !rentalPlanId) {
        errs.push("レンタルプランを選択してください。");
      }
    }
    for (const f of selected?.select_fields ?? []) {
      if (f.required && !(selectValues[f.label] ?? "").trim()) {
        errs.push(`${f.label}を選択してください。`);
      }
    }
    if (rawText.trim().length === 0) errs.push("FMTを貼り付けてください。");
    if (customerRequests.length > MAX_CUSTOMER_REQUESTS) {
      errs.push(`要望・連絡事項は${MAX_CUSTOMER_REQUESTS}文字以内で入力してください。`);
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !selected) return;
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setErrors([]);

    // 汎用select_fields(レンタルプラン以外)はFMT行として先頭注入(既存挙動)
    const injectedLines: string[] = [];
    for (const f of selected.select_fields ?? []) {
      if ((selectValues[f.label] ?? "") !== "") {
        injectedLines.push(`${f.label}: ${selectValues[f.label]}`);
      }
    }
    const fullText =
      injectedLines.length > 0 ? [...injectedLines, rawText].join("\n") : rawText;

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_type_id: selected.id,
          raw_text: fullText,
          applicant_name: applicantName.trim(),
          applicant_phone: applicantPhone.trim(),
          applicant_email: applicantEmail.trim(),
          rental_status: usesRentalPlan ? rentalStatus : null,
          rental_plan_id: rentalStatus === "new_rental" ? rentalPlanId : null,
          customer_requests: customerRequests.trim() || null,
        }),
      });

      const body = await res.json().catch(() => null);
      if (res.ok) {
        const mail = body?.mail ?? "pending";
        router.push(`/apply/complete?rid=${body?.rid ?? ""}&mail=${mail}`);
        return;
      }
      setErrors(
        body?.errors ?? ["送信に失敗しました。時間をおいて再度お試しください。"]
      );
    } catch {
      setErrors(["通信エラーが発生しました。時間をおいて再度お試しください。"]);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {/* 種別選択(複数種別がある場合のみ表示) */}
      {formTypes.length > 1 && (
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
                    setSelectValues({});
                    setRentalStatus("");
                    setRentalPlanId("");
                    setErrors([]);
                  }}
                  className="h-4 w-4 accent-blue-600"
                />
                {f.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {selected && (
        <>
          {/* 1. 入力者情報 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">入力者情報</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  氏名 <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  value={applicantName}
                  onChange={(e) => setApplicantName(e.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  placeholder="山田 太郎"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  電話番号 <span className="text-red-600">*</span>
                </label>
                <input
                  type="tel"
                  value={applicantPhone}
                  onChange={(e) => setApplicantPhone(e.target.value)}
                  maxLength={30}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="090-1234-5678"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  メールアドレス <span className="text-red-600">*</span>
                </label>
                <input
                  type="email"
                  value={applicantEmail}
                  onChange={(e) => setApplicantEmail(e.target.value)}
                  maxLength={254}
                  autoComplete="email"
                  inputMode="email"
                  placeholder="example@example.com"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">
                  申請完了メール・承認完了メールをこのアドレスへお送りします。
                </p>
              </div>
            </div>
          </section>

          {/* 2. レンタル状況(レンタルプランを使う種別のみ) */}
          {usesRentalPlan && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">
                てずくーるのレンタル状況を選択してください{" "}
                <span className="text-red-600">*</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {RENTAL_STATUSES.map((s) => (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      rentalStatus === s
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="rental_status"
                      value={s}
                      checked={rentalStatus === s}
                      onChange={() => {
                        setRentalStatus(s);
                        setRentalPlanId("");
                        setErrors([]);
                      }}
                      className="h-4 w-4 accent-blue-600"
                    />
                    {RENTAL_STATUS_LABELS[s]}
                  </label>
                ))}
              </div>

              {/* 3. レンタルプラン(新規のみ) */}
              {showPlanSelect && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700">
                    レンタルプラン <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={rentalPlanId}
                    onChange={(e) => setRentalPlanId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">選択してください</option>
                    {rentalPlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.description ? `（${p.description}）` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {rentalStatus === "already_renting" && (
                <p className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                  レンタルプランは社内確認後に設定されます。このまま申請いただけます。
                </p>
              )}
            </fieldset>
          )}

          {/* その他の select_fields(現状てずくーるは無し) */}
          {(selected.select_fields ?? []).map((field) => (
            <div key={field.label}>
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
                className={inputClass}
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

          {/* 入力説明 */}
          {selected.input_guide && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
              {selected.input_guide}
            </p>
          )}

          {/* FMTテンプレート */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
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

          {/* 注意事項 */}
          {selected.notes && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-xs font-semibold text-yellow-800">注意事項</p>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-yellow-900">
                {selected.notes}
              </p>
            </div>
          )}
        </>
      )}

      {/* 4. FMT貼り付け */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          FMT貼り付け <span className="text-red-600">*</span>
        </label>
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={14}
          placeholder="ここにFMTを貼り付けてください"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* 5. お客様からの要望・連絡事項(任意) */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          お客様からの要望・連絡事項{" "}
          <span className="text-xs font-normal text-gray-500">(任意)</span>
        </label>
        <textarea
          value={customerRequests}
          onChange={(e) => setCustomerRequests(e.target.value)}
          rows={4}
          maxLength={MAX_CUSTOMER_REQUESTS}
          placeholder="配送時間の希望、イベント内容に関する相談、その他の連絡事項をご入力ください。"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {customerRequests.length} / {MAX_CUSTOMER_REQUESTS}
        </p>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 6. 申請ボタン */}
      <button
        type="submit"
        disabled={submitting || !selected}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitting ? "送信中..." : "申請する"}
      </button>
    </form>
  );
}
