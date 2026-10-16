-- オールマイトの手配種別(配送/集荷)を申請ごとに保存できるようにする。
--
-- ・requests に allmight_delivery_arrangement / allmight_pickup_arrangement を追加。
--   値は 'normal'(通常配送)/ 'charter'(チャーター)。null=未設定=通常配送扱い。
--   申請者は入力せず常に通常配送。管理者(オールマイト担当)が申請詳細で変更する。
-- ・変更履歴を request_histories に残せるよう、action の CHECK に手配種別関連を追加する。
--
-- 【安全性】
--   ・ファイル全体を BEGIN; ... COMMIT; で囲む。途中で RAISE/エラーが起きた場合は、
--     列追加を含めてすべてロールバックされる(部分適用されない)。
--   ・列追加は NULL 許容の追加のみ。てずくーる申請・既存データ・請求アプリに影響しない。
--   ・action の CHECK は「request_histories_action_check」という名前の 1 本だけを対象。
--     他の CHECK 制約には一切触れない。
--   ・既存許可値の検証に加え、定義が「単純な許可値リスト形式」であることも検証する。
--   ・再実行しても壊れないよう if not exists / drop if exists / distinct 併合を用いる。
--   ・本ファイルは作成のみ。本番適用は確認後、SQL Editor で手動実行(supabase db push はしない)。

begin;

-- 1) 手配種別の保存列(オールマイト用)
alter table public.requests
  add column if not exists allmight_delivery_arrangement text;
alter table public.requests
  add column if not exists allmight_pickup_arrangement text;

-- 手配種別列の CHECK(normal/charter または NULL)。
-- 【重要】同名の CHECK が既にある場合、無条件に DROP せず「想定どおりか」を先に検証する。
--   検証は 2 段階で厳密に行う(トークンの有無だけに依存しない):
--     (a) 定義全体が「(col IS NULL) OR (col = ANY (ARRAY[...]))」または
--         「(col IS NULL) OR (col IN (...))」という単純形に完全一致すること
--         (完全一致なので ... OR true / AND / 別カラム / IS NOT NULL 等の複合条件は弾く)。
--         pg_get_constraintdef の ANY(ARRAY[...]) 形式・型キャスト((col)::text 等)に対応。
--     (b) 許可リテラルがちょうど {normal, charter} の 2 種であること。
--   両方を満たせば変更しない(DROP しない)。満たさなければ DROP せず RAISE で停止する。
do $$
declare
  v_col   text;
  v_cname text;
  v_def   text;
  v_lits  text[];
  v_op    text;  -- 左オペランド: col / (col) / col::text / (col)::text
  v_shape text;  -- 許容する定義の完全一致パターン
begin
  foreach v_col in array array['allmight_delivery_arrangement', 'allmight_pickup_arrangement']
  loop
    v_cname := 'requests_' || v_col || '_check';

    select pg_get_constraintdef(oid)
      into v_def
    from pg_constraint
    where conrelid = 'public.requests'::regclass
      and contype = 'c'
      and conname = v_cname;

    if v_def is null then
      -- (要件1) 無ければ新規作成(既存を壊さない)
      execute format(
        'alter table public.requests
           add constraint %I check (%I is null or %I in (''normal'', ''charter''))',
        v_cname, v_col, v_col
      );
    else
      -- (要件2,3,8) 既存あり: 定義全体を単純形へ完全一致で検証(無条件 DROP はしない)。
      v_op := '\(?\s*' || v_col || '\s*\)?\s*(::text)?';
      v_shape :=
        '^CHECK\s*\(+\s*'
        || '\(?\s*' || v_op || '\s+IS\s+NULL\s*\)?'          -- (col IS NULL)
        || '\s+OR\s+'
        || '\(?\s*' || v_op || '\s*('                        -- (col ...
          || '=\s*ANY\s*\(\s*ARRAY\[\s*''[^'']*''(::text)?(\s*,\s*''[^'']*''(::text)?)*\s*\]\s*\)'
          || '|IN\s*\(\s*''[^'']*''(\s*,\s*''[^'']*'')*\s*\)'
        || ')\s*\)?'
        || '\s*\)+\s*$';

      if v_def !~ v_shape then
        raise exception
          'requests.% の既存 CHECK (%) が想定した単純形ではありません(複合条件等)。現定義: %。DROP せず中止します。',
          v_col, v_cname, v_def;
      end if;

      -- (要件2) 許可リテラルがちょうど {normal, charter} であること
      v_lits := array(select m[1] from regexp_matches(v_def, '''([^'']+)''', 'g') as m);
      if not (v_lits <@ array['normal', 'charter']
              and array['normal', 'charter'] <@ v_lits) then
        raise exception
          'requests.% の既存 CHECK (%) の許可値が normal/charter と一致しません。現定義: %。DROP せず中止します。',
          v_col, v_cname, v_def;
      end if;

      -- (要件5) 想定どおり → 変更不要(DROP も再作成もしない。再実行もここで安全に通過)
    end if;
  end loop;
end $$;

-- 2) request_histories_action_check(名前指定の 1 本のみ)の許可値を拡張する。
--
-- 【方針】
--   (1) 対象は conname='request_histories_action_check' の 1 本だけ。他 CHECK は不変。
--   (2) 定義が「単純な許可値リスト形式」であることを検証する。
--       許容形式は次の 2 つのみ:
--         ・action = ANY (ARRAY['...'::text, ...])   ← 本番で確認済みの形式
--         ・action IN ('...', ...)                   ← IN を書いた場合の正規化形式
--       複合条件(AND/OR)・別演算子(<>,<,>,LIKE 等)・関数・別カラム参照を含む場合は停止。
--   (3) 本番確認済みの既存 11 種をすべて保持する。
--   (4) 今回の追加値(arrangement_changed / arrangement_sync_failed)を足す。
--       ※ arrangement_synced は 120000 で追加。
--   (6) 制約が無い/形式が想定外/確認済み 11 種を満たさない/既知 14 種以外を含む場合は、
--       何も変更せず RAISE EXCEPTION で停止する(トランザクション全体がロールバック)。
--   (5)(7) 既存値∪追加値を distinct で張り替えるため、順番実行・再実行とも安全。
--
--   本番確認値(11): submitted / approved / rejected / kintone_registered /
--     kintone_failed / numbered / shipping_synced / notified / notify_failed /
--     email_sent / email_failed
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
  -- 既知で許容される全許可値(確認済み 11 + 手配種別 3)。これ以外は想定外。
  v_universe   text[] := array[
    'submitted', 'approved', 'rejected',
    'kintone_registered', 'kintone_failed',
    'numbered', 'shipping_synced',
    'notified', 'notify_failed',
    'email_sent', 'email_failed',
    'arrangement_changed', 'arrangement_synced', 'arrangement_sync_failed'
  ];
  -- このマイグレーションで追加する値
  v_additions  text[] := array['arrangement_changed', 'arrangement_sync_failed'];
  -- 許容する定義形式(単純な許可値リストのみ)。
  -- 左オペランドは action / (action) / action::text / (action)::text をすべて許容する
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
