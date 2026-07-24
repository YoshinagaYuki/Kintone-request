import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SettingsEditor } from "@/components/admin/settings-editor";
import { getMinimumOrderQuantity, getManualDriveUrl } from "@/lib/system-settings";

export const dynamic = "force-dynamic";

/**
 * システム設定(基本設定のみ)。middleware により認証必須。
 * 管理者ユーザー管理は独立メニュー(/admin/admin-users)へ移動した。
 * 今後のシステム全体設定はこの画面に追加していく。
 */
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
      <p className="mt-1 text-sm text-gray-600">基本設定(最低注文数量・Google Drive共有リンク)。</p>
      <SettingsEditor
        minimumOrderQuantity={minimumOrderQuantity}
        manualDriveUrl={manualDriveUrl}
      />
    </main>
  );
}
