-- Seeds a temporary browser-test student directly into the escape overlay.
-- Expected result after the front end auto-completes the overlay:
-- energy remains 4, because battleEnergyRefundEligible=false.

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-00000000e501';
BEGIN
  UPDATE users
  SET energy = 4,
      max_energy = 10
  WHERE id = v_user_id;

  IF NOT FOUND THEN
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
      'audit-escape-browser@example.invalid',
      'audit_escape_browser',
      '逃跑结算临时测试',
      'student',
      0,
      4,
      10,
      'audit123456',
      'approved',
      NOW()
    );
  END IF;

  DELETE FROM energy_logs WHERE student_id = v_user_id;
  DELETE FROM game_saves WHERE user_id = v_user_id;

  INSERT INTO game_saves (user_id, game_data, save_revision)
  VALUES (
    v_user_id,
    jsonb_build_object(
      'schemaVersion', 4,
      'showLaunchScreen', false,
      'view', 'battle',
      'turn', 'player',
      'logs', jsonb_build_array('测试：已进入战斗后逃跑。'),
      'playerTeam', jsonb_build_array(jsonb_build_object(
        'id', 'p1',
        'baseId', 1,
        'pokedexId', 1,
        'dexNo', 1,
        'name', '妙蛙种子',
        'type', 'grass',
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
        'moves', jsonb_build_array('tackle')
      )),
      'enemyTeam', jsonb_build_array(jsonb_build_object(
        'id', 'e1',
        'baseId', 13,
        'pokedexId', 13,
        'dexNo', 13,
        'name', '独角虫',
        'type', 'bug',
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
        'moves', jsonb_build_array('tackle')
      )),
      'activePlayerId', 'p1',
      'activeEnemyId', 'e1',
      'battleKind', 'wild',
      'battlePhase', 'escape',
      'battlePhaseData', NULL,
      'activeBattleEnergyCost', 1,
      'battleEnergyRefundEligible', false,
      'playerGold', 0,
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
