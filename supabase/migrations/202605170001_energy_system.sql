-- Energy system and controlled battle rewards.

ALTER TABLE users ADD COLUMN IF NOT EXISTS energy INT DEFAULT 6 CHECK (energy >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_energy INT DEFAULT 10 CHECK (max_energy >= 0);

UPDATE users
SET max_energy = GREATEST(COALESCE(max_energy, 10), COALESCE(energy, 6), 0),
    energy = LEAST(GREATEST(COALESCE(energy, 6), 0), GREATEST(COALESCE(max_energy, 10), COALESCE(energy, 6), 0))
WHERE role = 'student';

CREATE TABLE IF NOT EXISTS energy_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  teacher_id UUID REFERENCES users(id),
  amount INT NOT NULL,
  reason TEXT,
  energy_after INT NOT NULL,
  max_energy_after INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_energy_logs_student_id ON energy_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_energy_logs_created_at ON energy_logs(created_at DESC);

ALTER TABLE energy_logs ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS login_with_table_password(TEXT, TEXT);

CREATE OR REPLACE FUNCTION login_with_table_password(
  p_username TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  nickname TEXT,
  role TEXT,
  teacher_id UUID,
  gold INT,
  energy INT,
  max_energy INT,
  plain_password TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NULLIF(TRIM(p_username), '') IS NULL OR p_password IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.username,
    u.nickname,
    u.role,
    u.teacher_id,
    u.gold,
    u.energy,
    u.max_energy,
    u.plain_password,
    u.created_at
  FROM users u
  WHERE TRIM(u.username) = TRIM(p_username)
  AND COALESCE(TRIM(u.plain_password), '') = TRIM(p_password)
  ORDER BY
    CASE WHEN u.username = p_username THEN 0 ELSE 1 END,
    u.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION login_with_table_password(TEXT, TEXT) TO anon, authenticated;

DROP POLICY IF EXISTS "Teachers can update student energy" ON users;
DROP POLICY IF EXISTS "Students can view own energy logs" ON energy_logs;
DROP POLICY IF EXISTS "Teachers can view student energy logs" ON energy_logs;
DROP POLICY IF EXISTS "System can insert energy logs" ON energy_logs;

CREATE POLICY "Teachers can update student energy"
  ON users FOR UPDATE
  USING (
    role = 'student' AND EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  )
  WITH CHECK (role = 'student');

CREATE POLICY "Students can view own energy logs"
  ON energy_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view student energy logs"
  ON energy_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  );

CREATE POLICY "System can insert energy logs"
  ON energy_logs FOR INSERT
  WITH CHECK (true);

DROP FUNCTION IF EXISTS adjust_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS consume_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_energy(UUID, UUID, INT, TEXT, BOOLEAN, INT);
DROP FUNCTION IF EXISTS get_student_energy_logs(UUID, UUID, INT);

CREATE OR REPLACE FUNCTION adjust_energy(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '能量变动'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_energy INT;
  v_max_energy INT;
  v_new_energy INT;
BEGIN
  IF p_amount = 0 THEN
    SELECT energy, max_energy INTO v_current_energy, v_max_energy
    FROM users
    WHERE id = p_user_id
    AND role = 'student';

    RETURN json_build_object(
      'success', true,
      'energyBefore', COALESCE(v_current_energy, 0),
      'energyAfter', COALESCE(v_current_energy, 0),
      'maxEnergy', COALESCE(v_max_energy, 0)
    );
  END IF;

  IF p_amount > 0 THEN
    RETURN json_build_object('success', false, 'error', '能量只能由老师恢复或增加');
  END IF;

  SELECT energy, max_energy INTO v_current_energy, v_max_energy
  FROM users
  WHERE id = p_user_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_current_energy := COALESCE(v_current_energy, 0);
  v_max_energy := GREATEST(COALESCE(v_max_energy, 10), v_current_energy, 0);
  v_new_energy := v_current_energy + p_amount;

  IF v_new_energy < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', '能量不足',
      'currentEnergy', v_current_energy,
      'maxEnergy', v_max_energy
    );
  END IF;

  UPDATE users
  SET energy = v_new_energy,
      max_energy = v_max_energy
  WHERE id = p_user_id;

  INSERT INTO energy_logs (student_id, amount, reason, energy_after, max_energy_after)
  VALUES (p_user_id, p_amount, p_reason, v_new_energy, v_max_energy);

  RETURN json_build_object(
    'success', true,
    'energyBefore', v_current_energy,
    'energyAfter', v_new_energy,
    'maxEnergy', v_max_energy,
    'message', '消耗了' || ABS(p_amount) || '点能量'
  );
END;
$$;

CREATE OR REPLACE FUNCTION consume_energy(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '战斗消耗'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN adjust_energy(p_user_id, -ABS(p_amount), p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION grant_energy(
  p_teacher_id UUID,
  p_student_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '老师恢复能量',
  p_fill_to_max BOOLEAN DEFAULT FALSE,
  p_max_energy INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_energy INT;
  v_current_max_energy INT;
  v_new_energy INT;
  v_new_max_energy INT;
  v_student_nickname TEXT;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_amount < 0 THEN
    RETURN json_build_object('success', false, 'error', '能量数量不能为负数');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT energy, max_energy, nickname INTO v_current_energy, v_current_max_energy, v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  v_current_energy := COALESCE(v_current_energy, 0);
  v_current_max_energy := GREATEST(COALESCE(v_current_max_energy, 10), v_current_energy, 0);
  v_new_max_energy := CASE
    WHEN p_max_energy IS NULL THEN v_current_max_energy
    ELSE GREATEST(p_max_energy, 0, v_current_energy)
  END;

  IF p_fill_to_max THEN
    v_new_energy := v_new_max_energy;
  ELSE
    v_new_energy := LEAST(v_new_max_energy, v_current_energy + p_amount);
  END IF;

  UPDATE users
  SET energy = v_new_energy,
      max_energy = v_new_max_energy
  WHERE id = p_student_id;

  INSERT INTO energy_logs (student_id, teacher_id, amount, reason, energy_after, max_energy_after)
  VALUES (p_student_id, p_teacher_id, v_new_energy - v_current_energy, p_reason, v_new_energy, v_new_max_energy);

  RETURN json_build_object(
    'success', true,
    'studentName', v_student_nickname,
    'energyBefore', v_current_energy,
    'energyAfter', v_new_energy,
    'maxEnergyBefore', v_current_max_energy,
    'maxEnergyAfter', v_new_max_energy,
    'message', '成功给' || v_student_nickname || '恢复到 ' || v_new_energy || '/' || v_new_max_energy || ' 能量'
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_student_energy_logs(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  teacher_id UUID,
  amount INT,
  reason TEXT,
  energy_after INT,
  max_energy_after INT,
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
    FROM users u
    WHERE u.id = p_teacher_id
    AND u.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));

  RETURN QUERY
  SELECT
    el.id,
    el.student_id,
    el.teacher_id,
    el.amount,
    el.reason,
    el.energy_after,
    el.max_energy_after,
    el.created_at
  FROM energy_logs el
  WHERE el.student_id = p_student_id
  ORDER BY el.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_energy(UUID, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_energy(UUID, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION grant_energy(UUID, UUID, INT, TEXT, BOOLEAN, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_student_energy_logs(UUID, UUID, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION adjust_gold(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '金币变动'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_gold INT;
  v_new_gold INT;
BEGIN
  IF p_amount = 0 THEN
    RETURN json_build_object('success', true, 'goldBefore', 0, 'goldAfter', 0);
  END IF;

  SELECT gold INTO v_current_gold
  FROM users
  WHERE id = p_user_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_new_gold := v_current_gold + p_amount;

  IF v_new_gold < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', '金币不足',
      'currentGold', v_current_gold
    );
  END IF;

  UPDATE users
  SET gold = v_new_gold
  WHERE id = p_user_id;

  INSERT INTO gold_logs (student_id, amount, reason, balance_after)
  VALUES (p_user_id, p_amount, p_reason, v_new_gold);

  RETURN json_build_object(
    'success', true,
    'goldBefore', v_current_gold,
    'goldAfter', v_new_gold,
    'message', CASE
      WHEN p_amount < 0 THEN '花费了' || ABS(p_amount) || '金币'
      ELSE '获得了' || p_amount || '金币'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_gold(UUID, INT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
