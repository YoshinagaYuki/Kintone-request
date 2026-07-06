import type { StaffOption } from "./apply-form";

/** 検索用正規化(小文字化+空白除去。「吉永 勇樹」を「吉永勇」でもヒットさせる) */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/[\s　]+/g, "");
}

/** 氏名・所属会社で担当者を絞り込む(空クエリは全件) */
export function filterStaff(staff: StaffOption[], query: string): StaffOption[] {
  const q = normalizeForSearch(query);
  if (!q) return staff;
  return staff.filter((s) =>
    normalizeForSearch(`${s.name}${s.company}`).includes(q)
  );
}

/** 表示ラベル「氏名（所属会社）」 */
export function staffLabel(s: StaffOption): string {
  return s.company ? `${s.name}（${s.company}）` : s.name;
}
