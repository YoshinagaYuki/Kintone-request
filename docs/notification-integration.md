# 通知処理の共通化(Google Chat / LINE)

- 作成日: 2026-07-06
- 目的: **kintone直接登録**と**申請システム登録**のどちらからでも、同じ通知が Google Chat と LINE へ飛ぶようにする

---

## 1. 構成

### 変更前(分散していた)

```
kintone直接登録 → kintoneカスタマイズJS ─→ GAS ─→ LINE
                                        └─→ Google Chat(?)
申請システム登録 → Next.js ─→ Web Push のみ(Chat/LINEなし)
```

→ 登録経路によって通知先・内容がバラバラ。

### 変更後(共通通知サービスへ集約)

```
kintone直接登録 ──(POST /api/notify/registration)──┐
                                                    ├→ notifyRegistration()
申請システム登録 ──(承認→kintone登録の直後に直接呼出)┘        │
                                                              ├→ Google Chat(Incoming Webhook)
                                                              └→ LINE(既存GAS Webアプリ経由)
```

- 本文生成(`buildRegistrationMessage`)も送信も**1か所**(`lib/notify/registration.ts`)
- Chat と LINE は**同一本文**
- 二重通知は `notification_logs.dedup_key`(= `kintone:<appId>:<recordId>`)で防止

## 2. 通知本文(入力がある項目だけ表示)

```
【てずくーる 新規登録】
管理番号：696
レンタルプラン：てずくーる！！_週末
取次店名：株式会社ユニティ
担当者：山田太郎
イベントブース名：イオンモール幕張新都心

■コンテンツ
・シール：100
・くるくる万華鏡：50

■配送
日付：2026/07/18
郵便番号：261-8535
住所：千葉県千葉市美浜区豊砂1-1
受領者氏名：山田太郎
連絡先：090-1234-5678

■集荷
日付：2026/07/21
...
```

## 3. 環境変数(Webhook URLはコードに書かない)

| 変数 | 用途 | 未設定時 |
|---|---|---|
| `GOOGLE_CHAT_WEBHOOK_URL` | Google Chat Incoming Webhook | Chat通知をスキップ |
| `LINE_GAS_WEBHOOK_URL` | 既存GAS(LINEグループ通知)のWebアプリURL | LINE通知をスキップ |
| `LINE_GAS_TOKEN` | GAS側で照合する任意トークン | 送らない |
| `NOTIFY_API_TOKEN` | kintone JS → 通知API の共有トークン | APIは503を返す |

## 4. kintone カスタマイズJS からの呼び出し

レコード保存後イベント(`app.record.create.submit.success` など)に以下を追加してください。
**通知本文の組み立てはサーバー側で行う**ため、値を渡すだけです。

```js
// 通知APIのURL/トークンはkintoneのプラグイン設定や環境変数管理を利用し、
// 可能な限りソースへ直書きしないでください
const NOTIFY_URL = 'https://<vercel-app>/api/notify/registration';
const NOTIFY_TOKEN = '<NOTIFY_API_TOKEN と同じ値>';

kintone.events.on(['app.record.create.submit.success'], async (event) => {
  const r = event.record;
  const val = (code) => (r[code] && r[code].value) || '';

  const contents = [];
  const contentCodes = ['コンテンツ', 'コンテンツ_0', 'コンテンツ_1', 'コンテンツ_2', 'コンテンツ_3',
                        'コンテンツ_4', 'コンテンツ_5', 'コンテンツ_6', 'コンテンツ_7', 'コンテンツ_8'];
  const qtyCodes     = ['数値', '数値_0', '数値_1', '数値_2', '数値_3',
                        '数値_4', '数値_5', '数値_6', '数値_7', '数値_8'];
  contentCodes.forEach((c, i) => {
    if (val(c)) contents.push({ name: val(c), quantity: val(qtyCodes[i]) });
  });

  try {
    await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notify-token': NOTIFY_TOKEN },
      body: JSON.stringify({
        formTypeName: 'てずくーる',
        managementNo: val('管理番号'),
        rentalPlan: val('レンタル機材'),
        agencyName: val('文字列__1行__1'),
        staffName: val('文字列__1行__0'),
        boothName: val('イベント実施場所'),
        contents,
        delivery: {
          日付: val('納品_日付'), 郵便番号: val('郵便番号'), 住所: val('納品_住所'),
          受領者氏名: val('納品_担当者'), 連絡先: val('納品_電話番号'),
        },
        pickup: {
          日付: val('集荷_日付'), 郵便番号: val('郵便番号_0'), 住所: val('集荷_住所'),
          当日引渡者氏名: val('集荷_担当者'), 連絡先: val('集荷_電話番号'),
        },
        kintoneAppId: kintone.app.getId(),
        kintoneRecordId: r['レコード番号'].value,  // または event.recordId
      }),
    });
  } catch (e) {
    console.error('通知APIの呼び出しに失敗', e); // 通知失敗で保存は止めない
  }
  return event;
});
```

### 二重通知にならない理由

申請システムが登録 → kintone側の保存イベントでも上記POSTが走る、という順序でも、
どちらも `dedup_key = kintone:<appId>:<recordId>` を使うため**2回目はスキップ**されます
(レスポンスは `{ ok: true, skipped: true }`)。

## 5. LINE(既存GAS)の扱い

既存の GAS(LINEグループ通知)を**そのまま流用**する前提です。Next.js からは
`LINE_GAS_WEBHOOK_URL` へ JSON を POST するだけで、LINE APIの資格情報はGAS側に残ります。

GAS側の受け口は以下のような実装を想定しています(既存GASがこの形でない場合は、
`doPost` の先頭で `text`/`message` を読む処理を足すだけで流用できます)。

```js
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  // 必要ならトークン照合: if (body.token !== PropertiesService...) return ...;
  const text = body.text || body.message || '';
  pushToLineGroup(text);          // 既存のLINE送信処理をそのまま呼ぶ
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

GASのWebアプリは「アクセスできるユーザー: 全員」でデプロイし、URLは環境変数で管理してください
(URL自体が実質のシークレットになるため、`LINE_GAS_TOKEN` の併用を推奨)。

## 6. 通知失敗時の扱い

- 通知が失敗しても **kintone登録・配送管理連携は成功扱い**(処理は止めない)
- 結果は `notification_logs.channel_results` と `request_histories`(action: `notified` / `notify_failed`)に保存
- 管理画面の申請詳細に、登録完了パネル内で以下のように表示されます

```
管理番号        696
kintoneレコードID 160
配送管理連携     完了
Google Chat通知  失敗(HTTP 500)
LINE通知        成功
```
