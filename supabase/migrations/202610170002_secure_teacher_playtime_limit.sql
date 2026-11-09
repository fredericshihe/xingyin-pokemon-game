-- The table-password app has no auth.uid() session. Require the teacher's
-- password for the privileged limit mutation instead of trusting a caller
-- supplied teacher UUID, which students can discover from their own profile.
BEGIN;

CREATE OR REPLACE FUNCTION set_student_daily_playtime_limit(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit_minutes INT,
  p_teacher_password TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit_minutes INT := GREATEST(0, LEAST(COALESCE(p_limit_minutes, 30), 1440));
  v_student_name TEXT;
  v_status RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users teacher
    WHERE teacher.id = p_teacher_id
      AND teacher.role = 'teacher'
      AND COALESCE(teacher.registration_status, 'approved') = 'approved'
      AND COALESCE(TRIM(teacher.plain_password), '') = TRIM(COALESCE(p_teacher_password, ''))
  ) THEN
    RAISE EXCEPTION '教师验证失败，请重新登录教师账号';
  END IF;

  SELECT student.nickname INTO v_student_name
  FROM users student
  WHERE student.id = p_student_id
    AND student.role = 'student'
    AND student.teacher_id = p_teacher_id
    AND (student.registration_status IS NULL OR student.registration_status = 'approved')
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  UPDATE users SET daily_playtime_limit_minutes = v_limit_minutes WHERE id = p_student_id;
  SELECT * INTO v_status FROM get_student_playtime_status(p_student_id) LIMIT 1;
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

REVOKE ALL ON FUNCTION set_student_daily_playtime_limit(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_student_daily_playtime_limit(UUID, UUID, INT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
