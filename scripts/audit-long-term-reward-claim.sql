-- Transactional integration audit for atomic long-term progression rewards.
-- Run against an isolated/local Supabase database after migrations. All rows roll back.

BEGIN;

DO $audit$
DECLARE
  v_teacher_id UUID := gen_random_uuid();
  v_student_id UUID := gen_random_uuid();
  v_session_id TEXT := 'codex-long-term-reward-' || gen_random_uuid()::TEXT;
  v_season_key TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
  v_payload JSONB;
  v_claim RECORD;
  v_save RECORD;
  v_revision BIGINT;
  v_quantity INT;
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
    'codex-long-term-teacher-' || v_teacher_id::TEXT || '@invalid.local',
    'codex-long-term-teacher-' || v_teacher_id::TEXT,
    'Codex long-term reward audit teacher',
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
    'codex-long-term-student-' || v_student_id::TEXT || '@invalid.local',
    'codex-long-term-student-' || v_student_id::TEXT,
    'Codex long-term reward audit student',
    'student',
    v_teacher_id,
    100,
    5,
    10,
    'approved',
    30
  );

  PERFORM begin_student_playtime_session(v_student_id, v_session_id);

  v_payload := jsonb_build_object(
    '_sync', jsonb_build_object(
      'revision', 1,
      'sessionId', 'long-term-reward-audit',
      'playtimeSessionId', v_session_id
    ),
    'playerInventory', jsonb_build_array(jsonb_build_object(
      'itemType', 'pokeball',
      'itemKey', 'pokeball_basic',
      'quantity', 1
    )),
    'world', jsonb_build_object(
      'completionRewardClaimIds', '[]'::JSONB
    )
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_payload)
  LIMIT 1;

  IF NOT COALESCE(v_save.accepted, FALSE) OR v_save.save_revision <> 1 THEN
    RAISE EXCEPTION 'Failed to seed the atomic reward audit save: %', row_to_json(v_save);
  END IF;

  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'map_completion',
    'GodotMap',
    25,
    NULL,
    1,
    1,
    v_session_id,
    25
  )
  LIMIT 1;

  IF NOT COALESCE(v_claim.accepted, FALSE)
    OR COALESCE(v_claim.already_claimed, TRUE)
    OR v_claim.save_revision <> 2 THEN
    RAISE EXCEPTION 'First map reward claim failed: %', row_to_json(v_claim);
  END IF;

  SELECT COALESCE(SUM((entry.value ->> 'quantity')::INT), 0)
  INTO v_quantity
  FROM jsonb_array_elements(v_claim.game_data -> 'playerInventory') AS entry(value)
  WHERE entry.value ->> 'itemType' = 'pokeball'
    AND entry.value ->> 'itemKey' = 'pokeball_basic';

  IF v_quantity <> 3 OR NOT ((v_claim.game_data #> '{world,completionRewardClaimIds}') ? 'map:GodotMap:completion:v1:25') THEN
    RAISE EXCEPTION 'Reward item and claim fact were not committed together: quantity %, data %', v_quantity, v_claim.game_data;
  END IF;

  -- A second device still holding revision 1 must receive the committed row
  -- without adding the reward again.
  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'map_completion',
    'GodotMap',
    25,
    NULL,
    1,
    1,
    v_session_id,
    25
  )
  LIMIT 1;

  IF NOT COALESCE(v_claim.accepted, FALSE)
    OR NOT COALESCE(v_claim.already_claimed, FALSE)
    OR v_claim.save_revision <> 2 THEN
    RAISE EXCEPTION 'Idempotent stale-device retry failed: %', row_to_json(v_claim);
  END IF;

  SELECT COALESCE(SUM((entry.value ->> 'quantity')::INT), 0)
  INTO v_quantity
  FROM jsonb_array_elements(v_claim.game_data -> 'playerInventory') AS entry(value)
  WHERE entry.value ->> 'itemType' = 'pokeball'
    AND entry.value ->> 'itemKey' = 'pokeball_basic';

  IF v_quantity <> 3 THEN
    RAISE EXCEPTION 'Idempotent retry duplicated the map reward: quantity %', v_quantity;
  END IF;

  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'map_completion',
    'GodotMap',
    50,
    NULL,
    1,
    2,
    v_session_id,
    50
  )
  LIMIT 1;

  IF NOT COALESCE(v_claim.accepted, FALSE) OR v_claim.save_revision <> 3 THEN
    RAISE EXCEPTION 'Second threshold claim failed: %', row_to_json(v_claim);
  END IF;

  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'map_completion',
    'GodotMap',
    75,
    NULL,
    1,
    2,
    v_session_id,
    75
  )
  LIMIT 1;

  IF COALESCE(v_claim.accepted, TRUE) OR v_claim.error_message NOT LIKE '%旧版本存档%' THEN
    RAISE EXCEPTION 'A stale device claimed a different reward: %', row_to_json(v_claim);
  END IF;

  SELECT gs.game_data
  INTO v_payload
  FROM game_saves gs
  WHERE gs.user_id = v_student_id;

  v_payload := jsonb_set(
    v_payload,
    '{world,championTower}',
    jsonb_build_object(
      'version', 1,
      'highestStoryFloor', 10,
      'weekly', jsonb_build_object(
        'seasonKey', v_season_key,
        'highestFloor', 10,
        'rewardClaimed', FALSE
      )
    ),
    TRUE
  );
  v_payload := jsonb_set(v_payload, '{_sync,revision}', '4'::JSONB, TRUE);

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_payload)
  LIMIT 1;

  IF NOT COALESCE(v_save.accepted, FALSE) OR v_save.save_revision <> 4 THEN
    RAISE EXCEPTION 'Failed to seed weekly tower eligibility: %', row_to_json(v_save);
  END IF;

  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'tower_weekly',
    NULL,
    NULL,
    v_season_key,
    1,
    4,
    v_session_id,
    NULL
  )
  LIMIT 1;

  IF NOT COALESCE(v_claim.accepted, FALSE)
    OR COALESCE(v_claim.already_claimed, TRUE)
    OR v_claim.save_revision <> 5
    OR COALESCE(v_claim.game_data #>> '{world,championTower,weekly,rewardClaimed}', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Weekly tower reward claim failed: %', row_to_json(v_claim);
  END IF;

  SELECT * INTO v_claim
  FROM claim_long_term_progression_reward(
    v_student_id,
    'tower_weekly',
    NULL,
    NULL,
    v_season_key,
    1,
    4,
    v_session_id,
    NULL
  )
  LIMIT 1;

  IF NOT COALESCE(v_claim.accepted, FALSE)
    OR NOT COALESCE(v_claim.already_claimed, FALSE)
    OR v_claim.save_revision <> 5 THEN
    RAISE EXCEPTION 'Weekly reward retry was not idempotent: %', row_to_json(v_claim);
  END IF;

  SELECT COALESCE(gs.save_revision, 0)
  INTO v_revision
  FROM game_saves gs
  WHERE gs.user_id = v_student_id;

  IF v_revision <> 5 THEN
    RAISE EXCEPTION 'An idempotent retry advanced the save revision: %', v_revision;
  END IF;
END;
$audit$;

ROLLBACK;
