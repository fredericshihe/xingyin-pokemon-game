-- Bank access uses the authenticated student session and playtime lease.
DO $$
BEGIN
  IF to_regprocedure('timber_bank_advance_quotes()') IS NULL
     OR to_regprocedure('timber_bank_accrue(uuid)') IS NULL
     OR to_regprocedure('timber_bank_snapshot(uuid)') IS NULL THEN
    RAISE EXCEPTION '请先执行 202610050001_timber_bank.sql，再执行本迁移';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_check_session(p_student_id UUID, p_session_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_remaining INT;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 16 THEN RAISE EXCEPTION '游玩会话无效，请重新登录'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_student_id AND role = 'student') THEN RAISE EXCEPTION '玩家不存在'; END IF;
  SELECT remaining_seconds INTO v_remaining FROM settle_student_playtime_session(p_student_id, p_session_id, 'check') LIMIT 1;
  IF COALESCE(v_remaining, 0) <= 0 THEN RAISE EXCEPTION '今日游玩时间已用完'; END IF;
  IF NOT student_playtime_lease_is_valid(p_student_id, p_session_id, FALSE) THEN RAISE EXCEPTION '游玩会话已结束，请重新读取进度'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION timber_bank_get_state(p_student_id UUID, p_session_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM timber_bank_check_session(p_student_id, p_session_id);
  PERFORM 1 FROM users WHERE id = p_student_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  PERFORM timber_bank_advance_quotes();
  PERFORM timber_bank_accrue(p_student_id);
  RETURN timber_bank_snapshot(p_student_id);
END;
$$;

-- Compatibility entry point for clients that no longer send a second password.
-- It delegates to the already-deployed password-signature function when present.
DO $$
BEGIN
  IF to_regprocedure('timber_bank_transact(uuid,text,uuid,text,integer)') IS NULL
     AND to_regprocedure('timber_bank_transact(uuid,text,text,uuid,text,integer)') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION timber_bank_transact(
        p_student_id UUID, p_session_id TEXT, p_request_id UUID, p_action TEXT, p_amount INT DEFAULT 0
      ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $body$
      DECLARE v_password TEXT;
      BEGIN
        SELECT plain_password INTO v_password FROM users WHERE id = p_student_id AND role = 'student';
        RETURN timber_bank_transact(p_student_id, p_session_id, v_password, p_request_id, p_action, p_amount);
      END;
      $body$;
    $fn$;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION timber_bank_get_state(UUID, TEXT), timber_bank_transact(UUID, TEXT, UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION timber_bank_get_state(UUID, TEXT), timber_bank_transact(UUID, TEXT, UUID, TEXT, INT) TO anon, authenticated;
