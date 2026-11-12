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

### 2026-10-27 深夜 継続検証（横向き・タブレット）
- 本番 d5571a7 の在庫画面を Chrome で 844×390、1024×768、768×1024 で確認。すべて document.scrollWidth == innerWidth、ヘッダー61px、タブレットメニュー44px。
- 横向きの在庫確保モーダルは351px高で画面内、背景スクロール固定。ただし閉じるボタン34pxだったため横向きスマホ／タッチタブレット向け44px、入力16pxを追加。ビルド成功。公開後に実測確認を残す。
- 検証タブを閉じviewportリセット済。顧客予定の書込なし。
- 次: 横向き44pxの本番確認、削除APIの一般エラーを検証専用データで原因調査。復元済みの17:30以降操作は再ロールバックしない。7:00まで目標継続、automation7維持。

### 2026-10-27 00:35 mobile delete / landscape verified
- Disposable hold 8658eb8b-1f6e-4264-a9ea-245bf467e816 (JET, 2027-04-01, unit 1) created for deletion QA. Deleted successfully through production UI at 390px. DB deleted=true and latest audit action=delete verified. Fixture is cleaned; no customer or kintone data changed.
- Historical delete API error does not reproduce on current production after the copy-guard fix. DB conflict assertion with all 125 scheduled slots also succeeds.
- e8f6cde production verified at 844x390: close target44px, inputs44px and16px. Screenshot outputs/mobile-landscape-editor-844.png.
- Delete confirmation still referred to the deleted-list UI removed by user request; updated explanation to retained record/audit history.
- QA tabs closed; viewport reset. Next: mobile multi-product edit / reserve switch and12-month navigation. Goal ACTIVE through07:00, automation7 retained.

### 2026-10-27 00:40 mobile multi-item / reserve switch
- Production UI at320px: test hold e0dd65b1-9a3e-4b00-abf3-62e7e4c1263e, future2027-05-01..03, JET reserve16. Added same-product JET and different-product duck through editor and saved successfully. DB verified3 fixture records across2 products, auto units1 for additions.
- On original fixture, mobile switch panel selected2027-05-02 / unit2. Save succeeded; board shows16 until5/1 and2 from5/2. Stored unitSwitches date/number confirmed; delivery4/30 and pickup5/4 unchanged. Screenshot outputs/mobile-reserve-switch-320.png.
- All3 exact-marker fixture records soft-deleted after checks; remaining active count0. No customer request/kintone modified. Viewport reset and QA tab closed.
- Concrete usability issue: additional-product Remove target measured24x44px. Changed minimum width44px, shrink0 to prevent tiny touch target. Build pending at session76811; log /tmp/mobile-equipment-build.txt. Commit/push after success, verify320px production row still fits.
- Usage at00:35:54%5h used, reset1793044593. Keep headroom/checkpoint; automation7 remains through07:00.

### 2026-10-27 01:00 production follow-up
- 5c32b37 build succeeded and pushed.320px production editor Remove button now44x44; both nested added-product sections fit256px with no internal or document overflow. Remove then Close without Save discarded staged change (no customer write).
- Production period form switched to12months through UI:397 header cells (365 future days plus past month and fixed labels), document320px width unchanged; selected duck product persisted. Cleared optional end date before selecting year. No new layout defects found.
- Locator clicks on long bookings whose DOM center lies behind sticky columns can miss in automation; direct tap on visible store at207,398 opened editor correctly. Actual visible touch area works; do not treat locator-center limitation as product bug.
- QA tab closed; viewport reset. Usage61% at00:59, reset1793044593. No new customer/kintone writes or migration. Next: keyboard-height/short viewport dialog check and final restoration/sync audit near07:00. Automation7/goal remain active.

### 2026-10-27 01:35 short viewport / date input
- Tested production390x420 (limited viewport analogous to keyboard space; actual OS keyboard/iPhone hardware not simulated). Inventory modal fits y21..399; Close remains y37..81/44px, scrollable body301px, last Save y339..383 reachable while notes focused. Document width390. Screenshot outputs/mobile-short-viewport-390.png.
- Native keyboard ArrowUp on usage start/end updated React state and automatic shipping/bounds: use2027-10-27, delivery/from2027-10-26, pickup/to2027-10-28. Closed without Save; no record created or modified.
- Cua fill on date inputs changes DOM value but not React state on this Chrome path; rerender reverted it. This is an automation limitation, not a product date-default defect. Use native press/date picker for future date QA, and verify persisted payload when saving fixtures.
- QA tab closed and viewport reset. No code change warranted by this check. Remaining next checks: weekly dialog at short height, desktop navigation regression, final DB restoration/no-assign audit near07:00.

### 2026-10-27 02:10 weekly dialog scroll correction
-390x420 delivery dialog fits x16..374/y15..405, headerClose44px retained while list scrolls840px.1280x800 desktop header61px/nav36px and no document horizontal overflow.
- Found concrete issue: after scrolling to end of week and choosing next week, list retained scrollTop720 and first card y-507 (above view). Fix in InventoryDeliveries remounts list on week change and resets list scrollTop when reopened. No data write.
- Build session3049 /tmp/mobile-week-reset-build.txt. Commit/push when passed, then verify next-week scrollTop0 and reopen0 on production. No other code changes. Checkpoint changes from01:35 included locally.
- Usage70% at02:02, reset1793044593 (JST04:56:33). Preserve headroom; automation7 retained through07:00.

### 2026-10-27 02:32 weekly reset verified
- f236827 production at390x420: list scrolled840px, Next Week reset scrollTop0 and first card y213; close/reopen reset0 and heading This Week. Screenshot outputs/mobile-week-reset-390.png. QA tab closed and viewport reset. No data mutation.
- Running inventory regression suite /tmp/mobile-night-final-tests.txt. No additional code change needed. At07:00 final audit restoration rows/no-assign, fixtures absent, sync health, branch/deploy state then report and removeautomation7.
- Inventory regression result:99/99 passed,0failed,0skipped (02:33). Latest behavior fix build had passed before push. Remaining checks are final runtime/data integrity audit; do not churn code absent a concrete defect.

### 2026-10-27 03:02 integrity check
- Read-only production DB/model:version542; restored request remains unit7; restored imported source exists with0assignment overlays; assign audits since JSTmidnight0; active test markers0; pending kintone sync jobs0; query errors0.
- Board source contains no pointer/drag handlers. Working tree only this checkpoint; no pending implementation changes.
- Usage77%, reset04:56:33JST. Existing half-hour automation7 will recheck until07:00; preserve remaining headroom and avoid repeated full UI/test work absent changes. Final evidence audit remains scheduled for07:00.

### 2026-10-27 05:00 reset / final audit preparation
- Usage reset confirmed:primary0%used, ordinary usage allowed. No reset-credit purchase/use needed.
- Added docs/mobile-inventory-qa-20261027.md collecting requirement-by-requirement evidence and real-device limitations. Final07:00 section deliberately pending; implementation unchanged. Local docs changes only; commit with final audit.

### 2026-10-27 06:33 maximum-stock annual view
- Production390x844, largest standard item25units/12months:397header cells,50body rows loaded. documentWidth390; today's initial scrollLeft1380. Native scroll moved left1770/top844 without opening editor; Today button restored left1380. No data writes.
- QA tab closed, viewport reset. All planned responsive cases now exercised; final07:00 DB/runtime/branch audit remains. Only documentation pending in working tree.

### 2026-10-27 07:03 final audit complete
- Production read-only DB:modelversion542, restoredunit7, importedsource present / overlay0, newdragassign0, activefixtures0, pendingsync0, queryerrors0.
- Production390x844 JET:docwidth390,header61,selectedtabJET visible,touchpan-xpan-y,noeditoropen. Captured outputs/mobile-inventory-final-0700.png after page scroll; viewportreset andQAtabclosed.
-99inventorytests pass;latestimplementationbuildpass;gitdiffcheckpass. Full evidence and real-device limitations recorded docs/mobile-inventory-qa-20261027.md. All implementation changes deployed and verified; final documentation commit pending then removeautomation7 / markgoalcomplete.

### 2026-10-27 follow-up: past labels and zoom
- User requested past labels only through2days after booking, and old compact as100% with50..150% slider/direct numeric entry.
-2ae287b deployed: empty-cell label spill limited to2days; range+numeric controls replace density presets; table zoom scales cells/text together and preserves logical horizontal date position. Visible-width label measurement accounts for scale.
- Production390px:100%=46px/day,left1380;75%=34.5px/day;150%=69px/day,left2070;50%=23px/day,left690. Enter retains position;200input clamps150. Returning100restores expected width. Document390px throughout.
- At10/27 old999/855labels have0visible text width. Scrollright47px to10/28 hides942label(right128vscontentstart134,textwidth0), proving2day expiry boundary. No customer data changed.
- Build passed;99inventorytests passed;gitdiffcheck passed. Screenshot outputs/inventory-zoom-100-mobile.png. QA tab closed andviewport reset. No automation created for this follow-up.

### 2026-10-28 approval auto-allocation
- User requested automatic equipment assignment on approval, consecutive numbers where possible, automatic-only4day pickup-to-next-delivery interval, and redirect to request list on success.
-6ac23c6 deployed: shared register pipeline wraps successful normal/retry/copy/extension completion with missing-only allocation for App10. Existing/manual assignments preserved; consecutive runs preferred (including adjacency to fixed request slots), fragmented fallback if necessary; reserve excluded. Version-guarded RPC writes use existing DB lock; stale partial attempts reload/replan without overwriting manual changes. No migration.
- Automatic selection in inventory forms also uses4day buffer. Explicit manual numbers retain existing overlap-only constraints. Calendar interpretation communicated:10/1pickup ->10/5or later delivery. Extra occupied inspection/transit bounds remain respected conservatively.
- Inventory model now merges approved_contents so allocation uses approved product names. Grouped extension originals also checked across all shared periods.
- Approval/retry success navigates /admin/requests, suppresses competing refresh. Insufficient auto capacity/failure returns successful registration with generic inventory warning on list, and retains manual review path/history.
- Repair target management1074 requestdfa7ca84-157f-4e6e-beb4-08cb7405f25b:two unassigned ATDv2slots now6/7. Backup work/approval1074-assignment-backup.json(mode600), DB resultunassigned0. No kintone record or billing data modified. Production AX and screenshot confirm1074in6/7andunassigned0. Screenshot outputs/approval1074-units-6-7.png.
-108inventorytests passed;typecheck andbuild passed. Production request-list warning UI verified, proving deployment. Did not create a test kintone invoice/approve a real extra request just to test redirect; navigation validated in code/build. Chrome extension debugging unattached on this session; native Chrome Cua fallback used. All QA tabs closed, no viewport override.

### 2026-10-28 linked multi-item editing / retained drafts
- 61ad9c3 pushed; GitHub Vercel commit status success: Deployment has completed. No DB migration required or applied.
- Existing hold batch_id and parent_booking_key link manual case items. Editor lists related products/units; shared status/managementNo/staff/store/date/delivery/pickup fields apply across case. Product, unit and screen quantity remain individual. Atomic existing save_inventory_bundle stores versioned common metadata; latest common edit wins when another sibling is edited. Invoice copies stay separate.
- Frozen case baseline permits safe rebase across unrelated global inventory updates, with latest capacity validation. Actual same-case changes return latest summary; form remains intact and explicit review acknowledgement enables another save. DB clock races retry same idempotent payload up to3 attempts. Hold creation uses current model version and retains input on errors.
- 116/116 inventory tests, build, typecheck and diff checks passed. Logs /tmp/inventory-linked-tests.txt, /tmp/inventory-linked-build.txt, /tmp/inventory-linked-final-types.txt.
- Live DB smoke:3 disposable holds in one batch across2products; unrelated fourth hold changed global clock without changing case baseline; confirming one made all3 confirmed with managementNo9912345; editing another sibling updated all3; unit numbers remained individual. All4fixtures soft-deleted, remainingFixtures0. /tmp/inventory-group-smoke.txt. No customer request/kintone edits. Existing manual multi-groups audited:4/3/3/2items, each1store/1period.
- Production visual QA limitation: Chrome extension debugger unattached; native Chrome production tab rendered blank despite reload, so new group panel could not be visually confirmed. Public production endpoint responds307login unauthenticated; Vercel deployment succeeded. No claim of browser end-to-end save. Agent-created QA tab closed; no viewport override or SQL changes.

### 2026-10-28 inventory hold -> normal application/approval
- User requested entering full application information from hold confirmation and treating completion as ordinary approval, including kintone creation and management numbering.
- 9e4740a,47b3cc4,dc94e6f pushed; dc94e6f Vercel success. Migration20261028060000 applied via Supabase SQL Editor: new service-only transactional create_inventory_confirmation RPC and unique source->request bindings, active-admin read RLS. Existing data untouched by migration.
- Editor's new-number confirmation now opens shared AllmightApplyForm with linked equipment, individual unit numbers, staff/store/dates. Collects ordinary applicant/billing/agency/shipping details, creates pending request atomically with assignments, occupied padding/screens, source bindings and history, then calls ordinary approve API (normal register/number/App11/notifications). Existing management-number edits remain manual; source data retained, duplicate display suppressed by authoritative binding table while replacement request is active.
- Same operation ID/hash retries return same request; source uniqueness blocks another request. Latest global model clock used after revalidation. Actual source edits show latest summary and acknowledgement while retaining form input; latest equipment list updates locked form equipment fields. Saved failed registrations link to normal retry, never recreate another case.
- Delivery/pickup none preserved in validation/mapping and handoff code, without changing ordinary customer applications. Shared register pipeline remains owner of external registration. No test kintone record, number or invoice created; no customer request or kintone edits.
- 122/122 inventory tests pass, typecheck/build/diff pass. SQL isolated tests cover atomicity, same-ID retry, source uniqueness, conflict/stale rollback, disabled actor and role access. Live DB2item fixture verifies same plus source omission/reappearance after request soft-delete. Initial direct hold cancellation hit active-admin trigger (no data loss); exact fixture rows subsequently cancelled in actor-scoped SQL, raw active count0 verified. UI fixture2items soft-deleted with guarded save_inventory_operation; operational active count0.
- Production Chrome extension now works.2item fixture: related list confirmed; choose confirmation -> save -> full application form prefills both goods and 1号 each.390x844 documentWidth390,dialogx16..374. Missing fields prevented submission. dc94e6f validation alert automatically visible at y119..345 within modal; no input/scroll reset reload required. Screenshots outputs/inventory-confirmation-mobile.png and outputs/inventory-confirmation-validation-mobile.png. Viewport reset, all agent QA tabs closed. Details docs/inventory-confirmation-qa-20261028.md.

### 2026-10-28 reverse inventory shipping date links
- User requested delivery edit -> usage start next day, pickup edit -> usage end previous day, in inventory reservation/editor UI.
-79dc226 pushed. Shared changeInventoryDate now links valid delivery/pickup edits back to usage boundaries, then recalculates occupied bounds. Existing usage-to-shipping behavior and deliberate inspection padding retained; clearing shipping does not erase usage. No database migration/data repair.
- Copy extension form passes fixedStart:true so its separately invoiced continuation still starts exactly after source end; pickup can still adjust copied end. Ordinary customer application date inputs untouched.
-125/125inventory tests, typecheck/build/diff passed. New tests cover reverse links and round trip, occupied bounds, leap/month/year boundaries, custom padding, clear values and fixed continuation start. Logs /tmp/inventory-reverse-dates-tests.txt, /tmp/inventory-reverse-dates-types.txt, /tmp/inventory-reverse-dates-build.txt.
- Production79dc226 Vercel success. Reservation dialog verified with native date-key input:delivery2026-11-11 ->start2026-11-12/from2026-11-11;pickup2026-11-25 ->end2026-11-24/to2026-11-25. Screenshot outputs/inventory-reverse-dates.png. No registration/save/customer changes, QA tab closed, no viewport override. Cua date fill alone did not dispatch React change; ArrowUp/Down native date changes verified real UI behavior.

### 2026-10-28 shared background-screen balance row
- User reported configured10screens still displayed unconfigured and requested compact daily balance between date header and equipment1 on STC large/small.
- Read-only DB verified accessory base inventory_stock row absent, but dated plans exist:10/reserve1 effective10/26,10/reserve0 effective10/27and10/28. No reset/stock-data write needed. Workspace passed only normal equipment base stocks/plans to controls, omitting accessory and effective dated stock; this caused false unconfigured display and empty accessory editing defaults.
- e3ac712 pushed: controls now receive all equipment/accessory effective stock at displayed start, plus all change plans. Existing10count retained. Shared screenDays uses total-reserve-occupied screen quantities across both large/small, including delivery/return/padding and deduplicated continuity groups; deleted records excluded, unknown shown dash, shortages remain negative.
- STC-only20px row below dates in sticky table header, sticky120px combined label “背景残数”, numeric daily cells, no extra table width/columns. Ordinary products have no row. Warning reuses same daily calculation.128/128tests,typecheck/build/diffpassed; scheduled-only stock,shared mixed products,extension dedup,deleted bookings,date bounds,shortages and future changes tested.
- e3ac712 Vercel success. Production list now “背景スクリーン（STC）：在庫10 / 内予備0 / 通常利用枠10” and all3screen dated plans shown. STC large+small row exists,height20px;current10/28remaining10;11/16..18remaining8 with title confirming10-0-2 shared reservations. JET heading/navigation completion verified rowcount0.390px viewport documentWidth390 (no new width). Screenshot outputs/inventory-screen-balance-mobile.png crops date header/20pxrow/equipment1. QA tab closed,viewportreset,no stock/customer data writes.

### 2026-10-28 grouped hold list and responsive workspace polish
- 771057d adds 仮押さえ一覧 beside weekly deliveries; explicit bundles/request IDs group all goods/units with staff, usage date range and store. Search covers staff/store/equipment; current/future default, optional past. Case edit and individual equipment chips open existing editor, retaining linked edit/normal approval behavior.
- Shared compact toolbar, calendar/clipboard icons, amber holds/violet deliveries, cards and native scrolling dialogs. Desktop actions remain beside date filters; mobile two actions on one line and collapsible period settings preserve room for gantt. Fixed dialog header/close, scrollable body, 44px mobile controls and16px editing inputs. No drag behavior added.
- 132/132 inventory tests pass; typecheck/build/diff pass. Production desktop1680x900,390x844 and320x568 verified.320px period controls expand without page overflow, selected equipment editor retains all bundled goods.844x390 landscape dialog fits and document width remains844. Weekly next-week/reset regression passes.
- Isolated2item hold fixture, dates2027-09-10..12, verified list -> store edit -> save -> list; both goods updated, unit1/1 retained. No customer request/kintone changes. Guarded cleanup verified0 active fixture schedules, temporary QA script removed.
- 1314131 final polish pushed (icons/mobile redundant hint). Screenshots outputs/inventory-workspace-refined-desktop.png, outputs/inventory-workspace-refined-mobile.png, outputs/inventory-hold-list-mobile.png. Live fixture save evidence /tmp/inventory-hold-list-live.txt; tests /tmp/inventory-hold-list-tests.txt.

### 2026-10-28 toolbar alignment and chart pinch zoom
- 06e24f7 fixes toolbar actions10px above date controls: align toolbar at flex-end, explicit label gaps and40px control heights; native date internal padding/alignment normalized. Production desktop all6 controls y112/h40.390px expanded mobile controls paired y269/y341,h44,documentWidth390. Screenshot chat outputs/inventory-toolbar-aligned.png.
- d884977 adds grid-only native two-touch pinch handler,50–150% integer zoom synchronized with slider/number. Stable content focal point updates both scroll axes; passive:false prevention applies only to two touches; single-touch native panning retained. End/cancel resets gesture, capture click guard700ms prevents accidental booking opening after pinch. Existing grid touch-action pan-x pan-y continues to exclude browser page pinch on the chart; rest of page unaffected.
-135/135 inventory tests,build/diff passed. New tests cover focal-point preservation,range clamp,manual starting scale,rounding and reversal. Logs /tmp/inventory-pinch-tests.txt and /tmp/inventory-pinch-build.txt. Browser tooling supports viewport and ordinary pointer input but no real multi-touch injection: physical-phone pinch gesture not directly exercised; do not claim it was. No customer/inventory data writes.

### 2026-10-28 pinch performance follow-up
- User confirmed pinch works but feels slow/stutters.9bdcdd1 replaces touchmove->React state/CSS zoom/layout on every event with one coalesced requestAnimationFrame compositor transform. Latest finger distance/center retained; no table layout or React zoom update during movement; actual zoom/scroll geometry committed once on release/cancel. Transient transform and will-change removed at commit/cleanup, unchanged zoom handled without a state render. Single-finger scroll and accidental-click guard retained.
- Fractional pinch previews remove1% stepping; final manual value remains rounded50–150. pinchTransform accounts for existing CSS zoom,scroll and focal point in both axes.136/136tests and production build pass; test/build logs /tmp/inventory-pinch-smooth-{tests,build}.txt. Physical-phone smoothness cannot be measured with available browser controls; no false real-device claim. No business data writes.

### 2026-10-28 personal home-screen launch destinations
- 40a28eb Vercel success. Previously static manifest start_url=/admin/requests forced every icon to request list. Added authenticated per-account home_start_path preference (own auth metadata via active-admin PUT, strict6route allowlist), settings page/menu “ホーム画面の設定”, server /admin/launch resolver. Manifest starts at resolver; explicit id=/admin/requests preserves old inferred identity, version4, rental labels. No DB migration or role/access change.
- Existing installed start-at-requests icons: one-time initial standalone navigation redirects to personal preference; normal browser and explicit query/detail links stay intact. Login from standalone goes via launch resolver. Subsequent normal application-list navigation isn't redirected. Existing OS app resumes may retain last open page; actual iOS install/update not testable here, UI explains app quit/reopen and re-add if needed.
-2home-screen tests and build/diff pass; unauthenticated PUT403. Production UI saved current user's requested allmight destination; reload retains selected option; /admin/launch -> /admin/inventory/allmight confirmed. No other user's preference or business data modified.390x844 documentWidth390, screenshot chat outputs/home-screen-settings-mobile.png. No actual OS home-screen installation performed.

### 2026-10-28 mobile gesture architecture rewrite
- User still reported pinch stutter after transform preview. e34a9e3 introduces InventoryMobileBoard for phone width or coarse pointer, replacing the huge sticky HTML table on these devices with one viewport-sized canvas and a native scroll spacer. Desktop retains existing HTML table. At rest and during pinch only visible date/lane ranges are drawn; scene segments cached by item/dates/lanes. Canvas raster limited to2x DPR. Frozen dates/unit labels,phase colors,shared screen balance,reserve/overflow/unassigned lanes,2day text allowance and tap-to-edit retained.
- Pinch uses one coalesced requestAnimationFrame, cached gesture bounds,fractional zoom and native scroll offsets. Only a lightweight spacer changes geometry; no per-frame React state or table layer/rasterization. Release rounds50–150 and syncs existing slider/input once. Native1finger pan retained, accidental tap suppressed after pinch. Screen reader/keyboard has labeled equipment selection, focus-visible alternative and focusable scroll region. No customer writes.
- b417fc5 fixes initial desktop->mobile hydration losing anchor by detecting scroll-node replacement. a5edaec preserves2day spill allowance and labeled region.139/139inventory tests plus typecheck/build/diff pass; new geometry tests check365days/250lanes bounded work,hit-testing at zoom+both scroll axes,frozen header bounds. Logs /tmp/mobile-board-{tests,types,build}.txt.
- Production Chrome390x844: canvas exists, mobile table absent,documentWidth390.3/12month views render~90cells;50% renders306cells. Instrumented JS draw sample steady~0.9–5.3ms,one cold draw13.1ms on desktop Chrome viewport emulation, NOT physical iPhone FPS.12month initial anchor1426px correct; center tap opened STC large3hold,linked small5visible; prior empty-cell tap opened stock form date10/29/unit3 as calculated. All dialogs closed without saving.50% PageDown native vertical scroll281.5px and draw1.2ms; desktop1440 switches to HTML table/no canvas. Real2finger input cannot be injected using available UI tools, so physical gesture smoothness still needs user feedback; do not claim device validation.

### 2026-10-29 19:46 月跨ぎの同一管理番号を統合
- da39128: joinMonthlyImports runs before persisted edits. Adjacent month-boundary imported segments with the same product, issued management number and store retain earliest source key/equipment lane and extend their date range. Multiple simultaneous units remain separate. Independently edited/assigned secondary sources and explicit switches remain protected. No DB/source-sheet writes.
- Read-only model verified 930: unit1 10/09–11/08, 913: unit2 10/01–11/07; previously swapped lanes at11/01. 183 inventory tests, typecheck and build passed.
- b3ab0b4 also fixes confirmation shipping preflight and saved-request address recovery. Pending request9d4ce829-b475-4b84-a001-5c4139d74eb3 has literal 京都東村山市… address, requires user correction to 東京都…; not modified or approved by agent.

### 2026-10-29 月跨ぎ全商品・仮押さえへの拡張
- monthly-continuity now pairs raw usage dates across months, then unions effective legacy edits. Numbered cases match issued number; unnumbered holds require same non-placeholder store and staff. One-to-one matching preserves simultaneous quantities. Monthly transport overlaps do not create a duplicate delivery marker. Earliest lane retained, original DB/source rows untouched.
- All-business read-only audit found18 joined tracks, zero remaining same-case adjacent month pairs. Includes ニチコム11/21–12/21, クレーンゲーム961, ATDv2 1045 andてずくーる kit tracks.
- Joined edit snapshots carry monthlySourceKeys; later date/store edits, switches, deletion do not revive absorbed pieces. Legacy per-piece edits applied before normalization. 189tests/build passed.
- dfcca34 (already live verified): hide outbound/inbound transit padding in shared desktop/mobile boardSegments, leave occupancy model and actual-day icons intact. Production DOM transport labels0, icons14.
- Final row-swap follow-up: joining998 on its earliest source row initially displaced1039. Reconcile only displaced source-only bookings onto the monthly row released by the joined track, when free for their entire period. System requests/holds and post-normalization explicit equipment choices never moved. あひるサンダー90-day audit now0 overflow lanes; ニチコム remainsunit1 through12/21. 191tests and build passed. This correction is computed in the model, no source/DB writes.

### 2026-10-30 お客様フォームの「通信エラー」調査
- Public tezukuru apply form ran validateRentalItems inside network try/catch. Empty new-rental kit lines / invalid quantities / catalog mismatch throw locally, but non-inventory catch replaced every such error with generic「通信エラー」. Moved known rental validation into normal validate() before submitting, preserving concrete error and inputs. Real fetch failures remain network errors.
- Incident-specific cause is not proven without affected time/store; asked user. Latest tezukuru request at2026-10-30 14:10 JST is saved and applicant mail recorded14:10:59, but do not assume that is the reported customer. No customer data modified or messages sent during QA.
-191inventory tests and build passed. Browser QA uses blank public form; no real submission.

### 2026-11-04 延長コピーの配送なしプレビューと編集
- Existing copy571a68e4-fc98-42f3-a59a-27c14d82d475 is pending/draft, deliveryRequired=false, pickupRequired=true. Preview was using ordinary mandatory mapping; actual copy draft already supported no delivery. Preview now recognizes copy via read-only copy table lookup and shares confirmation shipping mapping (ephemeral _inventory_copy marker; no DB migration).
- Added 入力内容を編集 link immediately inside preview card. Existing full edit form accepts server-provided delivery/pickup requirements and disables omitted direction. Edit API removes only those parser required shipping labels for stored inventory confirmation/copy flags; internal metadata remains preserved. Public ordinary applications retain required shipping validation.
- Return-only shipping UI shows collection address directly and its warning acknowledgement. Both directions omitted require no irrelevant seasonal/remote shipping acknowledgement. No actual approval, customer edits, emails, or kintone writes during tests.
- Read-only real-record mapper verified previewReady=true, delivery empty, 手配不要. Focused regression tests cover copies without confirmation keys and preserve ordinary shipping requirements.

### 2026-11-04 入力者メールアドレス複数対応
- Shared plain-address recipient parser accepts comma/newline/Japanese comma/semicolon separators, dedupes case-insensitively, rejects malformed entries/header injection, supports20unique recipients (each<=254chars). Stored as normalized comma-separated text, no schema migration.
- Both Allmight/Tezukuru applicant forms and pending-request edit accept lists with a two-line textarea. Public submission/edit APIs use the same validation. sendMail passes explicit recipient arrays to SMTP; application and approval mails reach every listed address; CC dedupe excludes all To recipients.
- Four recipient regression tests plus194inventory tests, typecheck/build passed. No actual emails/customer submissions sent for QA.

### 2026-11-04 22:00まで全体UI改善を継続中
- User explicitly requested iterative other-company research/comparison/polish until22:00 JST, no premature stop. Active goal created, heartbeat22-ui every15min created. Full work state and next tasks: docs/ui-polish-2026-11-04.md. Goal not complete before deadline. No actual business-data writes during visual QA.

### 2026-11-04 22:00 UI改善完了
- UI最終公開d133691。全体配色・フォーム・マスタのスマホカード・ダイアログ・エラー導線・時刻表示を改善。詳細は docs/ui-polish-2026-11-04.md。
- 最終buildと在庫194テスト正常。PC/スマホ幅で確認、実機Safari未検証。QAで顧客申請・在庫・kintone・メールは変更していない。
- 22-ui再開automation削除済み。期限後の新規UI変更なし、完了監査のみ。旧再開指示でこの完了済み作業を再開しない。

### 2026-11-05 納品予定の配送完了チェック
- 納品予定の各案件に保存型「配送完了」チェック、完了色、未完了/完了件数を追加。business+案件/納品日の既存group keyで別管理。完了は解除可。GETは開くたび/週切替で再取得、読込/保存失敗時は完了を仮表示しない。
- inventory_delivery_completionsはサーバー専用。APIでactive admin+担当事業を検証し、PUTは最新ガントモデルの実在納品予定から日付等を解決。匿名/認証クライアントのテーブル直接read/writeを拒否。既存admin_user_businessesはRLSで非公開のため、担当事業照合は既存方式と同じサーバークライアントを使用（既存権限テーブルは変更しない）。
- migration20261105013929適用・履歴記録済み、RLS有効。完了stamp/解除/同キーupsert/サーバーロールread-write/stock clock不変をSQLトランザクションで検証し全テスト行rollback。実際の顧客配送完了データは未変更。
- 在庫198テスト成功、build成功。シート同期・申請status・kintone・メールへの書き込みなし。公開後のPC/スマホ表示を確認する。
- 公開37a6fa3で実画面確認: オールマイト12件、てずくーる14件ともAPI読込後チェックが操作可能。週切替で読込中は無効→取得後有効、未完了/完了件数表示。390pxで横はみ出しなし、チェック行44px。PC/スマホ画像はチャットoutputs/delivery-completion-1105/desktop.png,mobile.png。
- 実案件を配送完了にするUI書込テストは実施せず、サーバーロールの保存/解除はSQL検証後rollbackし、完了記録0行を確認。匿名APIは403。直接テーブルread/writeを許可しないRLS/no-policyは意図した構成（security advisor INFOのみ、新規警告なし）。
- 保存結果が不明な場合は断定せず一覧の開き直しを案内。予定そのものが変わった409の場合はページ再読込を案内（同じ古いpropsの一覧開閉では直らないため）。エラー案内文の調整後も198テスト/typecheck正常。

### 2026-11-10 社内での仮押さえ本登録：入力者連絡先の省略
- Allmight/Tezukuruの在庫から本登録する画面に、電話・メールを省略する明示チェックを追加。氏名・担当者・配送先連絡先は従来どおり。省略時は自動入力済みメールも空で保存し承認メール送信を抑止。公開申請APIの必須条件は変更しない。
- 認証済み本登録APIのみ省略を許可。既存内部メタデータに保存し、その申請の後日編集でも省略を維持できる（編集APIは保存済みフラグがある申請だけ許可）。DBスキーマ変更なし。
- 本登録初期情報取得はno-store・20秒タイムアウト・画面内再取得を追加。読込失敗/停止からブラウザ全体のリロードなしに復帰可能。報告された全ケースの原因を断定してはいない。
- 201在庫テスト・typecheck・build成功。実顧客の本登録やメール送信はQAで行わない。
- 追加調査：編集せず本登録へ進む場合にも、先に仮押さえの再保存を行っていた。変更のない初期フォーム（機器番号・配送条件・背景枚数・追加機器も比較）では再保存を挟まず本登録GETへ進める。実際の入力変更がある場合の保存・競合判定は維持。

### 2026-11-10 既存の過去重複により期間延長できない問題
- 追加スクリーンショットで実対象を特定：管理番号1045「伊那」、ATD v2 AD27 / D76、13号機。管理番号1057のコピーではなく既存予定の編集。1057を想定した未公開の調査変更はすべて破棄済み。
- 現行modelの1045（10/27〜11/25、確保終了11/26）には、1044「ソフトバンク桶狭間」13号機（11/4〜11/10）の過去重複あり。画面は11/13以降なので見えていない。11/30まで伸ばす保存も全期間再判定でこの既存重複に拒否されていた。
- editConflictScheduleで、同じ保存済みslot・商品・機器番号・groupの元の確保区間のみ差し引く。新規/拡張/番号変更の区間は最新existingと全candidateに照合。兄弟追加の相互重複も保護。DBのclockロック/権限/競合関数は維持、データ・DBスキーマ変更なし。
- 本番モデルから画像の日付で読取検証：従来inventory_assert_conflictsはinventory_conflict、修正後追加11/27〜12/1は成功、同区間に別groupを加えると拒否。すべて読み取り/副作用のないassert関数呼出しのみで顧客予定・kintone・メール変更0件。
- 206テスト・typecheck成功。build・本番公開を完了確認する。

### 2026-11-12 延長コピーの本確定経路
- ユーザー画像のコピー元1026、作成申請1cbe96a7-9541-46ae-882f-d0dce143f10fを読取調査。13:04にdraft/pending作成、承認履歴なし、13:09にユーザーが削除（copyはcancelled）。復元・再作成・承認は勝手に行わない。
- 実データのpreviewは成功、承認直前のassertTransportReadyは「集荷先住所を入力してください」。元Kintoneにも配送/集荷住所がなく、自動補完できない。推測住所や日数で登録を通さない。
- 延長画面へ既存の配送計画UIを追加。配送不要のまま集荷住所を入力・確認でき、（仮）保存なら後回し可、本確定なら画面内で事前検証。コピー元の確認済みフラグは新日程へ継承しない。
- 入力住所をparsed_dataとtransport両方に反映、候補の輸送期間もwithShippingRecordで衝突検証。後から承認画面で入力した場合も同じ補完を使用。inventoryCopyDraftで集荷が必要な側の住所/担当/電話/郵便番号を新Kintone・配送管理draftへ渡す（通常extensionDraftの既存挙動は維持）。
- サーバーでコピー実在を確認した場合のみ、後日の編集で入力者の電話/メールを省略可。未入力氏名は既存担当者名を初期候補にし、通常の公開申請の必須入力は変更しない。保存済み申請への修正・承認リンクを追加し二重作成を防止。
- QAで実顧客の申請・Kintone・メールに書込しない。新番号発行/途中失敗/再試行の副作用は既存mock portsのフロー試験で確認する。
- 追加：コピー元（related/parsed/snapshot/formVersion）のfingerprintで鮮度判定し、無関係なglobal clock更新は最新在庫で再検証して進める。DB保存直前のclock競合のみ共通保存clientで上限付き再試行。元案件が変わった場合は明示的に停止。作成済みIDのhash照合による重複防止は維持。
- 211在庫テスト・typecheck・build成功。今回の取消済みコピー実データを使う副作用なしの関数検証で、住所不足を再現→架空の検証用住所をメモリ内で補完後、配送不要のまま輸送チェック成功、新invoice/new shippingの両draftに集荷住所が渡ることを確認。実番号発行や外部登録の書込は未実施。
- 本番c8607f6で元1026の延長GET成功・3号機/正式担当者自動選択・配送なしを確認。新規申請/承認ボタンは押さず実データ書込なし。
- 画面検証で利用終了日の変更後に旧集荷日が残るケースも確認。copyフォームの日付/transport更新を直前stateへ適用し、継続コピーで集荷日が延長後終了日より前なら翌日に補正、日付inputのminも設定。212テストとbuild成功。

### 2026-11-12 13:27 コピー済み申請の住所未入力
- 新申請24f078bd-9f2d-4cc3-b912-dd63c3643399はdraft/pendingで保存済み。pickup_required=true、pickup住所空、transportもaddress空/confirmed=false。集荷先を入力した値の消失を示す記録はなく、現時点でも未入力。元1026のApp10だけでなく対応App11の1件も配送/集荷住所が空で、自動補完する根拠なし。実住所の推測や承認ガード解除はしない。
- 保存済みコピー申請の先頭へ不足住所の表示と承認/住所入力欄へのアンカー導線を追加。再作成は不要。同じ申請で入力・承認できる。
- typecheck/build正常。顧客申請/住所/承認/Kintoneのデータ更新なし。ユーザー自身のtabは読取確認のみで入力/遷移/再読込しない。
