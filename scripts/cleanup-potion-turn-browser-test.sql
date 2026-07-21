-- Removes the temporary student used by the potion turn-handoff browser audit.

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-00000000e503';
BEGIN
  DELETE FROM energy_logs WHERE student_id = v_user_id;
  DELETE FROM gold_logs WHERE student_id = v_user_id;
  DELETE FROM teacher_rewards WHERE student_id = v_user_id OR teacher_id = v_user_id;
  DELETE FROM game_saves WHERE user_id = v_user_id;
  DELETE FROM users WHERE id = v_user_id;
END $$;
