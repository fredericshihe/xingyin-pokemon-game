-- Page the teacher-wide gameplay feed so no student's history is silently truncated.

CREATE OR REPLACE FUNCTION get_teacher_gameplay_logs_page(
  p_teacher_id UUID,
  p_limit INT DEFAULT 1000,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  student_username TEXT,
  student_nickname TEXT,
  teacher_id UUID,
  event_type TEXT,
  category TEXT,
  title TEXT,
  summary TEXT,
  map_name TEXT,
  map_display_name TEXT,
  player_position JSONB,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 1000), 1000));
  v_offset INT := GREATEST(0, COALESCE(p_offset, 0));
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

  RETURN QUERY
  SELECT
    l.id,
    l.student_id,
    student.username,
    student.nickname,
    l.teacher_id,
    l.event_type,
    l.category,
    l.title,
    l.summary,
    l.map_name,
    l.map_display_name,
    l.player_position,
    l.details,
    l.created_at
  FROM student_gameplay_logs l
  JOIN users student ON student.id = l.student_id
  WHERE l.teacher_id = p_teacher_id
    AND student.teacher_id = p_teacher_id
    AND student.role = 'student'
    AND COALESCE(student.registration_status, 'approved') = 'approved'
  ORDER BY l.created_at DESC, l.id DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_gameplay_logs_page(UUID, INT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
