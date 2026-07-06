-- Phase 1: オールマイト(kintone AppID: 10)
-- ★ slug は必ず独自の推測困難な値に変更してから実行すること
--    (URLを知っていれば誰でも申請できるため)

insert into public.form_types (slug, name, kintone_app_id, parser_config)
values (
  'am-CHANGE-ME-x7k2q9v4',
  'オールマイト',
  10,
  -- FMT確定後に required_labels を設定する(未設定なら形式チェックは空文字チェックのみ)
  '{"separator": ":", "required_labels": []}'::jsonb
);
