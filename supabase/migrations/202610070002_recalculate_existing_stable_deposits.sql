-- Recalculate active "稳稳存" deposits after the three-day, full-balance
-- interest rule became effective. The adjustment is monotonic: it only adds
-- interest that was missing under the old 2,000-gold principal calculation.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.timber_bank_accounts') IS NULL
     OR to_regclass('public.timber_bank_ledger') IS NULL
     OR to_regprocedure('public.timber_bank_advance_quotes()') IS NULL THEN
    RAISE EXCEPTION '请先执行银行基础迁移和 202610070001_fix_timber_bank_stable_interest.sql';
  END IF;
END;
$$;

-- A migration can be pasted into the SQL editor more than once. Keep a
-- database-side marker so the compensation ledger entry is never duplicated.
CREATE TABLE IF NOT EXISTS timber_bank_stable_recalc_runs (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE timber_bank_stable_recalc_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON timber_bank_stable_recalc_runs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION timber_bank_recalculate_existing_stable()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_version CONSTANT TEXT := '202610070002_stable_recalc_v1';
  v_claimed INTEGER;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_account timber_bank_accounts%ROWTYPE;
  v_start_at TIMESTAMPTZ;
  v_term_end TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
  v_cursor TIMESTAMPTZ;
  v_boundary TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_segment_start TIMESTAMPTZ;
  v_day DATE;
  v_rate INTEGER;
  v_old_stable BIGINT;
  v_start_balance NUMERIC(30, 10);
  v_balance NUMERIC(30, 10);
  v_basis NUMERIC(30, 10);
  v_recorded_interest BIGINT;
  v_expected_interest BIGINT;
  v_interest BIGINT;
  v_missing BIGINT;
  v_new_basis NUMERIC(30, 10);
  v_processed INTEGER := 0;
BEGIN
  -- Serialize the one-time account rewrite with bank transactions.
  PERFORM pg_advisory_xact_lock(80100503);

  INSERT INTO timber_bank_stable_recalc_runs(version)
  VALUES (v_version)
  ON CONFLICT (version) DO NOTHING;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN 0;
  END IF;

  PERFORM timber_bank_advance_quotes();

  FOR v_account IN
    SELECT *
    FROM timber_bank_accounts
    WHERE stable_term_end IS NOT NULL
      AND stable_gold > 0
    ORDER BY student_id
    FOR UPDATE
  LOOP
    -- The latest deposit/renewal starts the currently active savings period.
    -- A legacy account without a ledger row falls back to its accrual cursor.
    SELECT l.created_at
    INTO v_start_at
    FROM timber_bank_ledger l
    WHERE l.student_id = v_account.student_id
      AND l.action IN ('stable_deposit', 'stable_renew')
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT 1;
    v_start_at := COALESCE(v_start_at, v_account.accrual_at);
    IF v_start_at IS NULL THEN
      CONTINUE;
    END IF;
    v_start_at := LEAST(v_start_at, v_now);

    v_term_end := v_start_at + INTERVAL '3 days';
    v_cutoff := LEAST(v_now, v_term_end);
    v_old_stable := v_account.stable_gold;

    -- Stable interest is credited into stable_gold. Remove all interest
    -- already recorded in this period to recover the period's starting balance.
    SELECT COALESCE(SUM(l.amount), 0)::BIGINT
    INTO v_recorded_interest
    FROM timber_bank_ledger l
    WHERE l.student_id = v_account.student_id
      AND l.action = 'stable_interest'
      AND l.created_at >= v_start_at;

    v_start_balance := GREATEST(0, v_old_stable - v_recorded_interest);
    v_balance := v_start_balance;
    v_expected_interest := 0;
    v_basis := 0;
    v_cursor := v_start_at;
    v_day := (v_cursor AT TIME ZONE 'Asia/Shanghai')::DATE;

    -- Replay the same day-boundary calculation used by timber_bank_accrue,
    -- including daily compounding and the final partial day at maturity.
    WHILE v_cursor < v_cutoff LOOP
      v_boundary := ((v_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai');
      v_end := LEAST(v_cutoff, v_boundary);
      IF v_end > v_cursor THEN
        v_basis := v_basis + v_balance
          * EXTRACT(EPOCH FROM (v_end - v_cursor)) / 86400;
        v_cursor := v_end;
      END IF;

      IF v_cursor >= v_boundary THEN
        SELECT q.stable_rate_bps
        INTO v_rate
        FROM timber_bank_quotes q
        WHERE q.quote_date = v_day;
        IF v_rate IS NULL THEN
          RAISE EXCEPTION '稳稳存重算缺少 % 的日利率，请先补齐银行行情', v_day;
        END IF;
        v_interest := floor(v_basis * v_rate / 10000)::BIGINT;
        v_expected_interest := v_expected_interest + v_interest;
        v_balance := v_balance + v_interest;
        v_basis := 0;
        v_day := v_day + 1;
      END IF;
    END LOOP;

    IF v_cutoff >= v_term_end AND v_basis > 0 THEN
      SELECT q.stable_rate_bps
      INTO v_rate
      FROM timber_bank_quotes q
      WHERE q.quote_date = v_day;
      IF v_rate IS NULL THEN
        RAISE EXCEPTION '稳稳存重算缺少 % 的日利率，请先补齐银行行情', v_day;
      END IF;
      v_interest := floor(v_basis * v_rate / 10000)::BIGINT;
      v_expected_interest := v_expected_interest + v_interest;
      v_basis := 0;
    END IF;

    -- Preserve any interest already paid. Only the missing difference is
    -- added, which also makes the result safe if old data was over-credited.
    v_missing := GREATEST(0, v_expected_interest - v_recorded_interest);
    IF v_missing > 0 THEN
      IF v_old_stable > 9223372036854775807 - v_missing THEN
        RAISE EXCEPTION '稳稳存余额超出 BIGINT 上限';
      END IF;
      UPDATE timber_bank_accounts
      SET stable_gold = stable_gold + v_missing,
          updated_at = v_now
      WHERE student_id = v_account.student_id;
      INSERT INTO timber_bank_ledger(
        student_id, request_id, action, amount, stable_delta, quote_date
      )
      VALUES (
        v_account.student_id, gen_random_uuid(), 'stable_interest',
        v_missing, v_missing,
        (v_now AT TIME ZONE 'Asia/Shanghai')::DATE
      );
      v_old_stable := v_old_stable + v_missing;
    END IF;

    -- Existing periods now mature exactly three days after their original
    -- deposit/renewal. Keep today's partial basis when the new period is open;
    -- a matured period has no remaining basis.
    IF v_now < v_term_end THEN
      v_boundary := (v_day::TIMESTAMP AT TIME ZONE 'Asia/Shanghai');
      v_segment_start := GREATEST(v_start_at, v_boundary);
      v_new_basis := v_old_stable
        * GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_segment_start))) / 86400;
      UPDATE timber_bank_accounts
      SET stable_term_end = v_term_end,
          accrued_basis = v_new_basis,
          accrual_at = v_now,
          accrual_day = v_day,
          updated_at = v_now
      WHERE student_id = v_account.student_id;
    ELSE
      UPDATE timber_bank_accounts
      SET stable_term_end = v_term_end,
          accrued_basis = 0,
          accrual_at = v_term_end,
          accrual_day = (v_term_end AT TIME ZONE 'Asia/Shanghai')::DATE,
          updated_at = v_now
      WHERE student_id = v_account.student_id;
    END IF;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_recalculate_existing_stable() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM timber_bank_recalculate_existing_stable();
END;
$$;

COMMIT;
