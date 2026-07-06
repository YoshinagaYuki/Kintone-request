"use client";

import { createBrowserClient } from "@supabase/ssr";

/** ブラウザ用クライアント(anonキー)。管理画面のログイン等で使用 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
