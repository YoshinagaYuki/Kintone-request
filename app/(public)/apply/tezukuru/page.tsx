import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplyForm, type ApplyFormType } from "@/components/apply/apply-form";
import type { RentalPlan } from "@/types/request";
import { getMinimumOrderQuantity } from "@/lib/system-settings";
import {
  DEFAULT_FMT_TEMPLATE,
  DEFAULT_INPUT_GUIDE,
  DEFAULT_NOTES,
  withFallback,
} from "@/lib/form-defaults";

export const dynamic = "force-dynamic";

/**
 * てずくーる申請フォーム(固定URL /apply/tezukuru)。
 *
 * 旧来 /apply にあった申請フォームをこのURLへ移設した。
 * 事業選択トップ(/apply)の「てずくーる」カードから遷移する。
 * 事業判定は表示名ではなく kintone_app_id=49(てずくーる)で行う。
 * 既存の申請処理・API・kintone連携(App49)は変更していない。
 */
export default async function TezukuruApplyPage() {
  const supabase = createAdminClient();

  // てずくーる(App49)かつ公開中のみ対象
  const { data } = await supabase
    .from("form_types")
    .select("id, name, fmt_template, input_guide, notes, parser_config, kintone_app_id")
    .eq("is_active", true)
    .eq("kintone_app_id", 49)
    .order("display_order", { ascending: true });

  const formTypes: ApplyFormType[] = (data ?? []).map((f) => {
    const allSelectFields =
      (f.parser_config as { select_fields?: ApplyFormType["select_fields"] })
        ?.select_fields ?? [];
    return {
      id: f.id,
      name: f.name,
      fmt_template: withFallback(f.fmt_template, DEFAULT_FMT_TEMPLATE),
      input_guide: withFallback(f.input_guide, DEFAULT_INPUT_GUIDE),
      notes: withFallback(f.notes, DEFAULT_NOTES),
      select_fields: allSelectFields.filter((sf) => sf.label !== "レンタルプラン"),
      has_rental_plan: allSelectFields.some((sf) => sf.label === "レンタルプラン"),
      is_tezukuru: (f.kintone_app_id as number) === 49,
    };
  });
  if (formTypes.length === 0) notFound();

  // レンタルプランマスタ(有効なもののみ・表示順)
  const { data: planData } = await supabase
    .from("rental_plans")
    .select("id, name, description, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const rentalPlans = (planData ?? []) as RentalPlan[];

  // 商品(コンテンツ)プルダウン: 商品マスターの有効な正式名称のみ・sort_order→正式名称順。
  const { data: itemData } = await supabase
    .from("item_name_master")
    .select("name, sort_order, is_active, category, excluded_slots")
    .eq("category", "tezukuru")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const productItems = (itemData ?? []).map((r) => ({
    name: r.name as string,
    excludedSlots: Array.isArray(r.excluded_slots)
      ? (r.excluded_slots as number[])
      : [],
  }));

  const minimumOrderQuantity = await getMinimumOrderQuantity(supabase);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">てずくーる 案件申請</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            各項目を入力して申請してください。
          </p>
        </div>
        <Link
          href="/admin/requests"
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          管理者画面
        </Link>
      </div>

      <ApplyForm
        formTypes={formTypes}
        rentalPlans={rentalPlans}
        productItems={productItems}
        minimumOrderQuantity={minimumOrderQuantity}
      />
    </main>
  );
}
