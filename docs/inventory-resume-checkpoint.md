# 在庫管理の現在状態（2026-10-24 更新）

本ファイルの旧チェックポイントは完了済み。現在の仕様・検証は `docs/inventory-manual-allocation.md` が最新。

- 本番 https://kintone-request.vercel.app/admin/inventory/allmight
- Git main に手動番号、ドラッグ、編集・削除・復元、複数台仮押さえ、公開申請の同一商品複数枠、固定タブを反映。
- DB `20261024050000_inventory_manual_operations.sql` 本番適用済み。
- 元シートの手入力番号は継承するが、自動詰め直しは廃止。新規・既存の番号未指定申請は未割当。配送・集荷・点検を含む確保期間を手動で確認・指定する。
- 商品や日程の編集は在庫運用用の別記録。元申請・kintone・元手入力は保持。削除は復元可能。
- 申請システム優先のシート重複除外を継続。元143シート記録を保持し、有効な表示136台分。検証バッチの3台は取消済みで表示対象外。
- Google既存8ミラーへ反映済み。値・色・結合がAPIと一致し、元15タブの1〜249行の値・数式・結合は変更なし。
- Apps Script公開v5のままで共通モデルAPIを利用。既存Webhook署名・毎分復旧トリガーは継続。追加Google認証なし。
- 53テスト・型検査・ビルド成功。UIで番号移動・競合拒否・編集・削除・復元・同一商品複数台と異商品の一括保存を確認。
- kintone脱却は `docs/kintone-transition-assessment.md` の考察のみ。実装しない。
- 使用量は今回途中確認で17%使用、枠不足なし。再開用の定期自動実行は不要。

## 守るもの
- `.env.local` とチャット作業dir `work/*token/key/url` を出力しない。
- 生の申請・手入力シートを削除・上書きしない。
- ブラウザ操作はcua。ChromeブラウザID3。新ターンではrewriteDocumentationを読む。
- 検証結果: チャット作業dir `/Users/yoshinaga/Documents/Codex/2026-10-23/referenced-chatgpt-conversation-this-is-an-2/outputs/inventory-manual-mirror-audit.json`。

## 2026-10-26 商品追加・申請/kintone同期
- 編集画面から同一/別商品を複数追加。申請に紐付く場合は既存5枠の範囲で申請本文・承認済み商品・変更前後履歴を原子的に保存。
- App10/11の既存レコードのみ更新。新規管理番号発行・通知は実行しない。対象フィールド限定、料金再計算、外部変更のリビジョン照合、二つのアプリを一括更新し再取得照合。
- 永続同期ジョブと再試行表示。失敗時は申請を処理中として保護し、再試行成功時に解除。二重クリック/応答喪失の再実行は同一操作IDで重複追加しない。
- 20261026030000 migration: 本番SQLエディタで適用成功。ローカルPGliteで履歴・一括保存・失敗時全ロールバック・リトライ・権限検証済み。単体テスト70件、ビルド成功。
- ドラッグ移動は日付維持、移動先の番号強調・スクロール補助。変更は機器番号であり管理番号1046等は変えない。
- 本番4605027公開確認。将来日の専用テスト予定で1号→4号ドラッグ成功、使用中1号への移動拒否、同商品2台+別商品1台追加成功。専用pending申請へ同商品2台追加し、parsed/raw/承認商品/変更履歴の保存を照合。
- 実際の1046を読み取りのみで追加機器の外部更新内容を準備し、App10機器+料金、App11配送機器+コードへ限定されることを確認。実案件への検証目的のkintone書込はしていない。外部更新/競合/応答喪失リトライは模擬データのテストで検証。
- 上記専用テスト4holdはcancelled、専用requestはsoft-deleteして履歴保持。未完了同期ジョブ0。既存の業務案件・スクリーン保有10/予備1は保全。

## 2026-10-26 11:29 在庫減少の訂正
- ユーザーが設定していないあひるサンダーv2 11/1の25→20変更予定が初期導入で残っていた。監査履歴で10/23 17:15登録を確認。
- 11/1予定を25/予備2へ訂正（削除せず監査履歴保持）。通常在庫23を継続。案件・基準在庫・他商品の設定は変更なし。
- ガント編集の「延長」は既存予定の期間変更（管理番号維持）、配送なし初期・配送/集荷の有無を個別選択。既存の別申請/新番号延長はリンクから利用可能。不要フラグは再表示/日付変更/在庫バッファ判定でも維持。

## 2026-10-26 11:46 利用枠93%で中断準備（13:40:26 JSTリセット、13:42再開）
### 進行中1 ミラータブ増殖
- 原因: ユーザーがガントタブを【STC(小)】等へ改名し、旧同期がgetSheetByName('ガント ...')で再作成。全31タブ（元15+改名ミラー8+重複8）。元手入力は変更しない。
- integrations/google-sheets/Code.gs にresolveMirrorSheet: props mirrorId:source.trim()の固定sheetIdで検索、初回はA1=在庫管理表/C1=商品/A2=自動更新を検証して【source】優先。見失ったIDや曖昧候補は作り直さず停止。repairMirrorBindingsは重複の旧ガント8タブを削除せず非表示、ユーザー改名タブ維持、ハッシュクリアして同期。
- 新コードをGASへ保存し、同じ既存公開URLのバージョン6へ更新完了（ライブラリ/6確認）。既存1分トリガーもHEAD新コード。
- repairMirrorBindings実行は最初doPost選択反映前で0秒、その次はbusyで失敗。3回目実行中（11:46頃）: Cua mirrorScriptTab=1093846900、Chrome3。実行ログを確認。busyなら進行中同期終了後に再実行（旧v5のpushも同ロック、今はv6へ更新済み）。初回走査は重いので長くかかる。
- 最新ローカル76 tests PASS。コードとtests/inventory-mirror-bindings.test.ts、tests/inventory-sheet-writer.test.ts未コミット。名前変更→同ID継続、見失ったタブ再作成禁止、曖昧/非ミラー保護を追加。
- XLSXexport読取で31タブのvisible/hiddenと8【】C2最新時刻を検証すること。元15の手入力保護。2回同期してタブ数不変、改名ミラー最新であることを確認。非表示整理完了まだ未確認。削除不要。
### 進行中2 延長UXのユーザー修正（最新依頼）
- 現在公開ee346c6の延長は同じ予定の期間変更でユーザー意図と違う。配送/集荷の有無セレクトはそのまま残す。
- 新しい延長ボタン: 元予定を変更せず別の予定を作る。商品・機器番号・担当者・店舗名コピー、開始日=元終了翌日、配送なし、登録区分「（仮）」初期でユーザー手動修正可。新しい管理番号を入力し本確定化できるフロー。自動新規採番と誤解してkintoneに未承認書込をしない（ユーザーは仮初期を指定）。既存正式申請からの新規採番延長パイプラインは別途存在し保持。
- InventoryHoldFormの初期値props拡張等で別フォームへ切替が自然。期間変更ボタン(setExtending)を置換。新コピーで元の管理番号を継承しない。開始日nextDay、終了日ユーザー指定。元予定を勝手に取消しない。
- 重要: コピー機器番号は元予定の翌日でも元集荷日の+1バッファと重なる。継続貸出として同一物理機器を保持する場合の在庫グループ連鎖（parent_booking_key等）と旧集荷扱いを設計し、配送サイクル無視で一般競合を緩めない。原本の配送/集荷やkintone手配を勝手に変更しない。
- 既存ユーザー承認: DB変更/テスト/デプロイ/Google連携更新自動で進める。kintone脱却は考察止め（未実装）。最新要求優先。
- ee346c6は配送Required/pickupRequired booleanをpatchへ永続化、ganttEntryは内部parsedメタデータ参照、occupiedCycleはなしの場合余分な前後日を足さない。再オープン/日付変更でもなし維持。72testsPASS,buildPASS。本番UIでなしdisabled日付・from/toが利用期間のみになる確認済（実案件へ保存していない）。
- Stockあひるv2 11/1の20/予備2予定をSQL+actorで25/予備2に訂正成功。23号11/1button有効と19〜23号白セル確認。元の在庫・案件不変。work/inventory-stock-restored.png。
- 最後の確認: 11:47:xx repairMirrorBindingsは8製品の【】タブ紐付けログを出し終えた（IRS2 #302140273、クレーン#1352967020等）。その後syncInventoryの再取得ロックでbusy。つまり整理/固定ID登録は完了、描画更新のみ未確認。v6+minute triggerで回復するはず。Chrome3 mirrorScriptTab1093846900をhandoffマーク済み。
- 自動再開heartbeat作成成功: automationId=13-42、destination=thread、毎日13:42（完了後削除）。再開時はusage残量確認し、この時刻以降進める。

### 2026-10-26 13:18 ユーザーの最終確定指示（再開時最優先）
延長の概念を明確化: 同じ管理番号の期間変更では絶対にない。請求月が異なるため、内容をコピーした完全に別の新規申請として作成し、kintoneは新しい管理番号の別レコードとして作り直す。ガント上は集配送を挟まず同じ機器番号の右へ継続表示。コピー項目は商品・機器番号・担当者・店舗名、開始日は元終了日の翌日。直前指示の登録区分「（仮）」初期、手動修正可能、配送/集荷有無セレクト維持も引き継ぐ。仮のまま即外部採番せず、コピー新規申請→請求月選択→確定/承認で別採番する整合的なフローを実装。元を上書きしない。元と子の同一機器連鎖・旧集荷不要化は既存正式延長RPC/runnerを活かし、安全かつ原子的に扱う。現在のボタンは誤った同番号編集なので置換必須。13:42 heartbeat再開設定済み、利用枠リセット13:40:26。

## 2026-10-26 13:40リセット後の再開
- 使用率0%へ回復確認。ミラーは8【】が更新、重複旧ガント8タブhidden、全31タブ不増加。JETの【】は13:18:28更新、旧ガントは11:35停止をexportで確認。
- 延長はInventoryCopyFormに置換。別のpending申請を作り、ガントでは（仮）。請求対象月は新規選択、元の終了翌日開始、配送/集荷なし初期、商品/機器番号/担当/店舗をコピー。元管理番号を継承せず、確定・承認時にApp10/11新規作成+App50別採番。
- 同じ管理番号に複数機器がある場合、全機器を1請求としてコピーして旧集荷取消を部分だけに適用しない。kintone実機材数との照合あり。
- inventory_copy_requests新規表/RPC、copy-source/copy-model/copy-runner追加。元/子を連鎖グループで固定、配送なしで物理番号同じ、元予定の値自体は変更せず表示上のみ旧集荷を外す。仮コピー削除時は元集荷復帰し、別コピー作成可能。元申請の上書き保護、登録開始後は子の内容も保護。
- 20261026040000、20261026041000本番適用成功。SQL互換環境で別pending申請・未採番・別請求月・同機器・承認前外部実行不可・リトライ/権限を検証。85単体テスト予定、本番ビルド後公開へ。
- 実際の949（JET7号、10/31終了）と1026（ATDv2 3号、11/30終了）を読取のみでkintone/source照合成功。実案件へ試験用外部書込なし。

## 2026-10-26 14:32 通常編集の保存エラー修正・公開
- 原因: copy-guardのJSONB containsにJS配列を渡し、PostgRESTがPostgreSQL配列として送信して22P02。コピー未作成の通常編集まで失敗していた。JSON.stringifyでJSONBを明示し修正。通常編集は元予定更新のまま、コピー作成処理は実行しない。
- d6bd064を本番公開。Vercel FPK45… (FPk45HN7cX23yUXYmJo7UYqmAQNZ) Ready 14:25:44。
- 89 tests PASS、typecheck/build PASS。通常編集許可・コピー元保護・DBエラー時の保護継続を回帰テスト追加。
- 本番UIで検証専用のJET1台を登録→店舗名のみ変更→保存→再度開き、同じ機器8号・同じ日程で更新済を確認。DBでも同一hold1件、patch更新、copyRequestsCreated=0を確認。検証予定はdeleted=trueで片付け済み。顧客の申請・管理番号・kintoneを変更していない。
- 検証予定のUI削除で一般エラーが出たため、同一予定だけをsave_inventory_operation RPCでsoft deleteして検証。RPCは成功。UI削除エラーの追加調査は必要なら別途（通常編集の保存は本番実測成功）。
- コピーの実配送ありでは元機器番号/元集荷を変えないようcontinuity=falseで分離。42000マイグレーション適用成功。コピー開始時の元データ変更を外部採番前に拒否。コピー画面タイトル・仮表記も修正。
- ミラーは本ターン13:40時点のexportで31タブ不増加、8【】表示・8旧ガント非表示、更新先固定を確認済み。

## 2026-10-26 予備機の利用・日付指定の機器切替
- 5b8ae33: 手動選択は通常在庫+予備を許可。自動割当は従来通り通常在庫のみ。予備の行は使用可能、選択肢に予備を明示。保有数の対象外と予約重複は引き続き拒否。
- 在庫予定の編集に『機器番号の切り替え（配送なし）』。切替日（利用開始翌日〜利用終了）と番号を登録、解除可能。unitSwitchesをinventory_booking_edits.patchへ既存のバージョン/排他/監査RPCで保存。DBマイグレーション不要。管理番号・元申請・kintone・配送/集荷日は変更しない。
- layoutBoardとslotScheduleが同じ期間分割を使用。切替前日までは元番号、当日から切替先へ。Sheetsミラーも同じ描画。通常編集で商品/利用期間を変更する場合と延長コピーは切替解除を要求し、無言の変更を防ぐ。
- 今日（anchor）の強制分割を廃止。配送/利用/集荷の色分けは維持。
- 99 tests PASS、typecheck/build PASS。本番UIで検証用hold 7fbd5999-4c7a-2f0b-98c3-296d816fef28 をJET予備16号へ2/1〜2/3登録→2/2から1号に切替→1号は2/2〜、16号は前日まで表示を確認。元納品1/31・集荷2/4不変。解除をUI確認後、検証holdをsoft-delete済み。顧客データやkintoneへの検証書込なし。

## 2026-10-27 00時台 スマホ改善・17:30復元・朝7時まで継続中
- 最新ユーザー依頼: スマホのドラッグ移動を廃止。10/26 17:30以降の誤操作復元。10/27 07:00をゴールに一晩改善。goal ACTIVEを作成。07:00まで完了扱いにしない。
- 17:30以降の監査494〜497を取得。実変更は494（request b039aeaf… unit7→4）と497（sheet6a5964… 新規unit2割当）の2件。495/496は同じ番号へのnoop。条件付きupdateで494をunit7へ、497を割当overlay削除し元シートの元番号へ復元済み。監査inventory_assignment_restore / restore_before_1730も記録。顧客申請・kintoneに変更なし。
- バックアップはチャットwork/inventory-after1730-audit.json と inventory-1730-rollback-backup.json（0600）。復元済みなので再実行禁止。新しいユーザー変更を上書きしない。
- 410c8f8 本番公開済み、実画面で『予定をタップして編集』確認。pointer handlers / pointercapture / drag state / assignment fetchを全削除。旧画面のPOST operations action=assignも410で拒否。手動番号編集/日付指定unit-switchesは残す。
- 同commit: モバイルヘッダー60px固定+メニュー（1024px未満）。タップ44px、入力16px（iOS自動拡大抑制）、フォーム1列、日付パネル2列、予定セルpan-x pan-y、タブsticky60px、編集max90dvh。99 tests/typecheck/build PASS。
- 本番スマホ検証: Chrome browser IDが旧3→現在1へ変化（Cua runtimeもreset）。Chrome1はログイン済み、IAB3はログイン切れ。CuaでChrome1選択・nameSession済み。mobileSignedTab=1093846964、/admin/inventory/allmight。viewport capability.set({width:390,height:844})で検証中、終了時reset必須。ページwidth/scrollWidthとも390、headerHeight61、gridtouchActionpan-x pan-yを実測。スマホメニュー表示、週間納品dialogの表示まで確認。顧客データは変更しない。
- 未コミット追補: スマホdensityをselectにして操作バー1行化、編集ウィンドウヘッダーsticky+close44/nowrap、週間dialogボタン44/close nowrap、body:has(dialog[open]/inventory-editor)で背景スクロール固定。/tmp/mobile-controls-build.txtで先行typecheck/build PASS、nowrap/bodylock追補は小変更未再build。
- 次: 追補をcommit/push、本番390/320/430幅を検証。週間dialog次週/閉じる、商品タブ、横縦スクロール、編集保存を検証用future hold（明示marker）で確認しsoft-delete cleanup。既存のcaseを検証書込しない。17:30復元のDB事後照合、Chromeviewportreset、画像保存。具体的問題があれば修正、無意味な変更はしない。
- 継続heartbeat automation ID『7』 ACTIVE、30分毎、destination thread。07:00になったら最終監査・報告後automation7削除、goalを達成時のみcomplete。変化のない通知をしない。利用枠を随時確認し枯渇前にcheckpoint+実回復後再開予約。

### 深夜の追加検証（10/27、00時台）
- c879887: マスサイズをスマホselectにして操作バー1行、dialogボタン44px/nowrap、背景スクロール固定。
- 089b989: 長期案件の先頭（管理番号）が横スクロール時に画面左へ隠れないよう、表示範囲でラベル幅を制限。先頭から表示・末尾省略を維持。
- 1f6f53c: 編集ヘッダーをフォームのスクロール領域の外に分離。320px幅の長い新規フォームを下までスクロールしても『閉じる』が見えて操作可能なのをスクリーンショットとDOM座標で確認。
- e7cdf87/e4d15ab: 選択中の製品タブを初期表示/端末回転時に画面内へ自動スクロール（縦のページ位置は変更しない）。JETタブが320px幅のnav内（x227〜303、nav10〜310）に収まることを実測。
- 320/390/430px幅すべてdocument.scrollWidth==clientWidth。入力16px、メニュー61px。週間納品dialog全ボタン44px、前/次週・閉じる成功、bodyoverflowhidden。縦横スクロールでleft1380→1810、top0→474、編集dialogなし。深夜0時以降のaction=assign監査は0件。
- 実画面の検証用hold c3616329-01f2-d60f-ad6e-dd611733835a（2027/3/1、動作検証専用_スマホ_20261027）をスマホUIから作成→店舗名だけ変更保存→同一ID patch更新をDB確認→soft-delete cleanup済み。顧客申請/kintoneへの検証書込なし。復元2件の事後照合も成功（request元7号、source新規overlayなし）。
- 出力: outputs/mobile-inventory-night-390.png, mobile-delivery-390.png。Chrome viewportはreset済み。Cua signedInBrowser Chrome1 / mobileSignedTab1093846964 は当turnの一時タブなので次turnは必要なら新規作成。IAB3はログイン画面なのでChrome1で検証する。
- 直近99 tests/typecheck/build PASS（/tmp/mobile-night-*）。未コミットのAdminHeader lg→xl変更は狭いタブレットでヘッダーが複数行となりsticky商品タブと重なるのを防ぐもの。次commitに含める。
- automation7は『毎時00分/30分』に更新済み（7:00ちょうどの最終監査用）。goal ACTIVEを維持。07:00まで残りはタブレット幅/横向き、通常PCの回帰、12ヶ月表示、編集画面の複数商品と切替、既知のUI削除一般エラー（顧客データは触らずテスト用だけで）等を具体的問題がある場合に検証する。期限前は未完を完了扱いにしない。
