-- Allow teachers to lower a student's max energy.
-- If the new cap is below the current energy, clamp current energy down to the new cap
-- so the change always takes effect instead of being silently ignored.

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

  SELECT energy, max_energy, nickname
  INTO v_current_energy, v_current_max_energy, v_student_nickname
  FROM users
  WHERE id = p_student_id
    AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  v_current_energy := GREATEST(COALESCE(v_current_energy, 0), 0);
  v_current_max_energy := GREATEST(COALESCE(v_current_max_energy, 10), 0, v_current_energy);
  v_new_max_energy := CASE
    WHEN p_max_energy IS NULL THEN v_current_max_energy
    ELSE GREATEST(p_max_energy, 0)
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
  VALUES (
    p_student_id,
    p_teacher_id,
    v_new_energy - v_current_energy,
    p_reason,
    v_new_energy,
    v_new_max_energy
  );

  RETURN json_build_object(
    'success', true,
    'studentName', v_student_nickname,
    'energyBefore', v_current_energy,
    'energyAfter', v_new_energy,
    'maxEnergyBefore', v_current_max_energy,
    'maxEnergyAfter', v_new_max_energy,
    'message', '成功调整' || v_student_nickname || '能量为 ' || v_new_energy || '/' || v_new_max_energy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION grant_energy(UUID, UUID, INT, TEXT, BOOLEAN, INT) TO anon, authenticated;
