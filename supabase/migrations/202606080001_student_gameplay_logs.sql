-- Detailed student gameplay logs.
-- Additive only: this migration does not update or rewrite existing saves/users.

CREATE TABLE IF NOT EXISTS student_gameplay_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'progress',
  title TEXT NOT NULL DEFAULT '游玩记录',
  summary TEXT,
  map_name TEXT,
  map_display_name TEXT,
  player_position JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_gameplay_logs'
      AND column_name = 'position'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'student_gameplay_logs'
      AND column_name = 'player_position'
  ) THEN
    ALTER TABLE student_gameplay_logs RENAME COLUMN position TO player_position;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_gameplay_logs_student_created
  ON student_gameplay_logs(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_gameplay_logs_teacher_created
  ON student_gameplay_logs(teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_gameplay_logs_category_created
  ON student_gameplay_logs(category, created_at DESC);

ALTER TABLE student_gameplay_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct student gameplay log access" ON student_gameplay_logs;
CREATE POLICY "No direct student gameplay log access"
  ON student_gameplay_logs
  FOR ALL
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION append_student_gameplay_log(
  p_student_id UUID,
  p_event_type TEXT,
  p_category TEXT DEFAULT 'progress',
  p_title TEXT DEFAULT NULL,
  p_summary TEXT DEFAULT NULL,
  p_map_name TEXT DEFAULT NULL,
  p_map_display_name TEXT DEFAULT NULL,
  p_position JSONB DEFAULT '{}'::jsonb,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_log_id UUID;
  v_event_type TEXT;
  v_category TEXT;
BEGIN
  SELECT u.teacher_id
  INTO v_teacher_id
  FROM users u
  WHERE u.id = p_student_id
    AND u.role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_event_type := LEFT(NULLIF(TRIM(COALESCE(p_event_type, '')), ''), 80);
  IF v_event_type IS NULL THEN
    RAISE EXCEPTION 'event_type required';
  END IF;

  v_category := LEFT(NULLIF(TRIM(COALESCE(p_category, '')), ''), 40);
  IF v_category IS NULL THEN
    v_category := 'progress';
  END IF;

  INSERT INTO student_gameplay_logs (
    student_id,
    teacher_id,
    event_type,
    category,
    title,
    summary,
    map_name,
    map_display_name,
    player_position,
    details
  )
  VALUES (
    p_student_id,
    v_teacher_id,
    v_event_type,
    v_category,
    LEFT(COALESCE(NULLIF(TRIM(p_title), ''), '游玩记录'), 240),
    NULLIF(LEFT(COALESCE(TRIM(p_summary), ''), 500), ''),
    NULLIF(LEFT(COALESCE(TRIM(p_map_name), ''), 120), ''),
    NULLIF(LEFT(COALESCE(TRIM(p_map_display_name), ''), 120), ''),
    COALESCE(p_position, '{}'::jsonb),
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION append_student_gameplay_log(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_student_gameplay_logs(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit INT DEFAULT 80
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
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
AS $$
DECLARE
  v_limit INT;
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

  IF NOT EXISTS (
    SELECT 1
    FROM users student
    WHERE student.id = p_student_id
      AND student.role = 'student'
      AND student.teacher_id = p_teacher_id
      AND (student.registration_status IS NULL OR student.registration_status = 'approved')
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 80), 300));

  RETURN QUERY
  SELECT
    l.id,
    l.student_id,
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
  WHERE l.student_id = p_student_id
    AND l.teacher_id = p_teacher_id
  ORDER BY l.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_student_gameplay_logs(UUID, UUID, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
