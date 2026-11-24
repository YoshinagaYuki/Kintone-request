/** Authentication links belong to this application, independent of shared Auth Site URL. */
export type PasswordLinkType = 'invite' | 'recovery';
export function passwordSetupUrl(origin: string, token: string, type: PasswordLinkType): string {
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('安全なサイトURLが必要です');
  const url = new URL('/auth/set-password', base.origin);
  // Fragment never reaches hosting access logs or Referer headers.
  url.hash = new URLSearchParams({token_hash: token, type}).toString();
  return url.toString();
}
export function passwordLinkToken(hash: string): {token_hash: string; type: PasswordLinkType} | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token_hash = params.get('token_hash');
  const type = params.get('type');
  return token_hash && (type === 'invite' || type === 'recovery') ? {token_hash, type} : null;
}
export function passwordSetupMail(url: string, invitation: boolean) {
  return {
    subject: invitation ? '【レンタル管理】管理者の招待・パスワード登録' : '【レンタル管理】パスワード再設定',
    text: `レンタル管理システムの${invitation ? '管理者として招待されました' : 'パスワード再設定を受け付けました'}。\n\n以下のリンクから、ご本人がパスワードを設定してください。\n${url}\n\nリンクが無効な場合は、管理者に再送を依頼し、最新のメールをご利用ください。\nこのメールに心当たりがない場合は、リンクを開かず破棄してください。`,
    skipAlwaysCc: true as const,
  };
}
