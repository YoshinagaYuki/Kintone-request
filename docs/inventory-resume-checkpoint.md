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
