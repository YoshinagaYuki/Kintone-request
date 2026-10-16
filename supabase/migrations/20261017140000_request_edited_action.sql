-- 申請内容の管理者編集:request_histories.action に 'edited'(申請内容の編集)を追加する。
--
-- 【方針】20261017090000 / 120000 と同一の安全方式:
--   (1) 対象は conname='request_histories_action_check' の 1 本だけ。他 CHECK は不変。
--   (2) 定義が「単純な許可値リスト形式」(action = ANY (ARRAY[...]) / action IN (...))であることを検証。
--   (3) 既存の確認済み許可値(11原本 + 手配種別3)をすべて保持。
--   (4) 'edited' を追加。
--   (6) 制約が無い/形式が想定外/確認済み値を満たさない/既知値以外を含む場合は RAISE で停止。
--   (5) 既存値∪追加値を distinct で張り替えるため、再実行しても安全。
--   ・本ファイルは作成のみ。本番適用は内容確認後、SQL Editor で手動実行(supabase db push はしない)。

begin;

do $$
declare
  v_def        text;
  v_existing   text[];
  v_confirmed  text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed'
  ];
  v_universe   text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed',
    'edited'
  ];
  v_additions  text[] := array['edited'];
  v_shape_any  text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*=\s*ANY\s*\(\s*ARRAY\[\s*''[^'']*''(::text)?(\s*,\s*''[^'']*''(::text)?)*\s*\]\s*\)\s*\)+\s*$';
  v_shape_in   text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*IN\s*\(\s*''[^'']*''(\s*,\s*''[^'']*'')*\s*\)\s*\)+\s*$';
  v_unexpected text[];
  v_final      text[];
  v_list       text;
begin
  select pg_get_constraintdef(oid)
    into v_def
  from pg_constraint
  where conrelid = 'public.request_histories'::regclass
    and contype = 'c'
    and conname = 'request_histories_action_check';

  if v_def is null then
    raise exception 'request_histories_action_check が見つかりません。想定外のため中止します。';
  end if;

  if not (v_def ~ v_shape_any or v_def ~ v_shape_in) then
    raise exception
      'request_histories_action_check が想定した単純な許可値リスト形式ではありません。現定義: %。中止します。', v_def;
  end if;

  v_existing := array(
    select m[1] from regexp_matches(v_def, '''([^'']+)''', 'g') as m
  );

  if not (v_confirmed <@ v_existing) then
    raise exception
      'request_histories_action_check が確認済み許可値を満たしません。現定義: %。中止します。', v_def;
  end if;

  select array_agg(e) into v_unexpected
  from unnest(v_existing) as e
  where e <> all (v_universe);
  if v_unexpected is not null then
    raise exception
      'request_histories_action_check に想定外の許可値 % が含まれます。中止します。', v_unexpected;
  end if;

  select array_agg(distinct v order by v)
    into v_final
  from unnest(v_existing || v_additions) as v;

  select string_agg(quote_literal(v), ', ')
    into v_list
  from unnest(v_final) as v;

  alter table public.request_histories
    drop constraint request_histories_action_check;
  execute format(
    'alter table public.request_histories
       add constraint request_histories_action_check check (action in (%s))',
    v_list
  );
end $$;

commit;
