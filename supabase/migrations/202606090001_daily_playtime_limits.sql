-- Daily student playtime limits.
-- - Each student gets 30 minutes per China-calendar day by default.
-- - Played seconds are stored server-side, so the counter survives re-login.
-- - Teachers can set a per-student daily limit and the client is notified in realtime.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS daily_playtime_limit_minutes INT;

UPDATE users
SET daily_playtime_limit_minutes = GREATEST(0, LEAST(COALESCE(daily_playtime_limit_minutes, 30), 1440));

ALTER TABLE users
  ALTER COLUMN daily_playtime_limit_minutes SET DEFAULT 30,
  ALTER COLUMN daily_playtime_limit_minutes SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_daily_playtime_limit_minutes_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_daily_playtime_limit_minutes_check
      CHECK (daily_playtime_limit_minutes >= 0 AND daily_playtime_limit_minutes <= 1440);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS student_playtime_daily (
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_date DATE NOT NULL,
  played_seconds INT NOT NULL DEFAULT 0 CHECK (played_seconds >= 0),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  PRIMARY KEY (student_id, play_date)
);

CREATE INDEX IF NOT EXISTS idx_student_playtime_daily_date
  ON student_playtime_daily(play_date DESC);

ALTER TABLE student_playtime_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct student playtime access" ON student_playtime_daily;
CREATE POLICY "No direct student playtime access"
  ON student_playtime_daily
  FOR ALL
  USING (false)
  WITH CHECK (false);

DROP FUNCTION IF EXISTS playtime_today_cn();
CREATE OR REPLACE FUNCTION playtime_today_cn()
RETURNS DATE
LANGUAGE sql
STABLE
AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Shanghai')::DATE;
$$;

GRANT EXECUTE ON FUNCTION playtime_today_cn() TO anon, authenticated;

DROP FUNCTION IF EXISTS get_student_playtime_status(UUID);
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
  ON CONFLICT (student_id, play_date) DO NOTHING;

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

DROP FUNCTION IF EXISTS record_student_playtime(UUID, INT);
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
  ON CONFLICT (student_id, play_date) DO NOTHING;

  UPDATE student_playtime_daily d
  SET played_seconds = CASE
        WHEN GREATEST(COALESCE(d.played_seconds, 0), 0) >= v_limit_seconds THEN GREATEST(COALESCE(d.played_seconds, 0), 0)
        ELSE LEAST(v_limit_seconds, GREATEST(COALESCE(d.played_seconds, 0), 0) + v_delta_seconds)
      END,
      updated_at = NOW()
  WHERE d.student_id = p_student_id
    AND d.play_date = v_today
  RETURNING played_seconds INTO v_played_seconds;

  RETURN QUERY
  SELECT
    v_limit_minutes,
    GREATEST(COALESCE(v_played_seconds, 0), 0),
    GREATEST(0, v_limit_seconds - GREATEST(COALESCE(v_played_seconds, 0), 0)),
    v_today;
END;
$$;

GRANT EXECUTE ON FUNCTION record_student_playtime(UUID, INT) TO anon, authenticated;

DROP FUNCTION IF EXISTS set_student_daily_playtime_limit(UUID, UUID, INT);
CREATE OR REPLACE FUNCTION set_student_daily_playtime_limit(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit_minutes INT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit_minutes INT := GREATEST(0, LEAST(COALESCE(p_limit_minutes, 30), 1440));
  v_student_name TEXT;
  v_status RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users teacher
    WHERE teacher.id = p_teacher_id
      AND teacher.role = 'teacher'
      AND COALESCE(teacher.registration_status, 'approved') = 'approved'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT student.nickname
  INTO v_student_name
  FROM users student
  WHERE student.id = p_student_id
    AND student.role = 'student'
    AND student.teacher_id = p_teacher_id
    AND (student.registration_status IS NULL OR student.registration_status = 'approved')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  UPDATE users
  SET daily_playtime_limit_minutes = v_limit_minutes
  WHERE id = p_student_id;

  SELECT *
  INTO v_status
  FROM get_student_playtime_status(p_student_id)
  LIMIT 1;

  RETURN json_build_object(
    'success', true,
    'studentName', v_student_name,
    'limitMinutes', v_limit_minutes,
    'playedSeconds', COALESCE(v_status.played_seconds, 0),
    'remainingSeconds', COALESCE(v_status.remaining_seconds, v_limit_minutes * 60),
    'playDate', v_status.play_date,
    'message', '已将每日游玩时长设为 ' || v_limit_minutes || ' 分钟'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION set_student_daily_playtime_limit(UUID, UUID, INT) TO anon, authenticated;

DROP FUNCTION IF EXISTS get_teacher_students(UUID);
CREATE OR REPLACE FUNCTION get_teacher_students(
  p_teacher_id UUID
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  gold INT,
  energy INT,
  max_energy INT,
  daily_playtime_limit_minutes INT,
  created_at TIMESTAMP WITH TIME ZONE,
  registration_status TEXT,
  registration_requested_at TIMESTAMP WITH TIME ZONE,
  registration_reviewed_at TIMESTAMP WITH TIME ZONE,
  registration_rejection_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users teacher
    WHERE teacher.id = p_teacher_id
      AND teacher.role = 'teacher'
      AND COALESCE(teacher.registration_status, 'approved') = 'approved'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.nickname,
    u.gold,
    u.energy,
    u.max_energy,
    GREATEST(0, LEAST(COALESCE(u.daily_playtime_limit_minutes, 30), 1440)) AS daily_playtime_limit_minutes,
    u.created_at,
    COALESCE(u.registration_status, 'approved') AS registration_status,
    u.registration_requested_at,
    u.registration_reviewed_at,
    u.registration_rejection_reason
  FROM users u
  WHERE u.role = 'student'
    AND u.teacher_id = p_teacher_id
    AND (u.registration_status IS NULL OR u.registration_status = 'approved')
  ORDER BY u.nickname, u.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_students(UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
