-- Timber Bank market v2: four-hour quotes, unlimited position size, and
-- cost-basis reporting for stock-like partial buys and sells.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('timber_bank_advance_quotes()') IS NULL
     OR to_regprocedure('timber_bank_accrue(uuid)') IS NULL
     OR to_regprocedure('timber_bank_snapshot(uuid)') IS NULL
     OR to_regprocedure('timber_bank_transact(uuid,text,text,uuid,text,integer)') IS NULL
     OR to_regprocedure('settle_student_playtime_session(uuid,text,text)') IS NULL
     OR to_regprocedure('student_playtime_lease_is_valid(uuid,text,boolean)') IS NULL THEN
    RAISE EXCEPTION '请先执行 202610050001_timber_bank.sql 和 202610060001_timber_bank_session_only.sql，再执行本迁移';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS timber_bank_market_quotes (
  quote_slot TIMESTAMPTZ PRIMARY KEY,
  market_price NUMERIC(30, 12) NOT NULL CHECK (market_price > 0),
  market_change_bps INT NOT NULL CHECK (market_change_bps BETWEEN -1000 AND 1000),
  market_regime TEXT NOT NULL CHECK (market_regime IN ('up', 'sideways', 'down')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS timber_bank_market_quotes_recent
  ON timber_bank_market_quotes(quote_slot DESC);
ALTER TABLE timber_bank_market_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON timber_bank_market_quotes FROM PUBLIC, anon, authenticated;

ALTER TABLE timber_bank_accounts
  DROP CONSTRAINT IF EXISTS timber_bank_accounts_market_cost_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'timber_bank_accounts'::regclass
      AND conname = 'timber_bank_accounts_market_cost_nonnegative_check'
  ) THEN
    ALTER TABLE timber_bank_accounts
      ADD CONSTRAINT timber_bank_accounts_market_cost_nonnegative_check CHECK (market_cost >= 0);
  END IF;
END;
$$;

-- Add new fields as nullable first so existing quote rows can be migrated
-- before NOT NULL and CHECK constraints are attached.
ALTER TABLE timber_bank_market_quotes
  ADD COLUMN IF NOT EXISTS volatility_bps INT,
  ADD COLUMN IF NOT EXISTS signal TEXT,
  ADD COLUMN IF NOT EXISTS event_label TEXT;

ALTER TABLE timber_bank_market_quotes
  DROP CONSTRAINT IF EXISTS timber_bank_market_quotes_volatility_bps_check,
  DROP CONSTRAINT IF EXISTS timber_bank_market_quotes_signal_check;

UPDATE timber_bank_market_quotes
SET
  volatility_bps = GREATEST(260, LEAST(1000, 410 + floor(abs(market_change_bps) * 0.35)::INT)),
  signal = CASE
    WHEN market_regime = 'up' THEN 'momentum_up'
    WHEN market_regime = 'down' THEN 'momentum_down'
    ELSE 'range'
  END,
  event_label = NULL
WHERE volatility_bps IS NULL
   OR volatility_bps NOT BETWEEN 200 AND 1000
   OR signal IS NULL
   OR signal NOT IN ('momentum_up', 'momentum_down', 'pullback', 'range', 'event');

ALTER TABLE timber_bank_market_quotes
  ALTER COLUMN volatility_bps SET DEFAULT 450,
  ALTER COLUMN volatility_bps SET NOT NULL,
  ALTER COLUMN signal SET DEFAULT 'range',
  ALTER COLUMN signal SET NOT NULL;

ALTER TABLE timber_bank_market_quotes
  ADD CONSTRAINT timber_bank_market_quotes_volatility_bps_check CHECK (volatility_bps BETWEEN 200 AND 1000),
  ADD CONSTRAINT timber_bank_market_quotes_signal_check CHECK (signal IN ('momentum_up', 'momentum_down', 'pullback', 'range', 'event'));

CREATE OR REPLACE FUNCTION timber_bank_advance_quotes()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_local TIMESTAMP := v_now AT TIME ZONE 'Asia/Shanghai';
  v_today DATE := v_local::DATE;
  v_current_slot TIMESTAMPTZ := (
    date_trunc('day', v_local)
      + floor(extract(hour FROM v_local) / 4)::INT * INTERVAL '4 hours'
  ) AT TIME ZONE 'Asia/Shanghai';
  v_daily_last timber_bank_quotes%ROWTYPE;
  v_market_last timber_bank_market_quotes%ROWTYPE;
  v_date DATE;
  v_slot TIMESTAMPTZ;
  v_roll DOUBLE PRECISION;
  v_noise DOUBLE PRECISION;
  v_momentum DOUBLE PRECISION;
  v_reversion DOUBLE PRECISION;
  v_event_roll DOUBLE PRECISION;
  v_shock DOUBLE PRECISION;
  v_regime TEXT;
  v_signal TEXT;
  v_event_label TEXT;
  v_volatility INT;
  v_change INT;
BEGIN
  PERFORM pg_advisory_xact_lock(80100501);

  -- Daily quotes remain the stable-deposit rate source.
  SELECT * INTO v_daily_last
  FROM timber_bank_quotes
  WHERE quote_date <= v_today
  ORDER BY quote_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO timber_bank_quotes(quote_date, market_price, market_change_bps, market_regime, stable_rate_bps)
    VALUES (v_today, 100, 0, 'sideways', floor(random() * 201)::INT)
    RETURNING * INTO v_daily_last;
  END IF;

  v_date := v_daily_last.quote_date + 1;
  WHILE v_date <= v_today LOOP
    INSERT INTO timber_bank_quotes(quote_date, market_price, market_change_bps, market_regime, stable_rate_bps)
    VALUES (v_date, v_daily_last.market_price, 0, 'sideways', floor(random() * 201)::INT)
    RETURNING * INTO v_daily_last;
    v_date := v_date + 1;
  END LOOP;

  -- Market quotes roll every four hours in China time. Missed slots are
  -- filled on the next bank request so the chart remains continuous.
  SELECT * INTO v_market_last
  FROM timber_bank_market_quotes
  WHERE quote_slot <= v_current_slot
  ORDER BY quote_slot DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO timber_bank_market_quotes(quote_slot, market_price, market_change_bps, market_regime, volatility_bps, signal, event_label)
    VALUES (v_current_slot, 100, 0, 'sideways', 420, 'range', NULL)
    RETURNING * INTO v_market_last;
  END IF;

  v_slot := v_market_last.quote_slot + INTERVAL '4 hours';
  WHILE v_slot <= v_current_slot LOOP
    -- Strategy model:
    -- 1) momentum keeps a run readable, 2) mean reversion creates pullbacks,
    -- 3) volatility clusters after a large move, and 4) rare events create
    -- memorable but bounded surprises. No branch guarantees the next sign.
    v_roll := random();
    v_noise := random() * 2 - 1;
    v_momentum := CASE v_market_last.market_regime WHEN 'up' THEN 0.34 WHEN 'down' THEN -0.34 ELSE 0 END;
    v_reversion := CASE
      WHEN v_market_last.market_price > 135 THEN -0.28
      WHEN v_market_last.market_price < 75 THEN 0.28
      ELSE 0
    END;
    v_event_roll := random();
    v_shock := CASE
      WHEN v_event_roll < 0.035 THEN (CASE WHEN random() < 0.5 THEN 1 ELSE -1 END) * (700 + floor(random() * 301))
      ELSE 0
    END;
    v_volatility := LEAST(1000, GREATEST(260, floor(
      410 + abs(v_market_last.market_change_bps) * 0.35 + CASE WHEN v_shock <> 0 THEN 220 ELSE 0 END + 0.5
    )::INT));
    v_change := floor(v_momentum * v_volatility + v_reversion * v_volatility + v_noise * v_volatility * 0.62 + v_shock + 0.5)::INT;
    v_change := LEAST(1000, GREATEST(-1000, v_change));
    IF abs(v_change) < 200 THEN
      v_change := CASE WHEN v_change < 0 THEN -200 ELSE 200 END;
    END IF;
    IF v_market_last.market_price < 1 THEN v_change := abs(v_change); END IF;
    v_regime := CASE
      WHEN v_change >= 140 THEN 'up'
      WHEN v_change <= -140 THEN 'down'
      ELSE 'sideways'
    END;
    v_signal := CASE
      WHEN v_shock <> 0 THEN 'event'
      WHEN v_market_last.market_regime = 'up' AND v_change < 0 THEN 'pullback'
      WHEN v_market_last.market_regime = 'down' AND v_change > 0 THEN 'pullback'
      WHEN v_regime = 'up' THEN 'momentum_up'
      WHEN v_regime = 'down' THEN 'momentum_down'
      ELSE 'range'
    END;
    v_event_label := CASE
      WHEN v_shock > 0 THEN '营地订单增加'
      WHEN v_shock < 0 THEN '商路遇到风雨'
      ELSE NULL
    END;
    INSERT INTO timber_bank_market_quotes(quote_slot, market_price, market_change_bps, market_regime, volatility_bps, signal, event_label)
    VALUES (
      v_slot,
      v_market_last.market_price * (1 + v_change / 10000.0),
      v_change,
      v_regime,
      v_volatility,
      v_signal,
      v_event_label
    ) RETURNING * INTO v_market_last;
    v_slot := v_slot + INTERVAL '4 hours';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_snapshot(p_student_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'walletGold', u.gold,
    'stableGold', a.stable_gold,
    'stableTermEnd', a.stable_term_end,
    'stableTermMatured', a.stable_term_end IS NOT NULL AND clock_timestamp() >= a.stable_term_end,
    'stableInterestCap', 2000,
    'stableRateBps', daily_quote.stable_rate_bps,
    'marketUnits', a.market_units,
    'marketCost', a.market_cost,
    'marketAveragePrice', CASE WHEN a.market_units > 0 THEN a.market_cost / a.market_units ELSE 0 END,
    'marketValue', floor(a.market_units * market_quote.market_price)::BIGINT,
    'marketUnrealizedPnl', floor(a.market_units * market_quote.market_price)::BIGINT - a.market_cost,
    'marketPrice', market_quote.market_price,
    'marketChangeBps', market_quote.market_change_bps,
    'marketQuoteSlot', market_quote.quote_slot,
    'marketNextChangeAt', market_quote.quote_slot + INTERVAL '4 hours',
    'marketWaveHours', 4,
    'marketSignal', market_quote.signal,
    'marketVolatilityBps', market_quote.volatility_bps,
    'marketEventLabel', market_quote.event_label,
    'quoteDate', daily_quote.quote_date,
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', h.quote_slot,
        'price', h.market_price,
        'changeBps', h.market_change_bps,
        'signal', h.signal,
        'volatilityBps', h.volatility_bps,
        'eventLabel', h.event_label
      ) ORDER BY h.quote_slot)
      FROM (
        SELECT quote_slot, market_price, market_change_bps, signal, volatility_bps, event_label
        FROM timber_bank_market_quotes
        WHERE quote_slot <= market_quote.quote_slot
        ORDER BY quote_slot DESC
        LIMIT 180
      ) h
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'action', l.action,
        'amount', l.amount,
        'walletDelta', l.wallet_delta,
        'stableDelta', l.stable_delta,
        'unitsDelta', l.units_delta,
        'date', l.created_at
      ) ORDER BY l.id DESC)
      FROM (
        SELECT * FROM timber_bank_ledger
        WHERE student_id = p_student_id
        ORDER BY id DESC
        LIMIT 12
      ) l
    ), '[]'::jsonb)
  )
  FROM users u
  JOIN timber_bank_accounts a ON a.student_id = u.id
  CROSS JOIN LATERAL (
    SELECT * FROM timber_bank_quotes
    WHERE quote_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE
    LIMIT 1
  ) daily_quote
  CROSS JOIN LATERAL (
    SELECT * FROM timber_bank_market_quotes
    WHERE quote_slot <= clock_timestamp()
    ORDER BY quote_slot DESC
    LIMIT 1
  ) market_quote
  WHERE u.id = p_student_id;
$$;

CREATE OR REPLACE FUNCTION timber_bank_transact(
  p_student_id UUID, p_session_id TEXT, p_password TEXT, p_request_id UUID,
  p_action TEXT, p_amount INT DEFAULT 0
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_wallet INT;
  v_account timber_bank_accounts%ROWTYPE;
  v_price NUMERIC(30,12);
  v_wallet_delta BIGINT := 0;
  v_stable_delta BIGINT := 0;
  v_units_delta NUMERIC(24,8) := 0;
  v_cost_delta BIGINT := 0;
  v_payout BIGINT := 0;
  v_units NUMERIC(24,8);
  v_existing timber_bank_ledger%ROWTYPE;
  v_term_end TIMESTAMPTZ;
  v_reset_accrual BOOLEAN := FALSE;
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
BEGIN
  IF p_request_id IS NULL OR p_action NOT IN (
    'stable_deposit', 'stable_withdraw', 'stable_renew',
    'market_buy', 'market_sell', 'market_sell_all'
  ) THEN
    RAISE EXCEPTION '无效银行操作';
  END IF;
  IF p_action IN ('market_sell_all', 'stable_renew', 'stable_withdraw') THEN
    IF p_amount IS DISTINCT FROM 0 THEN RAISE EXCEPTION '无效银行操作金额'; END IF;
  ELSIF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '请输入正整数金币';
  END IF;

  PERFORM timber_bank_check_session(p_student_id, p_session_id, p_password);
  SELECT gold INTO v_wallet FROM users WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  PERFORM timber_bank_advance_quotes();
  PERFORM timber_bank_accrue(p_student_id);
  SELECT * INTO STRICT v_account FROM timber_bank_accounts WHERE student_id = p_student_id FOR UPDATE;
  v_term_end := v_account.stable_term_end;
  SELECT market_price INTO STRICT v_price
  FROM timber_bank_market_quotes
  WHERE quote_slot <= clock_timestamp()
  ORDER BY quote_slot DESC
  LIMIT 1;

  SELECT * INTO v_existing FROM timber_bank_ledger
  WHERE student_id = p_student_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.action <> p_action OR (
      p_action NOT IN ('market_sell_all', 'stable_renew', 'stable_withdraw')
      AND v_existing.amount <> p_amount
    ) THEN
      RAISE EXCEPTION '交易编号已被其他操作使用';
    END IF;
    RETURN timber_bank_snapshot(p_student_id);
  END IF;

  CASE p_action
    WHEN 'stable_deposit' THEN
      IF v_account.stable_term_end IS NOT NULL THEN RAISE EXCEPTION '请先取出或续存当前存单'; END IF;
      IF v_wallet < p_amount THEN RAISE EXCEPTION '钱包金币不足'; END IF;
      v_wallet_delta := -p_amount;
      v_stable_delta := p_amount;
      v_term_end := clock_timestamp() + INTERVAL '7 days';
      v_reset_accrual := TRUE;
    WHEN 'stable_withdraw' THEN
      IF v_account.stable_term_end IS NULL OR clock_timestamp() < v_account.stable_term_end THEN RAISE EXCEPTION '稳稳存尚未到期'; END IF;
      v_wallet_delta := v_account.stable_gold;
      v_stable_delta := -v_account.stable_gold;
      v_term_end := NULL;
      v_reset_accrual := TRUE;
    WHEN 'stable_renew' THEN
      IF v_account.stable_term_end IS NULL OR clock_timestamp() < v_account.stable_term_end THEN RAISE EXCEPTION '稳稳存尚未到期'; END IF;
      v_term_end := clock_timestamp() + INTERVAL '7 days';
      v_reset_accrual := TRUE;
    WHEN 'market_buy' THEN
      IF v_wallet < p_amount THEN RAISE EXCEPTION '钱包金币不足'; END IF;
      v_units_delta := ROUND(p_amount / v_price, 8);
      IF v_units_delta <= 0 THEN RAISE EXCEPTION '投入太少，无法购买份额'; END IF;
      v_wallet_delta := -p_amount;
      v_cost_delta := p_amount;
    WHEN 'market_sell', 'market_sell_all' THEN
      IF v_account.market_units <= 0 THEN RAISE EXCEPTION '目前没有商队份额'; END IF;
      v_units := CASE
        WHEN p_action = 'market_sell_all' OR p_amount >= floor(v_account.market_units * v_price)
          THEN v_account.market_units
        ELSE LEAST(v_account.market_units, ROUND(p_amount / v_price, 8))
      END;
      v_payout := floor(v_units * v_price)::BIGINT;
      IF v_units <= 0 THEN RAISE EXCEPTION '卖出金额太小，请增加金额或全部卖出'; END IF;
      v_units_delta := -v_units;
      v_wallet_delta := v_payout;
      v_cost_delta := CASE
        WHEN v_units = v_account.market_units THEN -v_account.market_cost
        ELSE -ROUND(v_account.market_cost * v_units / v_account.market_units)::BIGINT
      END;
  END CASE;

  IF v_wallet + v_wallet_delta NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION '钱包余额超出上限'; END IF;
  UPDATE users SET gold = v_wallet + v_wallet_delta WHERE id = p_student_id;
  UPDATE timber_bank_accounts SET
    stable_gold = stable_gold + v_stable_delta,
    stable_term_end = v_term_end,
    accrued_basis = CASE WHEN v_reset_accrual THEN 0 ELSE accrued_basis END,
    accrual_at = CASE WHEN v_reset_accrual THEN clock_timestamp() ELSE accrual_at END,
    accrual_day = CASE WHEN v_reset_accrual THEN v_today ELSE accrual_day END,
    market_units = market_units + v_units_delta,
    market_cost = market_cost + v_cost_delta,
    updated_at = clock_timestamp()
  WHERE student_id = p_student_id;

  IF v_wallet_delta <> 0 THEN
    INSERT INTO gold_logs(student_id, amount, reason, balance_after)
    VALUES (
      p_student_id,
      v_wallet_delta::INT,
      CASE p_action
        WHEN 'stable_deposit' THEN '铁木银行存入稳稳存'
        WHEN 'stable_withdraw' THEN '铁木银行取出稳稳存'
        WHEN 'market_buy' THEN '铁木银行买入商队份额'
        ELSE '铁木银行卖出商队份额'
      END,
      (v_wallet + v_wallet_delta)::INT
    );
  END IF;

  INSERT INTO timber_bank_ledger(
    student_id, request_id, action, amount, wallet_delta, stable_delta, units_delta, quote_date
  ) VALUES (
    p_student_id,
    p_request_id,
    p_action,
    CASE
      WHEN p_action = 'market_sell_all' THEN v_payout
      WHEN p_action IN ('stable_renew', 'stable_withdraw') THEN v_account.stable_gold
      ELSE p_amount
    END,
    v_wallet_delta,
    v_stable_delta,
    v_units_delta,
    v_today
  );
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) TO anon, authenticated;
COMMIT;
