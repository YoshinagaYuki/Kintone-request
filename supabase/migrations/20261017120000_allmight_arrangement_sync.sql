-- オールマイト手配種別:承認後(kintone登録済み)の同期状態を保持する。
--
-- ・allmight_arrangement_sync_failed: 直近のkintone同期が失敗したか。
--     true のとき管理画面に警告を出し「再同期」ボタンを表示する。再同期成功で false に戻す。
--     未登録・未変更・同期成功時は false。
-- ・request_histories_action_check に 'arrangement_synced'(再同期成功)を追加。
--
-- 【安全性】
--   ・ファイル全体を BEGIN; ... COMMIT; で囲む。途中で RAISE/エラーが起きた場合は、
--     列追加を含めてすべてロールバックされる(部分適用されない)。
--   ・NULL/既定値での列追加のみ。既存データ・てずくーる・請求アプリに影響しない。
--   ・action の CHECK は「request_histories_action_check」の 1 本だけを対象にし、他 CHECK は
--     一切変更しない。既存許可値の検証に加え、定義が単純な許可値リスト形式であることも検証する。
--   ・想定外なら RAISE で停止。再実行可。本番適用は確認後に手動実行。

begin;

alter table public.requests
  add column if not exists allmight_arrangement_sync_failed boolean not null default false;

-- request_histories_action_check(名前指定の 1 本のみ)に arrangement_synced を追加。
--
-- 【方針】090000 と同一。
--   (1) 対象は conname='request_histories_action_check' の 1 本だけ。他 CHECK は不変。
--   (2) 定義が「単純な許可値リスト形式」であることを検証する。
--       許容形式は action = ANY (ARRAY[...]) / action IN (...) の 2 つのみ。
--       複合条件(AND/OR)・別演算子・関数・別カラム参照を含む場合は停止。
--   (3) 本番確認済みの既存 11 種をすべて保持する。
--   (4) 手配種別 3 種(arrangement_changed / arrangement_synced / arrangement_sync_failed)を
--       併合する。090000 で追加済みの 2 種と重複しても distinct で安全。
--   (6) 制約が無い/形式が想定外/確認済み 11 種を満たさない/既知 14 種以外を含む場合は、
--       何も変更せず RAISE EXCEPTION で停止する(トランザクション全体がロールバック)。
--   (5)(7) 既存値∪追加値を distinct で張り替えるため、順番実行・再実行とも安全。
do $$
declare
  v_def        text;
  v_existing   text[];
  v_confirmed  text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed'
  ];
  v_universe   text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed'
  ];
  -- このマイグレーションで追加する値(手配種別 3 種。120000 単独適用でも完結するよう全 3 種)
  v_additions  text[] := array[
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed'
  ];
  -- 左オペランドは action / (action) / action::text / (action)::text をすべて許容
  -- (pg_get_constraintdef による型キャスト正規化に対応)。
  v_shape_any  text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*=\s*ANY\s*\(\s*ARRAY\[\s*''[^'']*''(::text)?(\s*,\s*''[^'']*''(::text)?)*\s*\]\s*\)\s*\)+\s*$';
  v_shape_in   text := '^CHECK\s*\(+\s*\(?\s*action\s*\)?\s*(::text)?\s*IN\s*\(\s*''[^'']*''(\s*,\s*''[^'']*'')*\s*\)\s*\)+\s*$';
  v_unexpected text[];
  v_final      text[];
  v_list       text;
begin
  -- (1) 名前で 1 本だけ取得(他の CHECK は参照しない)
  select pg_get_constraintdef(oid)
    into v_def
  from pg_constraint
  where conrelid = 'public.request_histories'::regclass
    and contype = 'c'
    and conname = 'request_histories_action_check';

  -- (6) 存在しない = 想定外。変更せず停止。
  if v_def is null then
    raise exception
      'request_histories_action_check が見つかりません。想定外のため中止します。定義を手動確認してください。';
  end if;

  -- (2)(6) 定義が「単純な許可値リスト形式」でなければ停止(複合条件・別演算子・関数等)。
  if not (v_def ~ v_shape_any or v_def ~ v_shape_in) then
    raise exception
      'request_histories_action_check の定義が想定した単純な許可値リスト形式ではありません。現定義: %。変更せず中止します。', v_def;
  end if;

  -- 指定した 1 本の定義からリテラル(許可値)を抽出
  v_existing := array(
    select m[1] from regexp_matches(v_def, '''([^'']+)''', 'g') as m
  );

  -- (6) 確認済み 11 種をすべて含まない定義は想定外 → 停止
  if not (v_confirmed <@ v_existing) then
    raise exception
      'request_histories_action_check の定義が想定外です(確認済み 11 種を満たしません)。現定義: %。変更せず中止します。', v_def;
  end if;

  -- (6) 既知 14 種以外の値を含む場合も想定外 → 停止
  select array_agg(e)
    into v_unexpected
  from unnest(v_existing) as e
  where e <> all (v_universe);

  if v_unexpected is not null then
    raise exception
      'request_histories_action_check に想定外の許可値 % が含まれます。変更せず中止します。', v_unexpected;
  end if;

  -- (3)(4) 既存値をすべて保持しつつ追加値を併合(重複排除)
  select array_agg(distinct v order by v)
    into v_final
  from unnest(v_existing || v_additions) as v;

  select string_agg(quote_literal(v), ', ')
    into v_list
  from unnest(v_final) as v;

  -- (1)(5) 名前指定の 1 本だけを張り替え(検証通過後にのみ drop する)
  alter table public.request_histories
    drop constraint request_histories_action_check;
  execute format(
    'alter table public.request_histories
       add constraint request_histories_action_check check (action in (%s))',
    v_list
  );
end $$;

commit;
