import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 申請トップページ(事業選択)。/apply
 *
 * ・お申し込み事業(てずくーる / オールマイト)をロゴカードで選択する。
 * ・てずくーる → /apply/tezukuru(既存フォーム)。公開中(App49 is_active)のときのみ有効。
 * ・オールマイト → 専用フォーム・App10連携が未完成のため「準備中」(選択不可)。
 * ・事業判定は表示名ではなく kintone_app_id(49/10)で行う。
 * ・ロゴ画像は public/images 配下を使用(縦横比維持・object-contain)。
 */

// オールマイトの公開可否は Vercel 環境変数 ALLMIGHT_PUBLIC("true" で公開)で制御する。
const ALLMIGHT_PUBLIC = process.env.ALLMIGHT_PUBLIC === "true";

export default async function ApplyTopPage() {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("form_types")
    .select("kintone_app_id, is_active")
    .eq("is_active", true);
  const activeAppIds = new Set((data ?? []).map((r) => r.kintone_app_id as number));

  const tezukuruAvailable = activeAppIds.has(49);
  const allmightAvailable = ALLMIGHT_PUBLIC && activeAppIds.has(10);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">案件申請受付</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            お申し込み希望のコンテンツを選択してください
          </p>
        </div>
        <Link
          href="/admin/requests"
          className="shrink-0 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          管理者画面
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* てずくーる */}
        <BusinessCard
          available={tezukuruAvailable}
          href="/apply/tezukuru"
          logoSrc="/images/tezukuru-logo.png"
          alt="てずくーる!!"
          description="ワークショップ"
        />

        {/* オールマイト */}
        <BusinessCard
          available={allmightAvailable}
          href="/apply/allmight"
          logoSrc="/images/allmight-logo.png"
          alt="オールマイト"
          description="アミューズメント機器"
        />
      </div>
    </main>
  );
}

function BusinessCard({
  available,
  href,
  logoSrc,
  alt,
  description,
}: {
  available: boolean;
  href: string;
  logoSrc: string;
  alt: string;
  description: string;
}) {
  const inner = (
    <>
      {/* ロゴ表示領域(高さ統一・縦横比維持) */}
      <div className="flex h-20 w-full items-center justify-center sm:h-24">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt={alt}
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="mt-4 text-sm font-medium text-gray-700">{description}</div>
      <div className="mt-4">
        {available ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">
            申請する →
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-200 px-3 py-1 text-xs font-semibold text-gray-600">
            準備中
          </span>
        )}
      </div>
    </>
  );

  if (!available) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-[13rem] cursor-not-allowed flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center opacity-80"
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex min-h-[13rem] flex-col items-center justify-center rounded-2xl border-2 border-blue-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-blue-500 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 active:bg-blue-100"
    >
      {inner}
    </Link>
  );
}
