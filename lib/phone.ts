/**
 * 電話番号の共通フォーマッタ。表示・メール・FMT生成・kintone登録など
 * 電話番号を出力する全ての箇所でこの関数を使う(DBは数字のみ保存のままでよい)。
 *
 * ・数字以外は除去してから判定する
 * ・空欄はそのまま返す
 * ・不正な桁数は元の文字列を返す(壊さない)
 * ・携帯(070/080/090/060)・IP(050)・フリーダイヤル(0120/0800)・固定電話に対応
 * ・固定電話は住所から「市区町村 → 都道府県 → 全国表」の順で市外局番を判定(市区町村を優先)
 *   不明時は先頭から一般的な市外局番長(既定3桁)を推測
 * ・冪等: すでにハイフン付きの値でも、数字抽出→再整形で同じ結果になる
 *
 * 市外局番の対応表は lib/area-codes.ts に共通定数として切り出し(保守しやすい構造)。
 */

import {
  NATIONAL_AREA_CODES,
  detectMunicipalityCodes,
  detectPrefectureCodes,
} from "./area-codes";

/** 候補コードのうち、番号先頭に最長一致するものの桁数を返す(無ければ0) */
function longestPrefixLen(digits: string, codes: string[]): number {
  let best = 0;
  for (const code of codes) {
    if (digits.startsWith(code) && code.length > best) best = code.length;
  }
  return best;
}

/**
 * 固定電話(10桁)の市外局番の桁数を決定する。
 * 判定優先順位:
 *   ① 市区町村テーブル(住所)との番号先頭最長一致  ← 市区町村レベルで最も正確
 *   ② 都道府県テーブル(住所)との番号先頭最長一致
 *   ③ 全国主要局番テーブルとの番号先頭最長一致
 *   ④ 一般的な市外局番長による推測(3桁)
 *
 * ※「柏市=04」と「松戸市=047」のように、番号だけでは区別できない局番があるため、
 *   住所から得た市区町村局番を全国表より優先する(それが市区町村レベル判定の要点)。
 */
function resolveAreaCodeLength(digits: string, address?: string | null): number {
  const byMunicipality = longestPrefixLen(digits, detectMunicipalityCodes(address));
  if (byMunicipality >= 2 && byMunicipality <= 5) return byMunicipality;

  const byPrefecture = longestPrefixLen(digits, detectPrefectureCodes(address));
  if (byPrefecture >= 2 && byPrefecture <= 5) return byPrefecture;

  const byNational = longestPrefixLen(digits, NATIONAL_AREA_CODES);
  if (byNational >= 2 && byNational <= 5) return byNational;

  return 3; // 推測(不明時の既定。東京/大阪の2桁は上で拾える)
}

/**
 * 電話番号を見やすいハイフン付きへ整形する。
 * @param phone 入力(数字以外混在可)
 * @param addressOrPrefecture 固定電話の市外局番判定に使う住所(市区町村を含むほど正確)/都道府県(任意)
 */
export function formatPhoneNumber(
  phone: string | null | undefined,
  addressOrPrefecture?: string | null
): string {
  if (phone == null) return "";
  const original = String(phone);
  const d = original.replace(/\D/g, "");
  if (!d) return original; // 空欄はそのまま

  // 携帯・IP(11桁)
  if (d.length === 11 && /^(070|080|090|060)/.test(d)) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 11 && d.startsWith("050")) {
    return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  }
  // フリーダイヤル 0800(11桁)
  if (d.length === 11 && d.startsWith("0800")) {
    return `0800-${d.slice(4, 7)}-${d.slice(7)}`;
  }
  // フリーダイヤル 0120(10桁)
  if (d.length === 10 && d.startsWith("0120")) {
    return `0120-${d.slice(4, 7)}-${d.slice(7)}`;
  }

  // 固定電話(10桁・先頭0)
  if (d.length === 10 && d.startsWith("0")) {
    const areaLen = resolveAreaCodeLength(d, addressOrPrefecture);
    const area = d.slice(0, areaLen);
    const middle = d.slice(areaLen, 6);
    const last4 = d.slice(6);
    if (area && middle && last4) return `${area}-${middle}-${last4}`;
  }

  // 不正な桁数などは元の文字列を返す
  return original;
}
