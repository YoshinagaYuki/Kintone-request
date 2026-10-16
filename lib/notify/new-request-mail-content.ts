import { formatJstDateTime } from "@/lib/format-time";

/**
 * 新規申請メール(管理者向け・担当者向け 共通)の件名・本文。コードで管理する。
 * ・実際に取得できる項目のみ使用し、会社名/開催日 のような未取得項目は出さない。
 * ・取次店名・配送日・集荷日 はラベルを明示して混同しない。
 */
export type NewRequestMailFields = {
  formTypeName: string;
  applicantName: string;
  agencyName: string; // 取次店名
  boothName: string; // イベントブース名
  deliveryDate: string; // 配送日
  pickupDate: string; // 集荷日
  submittedAt: string; // 申請日時(ISO)
  adminUrl: string; // 管理画面 詳細URL
};

export function newRequestSubject(f: NewRequestMailFields): string {
  return `【${f.formTypeName}】新規申請のお知らせ`;
}

export function newRequestBody(f: NewRequestMailFields): string {
  const line = (label: string, v: string) =>
    v && v.trim() ? `${label}: ${v.trim()}` : null;

  const lines: (string | null)[] = [
    "新しい申請を受け付けました。",
    "",
    `事業: ${f.formTypeName}`,
    line("申請者", f.applicantName),
    line("取次店名", f.agencyName),
    line("イベントブース名", f.boothName),
    line("配送日", f.deliveryDate),
    line("集荷日", f.pickupDate),
    `申請日時: ${formatJstDateTime(f.submittedAt)}`,
    "",
    "管理画面で内容をご確認ください:",
    f.adminUrl,
  ];
  return lines.filter((x): x is string => x !== null).join("\n");
}
