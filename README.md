# allmight-request

社外パートナー(Surely)向け案件申請受付システム。
申請は Supabase に「確認待ち」で保存し、ユニティ側の承認後に kintone(オールマイトアプリ AppID:10)へ登録する。

- 設計書: [docs/requirements.md](./docs/requirements.md) / [docs/system-design.md](./docs/system-design.md) / [docs/project-structure.md](./docs/project-structure.md)

## 技術構成

Next.js (App Router) / TypeScript / Tailwind CSS / Supabase / kintone REST API

## セットアップ

```bash
npm install
cp .env.local.example .env.local   # 値を設定
```

### Supabase

1. Supabase プロジェクトを作成
2. `supabase/migrations/` のSQLを順番に実行(SQL Editor または supabase CLI)
   - `0002_seed_allmight.sql` の slug は必ず独自の推測困難な値に変更すること
3. 管理者ユーザーを Authentication > Users で作成(メール+パスワード)
4. `.env.local` に URL / anon key / service_role key を設定

### 起動

```bash
npm run dev
```

- 申請画面: `http://localhost:3000/apply`(単一URL。種別をラジオで選択)
- 旧URL `/apply/<slug>` は `/apply` へリダイレクト
- 管理画面: `http://localhost:3000/admin/requests`(要ログイン)

### 申請種別(form_types 完全マスタ駆動)

名称・表示順・FMTテンプレート・入力説明・注意事項・完了メッセージ・kintone AppID・
parser_config・field_mapping・公開フラグ(is_active)はすべて `form_types` で管理する
(コードに固定文言・switch分岐なし)。種別ラジオは is_active=true を display_order 順に自動描画
するため、**新種別(親子スマイル便・よべるん.M 等)はレコードINSERTのみで受付開始**できる。
選択・送信は form_types.id を使用(slugカラムは残っているが秘匿URL運用は廃止・未使用)。

| 種別 | kintone App | 状態 |
|---|---|---|
| オールマイト | 10 | 承認→kintone登録→採番→配送管理連携まで有効 |
| てずくーる | 49 | pending保存まで(マッピング未確定のためkintone登録は無効化。docs/kintone-mapping-tezukuru.md 参照) |

field_mapping の mappings が空の種別は、承認画面に「kintone登録は未設定」と表示され、
承認・再実行APIも 409 を返す(マッピング設定で自動的に有効化)。

### 担当者マスター

申請画面の「担当者」プルダウン(両種別共通・必須)は `staff_members` テーブル駆動。
表示は「氏名（所属会社）」、選択値は「担当者:氏名」のFMT行として自動注入され、
kintoneの担当者フィールド(`文字列__1行__0`)へ登録される。
管理は `/admin/requests` 右上の「担当者マスター」(/admin/staff)から追加・編集・公開切替・削除。
セットアップ: migration `0006_staff_members.sql` の適用 +
両種別の反映SQL再実行(field_mapping / required_labels に「担当者」追加済み)。

### 定義バージョン管理

fmt_template / parser_config / field_mapping / notify_config を UPDATE すると
**version が自動で +1** され、その時点の定義が `form_type_versions` に保存される(DBトリガー)。
申請は `requests.form_type_version` に申請時点の version を保持し、
**承認・登録予定データ表示は申請時点の定義**で処理される(FMT改訂で過去申請が壊れない)。

## 実装状況(Phase 1)

| # | 項目 | 状態 |
|---|---|---|
| 1 | Supabase migrations | 済 |
| 2 | FMT貼り付け申請画面 | 済 |
| 3 | 申請をSupabaseへ保存 | 済 |
| 4 | 管理画面(一覧・詳細) | 済 |
| 5 | kintoneフィールド一覧取得 | 済(スクリプト) |
| 6 | kintone登録マッピング設計 | 済(docs/kintone-mapping-design.md 確定) |
| 7 | テスト登録 | 済(スクリプト・要ローカル実行) |
| 8 | 承認後にkintone登録 | 済(承認/再実行ボタン+API) |
| - | LINE WORKS通知 | 後回し(スタブのみ) |

## kintoneフィールド一覧の取得

```bash
# オールマイト(App10。KINTONE_DOMAIN / KINTONE_APP_ID / KINTONE_API_TOKEN を設定して)
npm run fetch:kintone-fields

# てずくーる(App49)
npm run fetch:kintone-fields -- --app 49 --token-env KINTONE_API_TOKEN_APP49 --out docs/kintone-fields-tezukuru.md
```

- 結果は `docs/kintone-fields-allmight.md` に保存される(フィールド名・コード・型・必須・選択肢)
- 取得のみでレコード登録は行わない。APIトークンはログ出力されない
- APIトークンには「アプリ管理(フォーム参照)」権限が必要

## form_types へのマッピング反映(手順6の確定内容)

1. `docs/kintone-mapping-design.md` §5 のSQLをコピー
2. 末尾の `where slug = '<オールマイトのslug>'` を実際の slug に置き換える
   (現在の slug は Supabase の Table Editor > form_types で確認できる)
3. Supabase の SQL Editor で実行
4. 反映確認: `select slug, jsonb_array_length(field_mapping->'mappings') from form_types;` が 21 になればOK

## kintoneテスト登録(手順7)

```bash
npm run test:kintone-register                # dry-run: レコードを組み立てて表示のみ
npm run test:kintone-register -- --execute   # 実際にkintoneへ1件テスト登録
npm run test:kintone-register -- --fmt sample.txt --execute   # 実FMTサンプルで登録
```

- form_types の field_mapping / parser_config を読み込んで変換するため、上記の反映が先に必要
- `--execute` 成功時はレコードIDが表示される。kintone上で内容確認後、テストレコードは削除してよい
- 本番の承認フロー(手順8)にはまだ接続していない。APIトークンはログ出力されない

## 申請受付通知(Web Push / PWA)

申請フォーム送信直後、通知を許可した管理者の端末へプッシュ通知を送る
(`lib/notify/` 共通通知モジュール。追加アプリ不要・無料・通知数制限なし)。

- タイトル「新しい申請が届きました」+ 申請種別 / 取次店名 / イベントブース名 / 配送日。
  タップで `/admin/requests/{id}` を開く
- 初回のみ管理画面(申請一覧)に「通知を受け取りますか?」バナーを表示。
  許可したユーザーの端末だけが通知対象(購読は `push_subscriptions` にUPSERT保存)
- 通知失敗・未設定でも申請保存は成功のまま(ログのみ)。失効購読(404/410)は自動削除
- チャネルは `Notifier` インターフェースで抽象化(`lib/notify/push.ts`)。
  メール・LINE WORKS等の追加は `lib/notify/notify.ts` の notifiers 配列に登録するだけ

### セットアップ

1. migration `0005_push_subscriptions.sql` を適用
2. VAPID鍵を生成して `.env.local` / Vercel環境変数に設定

   ```bash
   npx web-push generate-vapid-keys
   # → NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT を設定
   ```

3. `APP_BASE_URL` に本番URLを設定(通知タップ時の遷移先の生成に使用)

### 通知が届かないときの確認

1. **テスト送信**: 管理画面(申請一覧)の「テスト通知を送る」ボタンで、申請通知と同じ経路で送信し、
   購読件数・成功・失敗件数が画面に表示される
2. **サーバーログ**: 申請送信時・テスト送信時に以下が出力される
   - `[push] 通知送信を開始します` / `[push] 購読件数: N件` / `[push] 送信結果: 成功 N件 / 失敗 N件`
   - VAPID未設定の場合は `[push] VAPID鍵が未設定のため送信をスキップしました`
3. **購読レコードの確認**(Supabase SQL Editor):

   ```sql
   select id, user_id, left(endpoint, 60) as endpoint, created_at
   from public.push_subscriptions
   order by created_at desc;
   ```

   0件なら端末側の許可が未完了(バナーの「通知を受け取る」を押す)。
4. `.env.local` 変更後は `npm run dev` の再起動が必要

### 対応環境の注意

- HTTPS必須(localhostは例外的に可)。Vercel本番はそのまま動作
- **iPhone Safari**: iOS 16.4以降で、**「ホーム画面に追加」したPWAから開いた場合のみ**通知が使える
  (Safariタブ内では通知許可バナー自体が表示されない)。manifest / apple-touch-icon は設定済み
- Android Chrome / PC Chrome: ブラウザのままで動作

## 承認フロー(手順8)

申請詳細画面(`/admin/requests/[id]`)に「kintone登録予定データ」が表示され、
「承認してkintoneへ登録」ボタンで登録される(CLIと同じ `registerRecord()` を使用)。

- 成功: `kintone_record_id` 保存 / status=registered / 履歴 approved + kintone_registered
- 失敗: status=register_failed / 履歴 kintone_failed(エラー内容つき) / 画面の「再実行」ボタンで retry API を呼べる
- LINE WORKS通知は no-op スタブのまま(実装時も失敗でフローは止めない)

### 管理番号採番・配送管理連携(自動実行)

承認時に App10 登録に続けて、以下を自動実行する(設計: `docs/kintone-numbering-design.md`):

1. 採番マスタ(App50、キー=shipping)の「現在番号」を +1 して管理番号を採番(revision競合はリトライ)
2. App10 の管理番号フィールドを更新
3. 配送管理(App11)へ同じ管理番号で新規作成/更新(`lib/kintone/shipping-mapping.ts` の対応表で転記)

- 各ステップは冪等で、失敗時は register_failed → 画面の「再実行」で途中から再開
- 既存のkintone画面JSはそのまま(管理番号が既にあると採番しないため競合しない)
- **セットアップ**: migration `0003_numbering.sql` の適用、App50/App11 のAPIトークン追加(.env.local.example 参照)、
  App10トークンへの閲覧・編集権限の追加が必要
- 転記対応表(既存JSの FIELDS_MAP 準拠・24項目)と機器コード付与ルール(applyDropdownCodeRule 相当)は
  `lib/kintone/shipping-mapping.ts` に設定済み。App50のフィールドコードは `キー` / `現在番号`(既存JSと同一)

## 注意

- FMTパーサー(`lib/parser/fmt-parser.ts`)は「ラベル: 値」の行形式を仮実装。FMT確定後に `form_types.parser_config` と合わせて調整する
- 申請APIのレート制限はインメモリ実装(サーバーレス環境では要置き換え)
- `/api/admin/*` は middleware ではなく各Route Handler内で認証チェックしている
- 差戻し(reject)ボタンは未実装(TODO)
