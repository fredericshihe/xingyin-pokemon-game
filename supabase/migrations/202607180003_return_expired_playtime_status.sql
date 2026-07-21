-- Expiry is a valid authoritative status, not a stale-lease transport failure.

BEGIN;

CREATE OR REPLACE FUNCTION heartbeat_student_playtime(
  p_student_id UUID,
  p_session_id TEXT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
BEGIN
  SELECT *
  INTO v_status
  FROM settle_student_playtime_session(p_student_id, p_session_id, 'heartbeat')
  LIMIT 1;

  IF COALESCE(v_status.remaining_seconds, 0) <= 0 THEN
    RETURN QUERY
    SELECT v_status.limit_minutes, v_status.played_seconds, v_status.remaining_seconds, v_status.play_date;
    RETURN;
  END IF;

  IF NOT student_playtime_lease_is_valid(p_student_id, p_session_id, FALSE) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT v_status.limit_minutes, v_status.played_seconds, v_status.remaining_seconds, v_status.play_date;
END;
$$;

GRANT EXECUTE ON FUNCTION heartbeat_student_playtime(UUID, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
