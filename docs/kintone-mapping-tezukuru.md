# てずくーる(App49)マッピング設計

- ステータス: **確定(2026-07-04・要確認8件すべて回答済み)/ SQL反映・kintone登録は未実施**
- 前提資料: `docs/kintone-fields-tezukuru.md`
- 仕組み: オールマイトと同じ設定駆動(form_types)。反映SQL実行で version が自動+1され承認が有効化される

---

## 1. App49 の整理

### 1.1 kintone側の必須フィールド(登録時に値が必要)

| フィールド | コード | 充当方針(案) |
|---|---|---|
| 納品:手配種別 | `手配種別` | 固定値「通常配送」(オールマイトと同じ。例外は承認前にユニティ修正) |
| 集荷:手配種別 | `集荷_手配種別` | 同上 |
| ◯月分◯月請求 | `文字列__1行_` | **★要確認1** — オールマイトでは経理運用項目として除外したが、App49では必須のため何かを入れないと登録エラーになる |
| 担当者 | `文字列__1行__0` | **★要確認2** — 誰の名前か(ユニティ担当?)。FMTに含めるか固定値か |

※ オールマイトで必須だった利用開始日/利用最終日は App49 では必須ではない(充当は任意で継続可能)。

### 1.2 入力すべき項目(Surely申請由来と想定)

- 基本: 貸出先法人(取次店名)、イベント実施場所、連絡先TO/CC、緊急連絡先(責任者)
- プラン: レンタル機器(`レンタル機材`・選択肢6種: てずくーる！！_週末 / てずくーる！！_1ヶ月 /
  てずくーる！！フェス / シールLAB_週末 / シールLAB__長期 / 送付不要_1ヶ月)
- コンテンツ: コンテンツ①〜⑩(選択肢13〜14種)+ 数量①〜⑩
  - コードは①=`コンテンツ`、②=`コンテンツ_0` … ⑩=`コンテンツ_8`、数量は①=`数値` … ⑩=`数値_8`
  - **オールマイトのような④⑤逆転は無い**(順番どおり)
  - ★「シール」はコンテンツ①の選択肢にのみ存在(②〜⑩には無い)→ 要確認7
- 納品/集荷: オールマイトとフィールドコードが同一(`納品_日付` `納品_住所` `郵便番号` `集荷_*` `郵便番号_0` 等)
- 備考: `文字列__複数行_`

### 1.3 登録時に触らない(対象外)

| 分類 | フィールド |
|---|---|
| システムフィールド | レコード番号 / 作成者 / 作成日時 / 更新者 / 更新日時 / ステータス / 作業者 / カテゴリー |
| 自動計算(CALC) | `計算`(合計) / `計算_0`〜`計算_10`(基本料・売上_コンテンツ①〜⑩) |
| 在庫連携(システム項目) | `stock_error` / `stock_synced_json` |
| 発送運用 | 伝票番号①〜⑩(`文字列__1行__2` 等10個) / 追跡番号・リンク4種 / 集荷会社 / 配送会社 ※`商品発送確認` は固定値「確認前」で登録(§3.4) |
| 経理運用 | `調整額` / `配送費` / 見積書/請求書(`チェックボックス`) / `添付ファイル` / 西暦(`文字列__1行__7`) |
| 採番対象 | `管理番号`(承認パイプラインが採番・設定。共通採番マスタ App50 キー=shipping) |

## 2. てずくーるFMT案(★実サンプルと突き合わせて確定)

コンテンツは最大10組。空欄の項目は送信されない(任意項目は空でよい)。

```
取次店名:
担当者名:
請求月:
配送料:
イベントブース名:
コンテンツ1:
数量1:
コンテンツ2:
数量2:
コンテンツ3:
数量3:
コンテンツ4:
数量4:
コンテンツ5:
数量5:
コンテンツ6:
数量6:
コンテンツ7:
数量7:
コンテンツ8:
数量8:
コンテンツ9:
数量9:
コンテンツ10:
数量10:
配送日付:
配送郵便番号:
配送住所:
当日受領者氏名:
配送連絡先:
集荷日付:
集荷郵便番号:
集荷住所:
当日引渡者氏名:
集荷連絡先:
to:
cc:
責任者氏名:
責任者電話番号:
```

- 納品/集荷まわりのラベルはオールマイトFMTと同一(Surelyの学習コスト削減)
- このFMT案を**正式版**として運用する(要確認8の回答)
- 2026-07-05改訂: **レンタルプランはFMTから削除し、画面のプルダウン(選択UI)で選択**する。
  選択値は「レンタルプラン: <値>」のFMT行として自動注入され、従来どおり `レンタル機材` へ登録される
  (parser_config.select_fields で定義・SQLのみで変更可)。伝票通知to/cc は「to」「cc」に変更。
  配送料は上部(請求月の直後)へ移動

## 3. マッピング対応表(ドラフト)

### 3.1 基本情報

| FMTラベル(案) | kintoneフィールドコード | 型 | FMT必須 | 備考 |
|---|---|---|---|---|
| レンタルプラン | `レンタル機材` | DROP_DOWN | ○ | **画面のプルダウンで選択**(FMT貼り付けには含めない。選択値がFMT行として自動注入される) |
| 取次店名 | `文字列__1行__1` | SINGLE_LINE_TEXT | ○ | 貸出先法人 |
| 担当者名 | `文字列__1行__0` | SINGLE_LINE_TEXT | ○ | kintone必須(確定: FMTに含める) |
| 請求月 | `文字列__1行_` | SINGLE_LINE_TEXT | ○ | kintone必須(確定: FMTに含める)。例: 7月分8月請求 |
| イベントブース名 | `イベント実施場所` | SINGLE_LINE_TEXT | | |
| to | `to_addr` | SINGLE_LINE_TEXT | ○ | 2026-07-05: 「伝票通知to」から変更 |
| cc | `cc_addr` | SINGLE_LINE_TEXT | | 2026-07-05: 「伝票通知cc」から変更 |
| 責任者氏名 | `緊急連絡先` | SINGLE_LINE_TEXT | | |
| 責任者電話番号 | `緊急連絡先_0` | SINGLE_LINE_TEXT | | |

### 3.2 コンテンツ(①〜⑩)

| FMTラベル(案) | kintoneフィールドコード | 型 | FMT必須 | 備考 |
|---|---|---|---|---|
| コンテンツ1 | `コンテンツ` | DROP_DOWN | ○ | 「シール」は①のみ選択可(★要確認7) |
| 数量1 | `数値` | NUMBER | ○ | |
| コンテンツ2 | `コンテンツ_0` | DROP_DOWN | | |
| 数量2 | `数値_0` | NUMBER | | |
| コンテンツ3 | `コンテンツ_1` | DROP_DOWN | | |
| 数量3 | `数値_1` | NUMBER | | |
| コンテンツ4 | `コンテンツ_2` | DROP_DOWN | | ④の選択肢に「粘土12色」なし(kintone側設定) |
| 数量4 | `数値_2` | NUMBER | | |
| コンテンツ5 | `コンテンツ_3` | DROP_DOWN | | |
| 数量5 | `数値_3` | NUMBER | | |
| コンテンツ6 | `コンテンツ_4` | DROP_DOWN | | |
| 数量6 | `数値_4` | NUMBER | | |
| コンテンツ7 | `コンテンツ_5` | DROP_DOWN | | |
| 数量7 | `数値_5` | NUMBER | | |
| コンテンツ8 | `コンテンツ_6` | DROP_DOWN | | |
| 数量8 | `数値_6` | NUMBER | | |
| コンテンツ9 | `コンテンツ_7` | DROP_DOWN | | |
| 数量9 | `数値_7` | NUMBER | | |
| コンテンツ10 | `コンテンツ_8` | DROP_DOWN | | |
| 数量10 | `数値_8` | NUMBER | | |

### 3.3 納品/集荷(オールマイトと同一コード)

| FMTラベル(案) | kintoneフィールドコード | 型 | FMT必須 | 備考 |
|---|---|---|---|---|
| 配送日付 | `納品_日付` | DATE | ○ | |
| 配送日付 | `日付_0` | DATE | ○ | 利用開始日へ充当(App49では必須ではないが運用統一) |
| 配送郵便番号 | `郵便番号` | SINGLE_LINE_TEXT | | |
| 配送住所 | `納品_住所` | SINGLE_LINE_TEXT | | |
| 当日受領者氏名 | `納品_担当者` | SINGLE_LINE_TEXT | | |
| 配送連絡先 | `納品_電話番号` | SINGLE_LINE_TEXT | | |
| 集荷日付 | `集荷_日付` | DATE | ○ | |
| 集荷日付 | `日付_1` | DATE | ○ | 利用最終日へ充当 |
| 集荷郵便番号 | `郵便番号_0` | SINGLE_LINE_TEXT | | |
| 集荷住所 | `集荷_住所` | SINGLE_LINE_TEXT | | |
| 当日引渡者氏名 | `集荷_担当者` | SINGLE_LINE_TEXT | | |
| 集荷連絡先 | `集荷_電話番号` | SINGLE_LINE_TEXT | | |

### 3.4 その他・固定値

| 項目 | kintoneフィールドコード | 内容 |
|---|---|---|
| 配送料(FMT) | `文字列__複数行_`(備考) | オールマイトと同じく備考へテキスト転記(`配送費` には入れない) |
| 固定値: 納品手配種別 | `手配種別` | 「通常配送」(チャーター等はユニティが承認前に修正) |
| 固定値: 集荷手配種別 | `集荷_手配種別` | 「通常配送」 |
| 固定値: 商品発送確認 | `商品発送確認` | 「確認前」(2026-07-04追加。承認=発送準備開始のため「見積中」ではない) |

## 4. 確定事項(2026-07-04 回答反映)

| # | 項目 | 確定内容 |
|---|---|---|
| 1 | ◯月分◯月請求 | FMTに含める。ラベル「請求月」→ `文字列__1行_`(例: 7月分8月請求) |
| 2 | 担当者 | FMTに含める。ラベル「担当者名」→ `文字列__1行__0` |
| 3 | レンタルプラン | FMTに含める。表記はkintone選択肢と完全一致 |
| 4 | コンテンツ・数量 | 最大10組。空欄は送信しない |
| 5 | よべるん.M告知 / DSP様共有事項 | Phase1対象外。DSP様共有事項は必要なら備考にまとめる |
| 6 | 採番・配送管理連携 | **てずくーるも適用**(App50共通採番 → App49管理番号更新 → App11配送管理upsert)。承認パイプラインは種別非依存のためコード変更不要。機器コード判定は「てずくーる」→TZC /「シールLAB」→SLB が前方一致で適用される |
| 7 | シール | コンテンツ1のみで運用。FMT注意事項に明記 |
| 8 | FMT | §2の案を正式版として運用 |

## 5. 反映用SQL(確定版・★未実行)

実行すると version が自動で +1 され、mappings が入るため**承認(kintone登録)が自動有効化**される。
実行前に pending のてずくーる申請が無いか確認すること(旧version=マッピング空のため承認不可のまま残る。
その場合は差戻し→再申請の運用)。

```sql
update public.form_types
set
  field_mapping = '{
    "mappings": [
      { "fmt_label": "レンタルプラン", "kintone_code": "レンタル機材", "kintone_type": "DROP_DOWN", "required": true },
      { "fmt_label": "取次店名", "kintone_code": "文字列__1行__1", "kintone_type": "SINGLE_LINE_TEXT", "required": true },
      { "fmt_label": "担当者", "kintone_code": "文字列__1行__0", "kintone_type": "SINGLE_LINE_TEXT", "required": true },
      { "fmt_label": "◯月分として請求", "kintone_code": "文字列__1行_", "kintone_type": "SINGLE_LINE_TEXT", "required": true, "transform": "billing_month_next" },
      { "fmt_label": "イベントブース名", "kintone_code": "イベント実施場所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "コンテンツ1", "kintone_code": "コンテンツ", "kintone_type": "DROP_DOWN", "required": true },
      { "fmt_label": "数量1", "kintone_code": "数値", "kintone_type": "NUMBER", "required": true },
      { "fmt_label": "コンテンツ2", "kintone_code": "コンテンツ_0", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量2", "kintone_code": "数値_0", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ3", "kintone_code": "コンテンツ_1", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量3", "kintone_code": "数値_1", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ4", "kintone_code": "コンテンツ_2", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量4", "kintone_code": "数値_2", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ5", "kintone_code": "コンテンツ_3", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量5", "kintone_code": "数値_3", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ6", "kintone_code": "コンテンツ_4", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量6", "kintone_code": "数値_4", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ7", "kintone_code": "コンテンツ_5", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量7", "kintone_code": "数値_5", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ8", "kintone_code": "コンテンツ_6", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量8", "kintone_code": "数値_6", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ9", "kintone_code": "コンテンツ_7", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量9", "kintone_code": "数値_7", "kintone_type": "NUMBER" },
      { "fmt_label": "コンテンツ10", "kintone_code": "コンテンツ_8", "kintone_type": "DROP_DOWN" },
      { "fmt_label": "数量10", "kintone_code": "数値_8", "kintone_type": "NUMBER" },
      { "fmt_label": "配送日付", "kintone_code": "納品_日付", "kintone_type": "DATE", "required": true },
      { "fmt_label": "配送日付", "kintone_code": "日付_0", "kintone_type": "DATE", "required": true },
      { "fmt_label": "配送郵便番号", "kintone_code": "郵便番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "配送住所", "kintone_code": "納品_住所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "当日受領者氏名", "kintone_code": "納品_担当者", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "配送連絡先", "kintone_code": "納品_電話番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷日付", "kintone_code": "集荷_日付", "kintone_type": "DATE", "required": true },
      { "fmt_label": "集荷日付", "kintone_code": "日付_1", "kintone_type": "DATE", "required": true },
      { "fmt_label": "集荷郵便番号", "kintone_code": "郵便番号_0", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷住所", "kintone_code": "集荷_住所", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "当日引渡者氏名", "kintone_code": "集荷_担当者", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "集荷連絡先", "kintone_code": "集荷_電話番号", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "to", "kintone_code": "to_addr", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "cc", "kintone_code": "cc_addr", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "責任者氏名", "kintone_code": "緊急連絡先", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "責任者電話番号", "kintone_code": "緊急連絡先_0", "kintone_type": "SINGLE_LINE_TEXT" },
      { "fmt_label": "配送料", "kintone_code": "文字列__複数行_", "kintone_type": "MULTI_LINE_TEXT" }
    ],
    "constants": [
      { "kintone_code": "手配種別", "value": "通常配送" },
      { "kintone_code": "集荷_手配種別", "value": "通常配送" },
      { "kintone_code": "商品発送確認", "value": "確認前" }
    ]
  }'::jsonb,
  parser_config = '{
    "separator": ":",
    "required_labels": ["レンタルプラン", "取次店名", "担当者", "◯月分として請求", "コンテンツ1", "数量1", "配送日付", "集荷日付"],
    "label_aliases": {
      "緊急時責任者氏名": "責任者氏名",
      "緊急時責任者電話番号": "責任者電話番号",
      "請求月": "◯月分として請求"
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
    },
    "select_fields": [
      {
        "label": "レンタルプラン",
        "required": true,
        "options": [
          "てずくーる！！_週末",
          "てずくーる！！_1ヶ月",
          "てずくーる！！フェス",
          "シールLAB_週末",
          "シールLAB__長期",
          "送付不要_1ヶ月"
        ]
      }
    ]
  }'::jsonb,
  fmt_template = '取次店名:
イベントブース名:
◯月分として請求:
配送料:
《コンテンツは必要箇所のみご入力ください》
コンテンツ1:
　数量1:
コンテンツ2:
　数量2:
コンテンツ3:
　数量3:
コンテンツ4:
　数量4:
コンテンツ5:
　数量5:
コンテンツ6:
　数量6:
コンテンツ7:
　数量7:
コンテンツ8:
　数量8:
コンテンツ9:
　数量9:
コンテンツ10:
　数量10:
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
  input_guide = 'レンタルプランは上のプルダウンから選択してください。テンプレートをコピーし、各項目の「:」の後に値を入力して貼り付けてください。使用しないコンテンツ欄は空欄のままで構いません。',
  notes = '・シールは「コンテンツ1」に記載してください
・コンテンツはkintoneの選択肢と同じ名称で入力してください
・◯月分として請求は「7月分」の形式で入力してください(自動で「7月分8月請求」に変換されます)
・日付は 2026/07/18 のような形式で入力してください',
  complete_message = '申請を受け付けました。
内容を確認のうえ、担当者よりご連絡いたします。'
where name = 'てずくーる';

-- 反映確認(mappings=42 / version が +1 されていればOK)
-- 2026-07-06(2): 新FMT対応 — テンプレートをブロック形式(《配送》《集荷》)へ変更。
--   短縮ラベルは parser_config.block_aliases で既存ラベルへ正規化(登録先フィールドは無変更)。
--   請求月→「◯月分として請求」(transform billing_month_next。「7月分」入力→「7月分8月請求」。
--   旧形式「7月分8月請求」もそのまま通る)。担当者名エントリはFMT廃止に伴い削除。to は任意化
select name, version, jsonb_array_length(field_mapping->'mappings') as mappings
from public.form_types where name = 'てずくーる';
```
