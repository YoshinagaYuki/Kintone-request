import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ApplyForm,
  type ApplyFormType,
  type StaffOption,
} from "@/components/apply/apply-form";

export const dynamic = "force-dynamic";

/**
 * 申請ページ(単一URL /apply)。
 * is_active=true の form_types を display_order 順にラジオで自動描画し、
 * 選択種別に応じてテンプレート・入力説明・注意事項を切り替える(完全マスタ駆動)。
 * 種別追加は form_types へのレコードINSERTのみで反映される。
 */
export default async function ApplyPage() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("form_types")
    .select("id, name, fmt_template, input_guide, notes, parser_config")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  // 選択UI定義(parser_config.select_fields)のみクライアントへ渡す
  const formTypes: ApplyFormType[] = (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    fmt_template: f.fmt_template,
    input_guide: f.input_guide,
    notes: f.notes,
    select_fields:
      (f.parser_config as { select_fields?: ApplyFormType["select_fields"] })
        ?.select_fields ?? [],
  }));
  if (formTypes.length === 0) notFound();

  // 担当者マスター(is_active=true を sort_order 順。両種別共通)
  const { data: staffData } = await supabase
    .from("staff_members")
    .select("id, name, company")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  const staffMembers = (staffData ?? []) as StaffOption[];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">案件申請</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            申請種別を選択し、FMT(定型フォーマット)を貼り付けて申請してください。
          </p>
        </div>
        <Link
          href="/admin/requests"
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          管理者画面
        </Link>
      </div>

      <ApplyForm formTypes={formTypes} staffMembers={staffMembers} />
    </main>
  );
}
