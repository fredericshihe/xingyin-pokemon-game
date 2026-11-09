-- Fix stable savings interest: calculate from the full saved balance with no
-- artificial principal or cumulative-interest cap.
BEGIN;

-- Remove the earlier, incorrect per-period cap bookkeeping if that draft
-- migration was already applied. Interest is now uncapped and derived only
-- from the full principal and the daily rate.
DROP TRIGGER IF EXISTS timber_bank_reset_stable_interest_earned_trigger ON timber_bank_accounts;
DROP FUNCTION IF EXISTS timber_bank_reset_stable_interest_earned();
ALTER TABLE timber_bank_accounts DROP CONSTRAINT IF EXISTS timber_bank_accounts_stable_interest_earned_check;
ALTER TABLE timber_bank_accounts DROP COLUMN IF EXISTS stable_interest_earned;

CREATE OR REPLACE FUNCTION timber_bank_accrue(p_student_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_account timber_bank_accounts%ROWTYPE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_cursor TIMESTAMPTZ;
  v_boundary TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_day DATE;
  v_basis NUMERIC(30, 10);
  v_interest BIGINT;
  v_rate INT;
BEGIN
  INSERT INTO timber_bank_accounts(student_id) VALUES (p_student_id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT v_account
  FROM timber_bank_accounts
  WHERE student_id = p_student_id
  FOR UPDATE;

  v_now := LEAST(v_now, COALESCE(v_account.stable_term_end, v_now));
  v_cursor := LEAST(v_account.accrual_at, v_now);
  v_day := v_account.accrual_day;
  v_basis := v_account.accrued_basis;

  WHILE v_cursor < v_now LOOP
    v_boundary := ((v_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai');
    v_end := LEAST(v_now, v_boundary);
    IF v_end > v_cursor THEN
      -- Always use the complete saved balance as the interest principal.
      v_basis := v_basis + v_account.stable_gold
        * EXTRACT(EPOCH FROM (v_end - v_cursor)) / 86400;
      v_cursor := v_end;
    END IF;

    IF v_cursor >= v_boundary THEN
      SELECT stable_rate_bps INTO v_rate
      FROM timber_bank_quotes
      WHERE quote_date = v_day;
      IF v_rate IS NULL THEN
        RAISE EXCEPTION '缺少银行日利率，请稍后重试';
      END IF;

      v_interest := floor(v_basis * v_rate / 10000)::BIGINT;
      IF v_interest > 0 THEN
        v_account.stable_gold := v_account.stable_gold + v_interest;
        INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, stable_delta, quote_date)
        VALUES (p_student_id, gen_random_uuid(), 'stable_interest', v_interest, v_interest, v_day);
      END IF;
      v_basis := 0;
      v_day := v_day + 1;
    END IF;
  END LOOP;

  IF v_account.stable_term_end IS NOT NULL AND v_now >= v_account.stable_term_end AND v_basis > 0 THEN
    SELECT stable_rate_bps INTO v_rate
    FROM timber_bank_quotes
    WHERE quote_date = v_day;
    IF v_rate IS NULL THEN
      RAISE EXCEPTION '缺少银行日利率，请稍后重试';
    END IF;
    v_interest := floor(v_basis * v_rate / 10000)::BIGINT;
    IF v_interest > 0 THEN
      v_account.stable_gold := v_account.stable_gold + v_interest;
      INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, stable_delta, quote_date)
      VALUES (p_student_id, gen_random_uuid(), 'stable_interest', v_interest, v_interest, v_day);
    END IF;
    v_basis := 0;
  END IF;

  UPDATE timber_bank_accounts
  SET stable_gold = v_account.stable_gold,
      accrued_basis = v_basis,
      accrual_at = v_now,
      accrual_day = v_day,
      updated_at = v_now
  WHERE student_id = p_student_id;
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_accrue(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION timber_bank_accrue(UUID) TO anon, authenticated;

-- Expose recent stable-interest entries so the UI can draw a clear
-- "稳稳存收益" chart without mixing them with caravan trades.
CREATE OR REPLACE FUNCTION timber_bank_snapshot(p_student_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'walletGold', u.gold,
    'stableGold', a.stable_gold,
    'stableTermEnd', a.stable_term_end,
    'stableTermMatured', a.stable_term_end IS NOT NULL AND clock_timestamp() >= a.stable_term_end,
    'stableRateBps', daily_quote.stable_rate_bps,
    'stableInterestHistory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'amount', h.amount, 'date', h.created_at
      ) ORDER BY h.created_at)
      FROM (
        SELECT amount, created_at
        FROM timber_bank_ledger
        WHERE student_id = p_student_id AND action = 'stable_interest'
          AND created_at >= COALESCE((
            SELECT max(s.created_at)
            FROM timber_bank_ledger s
            WHERE s.student_id = p_student_id
              AND s.action IN ('stable_deposit', 'stable_renew')
              AND s.created_at > COALESCE((
                SELECT max(w.created_at)
                FROM timber_bank_ledger w
                WHERE w.student_id = p_student_id AND w.action = 'stable_withdraw'
              ), '-infinity'::TIMESTAMPTZ)
          ), '-infinity'::TIMESTAMPTZ)
        ORDER BY created_at DESC LIMIT 7
      ) h
    ), '[]'::jsonb),
    'marketUnits', a.market_units,
    'marketReservedUnits', COALESCE(a.market_reserved_units, 0),
    'marketAvailableUnits', GREATEST(0, a.market_units - COALESCE(a.market_reserved_units, 0)),
    'marketCost', a.market_cost,
    'marketAveragePrice', CASE WHEN a.market_units > 0 THEN a.market_cost / a.market_units ELSE 0 END,
    'marketValue', floor(a.market_units * market_quote.market_price)::BIGINT,
    'marketUnrealizedPnl', floor(a.market_units * market_quote.market_price)::BIGINT - a.market_cost,
    'marketInvestCap', 20000,
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
        'date', h.quote_slot, 'price', h.market_price, 'changeBps', h.market_change_bps,
        'signal', h.signal, 'volatilityBps', h.volatility_bps, 'eventLabel', h.event_label
      ) ORDER BY h.quote_slot)
      FROM (
        SELECT quote_slot, market_price, market_change_bps, signal, volatility_bps, event_label
        FROM timber_bank_market_quotes
        WHERE quote_slot <= market_quote.quote_slot
        ORDER BY quote_slot DESC LIMIT 180
      ) h
    ), '[]'::jsonb),
    'limitOrders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'side', o.side, 'targetPrice', o.target_price,
        'amountGold', o.amount_gold, 'amountUnits', o.amount_units,
        'createdAt', o.created_at, 'status', o.status
      ) ORDER BY o.created_at, o.id)
      FROM timber_bank_limit_orders o
      WHERE o.student_id = p_student_id AND o.status = 'open'
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'action', l.action, 'amount', l.amount, 'walletDelta', l.wallet_delta,
        'stableDelta', l.stable_delta, 'unitsDelta', l.units_delta, 'date', l.created_at
      ) ORDER BY l.id DESC)
      FROM (
        SELECT * FROM timber_bank_ledger
        WHERE student_id = p_student_id ORDER BY id DESC LIMIT 20
      ) l
    ), '[]'::jsonb)
  )
  FROM users u
  JOIN timber_bank_accounts a ON a.student_id = u.id
  CROSS JOIN LATERAL (
    SELECT * FROM timber_bank_quotes
    WHERE quote_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE LIMIT 1
  ) daily_quote
  CROSS JOIN LATERAL (
    SELECT * FROM timber_bank_market_quotes
    WHERE quote_slot <= clock_timestamp() ORDER BY quote_slot DESC LIMIT 1
  ) market_quote
  WHERE u.id = p_student_id;
$$;

REVOKE ALL ON FUNCTION timber_bank_snapshot(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION timber_bank_snapshot(UUID) TO anon, authenticated;

-- Keep the lock period aligned with the product rule: three days.
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
  ) THEN RAISE EXCEPTION '无效银行操作'; END IF;
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
  SELECT market_price INTO STRICT v_price FROM timber_bank_market_quotes
    WHERE quote_slot <= clock_timestamp() ORDER BY quote_slot DESC LIMIT 1;

  SELECT * INTO v_existing FROM timber_bank_ledger
    WHERE student_id = p_student_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.action <> p_action OR (p_action NOT IN ('market_sell_all', 'stable_renew', 'stable_withdraw') AND v_existing.amount <> p_amount) THEN
      RAISE EXCEPTION '交易编号已被其他操作使用';
    END IF;
    RETURN timber_bank_snapshot(p_student_id);
  END IF;

  CASE p_action
    WHEN 'stable_deposit' THEN
      IF v_account.stable_term_end IS NOT NULL THEN RAISE EXCEPTION '请先取出或续存当前存单'; END IF;
      IF v_wallet < p_amount THEN RAISE EXCEPTION '钱包金币不足'; END IF;
      v_wallet_delta := -p_amount; v_stable_delta := p_amount;
      v_term_end := clock_timestamp() + INTERVAL '3 days'; v_reset_accrual := TRUE;
    WHEN 'stable_withdraw' THEN
      IF v_account.stable_term_end IS NULL OR clock_timestamp() < v_account.stable_term_end THEN RAISE EXCEPTION '稳稳存尚未到期'; END IF;
      v_wallet_delta := v_account.stable_gold; v_stable_delta := -v_account.stable_gold;
      v_term_end := NULL; v_reset_accrual := TRUE;
    WHEN 'stable_renew' THEN
      IF v_account.stable_term_end IS NULL OR clock_timestamp() < v_account.stable_term_end THEN RAISE EXCEPTION '稳稳存尚未到期'; END IF;
      v_term_end := clock_timestamp() + INTERVAL '3 days'; v_reset_accrual := TRUE;
    WHEN 'market_buy' THEN
      IF v_wallet < p_amount THEN RAISE EXCEPTION '钱包金币不足'; END IF;
      v_units_delta := ROUND(p_amount / v_price, 8);
      IF v_units_delta <= 0 THEN RAISE EXCEPTION '投入太少，无法购买份额'; END IF;
      v_wallet_delta := -p_amount; v_cost_delta := p_amount;
    WHEN 'market_sell', 'market_sell_all' THEN
      IF v_account.market_units <= 0 THEN RAISE EXCEPTION '目前没有商队份额'; END IF;
      v_units := CASE WHEN p_action = 'market_sell_all' OR p_amount >= floor(v_account.market_units * v_price)
        THEN v_account.market_units ELSE LEAST(v_account.market_units, ROUND(p_amount / v_price, 8)) END;
      v_payout := floor(v_units * v_price)::BIGINT;
      IF v_units <= 0 THEN RAISE EXCEPTION '卖出金额太小，请增加金额或全部卖出'; END IF;
      v_units_delta := -v_units; v_wallet_delta := v_payout;
      v_cost_delta := CASE WHEN v_units = v_account.market_units THEN -v_account.market_cost
        ELSE -ROUND(v_account.market_cost * v_units / v_account.market_units)::BIGINT END;
  END CASE;

  IF v_wallet + v_wallet_delta NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION '钱包余额超出上限'; END IF;
  UPDATE users SET gold = v_wallet + v_wallet_delta WHERE id = p_student_id;
  UPDATE timber_bank_accounts SET stable_gold = stable_gold + v_stable_delta,
    stable_term_end = v_term_end,
    accrued_basis = CASE WHEN v_reset_accrual THEN 0 ELSE accrued_basis END,
    accrual_at = CASE WHEN v_reset_accrual THEN clock_timestamp() ELSE accrual_at END,
    accrual_day = CASE WHEN v_reset_accrual THEN v_today ELSE accrual_day END,
    market_units = market_units + v_units_delta, market_cost = market_cost + v_cost_delta,
    updated_at = clock_timestamp() WHERE student_id = p_student_id;
  IF v_wallet_delta <> 0 THEN
    INSERT INTO gold_logs(student_id, amount, reason, balance_after) VALUES (p_student_id, v_wallet_delta::INT,
      CASE p_action WHEN 'stable_deposit' THEN '铁木银行存入稳稳存' WHEN 'stable_withdraw' THEN '铁木银行取出稳稳存'
        WHEN 'market_buy' THEN '铁木银行买入商队份额' ELSE '铁木银行卖出商队份额' END, (v_wallet + v_wallet_delta)::INT);
  END IF;
  INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, wallet_delta, stable_delta, units_delta, quote_date)
  VALUES (p_student_id, p_request_id, p_action,
    CASE WHEN p_action = 'market_sell_all' THEN v_payout WHEN p_action IN ('stable_renew', 'stable_withdraw') THEN v_account.stable_gold ELSE p_amount END,
    v_wallet_delta, v_stable_delta, v_units_delta, v_today);
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) TO anon, authenticated;

COMMIT;
