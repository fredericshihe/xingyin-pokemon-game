BEGIN;

DO $$
BEGIN
  IF game_save_has_duplicate_party_species(
    '{"playerTeam":[{"id":"p1","baseId":208},{"id":"p2","speciesId":208}]}'::JSONB
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'duplicate species should be detected';
  END IF;

  IF game_save_has_duplicate_party_species(
    '{"playerTeam":[{"id":"p1","baseId":208},{"id":"p2","baseId":209}]}'::JSONB
  ) IS NOT FALSE THEN
    RAISE EXCEPTION 'distinct species should be accepted';
  END IF;

  IF game_save_has_active_battle(
    '{"view":"battle","activeEnemyId":"e1","enemyTeam":[{"id":"e1"}]}'::JSONB
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'active battle should be detected';
  END IF;

  IF game_save_has_active_battle(
    '{"view":"map","activeEnemyId":null,"enemyTeam":[]}'::JSONB
  ) IS NOT FALSE THEN
    RAISE EXCEPTION 'map snapshot should not be treated as an active battle';
  END IF;
END;
$$;

DO $audit$
DECLARE
  v_teacher_id UUID := gen_random_uuid();
  v_student_id UUID := gen_random_uuid();
  v_session_id TEXT := 'codex-party-clause-' || gen_random_uuid()::TEXT;
  v_duplicate_team JSONB := jsonb_build_array(
    jsonb_build_object('id', 'p1', 'baseId', 208, 'name', '烈咬陆鲨'),
    jsonb_build_object('id', 'p2', 'speciesId', 208, 'name', '烈咬陆鲨')
  );
  v_map_payload JSONB;
  v_battle_payload JSONB;
  v_save RECORD;
  v_blocked BOOLEAN := FALSE;
  v_gold INT;
  v_energy INT;
  v_revision BIGINT;
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
    'codex-party-teacher-' || v_teacher_id::TEXT || '@invalid.local',
    'codex-party-teacher-' || v_teacher_id::TEXT,
    'Codex party audit teacher',
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
    'codex-party-student-' || v_student_id::TEXT || '@invalid.local',
    'codex-party-student-' || v_student_id::TEXT,
    'Codex party audit student',
    'student',
    v_teacher_id,
    100,
    5,
    10,
    'approved',
    30
  );

  PERFORM begin_student_playtime_session(v_student_id, v_session_id);

  v_map_payload := jsonb_build_object(
    '_sync', jsonb_build_object(
      'revision', 1,
      'sessionId', 'party-clause-audit',
      'playtimeSessionId', v_session_id
    ),
    'view', 'map',
    'playerTeam', v_duplicate_team,
    'enemyTeam', '[]'::JSONB,
    'activeEnemyId', NULL,
    'world', '{}'::JSONB
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_map_payload)
  LIMIT 1;

  IF NOT COALESCE(v_save.accepted, FALSE) OR v_save.save_revision <> 1 THEN
    RAISE EXCEPTION 'legacy duplicate map save should remain repairable: %', row_to_json(v_save);
  END IF;

  v_battle_payload := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(v_map_payload, '{_sync,revision}', '2'::JSONB),
        '{view}',
        '"battle"'::JSONB
      ),
      '{enemyTeam}',
      '[{"id":"e1","baseId":25}]'::JSONB
    ),
    '{activeEnemyId}',
    '"e1"'::JSONB
  );

  BEGIN
    PERFORM 1
    FROM save_cloud_game_state_with_resources(
      v_student_id,
      v_battle_payload,
      -10,
      'party clause audit',
      0,
      'party clause audit'
    );
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('重复物种' IN SQLERRM) = 0 THEN
      RAISE;
    END IF;
    v_blocked := TRUE;
  END;

  IF NOT v_blocked THEN
    RAISE EXCEPTION 'duplicate party was allowed to start a new battle';
  END IF;

  SELECT COALESCE(u.gold, 0), COALESCE(u.energy, 0), COALESCE(gs.save_revision, 0)
  INTO v_gold, v_energy, v_revision
  FROM users u
  LEFT JOIN game_saves gs ON gs.user_id = u.id
  WHERE u.id = v_student_id;

  IF v_gold <> 100 OR v_energy <> 5 OR v_revision <> 1 THEN
    RAISE EXCEPTION 'rejected battle changed resources or revision: gold %, energy %, revision %',
      v_gold, v_energy, v_revision;
  END IF;

  v_battle_payload := jsonb_set(
    v_battle_payload,
    '{playerTeam}',
    '[{"id":"p1","baseId":208},{"id":"p2","baseId":209}]'::JSONB
  );

  SELECT * INTO v_save
  FROM save_cloud_game_save(v_student_id, v_battle_payload)
  LIMIT 1;

  IF NOT COALESCE(v_save.accepted, FALSE) OR v_save.save_revision <> 2 THEN
    RAISE EXCEPTION 'distinct-species battle save should be accepted: %', row_to_json(v_save);
  END IF;
END;
$audit$;

ROLLBACK;
