import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AllmightApplyForm } from "@/components/apply/allmight-apply-form";

export const dynamic = "force-dynamic";

/**
 * オールマイト申請フォーム(固定URL /apply/allmight)。
 *
 * ・事業判定は kintone_app_id=10(オールマイト)。
 * ・公開フラグ(form_types.is_active / 事業選択トップの ALLMIGHT_PUBLIC)はまだ変更しない。
 *   そのため事業選択トップからはまだ遷移できない(本ページは準備・検証用に直接URLで表示可能)。
 *   申請の実送信は /api/requests が is_active=true を要求するため、公開(is_active=true)後に有効化される。
 * ・機器商品はオールマイト商品マスター(item_name_master category='allmight')から選択。
 */
export default async function AllmightApplyPage() {
  const supabase = createAdminClient();

  // オールマイト(App10)の form_type を取得(公開前のため is_active では絞らない)
  const { data: formType } = await supabase
    .from("form_types")
    .select("id, name, kintone_app_id")
    .eq("kintone_app_id", 10)
    .maybeSingle();
  if (!formType) notFound();

  // オールマイト商品マスター(有効・表示順)
  const { data: itemData } = await supabase
    .from("item_name_master")
    .select("name, sort_order, is_active, category")
    .eq("category", "allmight")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const productOptions = (itemData ?? []).map((r) => r.name as string);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">オールマイト 案件申請</h1>
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

      <AllmightApplyForm formTypeId={formType.id as string} productOptions={productOptions} />
    </main>
  );
}
