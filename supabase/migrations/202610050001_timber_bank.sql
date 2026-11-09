-- Timber Bank keeps deposits and market holdings outside the client save.
-- Wallet changes, holdings and their audit record commit in one transaction.
BEGIN;

CREATE TABLE IF NOT EXISTS timber_bank_quotes (
  quote_date DATE PRIMARY KEY,
  market_price NUMERIC(30, 12) NOT NULL CHECK (market_price > 0),
  market_change_bps INT NOT NULL CHECK (market_change_bps BETWEEN -1000 AND 1000),
  market_regime TEXT NOT NULL CHECK (market_regime IN ('up', 'sideways', 'down')),
  stable_rate_bps INT NOT NULL CHECK (stable_rate_bps BETWEEN 0 AND 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS timber_bank_accounts (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  stable_gold BIGINT NOT NULL DEFAULT 0 CHECK (stable_gold >= 0),
  stable_term_end TIMESTAMPTZ,
  market_units NUMERIC(24, 8) NOT NULL DEFAULT 0 CHECK (market_units >= 0),
  market_cost BIGINT NOT NULL DEFAULT 0 CHECK (market_cost BETWEEN 0 AND 20000),
  accrued_basis NUMERIC(30, 10) NOT NULL DEFAULT 0 CHECK (accrued_basis >= 0),
  accrual_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  accrual_day DATE NOT NULL DEFAULT (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS timber_bank_ledger (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('stable_deposit', 'stable_withdraw', 'stable_renew', 'market_buy', 'market_sell', 'market_sell_all', 'stable_interest')),
  amount BIGINT NOT NULL DEFAULT 0,
  wallet_delta BIGINT NOT NULL DEFAULT 0,
  stable_delta BIGINT NOT NULL DEFAULT 0,
  units_delta NUMERIC(24, 8) NOT NULL DEFAULT 0,
  quote_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (student_id, request_id)
);
CREATE INDEX IF NOT EXISTS timber_bank_ledger_student_recent ON timber_bank_ledger(student_id, id DESC);

ALTER TABLE timber_bank_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE timber_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE timber_bank_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON timber_bank_quotes, timber_bank_accounts, timber_bank_ledger FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION timber_bank_advance_quotes()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
  v_last timber_bank_quotes%ROWTYPE;
  v_date DATE;
  v_roll DOUBLE PRECISION;
  v_regime TEXT;
  v_change INT;
BEGIN
  PERFORM pg_advisory_xact_lock(80100501);
  SELECT * INTO v_last FROM timber_bank_quotes WHERE quote_date <= v_today ORDER BY quote_date DESC LIMIT 1;
  IF NOT FOUND THEN
    INSERT INTO timber_bank_quotes(quote_date, market_price, market_change_bps, market_regime, stable_rate_bps)
    VALUES (v_today, 100, 0, 'sideways', floor(random() * 201)::INT);
    RETURN;
  END IF;

  v_date := v_last.quote_date + 1;
  WHILE v_date <= v_today LOOP
    v_roll := random();
    v_regime := CASE v_last.market_regime
      WHEN 'up' THEN CASE WHEN v_roll < 0.70 THEN 'up' WHEN v_roll < 0.90 THEN 'sideways' ELSE 'down' END
      WHEN 'down' THEN CASE WHEN v_roll < 0.70 THEN 'down' WHEN v_roll < 0.90 THEN 'sideways' ELSE 'up' END
      ELSE CASE WHEN v_roll < 0.20 THEN 'up' WHEN v_roll < 0.80 THEN 'sideways' ELSE 'down' END
    END;
    IF v_last.market_price < 1 THEN v_regime := 'up'; END IF;
    v_change := 200 + floor(random() * 801)::INT;
    IF v_regime = 'down' OR (v_regime = 'sideways' AND random() < 0.5) THEN
      v_change := -v_change;
    END IF;
    INSERT INTO timber_bank_quotes(quote_date, market_price, market_change_bps, market_regime, stable_rate_bps)
    VALUES (
      v_date,
      v_last.market_price * (1 + v_change / 10000.0),
      v_change,
      v_regime,
      floor(random() * 201)::INT
    ) RETURNING * INTO v_last;
    v_date := v_date + 1;
  END LOOP;
END;
$$;

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
  SELECT * INTO STRICT v_account FROM timber_bank_accounts WHERE student_id = p_student_id FOR UPDATE;
  v_now := LEAST(v_now, COALESCE(v_account.stable_term_end, v_now));
  v_cursor := LEAST(v_account.accrual_at, v_now);
  v_day := v_account.accrual_day;
  v_basis := v_account.accrued_basis;

  WHILE v_cursor < v_now LOOP
    v_boundary := ((v_day + 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai');
    v_end := LEAST(v_now, v_boundary);
    IF v_end > v_cursor THEN
      v_basis := v_basis + LEAST(v_account.stable_gold, 2000) * EXTRACT(EPOCH FROM (v_end - v_cursor)) / 86400;
      v_cursor := v_end;
    END IF;
    IF v_cursor >= v_boundary THEN
      SELECT stable_rate_bps INTO v_rate FROM timber_bank_quotes WHERE quote_date = v_day;
      IF v_rate IS NULL THEN RAISE EXCEPTION '缺少银行日利率，请稍后重试'; END IF;
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
    SELECT stable_rate_bps INTO v_rate FROM timber_bank_quotes WHERE quote_date = v_day;
    IF v_rate IS NULL THEN RAISE EXCEPTION '缺少银行日利率，请稍后重试'; END IF;
    v_interest := floor(v_basis * v_rate / 10000)::BIGINT;
    IF v_interest > 0 THEN
      v_account.stable_gold := v_account.stable_gold + v_interest;
      INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, stable_delta, quote_date)
      VALUES (p_student_id, gen_random_uuid(), 'stable_interest', v_interest, v_interest, v_day);
    END IF;
    v_basis := 0;
  END IF;

  UPDATE timber_bank_accounts SET stable_gold = v_account.stable_gold, accrued_basis = v_basis,
    accrual_at = v_now, accrual_day = v_day, updated_at = v_now
  WHERE student_id = p_student_id;
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
    'stableRateBps', q.stable_rate_bps,
    'marketUnits', a.market_units,
    'marketCost', a.market_cost,
    'marketValue', floor(a.market_units * q.market_price)::BIGINT,
    'marketInvestCap', 20000,
    'marketPrice', q.market_price,
    'marketChangeBps', q.market_change_bps,
    'quoteDate', q.quote_date,
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('date', h.quote_date, 'price', h.market_price, 'changeBps', h.market_change_bps) ORDER BY h.quote_date)
      FROM (SELECT quote_date, market_price, market_change_bps FROM timber_bank_quotes WHERE quote_date <= q.quote_date ORDER BY quote_date DESC LIMIT 30) h
    ), '[]'::jsonb),
    'ledger', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('action', l.action, 'amount', l.amount, 'walletDelta', l.wallet_delta,
        'stableDelta', l.stable_delta, 'unitsDelta', l.units_delta, 'date', l.created_at) ORDER BY l.id DESC)
      FROM (SELECT * FROM timber_bank_ledger WHERE student_id = p_student_id ORDER BY id DESC LIMIT 12) l
    ), '[]'::jsonb)
  )
  FROM users u JOIN timber_bank_accounts a ON a.student_id = u.id
  JOIN timber_bank_quotes q ON q.quote_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE
  WHERE u.id = p_student_id;
$$;

CREATE OR REPLACE FUNCTION timber_bank_check_session(p_student_id UUID, p_session_id TEXT, p_password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_remaining INT;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 16 THEN RAISE EXCEPTION '游玩会话无效，请重新登录'; END IF;
  IF NULLIF(TRIM(COALESCE(p_password, '')), '') IS NULL OR NOT EXISTS (
    SELECT 1 FROM users WHERE id = p_student_id AND role = 'student'
      AND COALESCE(TRIM(plain_password), '') = TRIM(p_password)
  ) THEN RAISE EXCEPTION '银行验证失败，请检查登录密码'; END IF;
  SELECT remaining_seconds INTO v_remaining FROM settle_student_playtime_session(p_student_id, p_session_id, 'check') LIMIT 1;
  IF COALESCE(v_remaining, 0) <= 0 THEN RAISE EXCEPTION '今日游玩时间已用完'; END IF;
  IF NOT student_playtime_lease_is_valid(p_student_id, p_session_id, FALSE) THEN
    RAISE EXCEPTION '游玩会话已结束，请重新读取进度';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_get_state(p_student_id UUID, p_session_id TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM timber_bank_check_session(p_student_id, p_session_id, p_password);
  PERFORM 1 FROM users WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  PERFORM timber_bank_advance_quotes();
  PERFORM timber_bank_accrue(p_student_id);
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_transact(
  p_student_id UUID, p_session_id TEXT, p_password TEXT, p_request_id UUID, p_action TEXT, p_amount INT DEFAULT 0
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
  IF p_request_id IS NULL OR p_action NOT IN ('stable_deposit','stable_withdraw','stable_renew','market_buy','market_sell','market_sell_all') THEN
    RAISE EXCEPTION '无效银行操作';
  END IF;
  IF p_action IN ('market_sell_all', 'stable_renew', 'stable_withdraw') THEN
    IF p_amount IS DISTINCT FROM 0 THEN RAISE EXCEPTION '无效银行操作金额'; END IF;
  ELSIF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION '请输入正整数金币'; END IF;
  PERFORM timber_bank_check_session(p_student_id, p_session_id, p_password);
  SELECT gold INTO v_wallet FROM users WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  PERFORM timber_bank_advance_quotes();
  PERFORM timber_bank_accrue(p_student_id);
  SELECT * INTO STRICT v_account FROM timber_bank_accounts WHERE student_id = p_student_id FOR UPDATE;
  v_term_end := v_account.stable_term_end;
  SELECT market_price INTO STRICT v_price FROM timber_bank_quotes WHERE quote_date = v_today;

  SELECT * INTO v_existing FROM timber_bank_ledger WHERE student_id = p_student_id AND request_id = p_request_id;
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
      IF v_account.market_cost + p_amount > 20000 THEN RAISE EXCEPTION '商队投入上限为 20,000 金币'; END IF;
      v_units_delta := ROUND(p_amount / v_price, 8);
      IF v_units_delta <= 0 THEN RAISE EXCEPTION '投入太少，无法购买份额'; END IF;
      v_wallet_delta := -p_amount;
      v_cost_delta := p_amount;
    WHEN 'market_sell', 'market_sell_all' THEN
      IF v_account.market_units <= 0 THEN RAISE EXCEPTION '目前没有商队份额'; END IF;
      v_units := CASE WHEN p_action = 'market_sell_all' OR p_amount >= floor(v_account.market_units * v_price)
        THEN v_account.market_units ELSE LEAST(v_account.market_units, ROUND(p_amount / v_price, 8)) END;
      v_payout := floor(v_units * v_price)::BIGINT;
      IF v_units <= 0 THEN RAISE EXCEPTION '卖出金额太小，请增加金额或全部卖出'; END IF;
      v_units_delta := -v_units;
      v_wallet_delta := v_payout;
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
    INSERT INTO gold_logs(student_id, amount, reason, balance_after)
    VALUES (p_student_id, v_wallet_delta::INT, CASE p_action
      WHEN 'stable_deposit' THEN '铁木银行存入稳稳存' WHEN 'stable_withdraw' THEN '铁木银行取出稳稳存'
      WHEN 'market_buy' THEN '铁木银行买入商队份额' ELSE '铁木银行卖出商队份额' END,
      (v_wallet + v_wallet_delta)::INT);
  END IF;
  INSERT INTO timber_bank_ledger(student_id, request_id, action, amount, wallet_delta, stable_delta, units_delta, quote_date)
  VALUES (p_student_id, p_request_id, p_action,
    CASE WHEN p_action = 'market_sell_all' THEN v_payout WHEN p_action IN ('stable_renew', 'stable_withdraw') THEN v_account.stable_gold ELSE p_amount END,
    v_wallet_delta, v_stable_delta, v_units_delta, v_today);
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_advance_quotes(), timber_bank_accrue(UUID), timber_bank_snapshot(UUID), timber_bank_check_session(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION timber_bank_get_state(UUID, TEXT, TEXT), timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timber_bank_get_state(UUID, TEXT, TEXT), timber_bank_transact(UUID, TEXT, TEXT, UUID, TEXT, INT) TO anon, authenticated;
COMMIT;
