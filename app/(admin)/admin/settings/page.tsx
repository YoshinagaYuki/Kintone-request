import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { getMinimumOrderQuantity, getManualDriveUrl } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/** システム設定(最小注文数量 / Google Drive 共有リンク)。middleware により認証必須 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const [minimumOrderQuantity, manualDriveUrl] = await Promise.all([
    getMinimumOrderQuantity(supabase),
    getManualDriveUrl(supabase),
  ]);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">システム設定</h1>
      <SettingsEditor
        minimumOrderQuantity={minimumOrderQuantity}
        manualDriveUrl={manualDriveUrl}
      />
    </main>
  );
}
