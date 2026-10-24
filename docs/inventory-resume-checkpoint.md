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
