import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  EmailTemplateEditor,
  type EmailTemplatesByBusiness,
} from "@/components/admin/email-template-editor";

export const dynamic = "force-dynamic";

/** メールテンプレート編集(事業別: てずくーる/オールマイト × 申請完了/承認完了)。認証必須 */
export default async function EmailTemplatesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_templates")
    .select("key, subject, body");

  const byKey = new Map((data ?? []).map((r) => [r.key as string, r]));
  const row = (k: string) => ({
    subject: (byKey.get(k)?.subject as string) ?? "",
    body: (byKey.get(k)?.body as string) ?? "",
  });
  const templates: EmailTemplatesByBusiness = {
    tezukuru: [
      { key: "application", ...row("application") },
      { key: "approval", ...row("approval") },
    ],
    allmight: [
      { key: "application", ...row("application_allmight") },
      { key: "approval", ...row("approval_allmight") },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-10">
      <Link href="/admin/requests" className="text-sm text-blue-600 hover:underline">
        ← 申請一覧へ戻る
      </Link>
      <h1 className="mt-4 text-xl font-bold sm:text-2xl">メールテンプレート</h1>
      <p className="mt-1 text-sm text-gray-600">
        申請完了メール・承認完了メールの件名と本文を編集できます。本文はデータベースに保存されます。
      </p>
      <EmailTemplateEditor templates={templates} />
    </main>
  );
}
