import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * 申請完了画面。
 * ・受付番号(内部ID)、管理番号(採番済みなら)を表示
 * ・受付メールの送信結果(mail=sent/failed/pending)に応じて正確な文言を出す
 *   → 事実と異なる「送信しました」を出さない
 */
export default async function CompletePage({
  searchParams,
}: {
  searchParams: Promise<{ rid?: string; mail?: string; type?: string }>;
}) {
  const { rid, mail } = await searchParams;

  let managementNo: string | null = null;
  let applicantEmail: string | null = null;
  if (rid) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("requests")
      .select("management_no, applicant_email")
      .eq("id", rid)
      .maybeSingle();
    managementNo = data?.management_no ?? null;
    applicantEmail = data?.applicant_email ?? null;
  }

  const emailMasked = applicantEmail
    ? applicantEmail.replace(/^(.).*(@.*)$/, "$1****$2")
    : null;

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

      <h1 className="mt-6 text-2xl font-bold">申請を受け付けました</h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        内容を確認のうえ、担当者よりご連絡いたします。
      </p>

      {/* 受付番号・管理番号 */}
      <div className="mt-6 w-full rounded-lg border border-gray-200 bg-white p-4 text-left text-sm shadow-sm">
        {rid && (
          <p className="flex justify-between gap-3">
            <span className="text-gray-500">受付番号</span>
            <span className="font-mono text-xs text-gray-800">{rid.slice(0, 8)}</span>
          </p>
        )}
        <p className="mt-2 flex justify-between gap-3">
          <span className="text-gray-500">管理番号</span>
          <span className="font-mono text-gray-800">
            {managementNo ?? "社内確認後に発行されます"}
          </span>
        </p>
      </div>

      {/* メール送信結果(正確な文言) */}
      <div className="mt-4 w-full rounded-lg border border-blue-200 bg-blue-50 p-4 text-left text-sm text-blue-900">
        {mail === "sent" ? (
          <p>
            {emailMasked ? `${emailMasked} 宛に` : "ご入力のメールアドレス宛に"}
            受付メールを送信しました。
          </p>
        ) : mail === "failed" ? (
          <p className="text-orange-800">
            受付は完了していますが、確認メールの送信に失敗した可能性があります。
            メールが届かない場合はお手数ですが担当者までご連絡ください。
          </p>
        ) : (
          <p>
            ご入力のメールアドレス宛に受付メールをお送りします(数分かかる場合があります)。
          </p>
        )}
        <p className="mt-2">
          社内での確認・承認が完了しましたら、承認完了メールをお送りします。
        </p>
      </div>

      <div className="mt-8 w-full space-y-3">
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
