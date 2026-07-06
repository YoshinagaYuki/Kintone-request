import { redirect } from "next/navigation";

/** 旧・種別別URL(/apply/[slug])は単一URL /apply へリダイレクト */
export default function LegacyApplyPage() {
  redirect("/apply");
}
