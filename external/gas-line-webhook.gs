/**
 * Google Apps Script — LINEグループ通知の受け口(コピペで動作)
 * ============================================================
 * 役割: Next.js の共通通知サービスから受け取ったテキストを、
 *       既存のLINEグループへそのまま push する。
 *       LINEの資格情報(アクセストークン)はGAS側のみに保持し、Next.jsへ渡さない。
 *
 * 受信するJSON(Next.js が送る形):
 *   { "text": "【てずくーる 新規登録】\n管理番号：696\n...",
 *     "message": "(textと同じ内容。実装差異の保険)",
 *     "token": "(任意。LINE_GAS_TOKEN と同じ値)" }
 *
 * 【設置手順】
 *  1. script.google.com で新規プロジェクト(または既存のLINE通知GASを開く)
 *  2. このコードを貼り付け(既存GASに追記する場合は doPost が重複しないよう注意)
 *  3. 「プロジェクトの設定 > スクリプト プロパティ」に以下を追加
 *       LINE_CHANNEL_ACCESS_TOKEN : LINE Messaging API のチャネルアクセストークン
 *       LINE_TO                   : 送信先のグループID / ユーザーID
 *       SHARED_TOKEN              : 任意の共有トークン(Vercelの LINE_GAS_TOKEN と同じ値)
 *  4. 「デプロイ > 新しいデプロイ > 種類: ウェブアプリ」
 *       次のユーザーとして実行 : 自分
 *       アクセスできるユーザー : 全員
 *  5. 発行されたウェブアプリURLを Vercel の LINE_GAS_WEBHOOK_URL に設定
 *
 * 【既存GASを流用する場合】
 *  既にLINE送信関数(例: pushToLineGroup)がある場合は、下の doPost だけを追加し、
 *  sendLineMessage(text) の中身を既存関数の呼び出しに置き換えてください。
 */

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    // 共有トークン照合(スクリプトプロパティ SHARED_TOKEN が未設定なら照合しない)
    var shared = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
    if (shared && body.token !== shared) {
      return jsonResponse({ ok: false, error: 'unauthorized' });
    }

    // Next.js は text / message の両方のキーで同じ本文を送る
    var text = body.text || body.message || '';
    if (!text) {
      return jsonResponse({ ok: false, error: 'empty message' });
    }

    sendLineMessage(text);
    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

/**
 * LINEへ送信(Messaging API push)。
 * ※ 既存GASに送信関数がある場合は、この中身を既存関数の呼び出しに置き換えるだけでOK。
 *    例: function sendLineMessage(text) { pushToLineGroup(text); }
 */
function sendLineMessage(text) {
  var props = PropertiesService.getScriptProperties();
  var accessToken = props.getProperty('LINE_CHANNEL_ACCESS_TOKEN');
  var to = props.getProperty('LINE_TO');

  if (!accessToken || !to) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN / LINE_TO が未設定です');
  }

  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + accessToken },
    payload: JSON.stringify({
      to: to,
      messages: [{ type: 'text', text: text }],
    }),
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('LINE API error ' + code + ': ' + res.getContentText());
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** 動作確認用(GASエディタから実行してLINEに届くか確認) */
function testSendLine() {
  sendLineMessage('【テスト】共通通知サービスの疎通確認です');
}
