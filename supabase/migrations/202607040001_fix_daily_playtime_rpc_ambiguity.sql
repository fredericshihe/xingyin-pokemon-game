-- Fix PL/pgSQL name ambiguity in daily playtime RPCs.
-- RETURNS TABLE exposes output column names as variables, so unqualified
-- "play_date" inside ON CONFLICT can be ambiguous.

CREATE OR REPLACE FUNCTION get_student_playtime_status(
  p_student_id UUID
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := playtime_today_cn();
  v_limit_minutes INT;
BEGIN
  SELECT GREATEST(0, LEAST(COALESCE(u.daily_playtime_limit_minutes, 30), 1440))
  INTO v_limit_minutes
  FROM users u
  WHERE u.id = p_student_id
    AND u.role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  INSERT INTO student_playtime_daily (student_id, play_date, played_seconds)
  VALUES (p_student_id, v_today, 0)
  ON CONFLICT ON CONSTRAINT student_playtime_daily_pkey DO NOTHING;

  RETURN QUERY
  SELECT
    v_limit_minutes,
    GREATEST(COALESCE(d.played_seconds, 0), 0),
    GREATEST(0, (v_limit_minutes * 60) - GREATEST(COALESCE(d.played_seconds, 0), 0)),
    v_today
  FROM student_playtime_daily d
  WHERE d.student_id = p_student_id
    AND d.play_date = v_today
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_playtime_status(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION record_student_playtime(
  p_student_id UUID,
  p_seconds INT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today DATE := playtime_today_cn();
  v_limit_minutes INT;
  v_limit_seconds INT;
  v_delta_seconds INT := GREATEST(0, LEAST(COALESCE(p_seconds, 0), 86400));
  v_played_seconds INT;
BEGIN
  SELECT GREATEST(0, LEAST(COALESCE(u.daily_playtime_limit_minutes, 30), 1440))
  INTO v_limit_minutes
  FROM users u
  WHERE u.id = p_student_id
    AND u.role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit_seconds := v_limit_minutes * 60;

  INSERT INTO student_playtime_daily (student_id, play_date, played_seconds)
  VALUES (p_student_id, v_today, 0)
  ON CONFLICT ON CONSTRAINT student_playtime_daily_pkey DO NOTHING;

  UPDATE student_playtime_daily d
  SET played_seconds = CASE
        WHEN GREATEST(COALESCE(d.played_seconds, 0), 0) >= v_limit_seconds THEN GREATEST(COALESCE(d.played_seconds, 0), 0)
        ELSE LEAST(v_limit_seconds, GREATEST(COALESCE(d.played_seconds, 0), 0) + v_delta_seconds)
      END,
      updated_at = NOW()
  WHERE d.student_id = p_student_id
    AND d.play_date = v_today
  RETURNING d.played_seconds INTO v_played_seconds;

  RETURN QUERY
  SELECT
    v_limit_minutes,
    GREATEST(COALESCE(v_played_seconds, 0), 0),
    GREATEST(0, v_limit_seconds - GREATEST(COALESCE(v_played_seconds, 0), 0)),
    v_today;
END;
$$;

GRANT EXECUTE ON FUNCTION record_student_playtime(UUID, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
