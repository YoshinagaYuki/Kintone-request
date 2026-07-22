/**
 * kintone App49(てずくーる)カスタマイズJS — 統合版(1ファイルで管理)
 * ============================================================================
 * このファイル1本で以下をすべて管理します。
 *   (2) 採番処理
 *   (3) 配送管理連携
 *   (4) 共通通知サービス連携(Google Chat / LINE)
 *
 * 【通知の設計方針(重要)】
 *   kintone JS は「appId」と「recordId」だけを送信します。
 *   通知本文は Next.js 側の buildRegistrationMessage() だけが生成します。
 *   → 本文生成ロジックはシステム全体で1か所のみ。
 *      申請システム経由の通知と kintone直接登録の通知が必ず同一になります。
 *      このファイルに本文の組み立てを書かないでください。
 *
 * 【導入手順】
 *   A. 既にApp49のカスタマイズJSを運用している場合(推奨)
 *      1. 現在のJSの (2)採番 / (3)配送管理 のコードを、下の該当セクションへ移してください
 *      2. 末尾のイベント登録を、このファイルの (5) の形(採番 → 配送管理 → 通知の順)に統一
 *      3. このファイル1本だけをアップロードし、旧ファイルは外す
 *      ※ (2)(3) をそのまま残したい場合は、最低限 (1)(4)(5) をコピーして
 *         既存処理の最後に notifyRegistration_() を呼ぶだけでも動作します
 *   B. 新規に構築する場合
 *      (2)(3) に自社の処理を実装し、そのままアップロード
 *
 * 【通知タイミングの注意】
 *   通知本文には「管理番号」が含まれます。
 *   採番が終わる前に通知すると管理番号が空で送信されるため、
 *   必ず (2)採番 → (3)配送管理 → (4)通知 の順で実行してください((5)で制御)。
 */
(function () {
  'use strict';

  // ==========================================================================
  // (1) 設定 — ここだけ書き換えてください
  // ==========================================================================
  var CONFIG = {
    /** Next.jsアプリのURL + /api/notify/registration */
    NOTIFY_URL: 'https://<あなたのVercelドメイン>/api/notify/registration',
    /** Vercel環境変数 NOTIFY_API_TOKEN と同じ値 */
    NOTIFY_TOKEN: '<NOTIFY_API_TOKEN と同じ値>',
    /** 編集保存でも通知するか(通常は false) */
    NOTIFY_ON_EDIT: false,
  };

  // ==========================================================================
  // (2) 採番処理
  //     ▼▼▼ 既存の採番コードをこのブロックに貼り付けてください ▼▼▼
  //     - App50(採番マスタ キー=shipping)から管理番号を採番
  //     - App49レコードの「管理番号」を更新
  //     - 既に管理番号がある場合は採番しない(二重採番防止)
  // ==========================================================================
  async function runNumbering(recordId) {
    // 例(既存実装に置き換えてください):
    // const res = await kintone.api('/k/v1/record', 'GET', { app: kintone.app.getId(), id: recordId });
    // if (res.record['管理番号'].value) return;               // 採番済みならスキップ
    // const no = await issueManagementNumber();               // 既存の採番関数
    // await kintone.api('/k/v1/record', 'PUT', {
    //   app: kintone.app.getId(), id: recordId,
    //   record: { '管理番号': { value: no } },
    // });
  }

  // ==========================================================================
  // (3) 配送管理連携(App11へのupsert)
  //     ▼▼▼ 既存の配送管理コードをこのブロックに貼り付けてください ▼▼▼
  // ==========================================================================
  async function runShippingSync(recordId) {
    // 例(既存実装に置き換えてください):
    // const res = await kintone.api('/k/v1/record', 'GET', { app: kintone.app.getId(), id: recordId });
    // await upsertShippingRecord(res.record);                 // 既存の配送管理関数
  }

  // ==========================================================================
  // (4) 共通通知サービス連携(このセクションは変更不要)
  //     送信するのは appId / recordId のみ。本文はサーバー側で生成されます。
  // ==========================================================================
  function notifyRegistration_(recordId) {
    return fetch(CONFIG.NOTIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-notify-token': CONFIG.NOTIFY_TOKEN,
      },
      // ★ ここに通知本文を書かないこと(本文は buildRegistrationMessage() が生成)
      body: JSON.stringify({
        appId: kintone.app.getId(),
        recordId: String(recordId),
      }),
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!res.ok) {
              console.error('[notify] 通知APIエラー', res.status, data && data.error);
              return;
            }
            if (data && data.skipped) {
              console.info('[notify] 送信済みのためスキップ(二重通知防止)');
            } else {
              console.info('[notify] 通知を送信しました', data && data.results);
            }
          });
      })
      .catch(function (err) {
        // 通知が失敗しても保存・採番・配送管理は成功のまま
        console.error('[notify] 通知APIの呼び出しに失敗', err);
      });
  }

  /** 保存後イベントからレコードIDを解決 */
  function resolveRecordId(event) {
    if (event.recordId) return event.recordId;
    if (event.record && event.record.$id && event.record.$id.value) return event.record.$id.value;
    if (event.record && event.record['レコード番号'] && event.record['レコード番号'].value) {
      return event.record['レコード番号'].value;
    }
    return kintone.app.record.getId();
  }

  // ==========================================================================
  // (5) イベント登録 — 採番 → 配送管理 → 通知 の順で実行
  //     (管理番号を確定させてから通知するため、この順序を守ってください)
  // ==========================================================================
  async function runAll(recordId) {
    // 「登録処理の成功」と「通知送信の成功」は分けて管理する。
    // 通知は 保存成功 + 採番成功 + 配送管理成功 の3つが揃った場合のみ実行する。
    try {
      await runNumbering(recordId);      // (2) 採番
      await runShippingSync(recordId);   // (3) 配送管理
    } catch (err) {
      // 採番 or 配送管理が失敗 → Google Chat / LINE とも通知しない
      console.error('[app49] 採番/配送管理が失敗したため通知を中止しました', err);
      return;
    }
    // ここから先は登録処理が全て成功。通知が失敗しても登録は成功扱いのまま
    await notifyRegistration_(recordId); // (4) 通知
  }

  kintone.events.on(['app.record.create.submit.success'], function (event) {
    var recordId = resolveRecordId(event);
    if (recordId) runAll(recordId); // await しない(保存フローを止めない)
    return event;
  });

  kintone.events.on(['app.record.edit.submit.success'], function (event) {
    var recordId = resolveRecordId(event);
    if (!recordId) return event;
    if (CONFIG.NOTIFY_ON_EDIT) {
      runAll(recordId);
    } else {
      // 通知はしないが採番・配送管理は従来どおり実行
      runNumbering(recordId)
        .then(function () {
          return runShippingSync(recordId);
        })
        .catch(function (err) {
          console.error('[app49] 採番/配送管理でエラー', err);
        });
    }
    return event;
  });

  // --------------------------------------------------------------------------
  // (任意) 詳細画面に「通知を送信」ボタン
  //   ※ 同一レコードは二重通知防止によりスキップされます。
  //      強制再送したい場合は Supabase の notification_logs から該当行を削除してください。
  // --------------------------------------------------------------------------
  kintone.events.on(['app.record.detail.show'], function (event) {
    if (document.getElementById('notify-resend-button')) return event;
    var space = kintone.app.record.getHeaderMenuSpaceElement();
    if (!space) return event;

    var button = document.createElement('button');
    button.id = 'notify-resend-button';
    button.textContent = '通知を送信';
    button.className = 'kintoneplugin-button-normal';
    button.onclick = function () {
      button.disabled = true;
      button.textContent = '送信中…';
      notifyRegistration_(event.recordId).then(function () {
        button.textContent = '送信しました';
      });
    };
    space.appendChild(button);
    return event;
  });
})();
