-- Verifies that save_cloud_game_state_with_resources only refunds escape
-- energy when the previous cloud save still has battleEnergyRefundEligible=true.
--
-- This script is intended to run against Supabase via:
--
--   supabase db query --db-url '<pooler-url>' --dns-resolver https \
--     -f scripts/verify-escape-refund-rpc-guard.sql
--
-- It runs as a single DO statement. On success it deletes all temporary rows;
-- on failure PostgreSQL rolls back the whole statement.

DO $$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_rejected RECORD;
  v_allowed RECORD;
BEGIN
  INSERT INTO users (
    id,
    email,
    username,
    nickname,
    role,
    gold,
    energy,
    max_energy,
    plain_password,
    registration_status
  )
  VALUES (
    v_user_id,
    'audit-' || v_user_id::TEXT || '@example.invalid',
    'audit_' || REPLACE(v_user_id::TEXT, '-', ''),
    'RPC Guard Audit',
    'student',
    0,
    4,
    10,
    'audit-only',
    'approved'
  );

  INSERT INTO game_saves (user_id, game_data, save_revision)
  VALUES (
    v_user_id,
    jsonb_build_object(
      'view', 'battle',
      'battleKind', 'wild',
      'battlePhase', 'escape',
      'activeBattleEnergyCost', 1,
      'battleEnergyRefundEligible', false,
      '_sync', jsonb_build_object('revision', 1)
    ),
    1
  );

  SELECT *
  INTO v_rejected
  FROM save_cloud_game_state_with_resources(
    v_user_id,
    jsonb_build_object(
      'view', 'map',
      'activeBattleEnergyCost', 0,
      'battleEnergyRefundEligible', false,
      '_sync', jsonb_build_object('revision', 2)
    ),
    0,
    'audit noop',
    1,
    '逃跑成功退回能量'
  );

  IF v_rejected.accepted IS DISTINCT FROM FALSE
    OR v_rejected.error_message IS DISTINCT FROM '能量只能由老师恢复或增加'
    OR v_rejected.energy_after IS DISTINCT FROM 4 THEN
    RAISE EXCEPTION
      'Expected refund rejection when battleEnergyRefundEligible=false, got accepted=%, error=%, energy=%',
      v_rejected.accepted,
      v_rejected.error_message,
      v_rejected.energy_after;
  END IF;

  UPDATE game_saves
  SET game_data = jsonb_build_object(
        'view', 'battle',
        'battleKind', 'wild',
        'battlePhase', 'escape',
        'activeBattleEnergyCost', 1,
        'battleEnergyRefundEligible', true,
        '_sync', jsonb_build_object('revision', 2)
      ),
      save_revision = 2
  WHERE user_id = v_user_id;

  SELECT *
  INTO v_allowed
  FROM save_cloud_game_state_with_resources(
    v_user_id,
    jsonb_build_object(
      'view', 'map',
      'activeBattleEnergyCost', 0,
      'battleEnergyRefundEligible', false,
      '_sync', jsonb_build_object('revision', 3)
    ),
    0,
    'audit noop',
    1,
    '逃跑成功退回能量'
  );

  IF v_allowed.accepted IS DISTINCT FROM TRUE
    OR v_allowed.error_message IS NOT NULL
    OR v_allowed.energy_after IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION
      'Expected refund acceptance when battleEnergyRefundEligible=true, got accepted=%, error=%, energy=%',
      v_allowed.accepted,
      v_allowed.error_message,
      v_allowed.energy_after;
  END IF;

  DELETE FROM energy_logs WHERE student_id = v_user_id;
  DELETE FROM gold_logs WHERE student_id = v_user_id;
  DELETE FROM teacher_rewards WHERE student_id = v_user_id OR teacher_id = v_user_id;
  DELETE FROM game_saves WHERE user_id = v_user_id;
  DELETE FROM users WHERE id = v_user_id;

  RAISE NOTICE
    'escape refund RPC guard ok: rejected_error=%, accepted_energy_after=%',
    v_rejected.error_message,
    v_allowed.energy_after;
END $$;
