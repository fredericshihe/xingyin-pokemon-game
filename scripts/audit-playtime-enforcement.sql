-- Transactional integration audit for the server-authoritative daily playtime guard.
-- The temporary users, saves and rewards are always rolled back.

BEGIN;

DO $audit$
DECLARE
  v_teacher_id UUID := gen_random_uuid();
  v_student_id UUID := gen_random_uuid();
  v_session_id TEXT := 'codex-playtime-audit-' || gen_random_uuid()::TEXT;
  v_active_session_id TEXT := 'codex-playtime-active-' || gen_random_uuid()::TEXT;
  v_today DATE := playtime_today_cn();
  v_status RECORD;
  v_save RECORD;
  v_atomic_save RECORD;
  v_payload JSONB;
  v_gold INT;
  v_energy INT;
  v_revision BIGINT;
  v_reward_count INT;
  v_reward_claim_token UUID;
  v_direct_write_blocked BOOLEAN := FALSE;
  v_clear_result JSONB;
  v_stored_session_id TEXT;
  v_session_active BOOLEAN;
BEGIN
  INSERT INTO users (
    id,
    email,
    username,
    nickname,
    role,
    registration_status
  )
  VALUES (
    v_teacher_id,
    'codex-playtime-teacher-' || v_teacher_id::TEXT || '@invalid.local',
    'codex-playtime-teacher-' || v_teacher_id::TEXT,
    'Codex playtime audit teacher',
    'teacher',
    'approved'
  );

  INSERT INTO users (
    id,
    email,
    username,
    nickname,
    role,
    teacher_id,
    gold,
    energy,
    max_energy,
    registration_status,
    daily_playtime_limit_minutes
  )
  VALUES (
    v_student_id,
    'codex-playtime-student-' || v_student_id::TEXT || '@invalid.local',
    'codex-playtime-student-' || v_student_id::TEXT,
    'Codex playtime audit student',
    'student',
    v_teacher_id,
    100,
    5,
    10,
    'approved',
    1
  );

  SELECT * INTO v_status
  FROM begin_student_playtime_session(v_student_id, v_session_id)
  LIMIT 1;

  IF v_status.remaining_seconds <> 60 OR v_status.play_date <> v_today THEN
    RAISE EXCEPTION 'Initial playtime session status is invalid: %', row_to_json(v_status);
  END IF;

  PERFORM pg_sleep(2.1);

  SELECT * INTO v_status
  FROM heartbeat_student_playtime(v_student_id, v_session_id)
  LIMIT 1;

  IF v_status.played_seconds < 2 OR v_status.played_seconds > 3 THEN
    RAISE EXCEPTION 'Server heartbeat did not record server elapsed time: %', row_to_json(v_status);
  END IF;

  SELECT * INTO v_status
  FROM record_student_playtime(v_student_id, 86400)
  LIMIT 1;

  IF v_status.played_seconds > 4 THEN
    RAISE EXCEPTION 'Legacy p_seconds still controls persisted playtime: %', row_to_json(v_status);
  END IF;

  SELECT * INTO v_status
  FROM begin_student_playtime_session(v_student_id, v_active_session_id)
  LIMIT 1;

  PERFORM end_student_playtime_session(v_student_id, v_session_id);
  PERFORM heartbeat_student_playtime(v_student_id, v_session_id);

  SELECT s.session_id, s.active
  INTO v_stored_session_id, v_session_active
  FROM student_playtime_sessions s
  WHERE s.student_id = v_student_id;

  IF v_stored_session_id <> v_active_session_id OR NOT v_session_active THEN
    RAISE EXCEPTION 'A stale end/heartbeat stole or closed the active lease: session %, active %', v_stored_session_id, v_session_active;
  END IF;

  v_payload := jsonb_build_object(
    '_sync', jsonb_build_object(
      'revision', 1,
      'sessionId', v_session_id,
      'playtimeSessionId', v_active_session_id
    ),
    'world', '{}'::JSONB
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_payload)
  LIMIT 1;

  IF NOT COALESCE(v_save.accepted, FALSE) OR v_save.save_revision <> 1 THEN
    RAISE EXCEPTION 'Valid pre-expiry save was rejected: %', row_to_json(v_save);
  END IF;

  SELECT s.session_id, s.active
  INTO v_stored_session_id, v_session_active
  FROM student_playtime_sessions s
  WHERE s.student_id = v_student_id;

  IF v_stored_session_id <> v_active_session_id OR NOT v_session_active THEN
    RAISE EXCEPTION 'A save payload changed the active playtime lease: session %, active %', v_stored_session_id, v_session_active;
  END IF;

  PERFORM end_student_playtime_session(v_student_id, v_active_session_id);
  IF NOT student_playtime_lease_is_valid(v_student_id, v_active_session_id, TRUE)
    OR student_playtime_lease_is_valid(v_student_id, v_active_session_id, FALSE) THEN
    RAISE EXCEPTION 'An explicit end did not create only the bounded final-save grace';
  END IF;

  PERFORM begin_student_playtime_session(v_student_id, v_active_session_id);

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
    'potion_basic',
    1,
    'Playtime integration audit'
  );

  UPDATE student_playtime_daily d
  SET played_seconds = 60,
      updated_at = clock_timestamp()
  WHERE d.student_id = v_student_id
    AND d.play_date = v_today;

  SELECT * INTO v_status
  FROM heartbeat_student_playtime(v_student_id, v_active_session_id)
  LIMIT 1;

  IF v_status.remaining_seconds <> 0 OR v_status.played_seconds <> 60 THEN
    RAISE EXCEPTION 'Expiry heartbeat did not return an authoritative zero status: %', row_to_json(v_status);
  END IF;

  v_payload := jsonb_build_object(
    '_sync', jsonb_build_object(
      'revision', 2,
      'sessionId', v_session_id,
      'playtimeSessionId', v_active_session_id
    ),
    'world', jsonb_build_object('defeatedBossIds', jsonb_build_array('must-not-save'))
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_payload)
  LIMIT 1;

  IF COALESCE(v_save.accepted, TRUE)
    OR v_save.error_message <> '今日游玩时间已用完。'
    OR v_save.save_revision <> 1 THEN
    RAISE EXCEPTION 'Expired basic save was not rejected cleanly: %', row_to_json(v_save);
  END IF;

  SELECT * INTO v_atomic_save
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    v_payload,
    -10,
    'Playtime audit gold mutation',
    -1,
    'Playtime audit energy mutation'
  )
  LIMIT 1;

  IF COALESCE(v_atomic_save.accepted, TRUE)
    OR v_atomic_save.error_message <> '今日游玩时间已用完。'
    OR v_atomic_save.gold_after <> 100
    OR v_atomic_save.energy_after <> 5 THEN
    RAISE EXCEPTION 'Expired atomic save mutated resources: %', row_to_json(v_atomic_save);
  END IF;

  SELECT u.gold, u.energy, gs.save_revision
  INTO v_gold, v_energy, v_revision
  FROM users u
  JOIN game_saves gs ON gs.user_id = u.id
  WHERE u.id = v_student_id;

  IF v_gold <> 100 OR v_energy <> 5 OR v_revision <> 1 THEN
    RAISE EXCEPTION 'Expired save changed persisted state: gold %, energy %, revision %', v_gold, v_energy, v_revision;
  END IF;

  v_clear_result := clear_cloud_game_save(v_student_id)::JSONB;
  IF COALESCE((v_clear_result ->> 'success')::BOOLEAN, TRUE)
    OR v_clear_result ->> 'error' <> '今日游玩时间已用完。' THEN
    RAISE EXCEPTION 'Expired reset was not rejected cleanly: %', v_clear_result;
  END IF;

  SELECT u.gold, u.energy, gs.save_revision
  INTO v_gold, v_energy, v_revision
  FROM users u
  JOIN game_saves gs ON gs.user_id = u.id
  WHERE u.id = v_student_id;

  IF v_gold <> 100 OR v_energy <> 5 OR v_revision <> 1 THEN
    RAISE EXCEPTION 'Expired reset changed persisted state: gold %, energy %, revision %', v_gold, v_energy, v_revision;
  END IF;

  SELECT COUNT(*) INTO v_reward_count
  FROM begin_teacher_reward_claim(v_student_id);

  SELECT tr.claim_token INTO v_reward_claim_token
  FROM teacher_rewards tr
  WHERE tr.student_id = v_student_id
  LIMIT 1;

  IF v_reward_count <> 0 OR v_reward_claim_token IS NOT NULL THEN
    RAISE EXCEPTION 'Expired reward reservation was not blocked';
  END IF;

  BEGIN
    UPDATE game_saves gs
    SET last_saved = clock_timestamp()
    WHERE gs.user_id = v_student_id;
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('今日游玩时间已用完' IN SQLERRM) > 0 THEN
      v_direct_write_blocked := TRUE;
    ELSE
      RAISE;
    END IF;
  END;

  IF NOT v_direct_write_blocked THEN
    RAISE EXCEPTION 'Direct game_saves update bypassed the expired trigger';
  END IF;

  UPDATE student_playtime_daily d
  SET played_seconds = 0,
      updated_at = clock_timestamp()
  WHERE d.student_id = v_student_id
    AND d.play_date = v_today;

  UPDATE student_playtime_sessions s
  SET session_id = v_active_session_id,
      active = TRUE,
      play_date = v_today,
      last_heartbeat_at = clock_timestamp() - INTERVAL '70 seconds'
  WHERE s.student_id = v_student_id;

  SELECT * INTO v_status
  FROM get_student_playtime_status(v_student_id)
  LIMIT 1;

  IF v_status.played_seconds <> 15 OR v_status.remaining_seconds <> 45 THEN
    RAISE EXCEPTION 'A stale active lease did not settle exactly one lease window: %', row_to_json(v_status);
  END IF;

  SELECT s.active INTO v_session_active
  FROM student_playtime_sessions s
  WHERE s.student_id = v_student_id;

  IF v_session_active THEN
    RAISE EXCEPTION 'A stale playtime lease remained active';
  END IF;

  v_payload := jsonb_build_object(
    '_sync', jsonb_build_object(
      'revision', 2,
      'sessionId', v_session_id,
      'playtimeSessionId', v_active_session_id
    ),
    'world', jsonb_build_object('mustNotSaveAfterStaleLease', TRUE)
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_payload)
  LIMIT 1;

  IF COALESCE(v_save.accepted, TRUE)
    OR v_save.error_message <> '无法确认当前游玩会话，请重新校验时长。'
    OR v_save.save_revision <> 1 THEN
    RAISE EXCEPTION 'A stale lease was still allowed to save: %', row_to_json(v_save);
  END IF;

  DELETE FROM student_playtime_daily d
  WHERE d.student_id = v_student_id;

  INSERT INTO student_playtime_daily (student_id, play_date, played_seconds)
  VALUES (v_student_id, v_today - 1, 60);

  UPDATE student_playtime_sessions s
  SET play_date = v_today - 1,
      active = TRUE,
      last_heartbeat_at = clock_timestamp() - INTERVAL '1 minute'
  WHERE s.student_id = v_student_id;

  SELECT * INTO v_status
  FROM begin_student_playtime_session(v_student_id, v_session_id)
  LIMIT 1;

  IF v_status.play_date <> v_today
    OR v_status.played_seconds <> 0
    OR v_status.remaining_seconds <> 60 THEN
    RAISE EXCEPTION 'China-calendar day rollover did not reset playtime: %', row_to_json(v_status);
  END IF;
END;
$audit$;

ROLLBACK;
