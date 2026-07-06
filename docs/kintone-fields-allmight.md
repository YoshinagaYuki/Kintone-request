# kintone フィールド一覧(App 10)

- kintone AppID: 10
- フォーム revision: 243
- 取得日時: 2026-07-05T07:49:22.821Z
- 取得スクリプト: `scripts/fetch-kintone-fields.ts`

手順6(登録マッピング設計)の材料。FMT項目との対応は `form_types.field_mapping` に定義する。

## 入力フィールド

| フィールド名 | フィールドコード | 型 | 必須 | 選択肢 |
|---|---|---|---|---|
| 集荷会社 | `carrier_pickup` | DROP_DOWN |  | 西濃運輸 / 佐川急便 / ヤマトJITBOX |
| 配送会社 | `carrier_ship` | DROP_DOWN |  | 西濃運輸 / 佐川急便 / ヤマトJITBOX |
| 連絡先（CC） | `cc_addr` | SINGLE_LINE_TEXT |  |  |
| 連絡先(TO) | `to_addr` | SINGLE_LINE_TEXT |  |  |
| 集荷追跡番号 | `tracking_no_pickup` | SINGLE_LINE_TEXT |  |  |
| 配送追跡番号 | `tracking_no_ship` | SINGLE_LINE_TEXT |  |  |
| 集荷追跡リンク | `tracking_url_pickup` | SINGLE_LINE_TEXT |  |  |
| 配送追跡リンク | `tracking_url_ship` | SINGLE_LINE_TEXT |  |  |
| イベント実施場所 | `イベント実施場所` | SINGLE_LINE_TEXT |  |  |
| 見積書/請求書 | `チェックボックス` | CHECK_BOX |  | 見積書 / 請求書 |
| よべるん.M 告知 | `よべるん_M_告知` | DROP_DOWN |  | あり / なし |
| レンタル機器① | `レンタル機材` | DROP_DOWN |  | スティックキャッチ（大） / スティックキャッチ（小） / イライラスティック / イライラスティックver.2 / クレーンゲーム / あひるサンダー / あひるサンダーv2 / JET Cola / kidsスペース / ぬりえスタジアム |
| レンタル機器② | `レンタル機材_0` | DROP_DOWN |  | スティックキャッチ（大） / スティックキャッチ（小） / イライラスティック / イライラスティックver.2 / クレーンゲーム / あひるサンダー / あひるサンダーv2 / JET Cola / kidsスペース / ぬりえスタジアム |
| レンタル機器③ | `レンタル機材_1` | DROP_DOWN |  | スティックキャッチ（大） / スティックキャッチ（小） / イライラスティック / イライラスティックver.2 / クレーンゲーム / あひるサンダー / あひるサンダーv2 / JET Cola / kidsスペース / ぬりえスタジアム |
| レンタル機器⑤ | `レンタル機材_2` | DROP_DOWN |  | スティックキャッチ（大） / スティックキャッチ（小） / イライラスティック / イライラスティックver.2 / クレーンゲーム / あひるサンダー / あひるサンダーv2 / JET Cola / kidsスペース / ぬりえスタジアム |
| レンタル機器④ | `レンタル機材_3` | DROP_DOWN |  | スティックキャッチ（大） / スティックキャッチ（小） / イライラスティック / イライラスティックver.2 / クレーンゲーム / あひるサンダー / あひるサンダーv2 / JET Cola / kidsスペース / ぬりえスタジアム |
| 管理番号 | `管理番号` | NUMBER |  |  |
| 緊急連絡先：担当者 | `緊急連絡先` | SINGLE_LINE_TEXT |  |  |
| 緊急連絡先：電話番号 | `緊急連絡先_0` | SINGLE_LINE_TEXT |  |  |
| 【機器代+配送費-調整額】合計(税抜) | `計算` | CALC |  |  |
| 納品：手配種別 | `手配種別` | DROP_DOWN | ○ | 通常配送 / チャーター便 / 手配不要 |
| 時刻（チャーターの場合） | `集荷_時刻` | TIME |  |  |
| 集荷：手配種別 | `集荷_手配種別` | DROP_DOWN | ○ | 通常配送 / チャーター便 / 手配不要 |
| 集荷：住所 | `集荷_住所` | SINGLE_LINE_TEXT |  |  |
| 集荷：担当者 | `集荷_担当者` | SINGLE_LINE_TEXT |  |  |
| 集荷：電話番号 | `集荷_電話番号` | SINGLE_LINE_TEXT |  |  |
| 集荷：日付 | `集荷_日付` | DATE |  |  |
| 調整額 | `調整額` | NUMBER |  |  |
| 見積書/請求書 | `添付ファイル` | FILE |  |  |
| 利用開始日 | `日付_0` | DATE | ○ |  |
| 利用最終日 | `日付_1` | DATE | ○ |  |
| 時刻（チャーターの場合） | `納品_時間` | TIME |  |  |
| 納品：住所 | `納品_住所` | SINGLE_LINE_TEXT |  |  |
| 納品：担当者 | `納品_担当者` | SINGLE_LINE_TEXT |  |  |
| 納品：電話番号 | `納品_電話番号` | SINGLE_LINE_TEXT |  |  |
| 納品：日付 | `納品_日付` | DATE |  |  |
| 別途配送費 | `配送費` | NUMBER |  |  |
| ◯月分◯月請求 | `文字列__1行_` | SINGLE_LINE_TEXT |  |  |
| 担当者 | `文字列__1行__0` | SINGLE_LINE_TEXT |  |  |
| 貸出先法人 | `文字列__1行__1` | SINGLE_LINE_TEXT |  |  |
| 西暦 | `文字列__1行__2` | SINGLE_LINE_TEXT |  |  |
| 備考 | `文字列__複数行_` | MULTI_LINE_TEXT |  |  |
| 補足欄 | `補足欄` | SINGLE_LINE_TEXT |  |  |
| 納品：郵便番号 | `郵便番号` | SINGLE_LINE_TEXT |  |  |
| 集荷：郵便番号 | `郵便番号_0` | SINGLE_LINE_TEXT |  |  |
| 利用金額① | `利用金額` | NUMBER |  |  |
| 利用金額② | `利用金額_0` | NUMBER |  |  |
| 利用金額③ | `利用金額_1` | NUMBER |  |  |
| 利用金額⑤ | `利用金額_2` | NUMBER |  |  |
| 利用金額④ | `利用金額_3` | NUMBER |  |  |
| 利用日数 | `利用日数` | SINGLE_LINE_TEXT |  |  |

## システムフィールド(API登録時に値指定不可)

| フィールド名 | フィールドコード | 型 | 必須 | 選択肢 |
|---|---|---|---|---|
| カテゴリー | `カテゴリー` | CATEGORY |  |  |
| ステータス | `ステータス` | STATUS |  |  |
| レコード番号 | `レコード番号` | RECORD_NUMBER |  |  |
| 更新者 | `更新者` | MODIFIER |  |  |
| 更新日時 | `更新日時` | UPDATED_TIME |  |  |
| 作業者 | `作業者` | STATUS_ASSIGNEE |  |  |
| 作成者 | `作成者` | CREATOR |  |  |
| 作成日時 | `作成日時` | CREATED_TIME |  |  |

## マッピング設計メモ(手順6で記入)

| FMT項目(ラベル) | kintoneフィールドコード | 変換ルール |
|---|---|---|
| (未定) | | |
