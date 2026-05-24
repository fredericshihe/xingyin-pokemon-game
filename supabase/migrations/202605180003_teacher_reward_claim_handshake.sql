-- Add a two-phase reward claim flow so teacher rewards are only finalized
-- after the client has persisted the updated game state.

ALTER TABLE teacher_rewards ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE teacher_rewards ADD COLUMN IF NOT EXISTS claim_reserved_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_teacher_rewards_claim_token ON teacher_rewards(claim_token);

DROP FUNCTION IF EXISTS begin_teacher_reward_claim(UUID);
DROP FUNCTION IF EXISTS confirm_teacher_reward_claim(UUID, UUID);

CREATE OR REPLACE FUNCTION begin_teacher_reward_claim(
  p_student_id UUID
)
RETURNS TABLE (
  claim_token UUID,
  reward_id UUID,
  reward_type TEXT,
  item_type TEXT,
  item_key TEXT,
  quantity INT,
  pokemon_id INT,
  pokemon_level INT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id UUID;
  v_claim_token UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_student_id := p_student_id;

  SELECT tr.claim_token
  INTO v_claim_token
  FROM teacher_rewards tr
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token IS NOT NULL
  ORDER BY tr.created_at, tr.id
  LIMIT 1;

  IF v_claim_token IS NULL THEN
    v_claim_token := gen_random_uuid();

    UPDATE teacher_rewards tr
    SET claim_token = v_claim_token,
        claim_reserved_at = NOW()
    WHERE tr.student_id = v_student_id
    AND tr.claimed_at IS NULL
    AND tr.claim_token IS NULL;
  END IF;

  RETURN QUERY
  SELECT
    v_claim_token,
    tr.id AS reward_id,
    tr.reward_type,
    tr.item_type,
    tr.item_key,
    tr.quantity,
    tr.pokemon_id,
    tr.pokemon_level,
    tr.reason,
    tr.created_at
  FROM teacher_rewards tr
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token = v_claim_token
  ORDER BY tr.created_at, tr.id;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_teacher_reward_claim(
  p_student_id UUID,
  p_claim_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id UUID;
  v_claimed_count INT := 0;
BEGIN
  IF p_claim_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', '缺少奖励领取批次');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_student_id := p_student_id;

  UPDATE teacher_rewards tr
  SET claimed_at = COALESCE(tr.claimed_at, NOW()),
      claim_token = NULL,
      claim_reserved_at = NULL
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token = p_claim_token;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'claimedCount', v_claimed_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION begin_teacher_reward_claim(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_teacher_reward_claim(UUID, UUID) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
