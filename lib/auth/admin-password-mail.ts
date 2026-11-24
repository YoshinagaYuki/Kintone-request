import 'server-only';
import type { createAdminClient } from '@/lib/supabase/admin';
import { isMailConfigured, sendMail } from '@/lib/mail/mailer';
import { passwordSetupUrl, passwordSetupMail, type PasswordLinkType } from './password-links';

type Admin = ReturnType<typeof createAdminClient>;
export async function generateAdminPasswordLink(admin: Admin, email: string, origin: string, invitation: boolean, name?: string) {
  if (!isMailConfigured()) throw new Error('招待メールの送信設定がありません。管理者にお問い合わせください。');
  let method: PasswordLinkType = invitation ? 'invite' : 'recovery';
  let result = await admin.auth.admin.generateLink(invitation
    ? {type: 'invite', email, options: {data: name ? {name} : undefined}}
    : {type: 'recovery', email});
  // An existing shared Auth account must be reused, never duplicated.
  if (result.error && invitation) {
    method = 'recovery';
    result = await admin.auth.admin.generateLink({type: method, email});
  }
  if (result.error || !result.data?.user || !result.data.properties?.hashed_token) throw new Error('パスワード設定リンクを発行できませんでした。時間をおいて再度お試しください。');
  return {userId: result.data.user.id, method, url: passwordSetupUrl(origin, result.data.properties.hashed_token, method)};
}
export async function deliverAdminPasswordLink(email: string, url: string, invitation: boolean) {
  const result = await sendMail({to: email, ...passwordSetupMail(url, invitation)});
  if (!result.sent) throw new Error('メールを送信できませんでした。管理者一覧から再送してください。');
}
