"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildAllmightFmt,
  validEquipments,
  ALLMIGHT_MAX_EQUIPMENT,
} from "@/lib/allmight-fmt";

/**
 * オールマイト専用 申請フォーム。
 * ・機器商品は最大5枠(1枠1台・同じ商品の複数選択可)。
 * ・利用開始日/利用最終日は必須。請求月(◯月分として請求)は必須(翌月請求)。
 * ・配送/集荷に 郵便番号・受領者氏名・連絡先 を追加(必須)。伝票 to/cc・緊急時責任者は任意。
 * ・「配送情報と同じ」チェックで集荷の郵便番号/住所/受領者/連絡先を配送から反映(日付は連動しない)。
 * ・金額は申請者に表示・入力させない(利用日数・利用金額はサーバー側で計算)。
 * ・送信時に buildAllmightFmt で FMT を組み立て /api/requests へ(既存の解析・承認・App10連携を利用)。
 * ・てずくーるのフォーム・処理には影響しない(別コンポーネント・別ルート)。
 */
const MAX_CUSTOMER_REQUESTS = 2000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BILLING_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月分`);

/** 編集モードの初期値(申請詳細から parsed_data + 申請者情報を詰めて渡す) */
export type AllmightInitialValues = {
  applicantName?: string;
  applicantPhone?: string;
  applicantEmail?: string;
  companyStaffName?: string;
  agencyName?: string;
  eventBooth?: string;
  billingMonth?: string;
  shippingFee?: string;
  usageStart?: string;
  usageEnd?: string;
  equipments?: string[];
  deliveryDate?: string;
  deliveryPostal?: string;
  deliveryAddress?: string;
  deliveryReceiver?: string;
  deliveryContact?: string;
  pickupDate?: string;
  pickupPostal?: string;
  pickupAddress?: string;
  pickupReceiver?: string;
  pickupContact?: string;
  slipTo?: string;
  slipCc?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  customerRequests?: string;
};

export function AllmightApplyForm({
  formTypeId,
  productOptions,
  mode = "create",
  requestId,
  initialValues,
  baseUpdatedAt,
}: {
  formTypeId: string;
  /** 機器商品の選択肢(オールマイト商品マスターの正式名称) */
  productOptions: string[];
  /** "create"=新規申請(/apply) / "edit"=管理者編集(申請詳細) */
  mode?: "create" | "edit";
  /** 編集対象の申請ID(mode="edit" で必須) */
  requestId?: string;
  /** 編集時の初期値 */
  initialValues?: AllmightInitialValues;
  /** 編集開始時の updated_at(楽観ロック用。mode="edit" で渡す) */
  baseUpdatedAt?: string;
}) {
  const router = useRouter();
  const iv = initialValues ?? {};

  // 入力者情報
  const [applicantName, setApplicantName] = useState(iv.applicantName ?? "");
  const [applicantPhone, setApplicantPhone] = useState(iv.applicantPhone ?? "");
  const [applicantEmail, setApplicantEmail] = useState(iv.applicantEmail ?? "");
  const [companyStaffName, setCompanyStaffName] = useState(iv.companyStaffName ?? "");

  // 基本情報
  const [agencyName, setAgencyName] = useState(iv.agencyName ?? "");
  const [eventBooth, setEventBooth] = useState(iv.eventBooth ?? "");
  const [billingMonth, setBillingMonth] = useState(iv.billingMonth ?? "");
  const [shippingFee, setShippingFee] = useState(iv.shippingFee ?? "");

  // 利用期間
  const [usageStart, setUsageStart] = useState(iv.usageStart ?? "");
  const [usageEnd, setUsageEnd] = useState(iv.usageEnd ?? "");

  // 機器商品(最初は1枠・最大5枠)
  const [equipments, setEquipments] = useState<string[]>(
    iv.equipments && iv.equipments.length > 0 ? iv.equipments : [""]
  );

  // 配送
  const [deliveryDate, setDeliveryDate] = useState(iv.deliveryDate ?? "");
  const [deliveryPostal, setDeliveryPostal] = useState(iv.deliveryPostal ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(iv.deliveryAddress ?? "");
  const [deliveryReceiver, setDeliveryReceiver] = useState(iv.deliveryReceiver ?? "");
  const [deliveryContact, setDeliveryContact] = useState(iv.deliveryContact ?? "");

  // 集荷
  const [pickupDate, setPickupDate] = useState(iv.pickupDate ?? "");
  const [pickupPostal, setPickupPostal] = useState(iv.pickupPostal ?? "");
  const [pickupAddress, setPickupAddress] = useState(iv.pickupAddress ?? "");
  const [pickupReceiver, setPickupReceiver] = useState(iv.pickupReceiver ?? "");
  const [pickupContact, setPickupContact] = useState(iv.pickupContact ?? "");

  // 「配送情報と同じ」(集荷の 郵便番号/住所/受領者/連絡先 を配送から反映。日付は連動しない)
  const [sameAsDelivery, setSameAsDelivery] = useState(false);

  // 伝票番号連絡先 / 緊急時責任者(任意)
  const [slipTo, setSlipTo] = useState(iv.slipTo ?? "");
  const [slipCc, setSlipCc] = useState(iv.slipCc ?? "");
  const [emergencyName, setEmergencyName] = useState(iv.emergencyName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(iv.emergencyPhone ?? "");

  const [customerRequests, setCustomerRequests] = useState(iv.customerRequests ?? "");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 集荷の実効値(「配送情報と同じ」時は配送の値を使用。チェックOFF時は個別入力値)。
  // ※ 個別入力値(pickup*)は保持したまま(チェック解除で元の入力が消えない)。
  const effPickupPostal = sameAsDelivery ? deliveryPostal : pickupPostal;
  const effPickupAddress = sameAsDelivery ? deliveryAddress : pickupAddress;
  const effPickupReceiver = sameAsDelivery ? deliveryReceiver : pickupReceiver;
  const effPickupContact = sameAsDelivery ? deliveryContact : pickupContact;

  function updateEquipment(i: number, v: string) {
    setEquipments((prev) => prev.map((e, idx) => (idx === i ? v : e)));
  }
  function addEquipment() {
    setEquipments((prev) => (prev.length >= ALLMIGHT_MAX_EQUIPMENT ? prev : [...prev, ""]));
  }
  function removeEquipment(i: number) {
    setEquipments((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function hasAnyInput(): boolean {
    return Boolean(
      applicantName || applicantPhone || applicantEmail || companyStaffName ||
      agencyName || eventBooth || billingMonth || shippingFee || usageStart || usageEnd ||
      deliveryDate || deliveryPostal || deliveryAddress || deliveryReceiver || deliveryContact ||
      pickupDate || pickupPostal || pickupAddress || pickupReceiver || pickupContact ||
      slipTo || slipCc || emergencyName || emergencyPhone || customerRequests ||
      equipments.some((e) => e)
    );
  }
  function handleBack() {
    if (submitting) return;
    // 編集モードは申請詳細へ戻る(新規は事業選択へ)
    if (mode === "edit") {
      if (!window.confirm("編集内容は保存されません。申請詳細に戻りますか?")) return;
      router.push(`/admin/requests/${requestId}`);
      return;
    }
    if (hasAnyInput() && !window.confirm("入力内容は保存されません。事業選択に戻りますか?")) return;
    router.push("/apply");
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!applicantName.trim()) errs.push("入力者氏名を入力してください。");
    if (!applicantPhone.trim()) errs.push("入力者電話番号を入力してください。");
    if (!applicantEmail.trim()) errs.push("入力者メールアドレスを入力してください。");
    else if (!EMAIL_RE.test(applicantEmail.trim())) errs.push("メールアドレスの形式が正しくありません。");
    if (!companyStaffName.trim()) errs.push("弊社担当者氏名を入力してください。");

    if (!agencyName.trim()) errs.push("取次店名を入力してください。");
    if (!eventBooth.trim()) errs.push("イベントブースを入力してください。");
    if (!billingMonth.trim()) errs.push("「◯月分として請求」を選択してください。");

    // 配送料(任意)。入力時のみ 0以上の数値を要求(全角/カンマ/円は許容し正規化して判定)。
    const feeRaw = shippingFee.trim();
    if (feeRaw) {
      const feeNorm = feeRaw
        .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[,，、円]/g, "")
        .trim();
      if (!/^\d+(\.\d+)?$/.test(feeNorm)) {
        errs.push("配送料は0以上の数値で入力してください(マイナス・数値以外は不可)。");
      }
    }

    if (!usageStart.trim()) errs.push("利用開始日を入力してください。");
    if (!usageEnd.trim()) errs.push("利用最終日を入力してください。");
    if (usageStart && usageEnd && usageEnd < usageStart) {
      errs.push("利用最終日は利用開始日以降の日付を入力してください。");
    }

    // 機器商品（1枠1台、同じ商品も複数枠に選択可）
    const filled = validEquipments(equipments);
    if (filled.length === 0) errs.push("機器商品を1つ以上選択してください。");


    // 配送(必須)
    if (!deliveryDate.trim()) errs.push("配送日付を入力してください。");
    if (!deliveryPostal.trim()) errs.push("配送の郵便番号を入力してください。");
    if (!deliveryAddress.trim()) errs.push("配送先住所を入力してください。");
    if (!deliveryReceiver.trim()) errs.push("配送の受領者氏名を入力してください。");
    if (!deliveryContact.trim()) errs.push("配送の連絡先を入力してください。");

    // 集荷(必須。実効値で判定=「配送情報と同じ」時は配送の値)
    if (!pickupDate.trim()) errs.push("集荷日付を入力してください。");
    if (!effPickupPostal.trim()) errs.push("集荷の郵便番号を入力してください。");
    if (!effPickupAddress.trim()) errs.push("集荷先住所を入力してください。");
    if (!effPickupReceiver.trim()) errs.push("集荷の受領者氏名を入力してください。");
    if (!effPickupContact.trim()) errs.push("集荷の連絡先を入力してください。");

    if (customerRequests.length > MAX_CUSTOMER_REQUESTS)
      errs.push(`要望・連絡事項は${MAX_CUSTOMER_REQUESTS}文字以内で入力してください。`);
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setSubmitting(true);
    setErrors([]);

    const rawText = buildAllmightFmt({
      equipments,
      eventBooth,
      agencyName,
      billingMonth,
      shippingFee,
      usageStart,
      usageEnd,
      deliveryDate,
      deliveryPostal,
      deliveryAddress,
      deliveryReceiver,
      deliveryContact,
      pickupDate,
      // 集荷は実効値(「配送情報と同じ」時はコピー後の実際の値をFMTへ含める)
      pickupPostal: effPickupPostal,
      pickupAddress: effPickupAddress,
      pickupHandover: effPickupReceiver,
      pickupContact: effPickupContact,
      slipTo,
      slipCc,
      emergencyName,
      emergencyPhone,
    });

    const payload = {
      form_type_id: formTypeId,
      raw_text: rawText,
      structured: true,
      applicant_name: applicantName.trim(),
      applicant_phone: applicantPhone.trim(),
      applicant_email: applicantEmail.trim(),
      company_staff_name: companyStaffName.trim(),
      rental_status: null,
      rental_plan_id: null,
      customer_requests: customerRequests.trim() || null,
      sns_promotion_requested: null,
      expected_updated_at: baseUpdatedAt ?? null,
    };

    try {
      // 編集モード: 管理者編集API(PATCH)。成功時は申請詳細へ戻る(メール再送なし)。
      if (mode === "edit" && requestId) {
        const res = await fetch(`/api/admin/requests/${requestId}/edit`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => null);
        if (res.ok) {
          router.push(`/admin/requests/${requestId}`);
          router.refresh();
          return;
        }
        setErrors(body?.errors ?? ["保存に失敗しました。"]);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
  const roInputClass =
    "mt-1 w-full rounded-md border border-gray-200 bg-gray-100 p-2.5 text-sm text-gray-600";
  const labelClass = "block text-sm font-medium text-gray-700";
  const req = <span className="text-red-600">*</span>;
  const filledCount = validEquipments(equipments).length;

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-6">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
      >
        ← {mode === "edit" ? "申請詳細に戻る" : "事業選択に戻る"}
      </button>
      {mode === "edit" && (
        <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          管理者による申請内容の編集です。保存しても申請完了メール・承認完了メールは再送されません。
        </p>
      )}

      {errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          <ul className="list-disc pl-5">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 入力者情報 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">入力者情報</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>氏名 {req}</label>
            <input type="text" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} maxLength={100} autoComplete="name" placeholder="山田 太郎" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>電話番号 {req}</label>
            <input type="tel" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} maxLength={30} inputMode="tel" placeholder="090-1234-5678" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>メールアドレス {req}</label>
            <input type="email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} maxLength={254} inputMode="email" placeholder="example@example.com" className={inputClass} />
            <p className="mt-1 text-xs text-gray-500">申請完了メール・承認完了メールをこのアドレスへお送りします。</p>
          </div>
          <div>
            <label className={labelClass}>弊社担当者氏名 {req}</label>
            <input type="text" value={companyStaffName} onChange={(e) => setCompanyStaffName(e.target.value)} maxLength={100} placeholder="例：吉永、田中、山田太郎" className={inputClass} />
            <p className="mt-1 text-xs text-gray-500">弊社の担当者名をご入力ください(社内で正式名称に確認・修正します)。</p>
          </div>
        </div>
      </section>

      {/* 基本情報 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">基本情報</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>取次店名 {req}</label>
            <input type="text" value={agencyName} onChange={(e) => setAgencyName(e.target.value)} maxLength={200} placeholder="株式会社〇〇" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>イベントブース {req}</label>
            <input type="text" value={eventBooth} onChange={(e) => setEventBooth(e.target.value)} maxLength={200} placeholder="〇〇フェス 特設ブース" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>◯月分として請求 {req}</label>
            <select value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} className={inputClass}>
              <option value="">選択してください</option>
              {BILLING_MONTHS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">選択した月の翌月に請求します(例: 7月分 → 8月請求)。</p>
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
              inputMode="numeric"
              placeholder="未定の場合は空欄で構いません(例: 5000)"
              className={inputClass}
            />
            <p className="mt-1 text-xs text-gray-500">入力する場合は0以上の数値でご入力ください。</p>
          </div>
        </div>
      </section>

      {/* 利用期間 */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800">利用期間</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>利用開始日 {req}</label>
            <input type="date" value={usageStart} onChange={(e) => setUsageStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>利用最終日 {req}</label>
            <input type="date" value={usageEnd} onChange={(e) => setUsageEnd(e.target.value)} className={inputClass} />
          </div>
        </div>
      </section>

      {/* 機器商品(最大5枠・数量なし) */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">レンタル機材 {req}</h2>
          <span className="text-xs text-gray-500">{filledCount} / {ALLMIGHT_MAX_EQUIPMENT} 件</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">機材を選択してください(最大{ALLMIGHT_MAX_EQUIPMENT}台・同じ商品を複数選択できます)。</p>
        <div className="mt-3 space-y-2">
          {equipments.map((eq, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-xs text-gray-400">{i + 1}.</span>
              <select
                value={eq}
                onChange={(e) => updateEquipment(i, e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white p-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">機材を選択</option>
                {productOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeEquipment(i)}
                disabled={equipments.length <= 1}
                aria-label={`機材${i + 1}を削除`}
                className="shrink-0 rounded-md border border-gray-300 px-2 py-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        {equipments.length < ALLMIGHT_MAX_EQUIPMENT && (
          <button
            type="button"
            onClick={addEquipment}
            className="mt-3 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            ＋ 機材を追加
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
            <label className={labelClass}>配送先住所 {req}</label>
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

        <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-2.5 text-sm font-medium text-blue-800">
          <input
            type="checkbox"
            checked={sameAsDelivery}
            onChange={(e) => setSameAsDelivery(e.target.checked)}
            className="h-4 w-4 accent-blue-600"
          />
          配送情報と同じ(郵便番号・住所・受領者氏名・連絡先を配送からコピー)
        </label>

        <div className="mt-3 space-y-3">
          <div>
            <label className={labelClass}>集荷日付 {req}</label>
            {/* 集荷日付は「配送情報と同じ」の対象外(独立入力) */}
            <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>郵便番号 {req}</label>
            <input type="text" value={effPickupPostal} onChange={(e) => setPickupPostal(e.target.value)} readOnly={sameAsDelivery} maxLength={10} inputMode="numeric" placeholder="123-4567" className={sameAsDelivery ? roInputClass : inputClass} />
          </div>
          <div>
            <label className={labelClass}>集荷先住所 {req}</label>
            <input type="text" value={effPickupAddress} onChange={(e) => setPickupAddress(e.target.value)} readOnly={sameAsDelivery} maxLength={300} placeholder="東京都〇〇区〇〇 1-2-3" className={sameAsDelivery ? roInputClass : inputClass} />
          </div>
          <div>
            <label className={labelClass}>受領者氏名 {req}</label>
            <input type="text" value={effPickupReceiver} onChange={(e) => setPickupReceiver(e.target.value)} readOnly={sameAsDelivery} maxLength={100} placeholder="当日の受け取り担当者" className={sameAsDelivery ? roInputClass : inputClass} />
          </div>
          <div>
            <label className={labelClass}>連絡先 {req}</label>
            <input type="tel" value={effPickupContact} onChange={(e) => setPickupContact(e.target.value)} readOnly={sameAsDelivery} maxLength={30} inputMode="tel" placeholder="090-1234-5678" className={sameAsDelivery ? roInputClass : inputClass} />
          </div>
        </div>
      </section>

      {/* 伝票番号連絡先(任意) */}
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

      {/* 緊急時責任者(任意) */}
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

      {/* お客様からの要望(任意) */}
      <div>
        <label className={labelClass}>
          お客様からの要望 <span className="text-xs font-normal text-gray-500">(任意)</span>
        </label>
        <textarea
          value={customerRequests}
          onChange={(e) => setCustomerRequests(e.target.value)}
          rows={4}
          maxLength={MAX_CUSTOMER_REQUESTS}
          placeholder="ご相談・連絡事項・希望台数などがあればご記入ください。"
          className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-sm focus:border-blue-500 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-gray-400">{customerRequests.length} / {MAX_CUSTOMER_REQUESTS}</p>
      </div>

      {/* 配送時の注意事項(オールマイト申請のみ。同意操作なしの告知表示) */}
      <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-600">
        <p className="text-sm font-bold sm:text-base">【重要】商品の引き渡しについて</p>
        <p className="mt-2 text-sm leading-relaxed">
          建物の搬入ルールや、店舗常設ではないイベント会場等への配送の場合、ドライバーが到着後、ご登録いただいた電話番号へご連絡し、搬入口等で商品をお引き渡しする場合がございます。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          その際、お電話がつながらない場合は商品の引き渡しができず、翌日以降の再配達となる可能性がございます。
        </p>
        <p className="mt-2 text-sm leading-relaxed">
          配送当日は必ず連絡が取れる電話番号をご登録いただき、ドライバーからの着信にご対応いただきますようお願いいたします。
        </p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {submitting
          ? (mode === "edit" ? "保存中..." : "送信中...")
          : (mode === "edit" ? "編集内容を保存" : "申請する")}
      </button>
    </form>
  );
}
