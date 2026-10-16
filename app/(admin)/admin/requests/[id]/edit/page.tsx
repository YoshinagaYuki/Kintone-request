import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentAdmin } from "@/lib/admin-users";
import { getMinimumOrderQuantity } from "@/lib/system-settings";
import {
  ApplyForm,
  type ApplyFormType,
  type TezukuruInitialValues,
} from "@/components/apply/apply-form";
import {
  AllmightApplyForm,
  type AllmightInitialValues,
} from "@/components/apply/allmight-apply-form";
import { ALLMIGHT_FMT_LABELS, equipmentLabel, ALLMIGHT_MAX_EQUIPMENT } from "@/lib/allmight-fmt";
import { FMT_LABELS, MAX_PRODUCTS, contentLabel, quantityLabel } from "@/lib/tezukuru-fmt";
import type { RentalPlan, RentalStatus, ParserConfig } from "@/types/request";
import {
  DEFAULT_FMT_TEMPLATE,
  DEFAULT_INPUT_GUIDE,
  DEFAULT_NOTES,
  withFallback,
} from "@/lib/form-defaults";

export const dynamic = "force-dynamic";

/**
 * 管理者による申請内容の編集ページ(承認前のみ)。
 * ・未承認(pending)かつ kintone未登録の申請だけ編集可能。
 * ・事業(App49/App10)に応じて既存の申請フォームを「編集モード」で表示し、
 *   既存の parsed_data / 申請者情報を初期値として詰める。
 * ・保存は各フォームが PATCH /api/admin/requests/[id]/edit を呼ぶ(サーバー側で再検証)。
 * ・手配種別・時刻(allmight)はこのページでは扱わない(申請詳細の手配種別編集で管理)。
 */
export default async function RequestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentAdmin(supabase);

  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select(
      "id, status, kintone_record_id, updated_at, form_type_id, parsed_data, applicant_name, applicant_phone, applicant_email, company_staff_name_input, customer_requests, sns_promotion_requested, rental_status, requested_rental_plan_id, form_types(id, name, kintone_app_id, fmt_template, input_guide, notes, parser_config)"
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const ft = data.form_types as unknown as {
    id: string;
    name: string;
    kintone_app_id: number;
    fmt_template: string | null;
    input_guide: string | null;
    notes: string | null;
    parser_config: ParserConfig | null;
  } | null;
  if (!ft) notFound();

  const pd = (data.parsed_data ?? {}) as Record<string, string>;
  const editable = data.status === "pending" && !data.kintone_record_id;

  // 権限: 利用中かつ担当事業(form_type_id)を持つ管理者のみ編集可
  let canEdit = false;
  if (me && me.status === "active") {
    const { data: biz } = await admin
      .from("admin_user_businesses")
      .select("form_type_id")
      .eq("admin_user_id", me.id)
      .eq("form_type_id", data.form_type_id as string)
      .maybeSingle();
    canEdit = !!biz;
  }

  const header = (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">申請内容を編集({ft.name})</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          承認前の申請内容を修正します。保存するとkintone登録予定データに反映されます。
        </p>
      </div>
      <Link
        href={`/admin/requests/${id}`}
        className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
      >
        申請詳細へ戻る
      </Link>
    </div>
  );

  if (!editable || !canEdit) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
        {header}
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {!editable
            ? "この申請は承認・登録済みのため編集できません(編集は未承認の申請のみ可能です)。"
            : "この事業の担当管理者のみ編集できます。"}
        </div>
      </main>
    );
  }

  // ========== オールマイト(App10) ==========
  if (ft.kintone_app_id === 10) {
    const { data: itemData } = await admin
      .from("item_name_master")
      .select("name, sort_order, is_active, category")
      .eq("category", "allmight")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    const productOptions = (itemData ?? []).map((r) => r.name as string);

    const equipments: string[] = [];
    for (let i = 1; i <= ALLMIGHT_MAX_EQUIPMENT; i++) {
      const v = (pd[equipmentLabel(i)] ?? "").trim();
      if (v) equipments.push(v);
    }

    const L = ALLMIGHT_FMT_LABELS;
    const initialValues: AllmightInitialValues = {
      applicantName: data.applicant_name ?? "",
      applicantPhone: data.applicant_phone ?? "",
      applicantEmail: data.applicant_email ?? "",
      companyStaffName: data.company_staff_name_input ?? "",
      agencyName: pd[L.agencyName] ?? "",
      eventBooth: pd[L.eventBooth] ?? pd[L.eventBoothName] ?? "",
      billingMonth: pd[L.billingMonth] ?? "",
      shippingFee: pd[L.shippingFee] ?? "",
      usageStart: pd[L.usageStart] ?? "",
      usageEnd: pd[L.usageEnd] ?? "",
      equipments,
      deliveryDate: pd[L.deliveryDate] ?? "",
      deliveryPostal: pd[L.deliveryPostal] ?? "",
      deliveryAddress: pd[L.deliveryAddress] ?? "",
      deliveryReceiver: pd[L.deliveryReceiver] ?? "",
      deliveryContact: pd[L.deliveryContact] ?? "",
      pickupDate: pd[L.pickupDate] ?? "",
      pickupPostal: pd[L.pickupPostal] ?? "",
      pickupAddress: pd[L.pickupAddress] ?? "",
      pickupReceiver: pd[L.pickupHandover] ?? "",
      pickupContact: pd[L.pickupContact] ?? "",
      slipTo: pd[L.slipTo] ?? "",
      slipCc: pd[L.slipCc] ?? "",
      emergencyName: pd[L.emergencyName] ?? "",
      emergencyPhone: pd[L.emergencyPhone] ?? "",
      customerRequests: data.customer_requests ?? "",
    };

    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
        {header}
        <AllmightApplyForm
          formTypeId={ft.id}
          productOptions={productOptions}
          mode="edit"
          requestId={id}
          initialValues={initialValues}
          baseUpdatedAt={(data.updated_at as string | null) ?? undefined}
        />
      </main>
    );
  }

  // ========== てずくーる(App49)および他事業 ==========
  const allSelectFields =
    (ft.parser_config as { select_fields?: ApplyFormType["select_fields"] })?.select_fields ?? [];
  const formTypes: ApplyFormType[] = [
    {
      id: ft.id,
      name: ft.name,
      fmt_template: withFallback(ft.fmt_template, DEFAULT_FMT_TEMPLATE),
      input_guide: withFallback(ft.input_guide, DEFAULT_INPUT_GUIDE),
      notes: withFallback(ft.notes, DEFAULT_NOTES),
      select_fields: allSelectFields.filter((sf) => sf.label !== "レンタルプラン"),
      has_rental_plan: allSelectFields.some((sf) => sf.label === "レンタルプラン"),
      is_tezukuru: ft.kintone_app_id === 49,
    },
  ];

  const { data: planData } = await admin
    .from("rental_plans")
    .select("id, name, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rentalPlans = (planData ?? []) as RentalPlan[];

  const { data: itemData } = await admin
    .from("item_name_master")
    .select("name, sort_order, is_active, category, excluded_slots")
    .eq("category", "tezukuru")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const productItems = (itemData ?? []).map((r) => ({
    name: r.name as string,
    excludedSlots: Array.isArray(r.excluded_slots) ? (r.excluded_slots as number[]) : [],
  }));

  const minimumOrderQuantity = await getMinimumOrderQuantity(admin);

  // 商品(スロット位置を保持。最後に値のあるスロットまで配列化)
  const products: { name: string; quantity: string }[] = [];
  let lastFilled = 0;
  for (let i = 1; i <= MAX_PRODUCTS; i++) {
    const name = (pd[contentLabel(i)] ?? "").trim();
    const qty = (pd[quantityLabel(i)] ?? "").trim();
    products.push({ name, quantity: qty });
    if (name || qty) lastFilled = i;
  }
  const trimmedProducts = products.slice(0, Math.max(lastFilled, 1));

  const snsBool = data.sns_promotion_requested;
  const initialValues: TezukuruInitialValues = {
    applicantName: data.applicant_name ?? "",
    applicantPhone: data.applicant_phone ?? "",
    applicantEmail: data.applicant_email ?? "",
    companyStaffName: data.company_staff_name_input ?? "",
    rentalStatus: (data.rental_status as RentalStatus | null) ?? "",
    rentalPlanId: data.requested_rental_plan_id ?? "",
    agencyName: pd[FMT_LABELS.agencyName] ?? "",
    boothName: pd[FMT_LABELS.boothName] ?? "",
    billingMonth: pd[FMT_LABELS.billingMonth] ?? "",
    shippingFee: pd[FMT_LABELS.shippingFee] ?? "",
    products: trimmedProducts,
    deliveryDate: pd[FMT_LABELS.deliveryDate] ?? "",
    deliveryPostal: pd[FMT_LABELS.deliveryPostal] ?? "",
    deliveryAddress: pd[FMT_LABELS.deliveryAddress] ?? "",
    deliveryReceiver: pd[FMT_LABELS.deliveryReceiver] ?? "",
    deliveryContact: pd[FMT_LABELS.deliveryContact] ?? "",
    pickupDate: pd[FMT_LABELS.pickupDate] ?? "",
    pickupPostal: pd[FMT_LABELS.pickupPostal] ?? "",
    pickupAddress: pd[FMT_LABELS.pickupAddress] ?? "",
    pickupHandover: pd[FMT_LABELS.pickupHandover] ?? "",
    pickupContact: pd[FMT_LABELS.pickupContact] ?? "",
    slipTo: pd[FMT_LABELS.slipTo] ?? "",
    slipCc: pd[FMT_LABELS.slipCc] ?? "",
    emergencyName: pd[FMT_LABELS.emergencyName] ?? "",
    emergencyPhone: pd[FMT_LABELS.emergencyPhone] ?? "",
    snsPromotion: snsBool === null || snsBool === undefined ? "" : snsBool ? "yes" : "no",
    customerRequests: data.customer_requests ?? "",
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      {header}
      <ApplyForm
        formTypes={formTypes}
        rentalPlans={rentalPlans}
        productItems={productItems}
        minimumOrderQuantity={minimumOrderQuantity}
        mode="edit"
        requestId={id}
        initialValues={initialValues}
        baseUpdatedAt={(data.updated_at as string | null) ?? undefined}
      />
    </main>
  );
}
