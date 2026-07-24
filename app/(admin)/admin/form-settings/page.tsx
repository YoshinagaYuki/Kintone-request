import { createClient } from "@/lib/supabase/server";
import {
  FormSettingsEditor,
  type FormSettingRow,
} from "@/components/admin/form-settings-editor";

export const dynamic = "force-dynamic";

/**
 * 申請フォーム設定(FMTテンプレート/注意事項/案内文章)。middleware により認証必須。
 *
 * 【削除候補 / DEPRECATED】
 * 構造化申請フォーム導入により、公開申請画面は form_settings の案内文章・FMTテンプレート本文を
 * 参照しなくなった(旧FMT申請との互換のためルート・API・DB・データは当面残置)。
 * ナビからは非表示。旧FMT互換が不要になった段階で本ページ一式を撤去する。
 */
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
