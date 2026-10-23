import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";
export const inventoryEnabled = () => process.env.INVENTORY_WRITES_ENABLED === "true";
export async function inventoryAccess() {
  if (!inventoryEnabled()) return { error: "在庫登録機能はまだ有効になっていません", status: 503 } as const;
  const db = await createClient();
  const admin = await getCurrentAdmin(db);
  if (!isActiveAdmin(admin)) return { error: "有効な管理者権限が必要です", status: 403 } as const;
  return { db, admin };
}
