-- Seeds a temporary browser-test student into an active battle with one potion.
-- Expected result after using the potion on 妙蛙种子:
-- - The heal animation finishes before the enemy starts acting.
-- - The enemy acts once within normal battle pacing despite the 1-second playtime tick.
-- - Control returns to the player without reloading.

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-00000000e503';
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
    registration_reviewed_at,
    daily_playtime_limit_minutes
  )
  VALUES (
    v_user_id,
    'audit-potion-turn@example.invalid',
    'audit_potion_turn',
    '伤药回合临时测试',
    'student',
    300,
    8,
    10,
    'audit123456',
    'approved',
    NOW(),
    1440
  );

  INSERT INTO game_saves (user_id, game_data, save_revision)
  VALUES (
    v_user_id,
    jsonb_build_object(
      'schemaVersion', 4,
      'showLaunchScreen', false,
      'view', 'battle',
      'turn', 'player',
      'logs', jsonb_build_array('测试：请使用伤药。'),
      'playerTeam', jsonb_build_array(jsonb_build_object(
        'id', 'p1',
        'baseId', 1,
        'pokedexId', 1,
        'dexNo', 1,
        'name', '妙蛙种子',
        'type', 'grass',
        'type2', 'poison',
        'level', 5,
        'maxHp', 20,
        'currentHp', 5,
        'maxMp', 30,
        'currentMp', 30,
        'atk', 10,
        'def', 10,
        'spAtk', 12,
        'spDef', 12,
        'spd', 10,
        'sprite', '/assets/pokemon/official-artwork/1.png',
        'backSprite', '/assets/pokemon/official-artwork/1.png',
        'fallbackSprite', '/assets/pokemon/placeholder.svg',
        'moves', jsonb_build_array('tackle', 'vinewhip'),
        'currentExp', 0,
        'expToNextLevel', 50
      )),
      'storageBox', jsonb_build_array(),
      'enemyTeam', jsonb_build_array(jsonb_build_object(
        'id', 'e1',
        'baseId', 13,
        'pokedexId', 13,
        'dexNo', 13,
        'name', '独角虫',
        'type', 'bug',
        'type2', 'poison',
        'level', 3,
        'maxHp', 16,
        'currentHp', 16,
        'maxMp', 24,
        'currentMp', 24,
        'atk', 8,
        'def', 8,
        'spAtk', 6,
        'spDef', 6,
        'spd', 8,
        'sprite', '/assets/pokemon/official-artwork/13.png',
        'backSprite', '/assets/pokemon/official-artwork/13.png',
        'fallbackSprite', '/assets/pokemon/placeholder.svg',
        'moves', jsonb_build_array('tackle'),
        'currentExp', 0,
        'expToNextLevel', 40
      )),
      'activePlayerId', 'p1',
      'activeEnemyId', 'e1',
      'battleKind', 'wild',
      'battlePhase', 'active',
      'battlePhaseData', NULL,
      'activeBattleEnergyCost', 1,
      'battleEnergyRefundEligible', false,
      'isThrowingPokeball', false,
      'captureSequenceData', NULL,
      'participatedMonIds', jsonb_build_array('p1'),
      'playerGold', 300,
      'playerInventory', jsonb_build_array(jsonb_build_object(
        'itemType', 'potion',
        'itemKey', 'potion',
        'quantity', 1
      )),
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
