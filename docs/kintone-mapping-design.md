# kintone 登録マッピング設計(手順6)

- 対象: オールマイト(kintone AppID: 10)
- ステータス: **確定(2026-07-03 全確認事項の回答反映済み)** / SQL反映は README「form_types への反映」参照
- 前提資料: `docs/kintone-fields-allmight.md`(rev.243)

---

## 1. 仕組み

FMTパース結果(`requests.parsed_data`)→ kintoneレコードへの変換は
`form_types.field_mapping`(jsonb)の定義に基づき `lib/kintone/mapper.ts` の
`buildKintoneRecord()` が行う。コードは種別非依存(てずくーる追加時もJSON追加のみ)。

```
requests.parsed_data ──┐
                       ├──► buildKintoneRecord() ──► kintoneレコード(手順7-8で登録)
form_types.field_mapping ─┘        │
                                   └─ 変換エラー時は登録せずエラー一覧を返す
```

## 2. field_mapping の形式

```json
{
  "mappings": [
    { "fmt_label": "取次店名", "kintone_code": "文字列__1行__1", "kintone_type": "SINGLE_LINE_TEXT", "required": true }
  ],
  "constants": [
    { "kintone_code": "手配種別", "value": "通常配送" }
  ]
}
```

- `mappings`: FMTラベル → kintoneフィールドコードの対応。`required: true` は値が空だと登録エラー
- `constants`: FMTに存在しない固定値
- 同じFMTラベルを複数のkintoneフィールドへ書くことも可(例: 配送日付 → 納品_日付 と 日付_0)

## 3. 型ごとの変換ルール(mapper.ts 実装済み)

| kintone型 | 変換ルール |
|---|---|
| SINGLE_LINE_TEXT / MULTI_LINE_TEXT / RICH_TEXT / LINK | そのまま |
| NUMBER | 全角数字→半角、カンマ・単位(円/個/件)除去。変換不能はエラー |
| DATE | `YYYY-MM-DD` へ正規化。年あり: `2026/7/1` `2026-07-01` `2026.7.1` `2026年7月1日` `20260701` `令和8年7月1日`。年なし: `7/1` `07-01` `7.1` `7月1日` → 現在年(JST)を補完。実在しない日付(2/30等)・変換不能はエラー |
| DROP_DOWN / RADIO_BUTTON | そのまま(選択肢に無い値はkintone側エラー。選択肢と要照合) |
| CHECK_BOX / MULTI_SELECT | 「、」「,」「/」区切りで配列化 |
| transform指定 | 型変換より優先の特殊変換。`billing_month_next`: 「7月分」「07月」「2026年7月分」→「7月分8月請求」(12月分→12月分1月請求・年繰り上げなし。解釈不能はエラー) |
| TIME | そのまま(全角コロン正規化は未実装・TODO) |

- 任意項目が空の場合はフィールド自体を送信しない(kintone側の初期値に任せる)

## 4. マッピング対応表(確定・実FMTラベル)

### 4.1 対応表(2026-07-05 最新版)

| # | FMTラベル | kintoneフィールドコード | kintoneフィールド名 | 型 | FMT必須 | 備考 |
|---|---|---|---|---|---|---|
| 1 | 機器商品① | `レンタル機材` | レンタル機器① | DROP_DOWN | ○ | 選択肢と完全一致必須 |
| 1' | 機器商品② | `レンタル機材_0` | レンタル機器② | DROP_DOWN | | |
| 1'' | 機器商品③ | `レンタル機材_1` | レンタル機器③ | DROP_DOWN | | |
| 1''' | 機器商品④ | `レンタル機材_3` | レンタル機器④ | DROP_DOWN | | ★コード逆転注意(_3が④) |
| 1'''' | 機器商品⑤ | `レンタル機材_2` | レンタル機器⑤ | DROP_DOWN | | ★コード逆転注意(_2が⑤) |
| - | 合計金額 | (登録しない) | - | - | | **FMT表示のみ**。field_mapping・required_labels に入れない。`計算`(CALC)へ直接登録しない |
| 2 | 内）配送料 | `配送費` | 別途配送費 | NUMBER | | `配送費` へ数値登録(合計(税抜)=機器代+配送費−調整額 に反映)。「3,300円」→3300 |
| 3 | イベントブース名 | `イベント実施場所` | イベント実施場所 | SINGLE_LINE_TEXT | | |
| 4 | 取次店名 | `文字列__1行__1` | 貸出先法人 | SINGLE_LINE_TEXT | ○ | |
| 5 | ◯月分として請求 | `文字列__1行_` | ◯月分◯月請求 | SINGLE_LINE_TEXT | ○ | transform: billing_month_next(「7月分」→「7月分8月請求」) |
| 6 | 利用開始日 | `日付_0` | 利用開始日 | DATE | ○ | 機器代はkintone側JSが日付_0/日付_1の差分で算出 |
| 7 | 利用最終日 | `日付_1` | 利用最終日 | DATE | ○ | 同上 |
| 8 | 配送日付 | `納品_日付` | 納品:日付 | DATE | ○ | |
| 9 | 配送郵便番号 | `郵便番号` | 納品:郵便番号 | SINGLE_LINE_TEXT | | |
| 10 | 配送住所 | `納品_住所` | 納品:住所 | SINGLE_LINE_TEXT | | |
| 11 | 当日受領者氏名 | `納品_担当者` | 納品:担当者 | SINGLE_LINE_TEXT | | |
| 12 | 配送連絡先 | `納品_電話番号` | 納品:電話番号 | SINGLE_LINE_TEXT | | |
| 13 | 集荷日付 | `集荷_日付` | 集荷:日付 | DATE | ○ | |
| 14 | 集荷郵便番号 | `郵便番号_0` | 集荷:郵便番号 | SINGLE_LINE_TEXT | | |
| 15 | 集荷住所 | `集荷_住所` | 集荷:住所 | SINGLE_LINE_TEXT | | |
| 16 | 当日引渡者氏名 | `集荷_担当者` | 集荷:担当者 | SINGLE_LINE_TEXT | | |
| 17 | 集荷連絡先 | `集荷_電話番号` | 集荷:電話番号 | SINGLE_LINE_TEXT | | |
| - | 《伝票番号連絡先》… | (パース対象外) | - | - | | 見出し行(コロンなし)。パーサーが自動で読み飛ばす |
| 18 | to | `to_addr` | 連絡先(TO) | SINGLE_LINE_TEXT | | **任意**(2026-07-05: 必須から変更) |
| 19 | cc | `cc_addr` | 連絡先(CC) | SINGLE_LINE_TEXT | | 任意 |
| 20 | 責任者氏名 | `緊急連絡先` | 緊急連絡先:担当者 | SINGLE_LINE_TEXT | | |
| 21 | 責任者電話番号 | `緊急連絡先_0` | 緊急連絡先:電話番号 | SINGLE_LINE_TEXT | | |

### 4.2 固定値(constants・暫定)

| kintoneフィールドコード | フィールド名 | 値 | 備考 |
|---|---|---|---|
| `手配種別` | 納品:手配種別 | 通常配送 | ★kintone必須のため暫定デフォルト(§6) |
| `集荷_手配種別` | 集荷:手配種別 | 通常配送 | ★同上 |
| ~~`商品発送確認`~~ | 商品発送確認 | - | **2026-07-05削除: App10には本フィールドが存在しないため対象外**(App49てずくーる側のみ設定)。App10に追加された場合は constants に再追加する |

### 4.3 マッピング対象外(確定)

2026-07-03 の回答で確定した除外項目:

| 項目 | kintoneフィールドコード | 理由 |
|---|---|---|
| 集荷会社 / 配送会社 | `carrier_pickup` / `carrier_ship` | ユニティ側で手配時に入力 |
| 利用金額②〜⑤ | `利用金額_0` `_1` `_3` `_2` | Phase1対象外(①のみ使用) |
| ◯月分◯月請求 | `文字列__1行_` | 経理運用項目 |
| 西暦 | `文字列__1行__2` | ユニティ側入力または後で自動化 |
| 調整額 | `調整額` | ユニティ側の請求調整項目 |
| ~~別途配送費~~ | `配送費` | **2026-07-05変更(3): 対象外を解除** — FMT「内）配送料」から数値で登録する(§4.1 #19) |
| 管理番号 | `管理番号` | ユニティ側管理項目 |
| 補足欄 | `補足欄` | Phase1は備考のみ使用 |
| レンタル機器②〜⑤ | `レンタル機材_0` `_1` `_3` `_2` | FMTは機器商品1つのみ(★④⑤はコード逆転に注意) |
| 担当者 | `文字列__1行__0` | FMTに対応ラベルなし(責任者氏名は緊急連絡先へ) |
| 利用日数 / よべるんM告知 | `利用日数` / `よべるん_M_告知` | FMTに対応ラベルなし |

### 4.4 登録時に触らない(仕様上の対象外)

| 分類 | フィールド | 理由 |
|---|---|---|
| システムフィールド | レコード番号 / 作成者 / 作成日時 / 更新者 / 更新日時 / ステータス / 作業者 / カテゴリー | API登録時に値指定不可 |
| 自動計算 | `計算` | CALC型。kintone側で自動計算 |
| 添付ファイル | `添付ファイル` | FILE型。ユニティ運用 |
| 見積書/請求書チェック | `チェックボックス` | ユニティ経理運用項目 |
| 追跡番号・リンク | `tracking_no_pickup` / `tracking_no_ship` / `tracking_url_pickup` / `tracking_url_ship` | 発送後にユニティが入力 |

## 5. 反映用SQL(確定版)

`field_mapping` と `parser_config`(必須ラベル)を同時に反映する。
★付き(§4.1の 5'/10'、§4.2)の暫定対応は §6 の方針で確定済み。
slug を実際の値に置き換えて Supabase SQL Editor で実行する(手順は README 参照)。

```sql
update public.form_types
set
  field_mapping = '{
    "mappings": [
      { "fmt_label": "機器商品①", "kintone_code": "レンタル機材", "kintone_type": "DROP_DOWN", "required": true },
      { "fmt_label": "機器商品②", "kintone_code": "レンタル機材_0", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "機器商品③", "kintone_code": "レンタル機材_1", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "機器商品④", "kintone_code": "レンタル機材_3", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "機器商品⑤", "kintone_code": "レンタル機材_2", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "イベントブース名", "kintone_code": "イベント実施場所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "取次店名", "kintone_code": "文字列__1行__1", "kintone_type": "SINGLE_LINE_TEXT", "required": true },
      { "fmt_label": "担当者", "kintone_code": "文字列__1行__0", "kintone_type": "SINGLE_LINE_TEXT", "required": true },
      { "fmt_label": "◯月分として請求", "kintone_code": "文字列__1行_", "kintone_type": "SINGLE_LINE_TEXT", "required": true, "transform": "billing_month_next" },
      { "fmt_label": "利用開始日", "kintone_code": "日付_0", "kintone_type": "DATE", "required": true },
      { "fmt_label": "利用最終日", "kintone_code": "日付_1", "kintone_type": "DATE", "required": true },
      { "fmt_label": "配送日付", "kintone_code": "納品_日付", "kintone_type": "DATE", "required": true },
      { "fmt_label": "配送郵便番号", "kintone_code": "郵便番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "配送住所", "kintone_code": "納品_住所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "当日受領者氏名", "kintone_code": "納品_担当者", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "配送連絡先", "kintone_code": "納品_電話番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷日付", "kintone_code": "集荷_日付", "kintone_type": "DATE", "required": true },
      { "fmt_label": "集荷郵便番号", "kintone_code": "郵便番号_0", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷住所", "kintone_code": "集荷_住所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "当日引渡者氏名", "kintone_code": "集荷_担当者", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷連絡先", "kintone_code": "集荷_電話番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "to", "kintone_code": "to_addr", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "cc", "kintone_code": "cc_addr", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "責任者氏名", "kintone_code": "緊急連絡先", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "責任者電話番号", "kintone_code": "緊急連絡先_0", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "内）配送料", "kintone_code": "配送費", "kintone_type": "NUMBER" }
    ],
    "constants": [
      { "kintone_code": "手配種別", "value": "通常配送" },
      { "kintone_code": "集荷_手配種別", "value": "通常配送" }
    ]
  }'::jsonb,
  parser_config = '{
    "separator": ":",
    "required_labels": ["機器商品①", "取次店名", "担当者", "◯月分として請求", "利用開始日", "利用最終日", "配送日付", "集荷日付"],
    "label_aliases": {
      "緊急時責任者氏名": "責任者氏名",
      "緊急時責任者電話番号": "責任者電話番号"
    },
    "block_aliases": {
      "《配送》": {
        "日付": "配送日付",
        "郵便番号": "配送郵便番号",
        "住所": "配送住所",
        "受領者氏名": "当日受領者氏名",
        "連絡先": "配送連絡先"
      },
      "《集荷》": {
        "日付": "集荷日付",
        "郵便番号": "集荷郵便番号",
        "住所": "集荷住所",
        "当日引渡者氏名": "当日引渡者氏名",
        "連絡先": "集荷連絡先"
      }
    }
  }'::jsonb,
  fmt_template = '機器商品①:
機器商品②:
機器商品③:
機器商品④:
機器商品⑤:
◯月分として請求:
合計金額:
内）配送料:
イベントブース名:
取次店名:
利用開始日:
利用最終日:
《配送》　※「建物名」「店舗名」などまで記載お願いします。
　日付:
　郵便番号:
　住所:
　受領者氏名:
　連絡先:
《集荷》※「建物名」「店舗名」などまで記載お願いします。
　日付:
　郵便番号:
　住所:
　当日引渡者氏名:
　連絡先:
《伝票番号連絡先》　※任意のため必須ではありません
to:
cc:
緊急時責任者氏名:
緊急時責任者電話番号: ',
  notes = '・日付は 2026/07/18 のような形式で入力してください
・機器商品はkintoneの選択肢と同じ名称で入力してください(使用しない機器欄は空欄のまま)
・利用開始日/利用最終日は機器の利用期間、配送日付/集荷日付は配送・引き取りの日付です(同じ日になる場合も、それぞれ入力してください)'
where name = 'オールマイト';

-- 反映確認(mappings=26 / version が +1 されていればOK)
select name, version, jsonb_array_length(field_mapping->'mappings') as mappings
from public.form_types where name = 'オールマイト';
```

> 2026-07-06変更(担当者マスター): FMTラベル「担当者」→ `文字列__1行__0` を追加(必須)。
> **fmt_template には「担当者:」行を追加しない** — 申請画面の担当者プルダウン(staff_members
> マスター)の選択値が「担当者:氏名」のFMT行として自動注入される。
>
> 2026-07-05変更(4): fmt_template を改訂(ユーザー指示による正式版差し替え)。
> ・「合計金額:」を追加 — **表示のみ**。field_mapping に入れない(パースはされるが登録時に無視)。
>   required_labels にも入れない。kintoneの `計算`(CALC)へは直接登録しない
> ・「内）配送料:」を機器商品⑤の直後へ移動(登録先は `配送費`(NUMBER)のまま)
> ・「《伝票番号連絡先》　※任意のため必須ではありません」の見出し行を追加 —
>   コロンを含まないためパーサーが自動的に読み飛ばす(パース対象外・マッピング対象外)
> ・to を必須から任意に変更(required 削除・required_labels からも削除)
>
> **運用ルール(2026-07-05確定): fmt_template(申請者が見るFMT文面・表示順)は凍結。**
> 以後の裏側修正は field_mapping / parser_config.required_labels / mapper.ts の変換処理 /
> kintone登録先フィールドのみを変更し、FMTラベル・テンプレートには手を入れない。
> field_mapping だけ変える場合は、上のSQLの `field_mapping` 部分のみの UPDATE でよい
> (fmt_template 等を同値でSETしても version は上がらないが、触らないのが安全):
>
> ```sql
> update public.form_types
> set field_mapping = '{ ...上記の mappings/constants と同じJSON... }'::jsonb
> where name = 'オールマイト';
> ```
>
> 2026-07-05変更(3): 「内）配送料」の登録先を 備考(`文字列__複数行_`)→ **`配送費`(NUMBER)** に変更。
> 合計(税抜)=機器代+配送費−調整額 の計算に反映させるため。「3,300円」→ 3300 に数値化される。
> **fmt_template は無変更**(申請者が見る「内）配送料:」の行はそのまま)。
>
> 2026-07-05変更: FMTに「利用開始日」「利用最終日」を追加し `日付_0` / `日付_1` へ直接マッピング
> (機器代はkintone側JSが日付_0/日付_1の差分で算出するため)。「金額」ラベルと利用金額への
> マッピングは削除。配送日付/集荷日付は 納品_日付 / 集荷_日付 のみに戻した(暫定充当を解消)。
> 配送料のラベルは実FMTの「内）配送料」に変更(備考へ転記のみ、計算・配送費には入れない)。
>
> 2026-07-05変更(2): `商品発送確認 = 確認前` の固定値は **App10に本フィールドが存在しないため削除**
> (てずくーる App49 側のみ設定を維持)。
> 反映済み環境ではこのSQLを再実行する — form_types の UPDATE により **version が自動で+1** され、
> **新規申請のみ**新定義で登録される(既存pending申請は旧versionのまま)。

## 5b. 利用日数・利用金額のサーバー側計算(2026-07-06 方針確定)

**kintone側JavaScriptには今後一切依存しない。** 利用日数・利用金額①〜⑤の計算は
`lib/allmight/pricing.ts` がサーバー側で完結させる(登録直前に `applyAllmightPricing()` を実行)。

- 利用日数 = 利用最終日(`日付_1`)− 利用開始日(`日付_0`)+ 1 → `利用日数` へ登録
- 料金体系: 3日 / 14日 / 21日 / 1ヶ月 の4パック(旧28日価格を1ヶ月価格として使用)+ extra(超過1日あたり)
- 1ヶ月判定: 利用開始日の翌月同日−1日まで(翌月同日が無い月は翌月末日まで)。
  1ヶ月超過分は 1ヶ月料金 + 超過日数×extra。全候補の最安を採用
- 対象: `レンタル機材`〜`レンタル機材_3` → `利用金額`〜`利用金額_3`
- `計算`(CALC)/ `配送費` / `調整額` には直接書き込まない

### 料金表(2026-07-06 原本を全件転記。3日/14日/21日/1ヶ月/extra)

| 機器 | 3日 | 14日 | 21日 | 1ヶ月 | extra | 状態 |
|---|---|---|---|---|---|---|
| スティックキャッチ（ペア） | 140000 | 210000 | 280000 | 350000 | 20000 | ✅(※現在のkintone選択肢には無い) |
| スティックキャッチ（大） | 100000 | 150000 | 200000 | 250000 | 15000 | ✅ |
| スティックキャッチ（小） | 80000 | 120000 | 160000 | 200000 | 12000 | ✅ |
| クレーンゲーム | 50000 | 75000 | 100000 | 125000 | 10000 | ✅ |
| イライラスティック | 100000 | 150000 | 200000 | 250000 | 15000 | ✅ |
| ぬりえスタジアム | 120000 | 180000 | 240000 | 300000 | 18000 | ✅ |
| あひるサンダー | 50000 | 75000 | 100000 | 125000 | 10000 | ✅ |
| あひるサンダーv2 | 40000 | 70000 | 90000 | 100000 | 10000 | ✅ |
| イライラスティックver.2 | 150000 | 225000 | 300000 | 375000 | 20000 | ✅ |
| JET Cola | 70000 | 140000 | 210000 | 350000 | 15000 | ✅ |
| **kidsスペース** | - | - | - | - | - | ❌ **原本料金表に存在しないため未登録**(kintone選択肢には存在。申請されると利用金額未設定+警告) |

原本(既存JSの料金表)の10機器はすべて転記済み・価格は原本のまま。
残る不足は **kidsスペース の1件のみ**(推測値は入れない方針のため、価格確定後に追加する)。

## 6. 確定事項(2026-07-03 確認済み)

kintone側の必須フィールド4つがFMTに存在しない件は、以下の方針で**確定**:

1. **利用開始日(`日付_0`)/利用最終日(`日付_1`)** — ~~配送日付/集荷日付を暫定充当~~ →
   **2026-07-05改訂: FMTに「利用開始日」「利用最終日」を独立項目として追加し、直接マッピングする**
   (機器代算出のため。配送日付と同日の場合もFMT上は別々に入力する)
2. **納品/集荷:手配種別** — Phase1では固定値「通常配送」で登録する。チャーター便など例外案件は、**ユニティ側が承認前に個別修正する運用**とする

補足(軽微・運用で吸収):
- FMTラベル「配送料」は今回の18ラベル一覧に無かったため、FMTに存在する場合のみ備考へ転記される(無ければ何もしない)
- DROP_DOWN「機器商品」の値が選択肢10種と完全一致するか、実FMTサンプルで要確認(括弧の全角/半角など)
- TIME型(納品_時間/集荷_時刻)はPhase1マッピング対象外になったため、全角コロン正規化TODOは保留
