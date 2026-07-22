# 共通通知システム — 外部設置ファイル

このフォルダの2ファイルと Next.js アプリ本体の**3点セット**で、新しい環境でも同じ通知システムを再構築できます。

| # | 構成要素 | 実体 | 役割 |
|---|---|---|---|
| ① | Next.js | 本リポジトリ | **共通通知サービス**(本文生成・Chat送信・LINE中継・二重通知防止) |
| ② | kintoneカスタマイズJS | `external/kintone-app49-customize.js` | **採番・配送管理・通知を1本に統合**。通知は「アプリID+レコードID」を送るだけ |
| ③ | Google Apps Script | `external/gas-line-webhook.gs` | 受け取った本文をLINEグループへpush(LINE資格情報の保管場所) |

## 全体フロー

```
kintone直接登録 ─→ ② kintone JS ─(appId/recordId)─┐
                                                    ├→ ① notifyRegistration()
申請システム登録 ─→ ① 承認→kintone登録 ────────────┘   │ (kintoneレコードを取得して本文生成)
                                                        ├→ Google Chat(Webhook直送)
                                                        └→ ③ GAS ─→ LINEグループ
```

**通知本文が100%一致する理由**: どちらの経路でも、通知本文は
`lib/notify/kintone-record.ts` → `buildRegistrationMessage()`(`lib/notify/registration.ts`)が
**同じkintoneレコードを同じコードで読んで**生成します。
② kintone JS は appId / recordId のみ送信し、本文組み立ては一切行いません。
通知APIも本文にあたる値を受け取りません(IDのみ)。

### kintone JS(App49)の構成

`kintone-app49-customize.js` 1本で 採番 → 配送管理 → 通知 を順に実行します。

**通知条件(登録処理の成功と通知の成功を分離)**

| 事象 | 通知 | 登録処理の扱い |
|---|---|---|
| 保存・採番・配送管理がすべて成功 | Chat / LINE へ送信 | 成功 |
| 採番が失敗 | **送信しない** | 失敗(要再実行) |
| 配送管理が失敗 | **送信しない** | 失敗(要再実行) |
| 通知開始後に Chat / LINE が失敗 | 失敗を記録 | **成功のまま**(画面に通知結果のみ表示) |

サーバー側にも安全網があり、管理番号が未採番のレコードで通知APIを叩いた場合は 409 を返して送信しません。

## セットアップ順

1. **Supabase**: `supabase/migrations/0010_notification_logs.sql` を実行(二重通知防止テーブル)
2. **GAS**(③): `gas-line-webhook.gs` を設置 → ウェブアプリとしてデプロイ → URLを控える
3. **Vercel環境変数**:
   | 変数 | 値 |
   |---|---|
   | `GOOGLE_CHAT_WEBHOOK_URL` | Google Chat の Incoming Webhook URL |
   | `LINE_GAS_WEBHOOK_URL` | ③ のウェブアプリURL |
   | `LINE_GAS_TOKEN` | ③ の `SHARED_TOKEN` と同じ値(任意) |
   | `NOTIFY_API_TOKEN` | ② と共有する任意のトークン(推測困難な文字列) |
   | `KINTONE_DOMAIN` / `KINTONE_API_TOKEN_APP49` 等 | 既存のまま(通知APIがレコード取得に使用) |
4. **kintone**(②): `kintone-app49-customize.js` の `CONFIG` を編集し、
   既存の採番・配送管理コードを (2)(3) セクションへ移設 → 「JavaScript / CSSでカスタマイズ」へ
   **この1本だけ**をアップロード(旧ファイルは外す) → アプリを更新
5. **再デプロイ**

## 動作確認

| パターン | 手順 | 期待結果 |
|---|---|---|
| A. 申請システム登録 | 申請 → 管理画面で承認 | Chat・LINEに通知 / 詳細画面に「Google Chat通知：成功 / LINE通知：成功」 |
| B. kintone直接登録 | kintoneでレコードを新規保存 | Aと**同じ本文**がChat・LINEに届く |
| C. 二重通知防止 | Aの直後にkintone側でも保存イベントが走る | 2回目は送信されない(ブラウザConsoleに「送信済みのためスキップ」) |
| D. 通知失敗 | Webhook URLを誤った値にして登録 | kintone登録・配送管理は成功のまま、画面に「Google Chat通知：失敗」 |

疎通だけ確認したい場合:

```bash
curl -X POST https://<vercel-domain>/api/notify/registration \
  -H "Content-Type: application/json" \
  -H "x-notify-token: <NOTIFY_API_TOKEN>" \
  -d '{"appId":49,"recordId":"160"}'
```

## 通知本文の変更方法

`lib/notify/registration.ts` の `buildRegistrationMessage()` **1か所**を直すだけで、
両経路の通知が同時に変わります(② ③ の修正は不要)。

フィールドコードの追加・変更は `lib/notify/kintone-record.ts` の `APP_FIELD_MAPS` を編集してください。
