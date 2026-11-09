-- Timber Bank limit orders: reserve funds/shares, match on each four-hour quote,
-- and expose a small open-order list for the player.
BEGIN;

DO $$
BEGIN
  IF to_regprocedure('timber_bank_advance_quotes()') IS NULL
     OR to_regprocedure('timber_bank_snapshot(uuid)') IS NULL
     OR to_regprocedure('timber_bank_check_session(uuid,text)') IS NULL THEN
    RAISE EXCEPTION '请先执行 202610050001_timber_bank.sql、202610060001_timber_bank_session_only.sql 和 202610060002_timber_bank_market_4h.sql，再执行本迁移';
  END IF;
END;
$$;

ALTER TABLE timber_bank_accounts
  ADD COLUMN IF NOT EXISTS market_reserved_units NUMERIC(24, 8) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION timber_bank_guard_reserved_units()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.market_units < NEW.market_reserved_units THEN
    RAISE EXCEPTION '已有预约卖单锁定了部分份额，请先撤单或减少即时卖出数量';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timber_bank_guard_reserved_units_trigger ON timber_bank_accounts;
CREATE TRIGGER timber_bank_guard_reserved_units_trigger
BEFORE UPDATE ON timber_bank_accounts
FOR EACH ROW EXECUTE FUNCTION timber_bank_guard_reserved_units();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'timber_bank_accounts'::regclass
      AND conname = 'timber_bank_accounts_market_reserved_units_check'
  ) THEN
    ALTER TABLE timber_bank_accounts
      ADD CONSTRAINT timber_bank_accounts_market_reserved_units_check
      CHECK (market_reserved_units >= 0 AND market_reserved_units <= market_units);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS timber_bank_limit_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  target_price NUMERIC(30, 12) NOT NULL CHECK (target_price > 0),
  amount_gold BIGINT NOT NULL DEFAULT 0 CHECK (amount_gold >= 0),
  amount_units NUMERIC(24, 8) NOT NULL DEFAULT 0 CHECK (amount_units >= 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  filled_price NUMERIC(30, 12),
  filled_units NUMERIC(24, 8) NOT NULL DEFAULT 0 CHECK (filled_units >= 0),
  filled_cost BIGINT NOT NULL DEFAULT 0 CHECK (filled_cost >= 0),
  refund_gold BIGINT NOT NULL DEFAULT 0 CHECK (refund_gold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  filled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (student_id, request_id),
  CHECK (
    (side = 'buy' AND amount_gold > 0 AND amount_units = 0)
    OR (side = 'sell' AND amount_units > 0 AND amount_gold = 0)
  )
);
CREATE INDEX IF NOT EXISTS timber_bank_limit_orders_open_match
  ON timber_bank_limit_orders(status, side, target_price, created_at)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS timber_bank_limit_orders_student_recent
  ON timber_bank_limit_orders(student_id, id DESC);
ALTER TABLE timber_bank_limit_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON timber_bank_limit_orders FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  ALTER TABLE timber_bank_ledger DROP CONSTRAINT IF EXISTS timber_bank_ledger_action_check;
  ALTER TABLE timber_bank_ledger
    ADD CONSTRAINT timber_bank_ledger_action_check CHECK (action IN (
      'stable_deposit', 'stable_withdraw', 'stable_renew', 'market_buy',
      'market_sell', 'market_sell_all', 'stable_interest',
      'limit_buy_filled', 'limit_sell_filled', 'limit_buy_cancelled',
      'limit_sell_cancelled'
    ));
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_match_limit_orders(
  p_quote_slot TIMESTAMPTZ,
  p_price NUMERIC
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_order timber_bank_limit_orders%ROWTYPE;
  v_account timber_bank_accounts%ROWTYPE;
  v_wallet BIGINT;
  v_units NUMERIC(24, 8);
  v_actual_cost BIGINT;
  v_refund BIGINT;
  v_payout BIGINT;
  v_cost_release BIGINT;
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(80100502);

  FOR v_order IN
    SELECT *
    FROM timber_bank_limit_orders
    WHERE status = 'open'
      AND ((side = 'buy' AND p_price <= target_price)
        OR (side = 'sell' AND p_price >= target_price))
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    SELECT gold INTO v_wallet FROM users
    WHERE id = v_order.student_id AND role = 'student'
    FOR UPDATE;
    IF NOT FOUND THEN CONTINUE; END IF;

    SELECT * INTO STRICT v_account
    FROM timber_bank_accounts
    WHERE student_id = v_order.student_id
    FOR UPDATE;

    IF v_order.side = 'buy' THEN
      -- The target price determines the promised share quantity. Any cheaper
      -- fill returns the unused part of the locked budget.
      v_units := ROUND(v_order.amount_gold / v_order.target_price, 8);
      v_actual_cost := FLOOR(v_units * p_price)::BIGINT;
      v_refund := GREATEST(0, v_order.amount_gold - v_actual_cost);
      IF v_units <= 0 OR v_actual_cost <= 0 THEN CONTINUE; END IF;
      IF v_wallet + v_refund > 2147483647 THEN
        RAISE EXCEPTION '钱包余额超出上限';
      END IF;
      UPDATE users SET gold = v_wallet + v_refund WHERE id = v_order.student_id;
      UPDATE timber_bank_accounts SET
        market_units = market_units + v_units,
        market_cost = market_cost + v_actual_cost,
        updated_at = clock_timestamp()
      WHERE student_id = v_order.student_id;
      UPDATE timber_bank_limit_orders SET
        status = 'filled', filled_price = p_price, filled_units = v_units,
        filled_cost = v_actual_cost, refund_gold = v_refund,
        filled_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = v_order.id;
      IF v_refund > 0 THEN
        INSERT INTO gold_logs(student_id, amount, reason, balance_after)
        VALUES (v_order.student_id, v_refund::INT, '铁木银行预约买入差额返还', (v_wallet + v_refund)::INT);
      END IF;
      INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, wallet_delta, units_delta, quote_date)
      VALUES (v_order.student_id, gen_random_uuid(), 'limit_buy_filled', v_actual_cost, v_refund, v_units, v_today);
    ELSE
      IF v_order.amount_units > v_account.market_units
         OR v_account.market_units <= 0
         OR v_order.amount_units > v_account.market_reserved_units THEN
        CONTINUE;
      END IF;
      v_payout := FLOOR(v_order.amount_units * p_price)::BIGINT;
      v_cost_release := CASE
        WHEN v_order.amount_units >= v_account.market_units THEN v_account.market_cost
        ELSE ROUND(v_account.market_cost * v_order.amount_units / v_account.market_units)::BIGINT
      END;
      IF v_wallet + v_payout > 2147483647 THEN
        RAISE EXCEPTION '钱包余额超出上限';
      END IF;
      UPDATE users SET gold = v_wallet + v_payout WHERE id = v_order.student_id;
      UPDATE timber_bank_accounts SET
        market_units = market_units - v_order.amount_units,
        market_reserved_units = market_reserved_units - v_order.amount_units,
        market_cost = GREATEST(0, market_cost - v_cost_release),
        updated_at = clock_timestamp()
      WHERE student_id = v_order.student_id;
      UPDATE timber_bank_limit_orders SET
        status = 'filled', filled_price = p_price, filled_units = v_order.amount_units,
        filled_cost = v_payout, refund_gold = 0,
        filled_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = v_order.id;
      INSERT INTO gold_logs(student_id, amount, reason, balance_after)
      VALUES (v_order.student_id, v_payout::INT, '铁木银行预约卖出成交', (v_wallet + v_payout)::INT);
      INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, wallet_delta, units_delta, quote_date)
      VALUES (v_order.student_id, gen_random_uuid(), 'limit_sell_filled', v_payout, v_payout, -v_order.amount_units, v_today);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_market_quote_limit_order_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM timber_bank_match_limit_orders(NEW.quote_slot, NEW.market_price);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS timber_bank_market_quote_limit_order_match ON timber_bank_market_quotes;
CREATE TRIGGER timber_bank_market_quote_limit_order_match
AFTER INSERT ON timber_bank_market_quotes
FOR EACH ROW EXECUTE FUNCTION timber_bank_market_quote_limit_order_trigger();

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
    'marketReservedUnits', a.market_reserved_units,
    'marketAvailableUnits', GREATEST(0, a.market_units - a.market_reserved_units),
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

-- Match the lock order used by quote-trigger settlement before the legacy
-- immediate-trade wrapper locks the player's wallet row.
DO $$
BEGIN
  IF to_regprocedure('timber_bank_transact(uuid,text,uuid,text,integer)') IS NOT NULL
     AND to_regprocedure('timber_bank_transact(uuid,text,text,uuid,text,integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION timber_bank_transact(
        p_student_id UUID, p_session_id TEXT, p_request_id UUID,
        p_action TEXT, p_amount INT DEFAULT 0
      ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
      DECLARE v_password TEXT;
      BEGIN
        PERFORM pg_advisory_xact_lock(80100501);
        SELECT plain_password INTO v_password FROM users
        WHERE id = p_student_id AND role = 'student';
        RETURN timber_bank_transact(p_student_id, p_session_id, v_password, p_request_id, p_action, p_amount);
      END;
      $body$;
    $fn$;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_place_order(
  p_student_id UUID,
  p_session_id TEXT,
  p_request_id UUID,
  p_side TEXT,
  p_target_price NUMERIC,
  p_amount NUMERIC
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_wallet BIGINT;
  v_account timber_bank_accounts%ROWTYPE;
  v_order timber_bank_limit_orders%ROWTYPE;
  v_price NUMERIC;
  v_slot TIMESTAMPTZ;
  v_amount_gold BIGINT := 0;
  v_amount_units NUMERIC(24, 8) := 0;
  v_open_count INT;
BEGIN
  IF p_request_id IS NULL OR p_side NOT IN ('buy', 'sell')
     OR p_target_price IS NULL OR p_target_price <= 0
     OR p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '请输入有效的预约价格和数量';
  END IF;
  PERFORM timber_bank_check_session(p_student_id, p_session_id);
  PERFORM timber_bank_advance_quotes();
  PERFORM pg_advisory_xact_lock(80100502);
  INSERT INTO timber_bank_accounts(student_id) VALUES (p_student_id) ON CONFLICT DO NOTHING;

  SELECT * INTO v_order FROM timber_bank_limit_orders
  WHERE student_id = p_student_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_order.side <> p_side
       OR v_order.target_price <> p_target_price THEN
      RAISE EXCEPTION '预约编号已被其他订单使用';
    END IF;
    IF p_side = 'buy' AND (v_order.amount_gold <> p_amount::BIGINT OR v_order.amount_units <> 0) THEN
      RAISE EXCEPTION '预约编号已被其他订单使用';
    END IF;
    IF p_side = 'sell' AND (v_order.amount_units <> ROUND(p_amount, 8) OR v_order.amount_gold <> 0) THEN
      RAISE EXCEPTION '预约编号已被其他订单使用';
    END IF;
    RETURN timber_bank_snapshot(p_student_id);
  END IF;

  SELECT gold INTO v_wallet FROM users
  WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  SELECT * INTO STRICT v_account FROM timber_bank_accounts
  WHERE student_id = p_student_id FOR UPDATE;

  SELECT COUNT(*) INTO v_open_count FROM timber_bank_limit_orders
  WHERE student_id = p_student_id AND status = 'open';
  IF v_open_count >= 5 THEN RAISE EXCEPTION '最多同时保留5笔预约单'; END IF;

  IF p_side = 'buy' THEN
    IF p_amount <> floor(p_amount) THEN RAISE EXCEPTION '买入金币必须是整数'; END IF;
    v_amount_gold := p_amount::BIGINT;
    IF v_amount_gold < CEIL(p_target_price)::BIGINT THEN
      RAISE EXCEPTION '买入金币至少要能买到1份';
    END IF;
    IF v_wallet < v_amount_gold THEN RAISE EXCEPTION '钱包金币不足'; END IF;
    UPDATE users SET gold = gold - v_amount_gold WHERE id = p_student_id;
  ELSE
    v_amount_units := ROUND(p_amount, 8);
    IF FLOOR(v_amount_units * p_target_price) < 1 THEN
      RAISE EXCEPTION '预约卖出至少要能换回1枚金币';
    END IF;
    IF v_amount_units <= 0 OR v_amount_units > v_account.market_units - v_account.market_reserved_units THEN
      RAISE EXCEPTION '可预约卖出的份额不足';
    END IF;
    UPDATE timber_bank_accounts SET
      market_reserved_units = market_reserved_units + v_amount_units,
      updated_at = clock_timestamp()
    WHERE student_id = p_student_id;
  END IF;

  INSERT INTO timber_bank_limit_orders(
    student_id, request_id, side, target_price, amount_gold, amount_units
  ) VALUES (
    p_student_id, p_request_id, p_side, p_target_price, v_amount_gold, v_amount_units
  ) RETURNING * INTO v_order;

  SELECT quote_slot, market_price INTO v_slot, v_price
  FROM timber_bank_market_quotes
  WHERE quote_slot <= clock_timestamp()
  ORDER BY quote_slot DESC LIMIT 1;
  PERFORM timber_bank_match_limit_orders(v_slot, v_price);
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_cancel_order(
  p_student_id UUID,
  p_session_id TEXT,
  p_order_id BIGINT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_order timber_bank_limit_orders%ROWTYPE;
  v_wallet BIGINT;
BEGIN
  IF p_order_id IS NULL THEN RAISE EXCEPTION '预约单无效'; END IF;
  PERFORM timber_bank_check_session(p_student_id, p_session_id);
  PERFORM timber_bank_advance_quotes();
  PERFORM pg_advisory_xact_lock(80100502);
  INSERT INTO timber_bank_accounts(student_id) VALUES (p_student_id) ON CONFLICT DO NOTHING;
  SELECT * INTO v_order FROM timber_bank_limit_orders
  WHERE id = p_order_id AND student_id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '预约单不存在'; END IF;
  IF v_order.status = 'cancelled' THEN RETURN timber_bank_snapshot(p_student_id); END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION '预约单已经成交，不能撤销'; END IF;

  SELECT gold INTO v_wallet FROM users WHERE id = p_student_id FOR UPDATE;
  IF v_order.side = 'buy' THEN
    IF v_wallet + v_order.amount_gold > 2147483647 THEN RAISE EXCEPTION '钱包余额超出上限'; END IF;
    UPDATE users SET gold = gold + v_order.amount_gold WHERE id = p_student_id;
    INSERT INTO gold_logs(student_id, amount, reason, balance_after)
    VALUES (p_student_id, v_order.amount_gold::INT, '铁木银行撤销预约买入', (v_wallet + v_order.amount_gold)::INT);
  ELSE
    UPDATE timber_bank_accounts SET
      market_reserved_units = GREATEST(0, market_reserved_units - v_order.amount_units),
      updated_at = clock_timestamp()
    WHERE student_id = p_student_id;
  END IF;
  UPDATE timber_bank_limit_orders SET
    status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = p_order_id;
  INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, wallet_delta, units_delta, quote_date)
  VALUES (
    p_student_id, gen_random_uuid(),
    CASE WHEN v_order.side = 'buy' THEN 'limit_buy_cancelled' ELSE 'limit_sell_cancelled' END,
    CASE WHEN v_order.side = 'buy' THEN v_order.amount_gold ELSE 0 END,
    CASE WHEN v_order.side = 'buy' THEN v_order.amount_gold ELSE 0 END,
    CASE WHEN v_order.side = 'sell' THEN v_order.amount_units ELSE 0 END,
    (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE
  );
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_match_limit_orders(TIMESTAMPTZ, NUMERIC), timber_bank_market_quote_limit_order_trigger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION timber_bank_place_order(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC), timber_bank_cancel_order(UUID, TEXT, BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timber_bank_place_order(UUID, TEXT, UUID, TEXT, NUMERIC, NUMERIC), timber_bank_cancel_order(UUID, TEXT, BIGINT) TO anon, authenticated;

COMMIT;
