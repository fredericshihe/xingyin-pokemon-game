ALTER TABLE teacher_rewards
DROP CONSTRAINT IF EXISTS teacher_rewards_item_type_check;

ALTER TABLE teacher_rewards
ADD CONSTRAINT teacher_rewards_item_type_check
CHECK (item_type IN ('pokeball', 'potion', 'expPotion', 'evolutionItem'));

CREATE OR REPLACE FUNCTION grant_item_reward(
  p_teacher_id UUID,
  p_student_id UUID,
  p_item_type TEXT,
  p_item_key TEXT,
  p_quantity INT,
  p_reason TEXT DEFAULT '老师奖励'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_student_nickname TEXT;
  v_reward_id UUID;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_item_type NOT IN ('pokeball', 'potion', 'expPotion', 'evolutionItem') THEN
    RETURN json_build_object('success', false, 'error', '无效的道具类型');
  END IF;

  IF p_item_key IS NULL OR LENGTH(TRIM(p_item_key)) = 0 THEN
    RETURN json_build_object('success', false, 'error', '无效的道具');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', '数量必须大于0');
  END IF;

  v_teacher_id := p_teacher_id;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT nickname INTO v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  INSERT INTO teacher_rewards (
    student_id, teacher_id, reward_type, item_type, item_key, quantity, reason
  )
  VALUES (
    p_student_id, v_teacher_id, 'item', p_item_type, p_item_key, p_quantity, p_reason
  )
  RETURNING id INTO v_reward_id;

  RETURN json_build_object(
    'success', true,
    'reward_id', v_reward_id,
    'message', '奖励发放成功'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION grant_item_reward(UUID, UUID, TEXT, TEXT, INT, TEXT) TO anon, authenticated;
