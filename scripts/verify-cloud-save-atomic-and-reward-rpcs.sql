-- Verifies the remote Supabase RPCs that protect cloud-save consistency:
-- - save_cloud_game_save rejects same-revision different payloads.
-- - save_cloud_game_state_with_resources is atomic for resource + save updates.
-- - same-revision same-payload retries do not reapply resource deltas.
-- - teacher reward claim handshake reserves, then confirms, a reward batch.
--
-- It runs as a single DO statement. On success it deletes all temporary rows;
-- on failure PostgreSQL rolls back the whole statement.

DO $$
DECLARE
  v_teacher_id UUID := '00000000-0000-0000-0000-00000000a701';
  v_student_id UUID := '00000000-0000-0000-0000-00000000a702';
  v_plain_same RECORD;
  v_plain_conflict RECORD;
  v_atomic_insufficient RECORD;
  v_atomic_ok RECORD;
  v_atomic_retry RECORD;
  v_saved JSONB;
  v_gold INT;
  v_energy INT;
  v_revision BIGINT;
  v_token UUID;
  v_begin_count INT;
  v_confirm JSON;
  v_claimed_count INT;
  v_remaining_count INT;
BEGIN
  DELETE FROM energy_logs WHERE student_id = v_student_id;
  DELETE FROM gold_logs WHERE student_id = v_student_id;
  DELETE FROM teacher_rewards WHERE student_id = v_student_id OR teacher_id IN (v_teacher_id, v_student_id);
  DELETE FROM game_saves WHERE user_id IN (v_teacher_id, v_student_id);
  DELETE FROM users WHERE id IN (v_teacher_id, v_student_id);

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
    registration_status,
    registration_reviewed_at
  )
  VALUES
  (
    v_teacher_id,
    'audit-rpc-teacher@example.invalid',
    'audit_rpc_teacher',
    'RPC 审计老师',
    'teacher',
    0,
    0,
    0,
    'audit-only',
    'approved',
    NOW()
  ),
  (
    v_student_id,
    'audit-rpc-student@example.invalid',
    'audit_rpc_student',
    'RPC 审计学生',
    'student',
    10,
    5,
    10,
    'audit-only',
    'approved',
    NOW()
  );

  INSERT INTO game_saves (user_id, game_data, save_revision)
  VALUES (
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'base',
      '_sync', jsonb_build_object('revision', 5)
    ),
    5
  );

  SELECT *
  INTO v_plain_same
  FROM save_cloud_game_save(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'base',
      '_sync', jsonb_build_object('revision', 5)
    )
  );

  IF v_plain_same.accepted IS DISTINCT FROM TRUE
    OR v_plain_same.save_revision IS DISTINCT FROM 5 THEN
    RAISE EXCEPTION
      'Expected same revision same payload to be idempotent, got accepted=%, revision=%',
      v_plain_same.accepted,
      v_plain_same.save_revision;
  END IF;

  SELECT *
  INTO v_plain_conflict
  FROM save_cloud_game_save(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'stale-overwrite',
      '_sync', jsonb_build_object('revision', 5)
    )
  );

  SELECT game_data, save_revision
  INTO v_saved, v_revision
  FROM game_saves
  WHERE user_id = v_student_id;

  IF v_plain_conflict.accepted IS DISTINCT FROM FALSE
    OR v_revision IS DISTINCT FROM 5
    OR v_saved #>> '{marker}' IS DISTINCT FROM 'base' THEN
    RAISE EXCEPTION
      'Expected same revision different payload rejection, got accepted=%, revision=%, marker=%',
      v_plain_conflict.accepted,
      v_revision,
      v_saved #>> '{marker}';
  END IF;

  SELECT *
  INTO v_atomic_insufficient
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'should-not-save',
      '_sync', jsonb_build_object('revision', 6)
    ),
    -99,
    'audit insufficient gold',
    0,
    'audit noop'
  );

  SELECT gold, energy INTO v_gold, v_energy FROM users WHERE id = v_student_id;
  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_atomic_insufficient.accepted IS DISTINCT FROM FALSE
    OR v_atomic_insufficient.error_message IS DISTINCT FROM '金币不足'
    OR v_gold IS DISTINCT FROM 10
    OR v_energy IS DISTINCT FROM 5
    OR v_revision IS DISTINCT FROM 5
    OR v_saved #>> '{marker}' IS DISTINCT FROM 'base' THEN
    RAISE EXCEPTION
      'Expected insufficient gold to leave resources/save unchanged, accepted=%, error=%, gold=%, energy=%, revision=%, marker=%',
      v_atomic_insufficient.accepted,
      v_atomic_insufficient.error_message,
      v_gold,
      v_energy,
      v_revision,
      v_saved #>> '{marker}';
  END IF;

  SELECT *
  INTO v_atomic_ok
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'atomic-ok',
      '_sync', jsonb_build_object('revision', 6)
    ),
    -3,
    'audit spend gold',
    -2,
    'audit spend energy'
  );

  SELECT gold, energy INTO v_gold, v_energy FROM users WHERE id = v_student_id;
  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_atomic_ok.accepted IS DISTINCT FROM TRUE
    OR v_gold IS DISTINCT FROM 7
    OR v_energy IS DISTINCT FROM 3
    OR v_revision IS DISTINCT FROM 6
    OR v_saved #>> '{marker}' IS DISTINCT FROM 'atomic-ok' THEN
    RAISE EXCEPTION
      'Expected atomic resource save success, accepted=%, gold=%, energy=%, revision=%, marker=%',
      v_atomic_ok.accepted,
      v_gold,
      v_energy,
      v_revision,
      v_saved #>> '{marker}';
  END IF;

  SELECT *
  INTO v_atomic_retry
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'marker', 'atomic-ok',
      '_sync', jsonb_build_object('revision', 6)
    ),
    -3,
    'audit spend gold retry',
    -2,
    'audit spend energy retry'
  );

  SELECT gold, energy INTO v_gold, v_energy FROM users WHERE id = v_student_id;

  IF v_atomic_retry.accepted IS DISTINCT FROM TRUE
    OR v_gold IS DISTINCT FROM 7
    OR v_energy IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'Expected same revision retry to be idempotent without resource reapply, accepted=%, gold=%, energy=%',
      v_atomic_retry.accepted,
      v_gold,
      v_energy;
  END IF;

  INSERT INTO teacher_rewards (
    student_id,
    teacher_id,
    reward_type,
    item_type,
    item_key,
    quantity,
    reason
  )
  VALUES (
    v_student_id,
    v_teacher_id,
    'item',
    'potion',
    'potion_small',
    2,
    'audit item reward'
  );

  INSERT INTO teacher_rewards (
    student_id,
    teacher_id,
    reward_type,
    pokemon_id,
    pokemon_level,
    reason
  )
  VALUES (
    v_student_id,
    v_teacher_id,
    'pokemon',
    25,
    8,
    'audit pokemon reward'
  );

  SELECT COUNT(*), (ARRAY_AGG(claim_token))[1]
  INTO v_begin_count, v_token
  FROM begin_teacher_reward_claim(v_student_id);

  IF v_begin_count IS DISTINCT FROM 2 OR v_token IS NULL THEN
    RAISE EXCEPTION
      'Expected begin reward claim to reserve 2 rewards, count=%, token=%',
      v_begin_count,
      v_token;
  END IF;

  SELECT confirm_teacher_reward_claim(v_student_id, gen_random_uuid())
  INTO v_confirm;

  v_claimed_count := COALESCE((v_confirm ->> 'claimedCount')::INT, -1);
  IF v_claimed_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Expected wrong reward token to claim 0 rewards, got %', v_claimed_count;
  END IF;

  SELECT confirm_teacher_reward_claim(v_student_id, v_token)
  INTO v_confirm;

  v_claimed_count := COALESCE((v_confirm ->> 'claimedCount')::INT, -1);
  IF v_claimed_count IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Expected correct reward token to claim 2 rewards, got %', v_claimed_count;
  END IF;

  SELECT COUNT(*)
  INTO v_remaining_count
  FROM begin_teacher_reward_claim(v_student_id);

  IF v_remaining_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Expected no remaining rewards after confirm, got %', v_remaining_count;
  END IF;

  DELETE FROM energy_logs WHERE student_id = v_student_id;
  DELETE FROM gold_logs WHERE student_id = v_student_id;
  DELETE FROM teacher_rewards WHERE student_id = v_student_id OR teacher_id IN (v_teacher_id, v_student_id);
  DELETE FROM game_saves WHERE user_id IN (v_teacher_id, v_student_id);
  DELETE FROM users WHERE id IN (v_teacher_id, v_student_id);

  RAISE NOTICE
    'cloud save atomic/reward RPC guard ok: gold=%, energy=%, reward_claimed=%',
    v_gold,
    v_energy,
    v_claimed_count;
END $$;
