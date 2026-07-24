"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  RENTAL_STATUSES,
  RENTAL_STATUS_LABELS,
  type RentalPlan,
  type RentalStatus,
} from "@/types/request";
import {
  buildTezukuruFmt,
  validProducts,
  MAX_PRODUCTS,
  type ProductRow,
} from "@/lib/tezukuru-fmt";

/**
 * 申請フォーム(構造化入力)。
 * ・FMT貼り付けは廃止。商品①〜⑩(商品マスターのプルダウン+数量)と配送/集荷情報を個別入力。
 * ・送信時に buildTezukuruFmt で従来と同じFMTテキストへ組み立てて送信するため、
 *   サーバー側(解析・kintone登録・承認・通知・履歴)は変更不要。
 * ・数量の最小値は system_settings(minimumOrderQuantity)で管理(ハードコードしない)。
 * ・弊社担当者は入力者情報として入力(承認時に正式名称へ確定)。
 * ・レンタル状況/プランは既存機能を維持。
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
const BILLING_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月分`);

const emptyProduct = (): ProductRow => ({ name: "", quantity: "" });

/** 商品マスターの1件(スロット固有の除外情報つき) */
export type ProductItem = {
  name: string;
  /** このスロット番号(1〜10)では選択不可 */
  excludedSlots: number[];
};

export function ApplyForm({
  formTypes,
  rentalPlans,
  productItems,
  minimumOrderQuantity,
}: {
  formTypes: ApplyFormType[];
  rentalPlans: RentalPlan[];
  /** 商品(コンテンツ)の選択肢(商品マスターの有効な正式名称+除外スロット) */
  productItems: ProductItem[];
  /** 数量の最小値(system_settings) */
  minimumOrderQuantity: number;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(
    formTypes.length === 1 ? formTypes[0].id : ""
  );

  // 入力者情報
  const [applicantName, setApplicantName] = useState("");
  const [applicantPhone, setApplicantPhone] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [companyStaffName, setCompanyStaffName] = useState("");

  // レンタル
  const [rentalStatus, setRentalStatus] = useState<RentalStatus | "">("");
  const [rentalPlanId, setRentalPlanId] = useState("");

  // 基本情報
  const [agencyName, setAgencyName] = useState("");
  const [boothName, setBoothName] = useState("");
  const [billingMonth, setBillingMonth] = useState("");
  const [shippingFee, setShippingFee] = useState("");

  // 商品(最初は3行。最大10行まで追加可能)
  const [products, setProducts] = useState<ProductRow[]>([
    emptyProduct(),
    emptyProduct(),
    emptyProduct(),
  ]);

  // 配送
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryPostal, setDeliveryPostal] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryReceiver, setDeliveryReceiver] = useState("");
  const [deliveryContact, setDeliveryContact] = useState("");

  // 集荷
  const [pickupDate, setPickupDate] = useState("");
  const [pickupPostal, setPickupPostal] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupHandover, setPickupHandover] = useState("");
  const [pickupContact, setPickupContact] = useState("");

  // 伝票番号連絡先 / 緊急時責任者
  const [slipTo, setSlipTo] = useState("");
  const [slipCc, setSlipCc] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");

  const [customerRequests, setCustomerRequests] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const selected = formTypes.find((f) => f.id === selectedId) ?? null;
  const usesRentalPlan = Boolean(selected?.has_rental_plan);
  const showPlanSelect = usesRentalPlan && rentalStatus === "new_rental";

  /** スロット番号(行番号=idx+1)で選択可能な商品名(除外スロットを反映) */
  function slotOptions(slot: number): string[] {
    return productItems.filter((it) => !it.excludedSlots.includes(slot)).map((it) => it.name);
  }

  function updateProduct(i: number, patch: Partial<ProductRow>) {
    setProducts((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function addProduct() {
    setProducts((prev) => (prev.length >= MAX_PRODUCTS ? prev : [...prev, emptyProduct()]));
  }
  function removeProduct(i: number) {
    setProducts((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!selected) errs.push("申請種別を選択してください。");

    // 入力者情報
    if (!applicantName.trim()) errs.push("入力者氏名を入力してください。");
    if (!applicantPhone.trim()) errs.push("入力者電話番号を入力してください。");
    if (!applicantEmail.trim()) errs.push("入力者メールアドレスを入力してください。");
    else if (!EMAIL_RE.test(applicantEmail.trim()))
      errs.push("メールアドレスの形式が正しくありません。");
    if (!companyStaffName.trim()) errs.push("弊社担当者氏名を入力してください。");

    // レンタル
    if (usesRentalPlan) {
      if (!rentalStatus) errs.push("レンタル状況を選択してください。");
      if (rentalStatus === "new_rental" && !rentalPlanId)
        errs.push("レンタルプランを選択してください。");
    }

    // 基本情報
    if (!agencyName.trim()) errs.push("取次店名を入力してください。");
    if (!boothName.trim()) errs.push("イベントブース名を入力してください。");
    if (!billingMonth.trim()) errs.push("「◯月分として請求」を選択してください。");

    // 商品・数量(セット必須・整数・最小数量)
    let hasProduct = false;
    products.forEach((p, idx) => {
      const name = p.name.trim();
      const qty = p.quantity.trim();
      if (!name && !qty) return; // 空行は無視
      const n = idx + 1;
      if (name && !qty) {
        errs.push(`商品${n}の数量を入力してください。`);
        return;
      }
      if (!name && qty) {
        errs.push(`商品${n}が未選択です(数量のみ入力されています)。`);
        return;
      }
      if (!/^\d+$/.test(qty)) {
        errs.push(`商品${n}の数量は整数で入力してください。`);
        return;
      }
      if (Number.parseInt(qty, 10) < minimumOrderQuantity) {
        errs.push(`商品${n}の数量は${minimumOrderQuantity}以上で入力してください。`);
        return;
      }
      hasProduct = true;
    });
    if (!hasProduct) errs.push("商品を1つ以上入力してください。");

    // 配送(必須)
    if (!deliveryDate.trim()) errs.push("配送日付を入力してください。");
    if (!deliveryPostal.trim()) errs.push("配送郵便番号を入力してください。");
    if (!deliveryAddress.trim()) errs.push("配送住所を入力してください。");
    if (!deliveryReceiver.trim()) errs.push("当日受領者氏名を入力してください。");
    if (!deliveryContact.trim()) errs.push("配送連絡先を入力してください。");

    // 集荷(必須)
    if (!pickupDate.trim()) errs.push("集荷日付を入力してください。");
    if (!pickupPostal.trim()) errs.push("集荷郵便番号を入力してください。");
    if (!pickupAddress.trim()) errs.push("集荷住所を入力してください。");
    if (!pickupHandover.trim()) errs.push("当日引渡者氏名を入力してください。");
    if (!pickupContact.trim()) errs.push("集荷連絡先を入力してください。");

    if (customerRequests.length > MAX_CUSTOMER_REQUESTS)
      errs.push(`要望・連絡事項は${MAX_CUSTOMER_REQUESTS}文字以内で入力してください。`);
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !selected) return;
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    setErrors([]);

    // 構造化入力 → FMTテキスト(従来の解析・登録パイプラインへ渡す)
    const rawText = buildTezukuruFmt({
      agencyName,
      boothName,
      billingMonth,
      shippingFee,
      products,
      deliveryDate,
      deliveryPostal,
      deliveryAddress,
      deliveryReceiver,
      deliveryContact,
      pickupDate,
      pickupPostal,
      pickupAddress,
      pickupHandover,
      pickupContact,
      slipTo,
      slipCc,
      emergencyName,
      emergencyPhone,
    });

    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_type_id: selected.id,
          raw_text: rawText,
          structured: true,
          applicant_name: applicantName.trim(),
          applicant_phone: applicantPhone.trim(),
          applicant_email: applicantEmail.trim(),
          company_staff_name: companyStaffName.trim(),
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
      setErrors(body?.errors ?? ["送信に失敗しました。時間をおいて再度お試しください。"]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setErrors(["通信エラーが発生しました。時間をおいて再度お試しください。"]);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none";
  const labelClass = "block text-sm font-medium text-gray-700";
  const req = <span className="text-red-600">*</span>;
  const filledProductCount = validProducts(products).length;

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 種別選択(複数種別がある場合のみ) */}
      {formTypes.length > 1 && (
        <fieldset>
          <legend className="text-sm font-medium text-gray-700">申請種別 {req}</legend>
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
          {/* 入力者情報 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">入力者情報</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>氏名 {req}</label>
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
                <label className={labelClass}>電話番号 {req}</label>
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
                <label className={labelClass}>メールアドレス {req}</label>
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
              <div>
                <label className={labelClass}>弊社担当者氏名 {req}</label>
                <input
                  type="text"
                  value={companyStaffName}
                  onChange={(e) => setCompanyStaffName(e.target.value)}
                  maxLength={100}
                  placeholder="例：吉永、田中、山田太郎"
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-gray-500">
                  弊社の担当者名をご入力ください(社内で正式名称に確認・修正します)。
                </p>
              </div>
            </div>
          </section>

          {/* レンタル状況(レンタルプランを使う種別のみ) */}
          {usesRentalPlan && (
            <fieldset>
              <legend className="text-sm font-medium text-gray-700">
                てずくーるのレンタル状況を選択してください {req}
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
              {showPlanSelect && (
                <div className="mt-3">
                  <label className={labelClass}>レンタルプラン {req}</label>
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

          {/* 基本情報 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">基本情報</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>取次店名 {req}</label>
                <input
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  maxLength={200}
                  placeholder="株式会社〇〇"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>イベントブース名 {req}</label>
                <input
                  type="text"
                  value={boothName}
                  onChange={(e) => setBoothName(e.target.value)}
                  maxLength={200}
                  placeholder="〇〇フェス 特設ブース"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>◯月分として請求 {req}</label>
                <select
                  value={billingMonth}
                  onChange={(e) => setBillingMonth(e.target.value)}
                  className={inputClass}
                >
                  <option value="">選択してください</option>
                  {BILLING_MONTHS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  選択した月の翌月に請求します(例: 7月分 → 8月請求)。
                </p>
              </div>
              <div>
                <label className={labelClass}>
                  配送料 <span className="text-xs font-normal text-gray-500">(任意)</span>
                </label>
                <input
                  type="text"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(e.target.value)}
                  maxLength={50}
                  placeholder="未定の場合は空欄で構いません"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          {/* 商品(コンテンツ)①〜⑩ */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">商品 {req}</h2>
              <span className="text-xs text-gray-500">
                {filledProductCount} / {MAX_PRODUCTS} 件
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              商品を選び、数量({minimumOrderQuantity}以上の整数)を入力してください。空欄の行は送信されません。
            </p>
            <div className="mt-3 space-y-2">
              {products.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs text-gray-400">{i + 1}.</span>
                  <select
                    value={p.name}
                    onChange={(e) => updateProduct(i, { name: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">商品を選択</option>
                    {slotOptions(i + 1).map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={minimumOrderQuantity}
                    step={1}
                    value={p.quantity}
                    onChange={(e) => updateProduct(i, { quantity: e.target.value })}
                    placeholder="数量"
                    className="w-24 shrink-0 rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeProduct(i)}
                    disabled={products.length <= 1}
                    aria-label={`商品${i + 1}を削除`}
                    className="shrink-0 rounded-md border border-gray-300 px-2 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {products.length < MAX_PRODUCTS && (
              <button
                type="button"
                onClick={addProduct}
                className="mt-3 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
              >
                ＋ 商品を追加
              </button>
            )}
          </section>

          {/* 配送 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">配送</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>配送日付 {req}</label>
                <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>郵便番号 {req}</label>
                <input type="text" value={deliveryPostal} onChange={(e) => setDeliveryPostal(e.target.value)} maxLength={10} inputMode="numeric" placeholder="123-4567" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>住所 {req}</label>
                <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)} maxLength={300} placeholder="東京都〇〇区〇〇 1-2-3" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>受領者氏名 {req}</label>
                <input type="text" value={deliveryReceiver} onChange={(e) => setDeliveryReceiver(e.target.value)} maxLength={100} placeholder="当日の受け取り担当者" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>連絡先 {req}</label>
                <input type="tel" value={deliveryContact} onChange={(e) => setDeliveryContact(e.target.value)} maxLength={30} inputMode="tel" placeholder="090-1234-5678" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 集荷 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">集荷</h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>集荷日付 {req}</label>
                <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>郵便番号 {req}</label>
                <input type="text" value={pickupPostal} onChange={(e) => setPickupPostal(e.target.value)} maxLength={10} inputMode="numeric" placeholder="123-4567" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>住所 {req}</label>
                <input type="text" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} maxLength={300} placeholder="東京都〇〇区〇〇 1-2-3" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>当日引渡者氏名 {req}</label>
                <input type="text" value={pickupHandover} onChange={(e) => setPickupHandover(e.target.value)} maxLength={100} placeholder="当日の引き渡し担当者" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>連絡先 {req}</label>
                <input type="tel" value={pickupContact} onChange={(e) => setPickupContact(e.target.value)} maxLength={30} inputMode="tel" placeholder="090-1234-5678" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 伝票番号連絡先 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">
              伝票番号連絡先 <span className="text-xs font-normal text-gray-500">(任意)</span>
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>to</label>
                <input type="text" value={slipTo} onChange={(e) => setSlipTo(e.target.value)} maxLength={254} placeholder="伝票番号の通知先(to)" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>cc</label>
                <input type="text" value={slipCc} onChange={(e) => setSlipCc(e.target.value)} maxLength={254} placeholder="伝票番号の通知先(cc)" className={inputClass} />
              </div>
            </div>
          </section>

          {/* 緊急時責任者 */}
          <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-800">
              緊急時責任者 <span className="text-xs font-normal text-gray-500">(任意)</span>
            </h2>
            <div className="mt-3 space-y-3">
              <div>
                <label className={labelClass}>氏名</label>
                <input type="text" value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} maxLength={100} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>電話番号</label>
                <input type="tel" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} maxLength={30} inputMode="tel" className={inputClass} />
              </div>
            </div>
          </section>
        </>
      )}

      {/* お客様からの要望(任意) */}
      <div>
        <label className={labelClass}>
          お客様からの要望{" "}
          <span className="text-xs font-normal text-gray-500">(任意)</span>
        </label>
        <textarea
          value={customerRequests}
          onChange={(e) => setCustomerRequests(e.target.value)}
          rows={4}
          maxLength={MAX_CUSTOMER_REQUESTS}
          placeholder="イベント内容に関するご相談、その他の連絡事項をご入力ください。"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-gray-400">
          {customerRequests.length} / {MAX_CUSTOMER_REQUESTS}
        </p>
      </div>

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
