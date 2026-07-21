-- Repair legacy PL/pgSQL routines that block whole-schema linting.
--
-- This migration does not touch player rows or game saves. It follows two rules:
--   1. Routines whose backing tables still exist receive the smallest compatible
--      search_path / renamed-column / type fix.
--   2. Routines whose backing schema has already been removed keep their exact
--      public signature, grants, owner and security mode, but fail closed with a
--      clear retirement error instead of referencing missing relations.

DO $migration$
DECLARE
  v_oid OID;
  v_ddl TEXT;
  v_missing_relation TEXT;
  v_retired_name TEXT;
  v_retired_names CONSTANT TEXT[] := ARRAY[
    'award_meiyin_star',
    'batch_update_daily_ranking',
    'cleanup_expired_inbox',
    'cleanup_expired_orders',
    'get_daily_ranking_cached',
    'get_dashboard_stats',
    'get_frontend_bulk_data',
    'get_realtime_leaderboard',
    'get_weekly_leaderboard',
    'import_student_data',
    'increment_usage_stat',
    'insert_rag_log',
    'log_user_activity',
    'process_credit_order',
    'process_payment',
    'refresh_leaderboard_cache',
    'refresh_leaderboard_day',
    'retry_pending_credit_orders',
    'update_rag_log_result'
  ];
BEGIN
  -- Stop rather than retire a routine if a previously removed backing relation
  -- has reappeared. That situation needs a fresh compatibility review.
  SELECT relation_name
  INTO v_missing_relation
  FROM unnest(ARRAY[
    'credit_orders',
    'departments',
    'inbox_messages',
    'leaderboard_cache',
    'leaderboard_daily',
    'meiyin_star_log',
    'orders',
    'rag_logs',
    'ranking_cache',
    'usage_stats',
    'user_activity_logs'
  ]) AS expected_missing(relation_name)
  WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL
  LIMIT 1;

  IF v_missing_relation IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = format(
        'Refusing legacy routine retirement because public.%I exists',
        v_missing_relation
      ),
      HINT = 'Review the restored schema and replace this migration with a compatible implementation.';
  END IF;

  -- Existing-table routines: restore a safe, explicit search path.
  IF to_regprocedure('public.batch_calculate_practice_minutes(date)') IS NOT NULL THEN
    ALTER FUNCTION public.batch_calculate_practice_minutes(date)
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.calculate_leaderboard(date)') IS NOT NULL THEN
    ALTER FUNCTION public.calculate_leaderboard(date)
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.get_student_detail(text)') IS NOT NULL THEN
    ALTER FUNCTION public.get_student_detail(text)
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.get_student_overview_data()') IS NOT NULL THEN
    ALTER FUNCTION public.get_student_overview_data()
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.get_student_schedule(text)') IS NOT NULL THEN
    ALTER FUNCTION public.get_student_schedule(text)
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.refresh_student_summary()') IS NOT NULL THEN
    ALTER FUNCTION public.refresh_student_summary()
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.update_heartbeat(text,integer)') IS NOT NULL THEN
    ALTER FUNCTION public.update_heartbeat(text, integer)
      SET search_path = public, pg_temp;
  END IF;

  -- practice_logs renamed start_time/end_time to session_start/session_end.
  v_oid := to_regprocedure('public.calculate_leaderboard(date)');
  IF v_oid IS NOT NULL THEN
    v_ddl := pg_get_functiondef(v_oid);
    v_ddl := replace(v_ddl, 'pl.end_time', 'pl.session_end');
    v_ddl := replace(v_ddl, 'pl.start_time', 'pl.session_start');
    EXECUTE v_ddl;
  END IF;

  -- rooms.student was replaced by rooms.occupant_student_name.
  v_oid := to_regprocedure('public.update_heartbeat(text,integer)');
  IF v_oid IS NOT NULL THEN
    v_ddl := pg_get_functiondef(v_oid);
    v_ddl := replace(
      v_ddl,
      'AND student IS NOT NULL',
      'AND occupant_student_name IS NOT NULL'
    );
    EXECUTE v_ddl;
  END IF;

  -- Resolve OUT-column names in favour of query columns and match row_number()
  -- (bigint) to the function's documented integer return type.
  v_oid := to_regprocedure('public.calculate_leaderboard_live(date)');
  IF v_oid IS NOT NULL THEN
    v_ddl := pg_get_functiondef(v_oid);
    IF position('#variable_conflict use_column' IN v_ddl) = 0 THEN
      v_ddl := replace(
        v_ddl,
        'AS $function$',
        E'AS $function$\n#variable_conflict use_column'
      );
    END IF;
    v_ddl := replace(v_ddl, 'rk as rank_position', 'rk::integer as rank_position');
    EXECUTE v_ddl;
  END IF;

  -- profiles.last_check_in was renamed to profiles.last_daily_bonus_at.
  v_oid := to_regprocedure('public.check_daily_rewards()');
  IF v_oid IS NOT NULL THEN
    v_ddl := pg_get_functiondef(v_oid);
    v_ddl := replace(v_ddl, 'last_check_in', 'last_daily_bonus_at');
    EXECUTE v_ddl;
  END IF;

  -- The project does not install pg_stat_statements. The call was optional and
  -- unrelated to practice-alert cleanup, so remove only that unavailable call.
  v_oid := to_regprocedure('public.housekeep_practice_alerts()');
  IF v_oid IS NOT NULL THEN
    v_ddl := pg_get_functiondef(v_oid);
    v_ddl := replace(
      v_ddl,
      '  perform pg_stat_statements_reset();',
      '  -- pg_stat_statements reset omitted: extension is not installed.'
    );
    EXECUTE v_ddl;
  END IF;

  -- Removed-schema routines: preserve every external contract detail that
  -- CREATE OR REPLACE keeps, while replacing an already-broken body with an
  -- intentional, stable and lintable failure.
  FOREACH v_retired_name IN ARRAY v_retired_names LOOP
    FOR v_oid IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = v_retired_name
        AND p.prokind = 'f'
    LOOP
      v_ddl := pg_get_functiondef(v_oid);

      IF position('AS $function$' IN v_ddl) = 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '55000',
          MESSAGE = format(
            'Cannot safely replace unexpected definition for public.%I',
            v_retired_name
          );
      END IF;

      v_ddl := split_part(v_ddl, 'AS $function$', 1)
        || 'AS $function$'
        || E'\nBEGIN\n'
        || E'  RAISE EXCEPTION USING\n'
        || E'    ERRCODE = ''55000'',\n'
        || '    MESSAGE = '
        || quote_literal(format(
          'Legacy function public.%I is retired because its backing schema no longer exists',
          v_retired_name
        ))
        || E',\n'
        || E'    HINT = ''Migrate the caller to a currently supported API.'';\n'
        || E'END;\n'
        || '$function$';

      EXECUTE v_ddl;
    END LOOP;
  END LOOP;
END
$migration$;
