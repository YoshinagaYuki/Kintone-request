import {test} from 'node:test';
import assert from 'node:assert/strict';
import {passwordSetupUrl, passwordLinkToken, passwordSetupMail} from '../lib/auth/password-links';

test('invite and recovery open the requesting rental origin, with secrets only in fragment', () => {
  for (const type of ['invite','recovery'] as const) {
    const url = new URL(passwordSetupUrl('https://kintone-request.vercel.app/ignored', 'test+&secret', type));
    assert.equal(url.origin,'https://kintone-request.vercel.app');
    assert.equal(url.pathname,'/auth/set-password');
    assert.equal(url.search,'');
    assert.deepEqual(passwordLinkToken(url.hash),{token_hash:'test+&secret',type});
  }
});
test('ordinary sessions, invalid and missing setup tokens are rejected', () => {
  for (const hash of ['', '#access_token=unrelated', '#type=signup&token_hash=x', '#type=invite', '#type=recovery&token_hash=']) assert.equal(passwordLinkToken(hash),null);
  assert.throws(()=>passwordSetupUrl('javascript:alert(1)','x','invite'));
  assert.throws(()=>passwordSetupUrl('http://outside.example','x','invite'));
});
test('invitation and recovery emails are Japanese rental mail with no automatic CC', () => {
  for (const invite of [true,false]) {
    const url=passwordSetupUrl('https://kintone-request.vercel.app','fixture-token',invite?'invite':'recovery');
    const mail=passwordSetupMail(url,invite);
    assert.ok(mail.subject.includes('レンタル管理'));
    assert.ok(mail.text.includes(url));
    assert.equal(mail.skipAlwaysCc,true);
    assert.ok(!mail.text.includes('supabase.co/auth/v1/verify'));
  }
});
