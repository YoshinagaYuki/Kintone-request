import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApplyForm, type ApplyFormType } from "@/components/apply/apply-form";
import type { RentalPlan } from "@/types/request";
import {
  DEFAULT_FMT_TEMPLATE,
  DEFAULT_INPUT_GUIDE,
  DEFAULT_NOTES,
  withFallback,
} from "@/lib/form-defaults";

export const dynamic = "force-dynamic";

/**
 * 申請ページ(単一URL /apply)。
 * is_active=true の form_types を display_order 順にラジオで自動描画。
 * オールマイトは is_active=false(機能オフ)のため公開申請には出ない。
 * 担当者選択は機能オフ(コード/マスタは保持)。代わりに入力者情報を入力。
 */
export default async function ApplyPage() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("form_types")
    .select("id, name, fmt_template, input_guide, notes, parser_config")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  // 選択UI定義(parser_config.select_fields)。レンタルプランは専用UIで扱うため除外する
  const formTypes: ApplyFormType[] = (data ?? []).map((f) => {
    const allSelectFields =
      (f.parser_config as { select_fields?: ApplyFormType["select_fields"] })
        ?.select_fields ?? [];
    return {
      id: f.id,
      name: f.name,
      // 管理画面「申請フォーム設定」で編集した内容を表示。
      // DB未登録(空)の場合のみ既定値へフォールバック
      fmt_template: withFallback(f.fmt_template, DEFAULT_FMT_TEMPLATE),
      input_guide: withFallback(f.input_guide, DEFAULT_INPUT_GUIDE),
      notes: withFallback(f.notes, DEFAULT_NOTES),
      select_fields: allSelectFields.filter((sf) => sf.label !== "レンタルプラン"),
      has_rental_plan: allSelectFields.some((sf) => sf.label === "レンタルプラン"),
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

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">案件申請</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            必要事項を入力し、FMT(定型フォーマット)を貼り付けて申請してください。
          </p>
        </div>
        <Link
          href="/admin/requests"
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          管理者画面
        </Link>
      </div>

      <ApplyForm formTypes={formTypes} rentalPlans={rentalPlans} />
    </main>
  );
}
