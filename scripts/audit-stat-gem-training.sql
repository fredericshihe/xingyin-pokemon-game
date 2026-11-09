-- Synthetic data only. Run after the migration, inside a transaction rolled back below.
BEGIN;
CREATE TEMP TABLE gem_audit_results (name TEXT, passed BOOLEAN, detail TEXT);
CREATE OR REPLACE FUNCTION pg_temp.expect_gem_result(p_name TEXT, p_old JSONB, p_new JSONB, p_allowed BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_error TEXT := NULL;
BEGIN
  BEGIN
    PERFORM public.validate_stat_gem_training(p_old, p_new);
  EXCEPTION WHEN OTHERS THEN v_error := SQLERRM;
  END;
  IF (v_error IS NULL) IS DISTINCT FROM p_allowed THEN
    RAISE EXCEPTION 'Gem audit failed: %; expected allowed %, error %', p_name, p_allowed, v_error;
  END IF;
  INSERT INTO gem_audit_results VALUES (p_name, TRUE, COALESCE(v_error, 'allowed'));
END;
$$;

DO $$
DECLARE
  v_old JSONB := '{"view":"map","activeEnemyId":null,"playerTeam":[{"id":1001,"statBoosts":{}}],"storageBox":[],"playerInventory":[{"itemType":"statBoost","itemKey":"hp_stone","quantity":20},{"itemType":"statBoost","itemKey":"attack_stone","quantity":20},{"itemType":"statBoost","itemKey":"defense_stone","quantity":20},{"itemType":"statBoost","itemKey":"sp_attack_stone","quantity":20},{"itemType":"statBoost","itemKey":"sp_defense_stone","quantity":20},{"itemType":"statBoost","itemKey":"speed_stone","quantity":20},{"itemType":"statBoost","itemKey":"rare_candy","quantity":2}]}';
  v_next JSONB;
  v_capped JSONB;
  v_keys TEXT[] := ARRAY['maxHp','atk','def','spAtk','spDef','spd'];
  v_amounts INT[] := ARRAY[5,3,3,3,3,2];
  v_i INT;
BEGIN
  PERFORM pg_temp.expect_gem_result('legacy unchanged save', v_old, v_old, TRUE);
  FOR v_i IN 1..6 LOOP
    v_next := jsonb_set(v_old, '{playerTeam,0,statGemUses}', jsonb_build_object(v_keys[v_i], 1));
    v_next := jsonb_set(v_next, '{playerTeam,0,statBoosts}', jsonb_build_object(v_keys[v_i], v_amounts[v_i]));
    v_next := jsonb_set(v_next, ARRAY['playerInventory',(v_i-1)::TEXT,'quantity'], '19');
    PERFORM pg_temp.expect_gem_result('single gem ' || v_keys[v_i], v_old, v_next, TRUE);
    v_next := jsonb_set(v_next, ARRAY['playerInventory',(v_i-1)::TEXT,'quantity'], '20');
    PERFORM pg_temp.expect_gem_result('missing inventory ' || v_keys[v_i], v_old, v_next, FALSE);
  END LOOP;

  v_old := jsonb_set(v_old, '{playerTeam,0,statGemUses}', '{"atk":3}');
  v_old := jsonb_set(v_old, '{playerTeam,0,statBoosts}', '{"atk":9}');
  v_next := jsonb_set(v_old, '{playerTeam,0,statGemUses}', '{"atk":4}');
  v_next := jsonb_set(v_next, '{playerTeam,0,statBoosts}', '{"atk":12}');
  v_next := jsonb_set(v_next, '{playerInventory,1,quantity}', '19');
  PERFORM pg_temp.expect_gem_result('fourth allowed', v_old, v_next, TRUE);
  PERFORM pg_temp.expect_gem_result('fifth rejected', v_next,
    jsonb_set(jsonb_set(jsonb_set(v_next, '{playerTeam,0,statGemUses}', '{"atk":5}'),
      '{playerTeam,0,statBoosts}', '{"atk":15}'), '{playerInventory,1,quantity}', '18'), FALSE);

  v_old := jsonb_set(v_old, '{playerTeam,0,statGemUses}', '{"atk":4,"def":4,"spd":1}');
  v_old := jsonb_set(v_old, '{playerTeam,0,statBoosts}', '{"atk":12,"def":12,"spd":2}');
  v_capped := jsonb_set(v_old, '{playerTeam,0,statGemUses}', '{"atk":4,"def":4,"spd":2}');
  v_capped := jsonb_set(v_capped, '{playerTeam,0,statBoosts}', '{"atk":12,"def":12,"spd":4}');
  v_capped := jsonb_set(v_capped, '{playerInventory,5,quantity}', '19');
  PERFORM pg_temp.expect_gem_result('tenth allowed', v_old, v_capped, TRUE);
  v_next := jsonb_set(v_capped, '{playerTeam,0,statGemUses}', '{"atk":4,"def":4,"spd":2,"maxHp":1}');
  PERFORM pg_temp.expect_gem_result('eleventh rejected', v_capped, v_next, FALSE);
  PERFORM pg_temp.expect_gem_result('cannot reset quota', v_capped, v_capped #- '{playerTeam,0,statGemUses}', FALSE);

  v_next := jsonb_set(jsonb_set(v_capped, '{storageBox}', v_capped -> 'playerTeam'), '{playerTeam}', '[]');
  PERFORM pg_temp.expect_gem_result('quota preserved in storage', v_capped, v_next, TRUE);
  v_next := jsonb_set(v_capped, '{playerTeam,0,baseId}', '999');
  PERFORM pg_temp.expect_gem_result('evolution preserves quota and bonuses', v_capped, v_next, TRUE);

  v_next := jsonb_set(v_capped, '{playerTeam,0,statBoosts}', '{"maxHp":5,"atk":17,"def":17,"spAtk":5,"spDef":5,"spd":9}');
  v_next := jsonb_set(v_next, '{playerInventory,6,quantity}', '1');
  PERFORM pg_temp.expect_gem_result('exploration candy does not use gem quota', v_capped, v_next, TRUE);
  PERFORM pg_temp.expect_gem_result('candy requires inventory', v_capped, jsonb_set(v_next, '{playerInventory,6,quantity}', '2'), FALSE);

  v_old := v_old #- '{playerTeam,0,statGemUses}';
  v_old := jsonb_set(v_old, '{playerTeam,0,statBoosts}', '{"attack":80,"hp":20,"spDefense":5}');
  v_next := jsonb_set(v_old, '{playerTeam,0,statBoosts}', '{"atk":80,"maxHp":20,"spDef":5}');
  PERFORM pg_temp.expect_gem_result('normalize historical bonuses without nerf', v_old, v_next, TRUE);
  v_next := jsonb_set(v_next, '{playerTeam,0,statBoosts}', '{"atk":83,"maxHp":20,"spDef":5}');
  v_next := jsonb_set(v_next, '{playerTeam,0,statGemUses}', '{"atk":1}');
  v_next := jsonb_set(v_next, '{playerInventory,1,quantity}', '19');
  PERFORM pg_temp.expect_gem_result('new gem adds to uncapped legacy bonuses', v_old, v_next, TRUE);
  PERFORM pg_temp.expect_gem_result('old client cannot omit new counter', v_old, v_next #- '{playerTeam,0,statGemUses}', FALSE);
  PERFORM pg_temp.expect_gem_result('old plus eight cannot bypass new effect', v_old,
    jsonb_set(v_next, '{playerTeam,0,statBoosts}', '{"atk":88,"maxHp":20,"spDef":5}'), FALSE);
  PERFORM pg_temp.expect_gem_result('cannot use gem during battle', jsonb_set(v_old, '{activeEnemyId}', '2001'), v_next, FALSE);
  PERFORM pg_temp.expect_gem_result('negative counter rejected', v_old, jsonb_set(v_next, '{playerTeam,0,statGemUses}', '{"atk":-1}'), FALSE);
  PERFORM pg_temp.expect_gem_result('fractional counter rejected', v_old, jsonb_set(v_next, '{playerTeam,0,statGemUses}', '{"atk":1.5}'), FALSE);
  PERFORM pg_temp.expect_gem_result('unknown stat counter rejected', v_old, jsonb_set(v_next, '{playerTeam,0,statGemUses}', '{"unknown":1}'), FALSE);
  PERFORM pg_temp.expect_gem_result('bonus cannot decrease', v_old, jsonb_set(v_old, '{playerTeam,0,statBoosts}', '{"atk":70}'), FALSE);
END;
$$;

CREATE TEMP TABLE gem_trigger_fixture (game_data JSONB);
CREATE TRIGGER gem_trigger_test BEFORE INSERT OR UPDATE OF game_data ON gem_trigger_fixture
FOR EACH ROW EXECUTE FUNCTION public.enforce_stat_gem_training_limits();
INSERT INTO gem_trigger_fixture VALUES ('{"playerTeam":[{"id":2,"statBoosts":{"atk":80}}]}');
UPDATE gem_trigger_fixture SET game_data = '{"playerTeam":[{"id":2,"statBoosts":{"atk":88}}]}'
WHERE game_data #>> '{playerTeam,0,id}' = '2';
INSERT INTO gem_audit_results VALUES ('unadopted legacy client remains saveable during rollout', TRUE, 'allowed');
DELETE FROM gem_trigger_fixture;
INSERT INTO gem_trigger_fixture VALUES ('{"playerTeam":[{"id":1,"statGemUses":{"atk":0}}]}');
DO $$
DECLARE v_rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    UPDATE gem_trigger_fixture SET game_data = '{"playerTeam":[{"id":1,"statGemUses":{"atk":5}}]}';
  EXCEPTION WHEN OTHERS THEN v_rejected := TRUE;
  END;
  IF NOT v_rejected OR (SELECT game_data #>> '{playerTeam,0,statGemUses,atk}' FROM gem_trigger_fixture) <> '0' THEN
    RAISE EXCEPTION 'Trigger did not atomically reject an over-limit save';
  END IF;
  INSERT INTO gem_audit_results VALUES ('trigger failure leaves previous save intact', TRUE, 'allowed');
  UPDATE gem_trigger_fixture SET game_data = game_data - 'statGemTrainingVersion';
  IF (SELECT game_data ->> 'statGemTrainingVersion' FROM gem_trigger_fixture) <> '1' THEN
    RAISE EXCEPTION 'Gem policy version was downgraded';
  END IF;
  INSERT INTO gem_audit_results VALUES ('adopted policy cannot be downgraded by an old tab', TRUE, 'allowed');
END;
$$;

SELECT COUNT(*) AS passed, COUNT(*) FILTER (WHERE NOT passed) AS failed FROM gem_audit_results;
ROLLBACK;
