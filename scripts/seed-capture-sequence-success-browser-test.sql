-- Seeds a temporary browser-test student directly into a successful capture animation.
-- Expected front-end state after login:
-- - Capture animation plays for 独角虫.
-- - After completion, the game returns to the map and 独角虫 is added to the party.

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
      'view', 'battle',
      'turn', 'capture',
      'logs', jsonb_build_array('测试：精灵球正在捕捉独角虫。'),
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
        'currentHp', 20,
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
        'currentHp', 8,
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
      'isThrowingPokeball', true,
      'captureSequenceData', jsonb_build_object(
        'success', true,
        'pokemonName', '独角虫',
        'pokemonSprite', '/assets/pokemon/official-artwork/13.png',
        'pokemonLevel', 3,
        'ballName', '精灵球',
        'ballSprite', '/assets/items/official-artwork/poke-ball.png',
        'catchRate', 100,
        'caughtMonster', jsonb_build_object(
          'id', 'p100',
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
        )
      ),
      'playerGold', 300,
      'playerInventory', jsonb_build_array(),
      'nextPlayerMonsterId', 101,
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
