-- Run after the bank migrations through 202610070002 in an isolated database.
INSERT INTO users(id, role, gold, plain_password)
VALUES ('00000000-0000-0000-0000-000000000101', 'student', 50000, 'bank-test-password');

DO $$
DECLARE
  student UUID := '00000000-0000-0000-0000-000000000101';
  session TEXT := 'test-session-123456';
  state JSONB;
  request UUID := '00000000-0000-0000-0000-000000000201';
  failed BOOLEAN;
  quote timber_bank_quotes%ROWTYPE;
BEGIN
  failed := FALSE;
  BEGIN
    PERFORM timber_bank_get_state(student, session, 'wrong-password');
  EXCEPTION WHEN OTHERS THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'bank accepted incorrect password'; END IF;

  state := timber_bank_get_state(student, session, 'bank-test-password');
  IF (state->>'stableRateBps')::INT NOT BETWEEN 0 AND 200 THEN RAISE EXCEPTION 'stable rate out of range'; END IF;

  state := timber_bank_transact(student, session, 'bank-test-password', request, 'stable_deposit', 5000);
  IF (state->>'walletGold')::INT <> 45000 OR (state->>'stableGold')::INT <> 5000 THEN RAISE EXCEPTION 'stable deposit mismatch'; END IF;
  IF (state->>'stableTermMatured')::BOOLEAN THEN RAISE EXCEPTION 'new term already matured'; END IF;
  state := timber_bank_transact(student, session, 'bank-test-password', request, 'stable_deposit', 5000);
  IF (state->>'walletGold')::INT <> 45000 THEN RAISE EXCEPTION 'idempotent retry charged twice'; END IF;

  failed := FALSE;
  BEGIN
    PERFORM timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'stable_deposit', 1);
  EXCEPTION WHEN OTHERS THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'active term accepted additional deposit'; END IF;
  failed := FALSE;
  BEGIN
    PERFORM timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'stable_withdraw', 0);
  EXCEPTION WHEN OTHERS THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'active term accepted withdrawal'; END IF;
  failed := FALSE;
  BEGIN
    PERFORM timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'stable_renew', 0);
  EXCEPTION WHEN OTHERS THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'active term accepted renewal'; END IF;

  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'market_buy', 20001);
  IF (state->>'marketCost')::INT <> 20001 THEN RAISE EXCEPTION 'market cost mismatch'; END IF;
  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'market_buy', 20000);
  IF (state->>'marketCost')::INT <> 40001 THEN RAISE EXCEPTION 'market accepted no unlimited add-on'; END IF;
  IF (state->>'marketAveragePrice')::NUMERIC <= 0 THEN RAISE EXCEPTION 'market average price missing'; END IF;
  IF (state->>'marketNextChangeAt')::TIMESTAMPTZ <= (state->>'marketQuoteSlot')::TIMESTAMPTZ THEN RAISE EXCEPTION 'market quote interval missing'; END IF;
  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'market_sell_all', 0);
  IF (state->>'marketCost')::INT <> 0 OR (state->>'marketUnits')::NUMERIC <> 0 THEN RAISE EXCEPTION 'sell all left holdings'; END IF;

  DELETE FROM timber_bank_quotes WHERE quote_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
  INSERT INTO timber_bank_quotes(quote_date, market_price, market_change_bps, market_regime, stable_rate_bps)
  VALUES (((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE - 1), 100, -200, 'down', 200);
  UPDATE timber_bank_accounts SET accrual_at = (((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE - 1)::TIMESTAMP AT TIME ZONE 'Asia/Shanghai'),
    accrual_day = ((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE - 1), accrued_basis = 0,
    stable_term_end = ((clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE::TIMESTAMP AT TIME ZONE 'Asia/Shanghai')
  WHERE student_id = student;
  state := timber_bank_get_state(student, session, 'bank-test-password');
  IF (state->>'stableGold')::INT <> 5100 THEN RAISE EXCEPTION 'daily interest did not use the full 5000 principal'; END IF;
  state := timber_bank_get_state(student, session, 'bank-test-password');
  IF (state->>'stableGold')::INT <> 5100 OR NOT (state->>'stableTermMatured')::BOOLEAN THEN
    RAISE EXCEPTION 'matured term changed after expiry';
  END IF;
  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'stable_renew', 0);
  IF (state->>'stableGold')::INT <> 5100 OR (state->>'stableTermMatured')::BOOLEAN THEN
    RAISE EXCEPTION 'renewal did not begin new three-day term';
  END IF;
  UPDATE timber_bank_accounts SET stable_term_end = clock_timestamp() - INTERVAL '1 second' WHERE student_id = student;
  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'stable_withdraw', 0);
  IF (state->>'stableGold')::INT <> 0 OR (state->>'walletGold')::INT <> 50100 THEN
    RAISE EXCEPTION 'matured full withdrawal failed';
  END IF;
  SELECT * INTO STRICT quote FROM timber_bank_quotes WHERE quote_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
  IF ABS(quote.market_change_bps) NOT BETWEEN 200 AND 1000 THEN RAISE EXCEPTION 'market change out of range'; END IF;
  IF ABS((quote.market_price / 100 - 1) * 10000 - quote.market_change_bps) > 0.00001 THEN RAISE EXCEPTION 'market price and change disagree'; END IF;

  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'market_buy', 1);
  UPDATE timber_bank_quotes SET market_price = 0.9 WHERE quote_date = quote.quote_date;
  state := timber_bank_transact(student, session, 'bank-test-password', gen_random_uuid(), 'market_sell_all', 0);
  IF (state->>'marketUnits')::NUMERIC <> 0 OR (state->>'marketCost')::INT <> 0 THEN
    RAISE EXCEPTION 'sub-one-gold holding could not be closed';
  END IF;
END;
$$;
