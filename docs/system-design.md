# allmight-request システム設計書

- 作成日: 2026-07-03
- ステータス: ドラフト(レビュー待ち)
- 前提: [requirements.md](./requirements.md)

---

## 1. アーキテクチャ概要

```
[Surely]                          [ユニティ担当者]
   │ 専用URL(ログインなし)            │ ログイン(Supabase Auth)
   ▼                                 ▼
┌─────────────────────────────────────────────┐
│        Next.js (App Router / Vercel想定)      │
│                                             │
│  申請フォーム        管理画面                  │
│  /apply/[slug]      /admin/*                │
│        │                │                   │
│  Route Handlers (API) ── Server Actions      │
└────────┬──────────────┬─────────────────────┘
         ▼              ▼ 承認時のみ(サーバーサイド)
   ┌──────────┐   ┌─────────────┐   ┌──────────────┐
   │ Supabase │   │ kintone      │──►│ LINE WORKS   │
   │ (受付DB) │   │ AppID:10     │   │ Bot 通知     │
   └──────────┘   └─────────────┘   └──────────────┘
```

- 申請データはまず Supabase に保存。kintone への書き込みは承認操作をトリガーにサーバーサイドでのみ実行
- kintone / LINE WORKS の認証情報はサーバー環境変数で保持し、クライアントには一切渡さない

## 2. 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Next.js (App Router) |
| 言語 | TypeScript |
| スタイル | Tailwind CSS |
| DB / 認証 | Supabase (PostgreSQL / Auth / RLS) |
| 業務データ連携 | kintone REST API |
| 通知 | LINE WORKS Bot API |

## 3. データベース設計(Supabase)

Supabase は一時保管ではなく、受付システムの正式なDBとして設計する。

### 3.1 form_types(案件種別マスタ)— 完全マスタ化

種別に関する情報は**すべて本テーブルで管理**する(コードに固定文言・固定選択肢・switch分岐を書かない)。
名称・表示順・FMTテンプレート・入力説明・注意事項・完了メッセージ・kintone AppID・
parser_config・field_mapping・公開フラグまで本テーブルが唯一の情報源(Single Source of Truth)。
表示文言・挙動はSQLのUPDATEだけで変更でき、**種別追加はレコードINSERTのみ(コード変更ゼロ)**。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | 種別ID(申請APIで選択種別の指定に使用。秘匿情報ではない) |
| slug | text UNIQUE | 専用URLスラッグ(推測困難な文字列。アクセスキーを兼ねる) |
| name | text | 種別名(例: オールマイト) |
| kintone_app_id | int | 登録先kintoneアプリ(オールマイト=10 / てずくーる=49) |
| field_mapping | jsonb | FMT項目 → kintoneフィールドコードの対応(空 = kintone登録未設定・承認不可) |
| parser_config | jsonb | FMTパース定義(必須項目・区切り等) |
| notify_config | jsonb | LINE WORKS通知先・文面テンプレート |
| fmt_template | text | 申請画面に表示するFMTテンプレート |
| input_guide | text | 入力説明(申請画面のテンプレート下等に表示) |
| notes | text | 注意事項(申請画面に表示) |
| complete_message | text | 申請完了画面のメッセージ(空なら既定文言) |
| display_order | int | 種別選択の表示順 |
| is_active | boolean | 公開フラグ(true のみ申請画面の選択肢に自動表示・受付可) |
| version | int | 定義バージョン(初期値1)。fmt_template / parser_config / field_mapping のいずれかを変更すると +1 |
| created_at / updated_at | timestamptz | |

種別追加(親子スマイル便・よべるん.M・その他)はレコード追加のみで対応:

```sql
-- 例: 種別追加はこのINSERTだけ。コード変更・デプロイ不要
insert into public.form_types
  (slug, name, kintone_app_id, parser_config, field_mapping,
   fmt_template, input_guide, notes, complete_message, display_order, is_active)
values
  ('<推測困難なslug>', '親子スマイル便', <AppID>, '{...}', '{"mappings":[],"constants":[]}',
   '<FMTテンプレート>', '<入力説明>', '<注意事項>', '<完了メッセージ>', 2, true);
```

- field_mapping が空の間は「kintone登録は未設定」(受付のみ可・承認不可)として安全に公開できる
- is_active=false にすれば選択肢から即時非表示(受付停止)

### 3.1b form_type_versions(種別定義のバージョン履歴)

FMT変更後も**過去申請を壊さない**ためのバージョン管理。運用者は form_types を普通に
UPDATE するだけでよく、バージョン管理はDBトリガーが自動で行う(SQLのみで完結)。

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| form_type_id | uuid FK → form_types | |
| version | int | バージョン番号(form_type_id + version で UNIQUE) |
| fmt_template | text | 当該バージョンのFMTテンプレート |
| parser_config | jsonb | 当該バージョンのパース定義 |
| field_mapping | jsonb | 当該バージョンのマッピング |
| created_at | timestamptz | |

トリガー仕様:

- form_types へ INSERT 時: version=1 の履歴行を自動作成
- form_types の fmt_template / parser_config / field_mapping のいずれかが変わる UPDATE 時:
  version を自動で +1 し、新しい内容を履歴行として自動作成
  (名称・表示順・文言のみの変更では version は上がらない)
- 履歴行は不変(UPDATE/DELETE しない)

### 3.2 requests(申請)

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | 内部ID(管理用のみ。Surely側には表示しない) |
| form_type_id | uuid FK → form_types | |
| form_type_version | int | 申請時点の種別定義バージョン(申請APIが form_types.version を保存) |
| raw_text | text | 貼り付けられたFMT原文 |
| parsed_data | jsonb | パース結果 |
| status | text | 下記ステータス参照 |
| reject_reason | text | 差戻し理由 |
| kintone_record_id | text | 登録後のkintoneレコードID |
| approved_by | uuid FK → auth.users | 承認者 |
| approved_at | timestamptz | |
| created_at / updated_at | timestamptz | |

### 3.3 request_histories(操作履歴)

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | |
| request_id | uuid FK → requests | |
| action | text | submitted / approved / rejected / kintone_registered / kintone_failed / notified / notify_failed |
| actor | text | 'surely' または 担当者のuser_id |
| detail | jsonb | 差戻し理由、エラー内容等 |
| created_at | timestamptz | |

### 3.4 ステータス遷移

```
(申請) → pending
                          │
        ┌─────────────────┤
        ▼                 ▼
    rejected           approved ──► registered(kintone登録成功)
    (差戻し・理由必須)      │
                          └──► register_failed(登録失敗) ──再実行──► registered
```

| status | 意味 |
|---|---|
| pending | 確認待ち |
| approved | 承認済み(kintone登録処理中) |
| registered | kintone登録完了 |
| register_failed | kintone登録失敗(再実行可) |
| rejected | 差戻し |

### 3.5 RLS 方針

- 匿名(anon)からの SELECT / UPDATE / DELETE は全テーブル禁止
- 申請(INSERT)は Route Handler 経由で service_role のみが実行(anonからの直接INSERTも禁止)
- 認証済みユーザー(ユニティ担当者)は requests / request_histories / form_types を参照・更新可

## 4. 画面設計

### 4.1 申請側(ログインなし)— 2026-07-05改訂: 単一URL化

**申請URLは /apply の1つのみ。** 秘匿slugによるURL運用は廃止した(form_types.slug カラムは残置・未使用)。

| パス | 画面 | 内容 |
|---|---|---|
| /apply | 申請フォーム | 種別ラジオ選択(初期選択なし・必須)、選択種別ごとに fmt_template / input_guide / notes を表示、FMT貼り付け、形式チェック、申請ボタン |
| /apply/complete?type=[form_type_id] | 申請完了 | 選択種別の complete_message を表示(空なら既定文言。受付番号・IDは表示しない) |
| /apply/[slug](旧URL) | リダイレクト | /apply へ redirect(既存の配布済みURL対策) |

動作仕様:

- **種別ラジオはコードに固定しない**: is_active=true の form_types を display_order 順に取得して自動描画する。
  種別追加(親子スマイル便・よべるん.M 等)はレコードINSERTのみでコード変更不要
- 切替時は名称・テンプレート・入力説明・注意事項・完了メッセージ・パース定義・
  登録先kintoneアプリがすべて選択種別のものに切り替わる(form_types 駆動)
- 種別の選択・送信には form_types.id を使用
- `robots: noindex` を設定。アクセス保護は秘匿URLではなく、レート制限+FMT形式チェック+
  承認フロー(ユニティ確認)で担保する

実装差分(この改訂で発生する変更。未実施):

1. 共通受付ページ `/apply`(前回実装)を**削除**し、種別選択UIを `/apply/[slug]` へ移設
2. migration 0004 を改訂: `input_guide` / `notes` / `complete_message` / `version` カラム、
   `form_type_versions` テーブル、バージョン自動採番トリガーを追加
   (0004未適用ならファイル修正、適用済みなら0005として差分適用)
3. `POST /api/requests` のペイロードを `{ slug, form_type_id, raw_text }` に変更し、
   `requests.form_type_version` に申請時点の version を保存
4. 完了画面を `?type=[form_type_id]` 対応にし complete_message を表示
5. 承認処理・登録予定データ表示を「申請時点のバージョン基準」に変更(下記)

### バージョン基準の処理ルール

- **パース(申請時)**: 現行 version の parser_config を使用し、その version を requests に保存
- **kintone登録予定データ表示・承認・再実行**: `requests.form_type_version` に対応する
  `form_type_versions.field_mapping` を使用する(現行の form_types ではなく申請時点の定義)。
  これにより FMT・マッピングを Version 2, 3... と変更しても、過去申請の再現・承認が壊れない
- **再パースが必要な場合**(運用ツール等): 同様に申請時点の parser_config を使用
- 例: オールマイト Version1 の申請が pending のまま Version2 に改訂されても、
  その申請は Version1 の field_mapping で登録される

### 4.2 管理側(Supabase Auth 必須)

| パス | 画面 | 内容 |
|---|---|---|
| /admin/login | ログイン | Supabase Auth(メール+パスワード) |
| /admin/requests | 申請一覧 | ステータス・日付フィルタ、一覧表示 |
| /admin/requests/[id] | 申請詳細 | FMT原文・パース結果・履歴の表示、承認/差戻し/再実行ボタン |

## 5. API 設計(Route Handlers)

| メソッド/パス | 認証 | 処理 |
|---|---|---|
| POST /api/requests | なし(レート制限あり) | ペイロード `{ form_type_id, raw_text }`。form_type_id=選択種別(is_activeを検証)。選択種別の parser_config(現行version)でFMT検証 → パース → requests へ pending で INSERT(form_type_id と **form_type_version=現行version** を保存) → 履歴記録 → Push通知 → 成功可否のみ返却(IDは返さない) |
| POST /api/admin/requests/[id]/approve | 必須 | status→approved → kintone登録 → 成功: registered+レコードID保存+LINE WORKS通知 / 失敗: register_failed |
| POST /api/admin/requests/[id]/reject | 必須 | 理由必須。status→rejected、履歴記録 |
| POST /api/admin/requests/[id]/retry | 必須 | register_failed の kintone 登録を再実行 |

一覧・詳細の取得は Server Component から Supabase を直接参照(API化しない)。

### 5.1 承認処理のシーケンス

```
担当者: 承認ボタン
  → status = approved(履歴: approved)
  → kintone REST API: POST /k/v1/record.json (app=form_types.kintone_app_id)
     ├ 成功 → kintone_record_id 保存, status = registered(履歴: kintone_registered)
     │        → LINE WORKS通知(失敗しても status は registered のまま、履歴: notify_failed)
     └ 失敗 → status = register_failed(履歴: kintone_failed, エラー内容を detail に記録)
```

## 6. 外部連携設計

### 6.1 kintone

- 認証: APIトークン(オールマイトアプリで発行、フォーム参照+レコード追加権限)
- フィールド一覧取得: `GET https://{KINTONE_DOMAIN}/k/v1/app/form/fields.json`(scripts/fetch-kintone-fields.ts → docs/kintone-fields-allmight.md)
- レコード登録: `POST https://{KINTONE_DOMAIN}/k/v1/record.json`
- **管理番号・配送管理連携は本システムの対象外**(確定・2026-07-03):
  既存kintone JSの保存イベントが担当。REST API登録では発火しないため、
  登録後にユニティ側がkintone上で内容確認→編集保存して発火させる運用。
  本システムは管理番号を生成せず、配送管理アプリにも直接登録しない
  (管理画面の登録完了表示に注意文を表示)
- フィールドマッピングは form_types.field_mapping(jsonb)で定義し、コードにハードコードしない
- ※ フィールドコード一覧は実装前に確定(requirements.md 未確定事項)

### 6.2 LINE WORKS

- Bot API(Service Account + JWT)でトークルームへメッセージ送信
- 通知文面テンプレートは form_types.notify_config で管理
- 通知失敗は履歴に記録するのみで業務フローは止めない

## 7. 環境変数(.env.local.example の内容)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # サーバーのみ

# kintone
KINTONE_DOMAIN=                   # 例: xxxx.cybozu.com(https:// なし)
KINTONE_APP_ID=10                 # オールマイトアプリ
KINTONE_API_TOKEN=                # APIトークン(フォーム参照/レコード追加)

# LINE WORKS
LINEWORKS_BOT_ID=
LINEWORKS_CLIENT_ID=
LINEWORKS_CLIENT_SECRET=
LINEWORKS_SERVICE_ACCOUNT=
LINEWORKS_PRIVATE_KEY=
LINEWORKS_CHANNEL_ID=             # 通知先トークルーム
```

## 8. セキュリティ設計

- 申請URL: 推測困難な slug + noindex。URL漏洩時は slug の差し替えで無効化できる
- 申請API: レート制限(IPベース)+ ペイロードサイズ上限 + FMT形式チェック
- 管理画面: middleware で /admin/* を認証必須に。未ログインは /admin/login へリダイレクト
- 秘密情報: service_role キー・kintoneトークン・LINE WORKS鍵はサーバーサイド専用

## 9. 将来拡張(てずくーる追加時)

1. form_types にレコード追加(slug / kintone_app_id / field_mapping / parser_config / notify_config)
2. kintone APIトークンの環境変数を追加(種別→トークンの解決マップを lib/kintone に用意)
3. 画面・API・DBスキーマの変更は不要
