import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * service_role クライアント(RLSバイパス)。
 * Route Handler / Server Component などサーバーサイド専用。
 * クライアントコンポーネントから import してはならない("server-only" で保護)。
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
