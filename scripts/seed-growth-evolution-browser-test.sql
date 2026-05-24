-- Seeds a temporary browser-test student into an evolution modal.
-- Expected front-end state after login:
-- - A normal evolution modal appears for 妙蛙种子 -> 妙蛙草.
-- - Confirming evolution commits the evolved form and consumes the pending event.

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-00000000e502';
BEGIN
  DELETE FROM energy_logs WHERE student_id = v_user_id;
  DELETE FROM gold_logs WHERE student_id = v_user_id;
  DELETE FROM teacher_rewards WHERE student_id = v_user_id OR teacher_id = v_user_id;
  DELETE FROM game_saves WHERE user_id = v_user_id;
  DELETE FROM users WHERE id = v_user_id;

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
    v_user_id,
    'audit-recovery-browser@example.invalid',
    'audit_recovery_browser',
    '恢复流程临时测试',
    'student',
    300,
    8,
    10,
    'audit123456',
    'approved',
    NOW()
  );

  INSERT INTO game_saves (user_id, game_data, save_revision)
  VALUES (
    v_user_id,
    jsonb_build_object(
      'schemaVersion', 4,
      'showLaunchScreen', false,
      'view', 'map',
      'turn', 'player',
      'logs', jsonb_build_array('测试：妙蛙种子达到进化等级。'),
      'playerTeam', jsonb_build_array(jsonb_build_object(
        'id', 'p1',
        'baseId', 1,
        'pokedexId', 1,
        'dexNo', 1,
        'name', '妙蛙种子',
        'type', 'grass',
        'type2', 'poison',
        'level', 16,
        'maxHp', 55,
        'currentHp', 55,
        'maxMp', 58,
        'currentMp', 58,
        'atk', 38,
        'def', 38,
        'spAtk', 48,
        'spDef', 48,
        'spd', 35,
        'sprite', '/assets/pokemon/official-artwork/1.png',
        'backSprite', '/assets/pokemon/official-artwork/1.png',
        'fallbackSprite', '/assets/pokemon/placeholder.svg',
        'moves', jsonb_build_array('tackle', 'vinewhip', 'razorleaf', 'recover'),
        'currentExp', 0,
        'expToNextLevel', 80
      )),
      'storageBox', jsonb_build_array(),
      'enemyTeam', jsonb_build_array(),
      'activePlayerId', 'p1',
      'activeEnemyId', NULL,
      'pendingGrowthEvents', jsonb_build_array(jsonb_build_object(
        'type', 'evolution',
        'monId', 'p1',
        'targetId', 71,
        'level', 16,
        'sourceBaseId', 1
      )),
      'playerGold', 300,
      'playerInventory', jsonb_build_array(),
      'nextPlayerMonsterId', 100,
      'nextEnemyMonsterId', 200,
      'mapLevel', 1,
      'maxReachedLevel', 1,
      'useRealMaps', true,
      'currentMapName', 'GodotMap',
      'playerPos', jsonb_build_object('x', 7, 'y', 7),
      'world', jsonb_build_object(
        'currentMapName', 'GodotMap',
        'playerPos', jsonb_build_object('x', 7, 'y', 7),
        'collectedEventIds', jsonb_build_array(),
        'defeatedTrainerIds', jsonb_build_array(),
        'flags', jsonb_build_object()
      ),
      '_sync', jsonb_build_object('revision', 1)
    ),
    1
  );
END $$;
