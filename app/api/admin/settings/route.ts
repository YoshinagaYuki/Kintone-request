import {validateDriveLinks,driveSettingKey,driveToken} from '@/lib/mail/drive-links';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAdmin, isActiveAdmin } from "@/lib/admin-users";
import {
  SETTING_KEYS,
  EMAIL_RE,
  parseEmailList,
  dedupeEmails,
} from "@/lib/system-settings";

/**
 * システム設定の更新(管理者のみ。RLSで保護)。
 * body: { minimum_order_quantity?; manual_drive_url?; always_cc_emails? }
 * ・minimum_order_quantity は正の整数のみ
 * ・manual_drive_url は http(s) のみ許可(空は許可=未設定)
 * ・always_cc_emails は配列/文字列。各アドレスの形式を検証(空は許可=常時CCなし)
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  // ログインだけでなく「有効(active)な管理者」であることを必須にする。
  // 停止中(disabled)・招待中(invited)・admin_users 未登録の認証ユーザーは拒否する。
  const me = await getCurrentAdmin(supabase);
  if (!isActiveAdmin(me)) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }

  let body: {
    mail_drive_links_allmight?: unknown;
    mail_drive_links_tezukuru?: unknown;
    minimum_order_quantity?: number | string;
    manual_drive_url?: string;
    manual_drive_url_allmight?: string;
    always_cc_emails?: string[] | string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const rows: { key: string; value: string }[] = [];

  if (body.minimum_order_quantity !== undefined) {
    const n = Number.parseInt(String(body.minimum_order_quantity).trim(), 10);
    if (!Number.isInteger(n) || n <= 0) {
      return NextResponse.json(
        { error: "最小注文数量は1以上の整数で入力してください" },
        { status: 400 }
      );
    }
    rows.push({ key: SETTING_KEYS.minimumOrderQuantity, value: String(n) });
  }

  if (body.manual_drive_url !== undefined) {
    const url = String(body.manual_drive_url).trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "共有リンクは http:// または https:// で始まるURLを入力してください" },
        { status: 400 }
      );
    }
    rows.push({ key: SETTING_KEYS.manualDriveUrl, value: url });
  }

  if (body.manual_drive_url_allmight !== undefined) {
    const url = String(body.manual_drive_url_allmight).trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: "共有リンク(オールマイト)は http:// または https:// で始まるURLを入力してください" },
        { status: 400 }
      );
    }
    rows.push({ key: SETTING_KEYS.manualDriveUrlAllmight, value: url });
  }

  if (body.always_cc_emails !== undefined) {
    const list = Array.isArray(body.always_cc_emails)
      ? body.always_cc_emails.map((s) => String(s).trim()).filter((s) => s.length > 0)
      : parseEmailList(String(body.always_cc_emails));
    const invalid = list.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `メールアドレスの形式が正しくありません: ${invalid.join(", ")}` },
        { status: 400 }
      );
    }
    // 大文字小文字を無視して重複排除し、1行1アドレスで保存(空は常時CCなし)
    rows.push({
      key: SETTING_KEYS.alwaysCcEmails,
      value: dedupeEmails(list).join("\n"),
    });
  }

  for(const business of ['allmight','tezukuru'] as const){
    const key=driveSettingKey(business),value=body[key as keyof typeof body];
    if(value===undefined)continue;
    try{
      const links=validateDriveLinks(value);
      const {data:templates,error:templateError}=await supabase.from('email_templates').select('subject,body').in('key',business==='allmight'?['application_allmight','approval_allmight']:['application','approval']);
      if(templateError)throw Error('メール本文の使用状況を確認できません');
      const used=(templates??[]).map(t=>`${t.subject}\n${t.body}`).join('\n');
      const old=await supabase.from('system_settings').select('value').eq('key',key).maybeSingle();
      if(old.error)throw Error('資料リンクの設定を確認できません');
      const oldLinks=old.data?validateDriveLinks(JSON.parse(old.data.value)):[];
      for(const link of oldLinks){if(!links.some(l=>l.id===link.id)&&new RegExp('\\{\\{\\s*'+driveToken(link.id)+'\\s*\\}\\}').test(used))throw Error(`「${link.name}」はメール本文で使用中です。先に本文から外してください`);}
      if(!links.some(l=>l.id==='legacy')&&/\{\{\s*manual_drive_url\s*\}\}/.test(used))throw Error('既存の資料リンクはメール本文で使用中です。先に本文から外してください');
      rows.push({key,value:JSON.stringify(links)});
      rows.push({key:business==='allmight'?SETTING_KEYS.manualDriveUrlAllmight:SETTING_KEYS.manualDriveUrl,value:links.find(l=>l.id==='legacy')?.url??''});
    }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'資料リンクを確認してください'},{status:400});}
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "更新項目がありません" }, { status: 400 });
  }

  const { error } = await supabase
    .from("system_settings")
    .upsert(rows, { onConflict: "key" });
  if (error) {
    return NextResponse.json({ error: `更新に失敗しました: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
