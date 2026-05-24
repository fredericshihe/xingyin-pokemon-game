-- Verifies the remote Supabase RPC hardening for configured battle completion:
-- - reward saves force-complete boss and trainer events when victory gold is paid.
-- - later stale snapshots cannot remove defeatedBossIds / defeatedTrainerIds.
-- - same-day normal trainer daily locks and trainerVictoryCounts are monotonic.
--
-- Run after pushing migrations:
--   supabase db query --linked -f scripts/verify-trainer-completion-rpc-guard.sql

DO $$
DECLARE
  v_student_id UUID := '00000000-0000-0000-0000-00000000b703';
  v_reward RECORD;
  v_stale RECORD;
  v_saved JSONB;
  v_revision BIGINT;
  v_gold INT;
  v_normal_id TEXT := 'AuditMap:trainer_daily_normal';
  v_lieutenant_id TEXT := 'AuditMap:trainer_lieutenant_gate';
  v_boss_id TEXT := 'AuditMap:audit_boss';
BEGIN
  DELETE FROM energy_logs WHERE student_id = v_student_id;
  DELETE FROM gold_logs WHERE student_id = v_student_id;
  DELETE FROM teacher_rewards WHERE student_id = v_student_id OR teacher_id = v_student_id;
  DELETE FROM game_saves WHERE user_id = v_student_id;
  DELETE FROM users WHERE id = v_student_id;

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
  VALUES (
    v_student_id,
    'audit-trainer-completion@example.invalid',
    'audit_trainer_completion',
    '训练家完成审计',
    'student',
    0,
    10,
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
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(),
        'trainerVictoryCounts', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 1)
    ),
    1
  );

  SELECT *
  INTO v_reward
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'battle',
      'battleKind', 'trainer',
      'battlePhase', 'active',
      'battleEnvironment', jsonb_build_object(
        'eventType', 'trainer',
        'eventRole', 'normal',
        'eventId', 'trainer_daily_normal',
        'mapName', 'AuditMap'
      ),
      'enemyTeam', jsonb_build_array(jsonb_build_object('name', 'audit opponent', 'currentHp', 1, 'hp', 10)),
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(),
        'trainerVictoryCounts', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 2)
    ),
    5,
    '训练家战胜利奖励: audit normal',
    0,
    'audit noop'
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_reward.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 2
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,dailyTrainerBattleIds}') ? v_normal_id, FALSE)
    OR (v_saved #>> ARRAY['world', 'trainerVictoryCounts', v_normal_id]) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION
      'Expected normal trainer reward save to force completion and same-day lock, accepted=%, revision=%, defeated=%, daily=%, count=%',
      v_reward.accepted,
      v_revision,
      v_saved #> '{world,defeatedTrainerIds}',
      v_saved #> '{world,dailyTrainerBattleIds}',
      v_saved #>> ARRAY['world', 'trainerVictoryCounts', v_normal_id];
  END IF;

  SELECT *
  INTO v_stale
  FROM save_cloud_game_save(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(),
        'trainerVictoryCounts', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 3)
    )
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_stale.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 3
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,dailyTrainerBattleIds}') ? v_normal_id, FALSE)
    OR (v_saved #>> ARRAY['world', 'trainerVictoryCounts', v_normal_id]) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION
      'Expected stale save to preserve normal trainer completion, accepted=%, revision=%, world=%',
      v_stale.accepted,
      v_revision,
      v_saved #> '{world}';
  END IF;

  SELECT *
  INTO v_reward
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'battle',
      'battleKind', 'trainer',
      'battlePhase', 'active',
      'battleEnvironment', jsonb_build_object(
        'eventType', 'trainer',
        'eventRole', 'lieutenant',
        'eventId', 'trainer_lieutenant_gate',
        'mapName', 'AuditMap'
      ),
      'enemyTeam', jsonb_build_array(jsonb_build_object('name', 'audit lieutenant', 'currentHp', 1, 'hp', 10)),
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(),
        'trainerVictoryCounts', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 4)
    ),
    7,
    '训练家战胜利奖励: audit lieutenant',
    0,
    'audit noop'
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_reward.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 4
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_lieutenant_id, FALSE)
    OR COALESCE((v_saved #> '{world,dailyTrainerBattleIds}') ? v_lieutenant_id, FALSE) THEN
    RAISE EXCEPTION
      'Expected lieutenant reward save to force permanent trainer completion only, accepted=%, revision=%, world=%',
      v_reward.accepted,
      v_revision,
      v_saved #> '{world}';
  END IF;

  SELECT *
  INTO v_stale
  FROM save_cloud_game_save(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(v_normal_id),
        'trainerVictoryCounts', jsonb_build_object(v_normal_id, 1)
      ),
      '_sync', jsonb_build_object('revision', 5)
    )
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_stale.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 5
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_lieutenant_id, FALSE) THEN
    RAISE EXCEPTION
      'Expected stale save to preserve lieutenant completion, accepted=%, revision=%, defeated=%',
      v_stale.accepted,
      v_revision,
      v_saved #> '{world,defeatedTrainerIds}';
  END IF;

  SELECT *
  INTO v_reward
  FROM save_cloud_game_state_with_resources(
    v_student_id,
    jsonb_build_object(
      'view', 'battle',
      'battleKind', 'trainer',
      'battlePhase', 'active',
      'battleEnvironment', jsonb_build_object(
        'eventType', 'boss',
        'eventRole', 'boss',
        'eventId', 'audit_boss',
        'mapName', 'AuditMap'
      ),
      'enemyTeam', jsonb_build_array(jsonb_build_object('name', 'audit boss', 'currentHp', 1, 'hp', 10)),
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(v_normal_id, v_lieutenant_id),
        'dailyTrainerBattleIds', jsonb_build_array(v_normal_id),
        'trainerVictoryCounts', jsonb_build_object(v_normal_id, 1)
      ),
      '_sync', jsonb_build_object('revision', 6)
    ),
    11,
    '训练家战胜利奖励: audit boss',
    0,
    'audit noop'
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_reward.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 6
    OR NOT COALESCE((v_saved #> '{world,defeatedBossIds}') ? v_boss_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_lieutenant_id, FALSE) THEN
    RAISE EXCEPTION
      'Expected boss reward save to force boss completion while preserving trainers, accepted=%, revision=%, world=%',
      v_reward.accepted,
      v_revision,
      v_saved #> '{world}';
  END IF;

  SELECT *
  INTO v_stale
  FROM save_cloud_game_save(
    v_student_id,
    jsonb_build_object(
      'view', 'map',
      'world', jsonb_build_object(
        'currentMapName', 'AuditMap',
        'dailyRefreshKey', 'audit-day',
        'defeatedBossIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'dailyTrainerBattleIds', jsonb_build_array(),
        'trainerVictoryCounts', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 7)
    )
  );

  SELECT game_data, save_revision INTO v_saved, v_revision FROM game_saves WHERE user_id = v_student_id;

  IF v_stale.accepted IS DISTINCT FROM TRUE
    OR v_revision IS DISTINCT FROM 7
    OR NOT COALESCE((v_saved #> '{world,defeatedBossIds}') ? v_boss_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_normal_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,defeatedTrainerIds}') ? v_lieutenant_id, FALSE)
    OR NOT COALESCE((v_saved #> '{world,dailyTrainerBattleIds}') ? v_normal_id, FALSE)
    OR (v_saved #>> ARRAY['world', 'trainerVictoryCounts', v_normal_id]) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION
      'Expected stale save to preserve boss/trainer completion, accepted=%, revision=%, world=%',
      v_stale.accepted,
      v_revision,
      v_saved #> '{world}';
  END IF;

  SELECT gold INTO v_gold FROM users WHERE id = v_student_id;

  DELETE FROM energy_logs WHERE student_id = v_student_id;
  DELETE FROM gold_logs WHERE student_id = v_student_id;
  DELETE FROM teacher_rewards WHERE student_id = v_student_id OR teacher_id = v_student_id;
  DELETE FROM game_saves WHERE user_id = v_student_id;
  DELETE FROM users WHERE id = v_student_id;

  RAISE NOTICE
    'trainer completion RPC guard ok: final gold=%, boss=%, trainers=%, daily=%',
    v_gold,
    v_saved #> '{world,defeatedBossIds}',
    v_saved #> '{world,defeatedTrainerIds}',
    v_saved #> '{world,dailyTrainerBattleIds}';
END $$;
