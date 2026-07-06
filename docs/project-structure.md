# allmight-request フォルダ構成書

- 作成日: 2026-07-03
- ステータス: ドラフト(レビュー待ち)
- 前提: [system-design.md](./system-design.md)

---

## 1. 全体構成

```
allmight-request/
├── .env.local.example          # 環境変数テンプレート(system-design.md §7)
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── middleware.ts               # /admin/* の認証ガード
│
├── docs/
│   ├── requirements.md         # 要件定義書
│   ├── system-design.md        # システム設計書
│   └── project-structure.md    # 本書
│
├── supabase/
│   └── migrations/             # form_types / requests / request_histories / RLS
│
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   │
│   ├── (public)/               # 申請側(ログインなし)
│   │   └── apply/
│   │       └── [slug]/
│   │           ├── page.tsx            # 申請フォーム(FMT貼り付け)
│   │           └── complete/
│   │               └── page.tsx        # 申請完了(完了メッセージのみ)
│   │
│   ├── (admin)/                # 管理側(要ログイン)
│   │   └── admin/
│   │       ├── login/
│   │       │   └── page.tsx            # ログイン
│   │       └── requests/
│   │           ├── page.tsx            # 申請一覧(フィルタ)
│   │           └── [id]/
│   │               └── page.tsx        # 申請詳細(承認/差戻し/再実行)
│   │
│   └── api/
│       ├── requests/
│       │   └── route.ts                # POST: 申請受付
│       └── admin/
│           └── requests/
│               └── [id]/
│                   ├── approve/route.ts # POST: 承認→kintone登録→通知
│                   ├── reject/route.ts  # POST: 差戻し
│                   └── retry/route.ts   # POST: kintone登録の再実行
│
├── components/
│   ├── apply/                  # 申請フォーム系UI
│   └── admin/                  # 一覧テーブル・詳細・承認/差戻しダイアログ等
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # ブラウザ用クライアント
│   │   ├── server.ts           # Server Component / Route Handler 用
│   │   └── admin.ts            # service_role クライアント(サーバー専用)
│   ├── kintone/
│   │   └── client.ts           # レコード登録(AppID・トークン解決含む)
│   ├── lineworks/
│   │   └── client.ts           # Bot通知(JWT認証)
│   └── parser/
│       └── fmt-parser.ts       # FMTパース・形式チェック(parser_config駆動)
│
└── types/
    ├── database.ts             # Supabaseスキーマ型(生成)
    └── request.ts              # ステータス・パース結果などのドメイン型
```

## 2. 設計方針

- **Route Group で公開/管理を分離**: `(public)` はログインなし、`(admin)` は middleware で認証必須。レイアウト・スタイルも分離できる
- **外部連携は lib/ に集約**: kintone / LINE WORKS / パーサーを画面から分離し、単体テスト可能にする
- **種別依存の設定はDBへ**: FMTパース定義・フィールドマッピング・通知設定は form_types テーブルに持たせ、コードは種別非依存にする(てずくーる追加時にコード変更不要)
- **service_role の隔離**: `lib/supabase/admin.ts` は Route Handler / Server Action からのみ import する

## 3. 実装順序(実装フェーズの目安)

1. プロジェクト初期化(create-next-app + Tailwind)+ .env.local.example
2. Supabase マイグレーション(テーブル・RLS)+ 型生成
3. 申請フォーム + POST /api/requests + FMTパーサー
4. 管理画面(ログイン・一覧・詳細)
5. 承認フロー(kintone登録 → LINE WORKS通知)+ 差戻し・再実行
6. レート制限・noindex 等の仕上げ
