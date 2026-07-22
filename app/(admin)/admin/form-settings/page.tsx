import { createClient } from "@/lib/supabase/server";
import {
  FormSettingsEditor,
  type FormSettingRow,
} from "@/components/admin/form-settings-editor";

export const dynamic = "force-dynamic";

/** 申請フォーム設定(FMTテンプレート/注意事項/案内文章)。middleware により認証必須 */
export default async function FormSettingsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("form_types")
    .select("id, name, is_active, version, fmt_template, notes, input_guide, updated_at")
    .order("display_order", { ascending: true });

  const forms = (data ?? []) as FormSettingRow[];

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">申請フォーム設定</h1>
      <p className="mt-2 text-sm text-gray-600">
        公開申請画面に表示するFMTテンプレート・注意事項・案内文章を編集できます(空欄保存も可能)。
      </p>
      <FormSettingsEditor forms={forms} />
    </main>
  );
}
