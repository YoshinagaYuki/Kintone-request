-- 管理番号採番・配送管理連携(docs/kintone-numbering-design.md)

-- 採番した管理番号を保持(管理画面表示用。マスタはkintone App10側)
alter table public.requests add column management_no text;

-- 履歴アクションを追加: numbered(採番+App10更新) / shipping_synced(App11転記)
alter table public.request_histories drop constraint request_histories_action_check;
alter table public.request_histories add constraint request_histories_action_check
  check (action in (
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed'
  ));
