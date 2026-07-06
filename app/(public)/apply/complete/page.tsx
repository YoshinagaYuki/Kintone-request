import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_MESSAGE =
  "申請を受け付けました。\n内容を確認のうえ、担当者よりご連絡いたします。";

// 受付番号・内部IDは表示しない方針(requirements.md FR-04)
// 完了メッセージは form_types.complete_message(?type=<form_type_id>)から取得
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;

  let message = DEFAULT_MESSAGE;
  if (type) {
    const supabase = createAdminClient();
    const { data: formType } = await supabase
      .from("form_types")
      .select("complete_message")
      .eq("id", type)
      .maybeSingle();
    if (formType?.complete_message) message = formType.complete_message;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg
          className="h-8 w-8 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="mt-6 text-2xl font-bold">申請完了</h1>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
        {message}
      </p>

      <div className="mt-10 w-full space-y-3">
        <Link
          href="/apply"
          className="block w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          続けて申請する
        </Link>
        <Link
          href="/admin/requests"
          className="block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          管理者画面へ
        </Link>
      </div>
    </main>
  );
}
