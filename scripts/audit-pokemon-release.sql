-- Synthetic fixtures only. All changes (including accounts/logs) roll back.
BEGIN;
CREATE TEMP TABLE release_audit_results(name TEXT PRIMARY KEY);
CREATE OR REPLACE FUNCTION pg_temp.expect_release_failure(p_name TEXT,p_old JSONB,p_id TEXT,p_from TEXT,p_gold INT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_failed BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM public.game_prepare_pokemon_release(p_old,p_id,p_from,p_gold);
  EXCEPTION WHEN OTHERS THEN v_failed := TRUE;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Release guard failed: %',p_name; END IF;
  INSERT INTO release_audit_results VALUES(p_name);
END;
$$;
DO $$
DECLARE
  v_old JSONB := '{"view":"team","activePlayerId":"p1","playerTeam":[{"id":"p1","baseId":16,"dexNo":129,"level":10,"currentHp":1,"statBoosts":{"atk":80}},{"id":"p2","baseId":4,"dexNo":25,"level":50}],"storageBox":[{"id":"s1","baseId":12,"dexNo":149,"level":80}],"pendingMonsterAcquisition":{"source":"capture","monster":{"id":"pending1","baseId":69,"dexNo":151,"level":100}},"world":{"dexProgress":{"registeredSpeciesKeys":["dex:129"]}},"playerInventory":[{"itemKey":"hp_stone","quantity":8}]}';
  v_prepared JSONB;
  v_species RECORD;
  v_level INT;
  v_expected INT;
BEGIN
  FOR v_species IN SELECT * FROM pokemon_release_species LOOP
    FOR v_level IN 1..100 LOOP
      v_expected := (FLOOR(((50+v_level*5)*v_species.multiplier)/10+0.5)*10)::INT;
      IF (game_pokemon_release_quote(jsonb_build_object('baseId',v_species.base_id,'dexNo',v_species.dex_no,'level',v_level))->>'gold')::INT <> v_expected THEN
        RAISE EXCEPTION 'Price mismatch: % %',v_species.base_id,v_level;
      END IF;
    END LOOP;
  END LOOP;
  INSERT INTO release_audit_results VALUES('all catalog levels use exact rounded formula');
  v_prepared := game_prepare_pokemon_release(v_old,'p1','party',100);
  IF jsonb_array_length(v_prepared#>'{snapshot,playerTeam}')<>1 OR v_prepared#>>'{snapshot,activePlayerId}'<>'p2'
    OR v_prepared#>'{snapshot,storageBox}'<>v_old->'storageBox' OR v_prepared#>'{snapshot,world}'<>v_old->'world'
    OR v_prepared#>'{snapshot,playerInventory}'<>v_old->'playerInventory' THEN RAISE EXCEPTION 'Party removal changed unrelated state'; END IF;
  INSERT INTO release_audit_results VALUES('party removes only chosen partner and retains dex/inventory');
  v_prepared := game_prepare_pokemon_release(v_old,'s1','storage',1130);
  IF v_prepared#>'{snapshot,storageBox}'<>'[]'::JSONB OR v_prepared#>'{snapshot,playerTeam}'<>v_old->'playerTeam' THEN RAISE EXCEPTION 'Storage release mismatch'; END IF;
  INSERT INTO release_audit_results VALUES('storage removal');
  v_prepared := game_prepare_pokemon_release(v_old,'pending1','pending',2200);
  IF v_prepared#>'{snapshot,pendingMonsterAcquisition}' IS DISTINCT FROM 'null'::JSONB THEN RAISE EXCEPTION 'Pending not cleared'; END IF;
  INSERT INTO release_audit_results VALUES('pending removal');
  PERFORM pg_temp.expect_release_failure('last party member',jsonb_set(v_old,'{playerTeam}',jsonb_build_array(v_old#>'{playerTeam,0}')),'p1','party',100);
  PERFORM pg_temp.expect_release_failure('party during battle',jsonb_set(v_old,'{activeEnemyId}','"e1"'),'p1','party',100);
  PERFORM pg_temp.expect_release_failure('storage during battle',jsonb_set(v_old,'{activeEnemyId}','"e1"'),'s1','storage',1130);
  PERFORM pg_temp.expect_release_failure('pending during battle',jsonb_set(v_old,'{view}','"battle"'),'pending1','pending',2200);
  PERFORM pg_temp.expect_release_failure('wrong source',v_old,'s1','party',1130);
  PERFORM pg_temp.expect_release_failure('missing target',v_old,'missing','storage',100);
  PERFORM pg_temp.expect_release_failure('forged quote',v_old,'s1','storage',999999);
  PERFORM pg_temp.expect_release_failure('duplicate identity',jsonb_set(v_old,'{storageBox}',jsonb_build_array(v_old#>'{playerTeam,0}')),'p1','party',100);
  PERFORM pg_temp.expect_release_failure('unknown species',jsonb_set(v_old,'{storageBox,0,baseId}','999999'),'s1','storage',1130);
  PERFORM pg_temp.expect_release_failure('mismatched dex',jsonb_set(v_old,'{storageBox,0,dexNo}','151'),'s1','storage',1130);
END;
$$;
DO $$
DECLARE
  v_user UUID := gen_random_uuid();
  v_session TEXT := gen_random_uuid()::TEXT;
  v_request UUID := gen_random_uuid();
  v_request2 UUID := gen_random_uuid();
  v_data JSONB;
  v_payload JSONB;
  v_result RECORD;
  v_failed BOOLEAN;
  v_gold INT;
BEGIN
  INSERT INTO users(id,email,username,nickname,role,gold,energy,max_energy,registration_status,daily_playtime_limit_minutes)
    VALUES(v_user,'release-audit-'||v_user||'@example.invalid','release-audit-'||v_user,'临时放生审计','student',500,5,10,'approved',1440);
  PERFORM * FROM settle_student_playtime_session(v_user,v_session,'begin');
  v_data := jsonb_build_object('view','team','activePlayerId','p1','playerTeam',
    '[{"id":"p1","baseId":16,"dexNo":129,"level":10},{"id":"p2","baseId":4,"dexNo":25,"level":50}]'::JSONB,
    'storageBox','[{"id":"s1","baseId":12,"dexNo":149,"level":80},{"id":"s2","baseId":69,"dexNo":151,"level":100}]'::JSONB,
    'pendingMonsterAcquisition','{"monster":{"id":"pending1","baseId":26,"dexNo":144,"level":80}}'::JSONB,
    'playerGold',500,'logs','[]'::JSONB,'world','{"dexProgress":{"registeredSpeciesKeys":["dex:129"]},"untouched":true}'::JSONB,
    '_sync',jsonb_build_object('revision',1,'playtimeSessionId',v_session));
  INSERT INTO game_saves(user_id,game_data,save_revision) VALUES(v_user,v_data,1);
  v_payload := jsonb_set(v_data,'{_sync,revision}','2');
  -- Client lies about every price input and tries to erase the remaining roster.
  v_payload := jsonb_set(jsonb_set(v_payload,'{storageBox}','[]'),'{playerGold}','9999999');
  SELECT * INTO v_result FROM release_pokemon_with_compensation(v_user,v_payload,'s1','storage',1130,v_request);
  IF NOT v_result.accepted OR v_result.gold_after<>1630 OR v_result.released_gold<>1130
    OR jsonb_array_length(v_result.game_data->'storageBox')<>1 OR v_result.energy_after<>5
    OR NOT ((v_result.game_data->'world') @> (v_data->'world')) THEN RAISE EXCEPTION 'Atomic payout failed: accepted %, gold %, released %, storage %, energy %, error %',v_result.accepted,v_result.gold_after,v_result.released_gold,jsonb_array_length(v_result.game_data->'storageBox'),v_result.energy_after,v_result.error_message; END IF;
  INSERT INTO release_audit_results VALUES('RPC computes from backend roster and ignores client balances/rosters');
  SELECT * INTO v_result FROM release_pokemon_with_compensation(v_user,v_payload,'s1','storage',1130,v_request);
  IF NOT v_result.accepted OR v_result.gold_after<>1630 OR v_result.save_revision<>2
    OR (SELECT COUNT(*) FROM gold_logs WHERE student_id=v_user)<>1
    OR (SELECT COUNT(*) FROM student_gameplay_logs WHERE student_id=v_user AND event_type='pokemon_released')<>1 THEN
    RAISE EXCEPTION 'Retry double paid or double logged'; END IF;
  INSERT INTO release_audit_results VALUES('retry returns receipt without coins or log duplication');
  v_failed:=FALSE;
  BEGIN
    PERFORM * FROM release_pokemon_with_compensation(v_user,jsonb_set(v_result.game_data,'{_sync,revision}','3'),'s1','storage',1130,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_failed:=TRUE; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Removed partner paid twice with a new request'; END IF;
  INSERT INTO release_audit_results VALUES('new request cannot release an already removed partner');
  v_failed:=FALSE;
  BEGIN
    PERFORM * FROM release_pokemon_with_compensation(v_user,jsonb_set(v_result.game_data,'{_sync,revision}','3'),'s2','storage',999999,v_request2);
  EXCEPTION WHEN OTHERS THEN v_failed:=TRUE; END;
  SELECT gold INTO v_gold FROM users WHERE id=v_user;
  IF NOT v_failed OR v_gold<>1630 OR (SELECT jsonb_array_length(game_data->'storageBox') FROM game_saves WHERE user_id=v_user)<>1 THEN
    RAISE EXCEPTION 'Rejected price changed coins or lost partner'; END IF;
  INSERT INTO release_audit_results VALUES('rejected quote keeps both partner and coins');
  v_failed:=FALSE;
  BEGIN
    PERFORM * FROM release_pokemon_with_compensation(v_user,jsonb_set(v_result.game_data,'{_sync,revision}','2'),'s2','storage',2200,v_request2);
  EXCEPTION WHEN OTHERS THEN v_failed:=TRUE; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Stale request accepted'; END IF;
  INSERT INTO release_audit_results VALUES('stale revision cannot overwrite cloud progress');
  SELECT * INTO v_result FROM release_pokemon_with_compensation(v_user,jsonb_set(v_result.game_data,'{_sync,revision}','3'),'p1','party',100,gen_random_uuid());
  IF NOT v_result.accepted OR v_result.gold_after<>1730 OR v_result.game_data->>'activePlayerId'<>'p2' THEN RAISE EXCEPTION 'Party RPC failed'; END IF;
  INSERT INTO release_audit_results VALUES('party RPC changes active partner');
  SELECT * INTO v_result FROM release_pokemon_with_compensation(v_user,jsonb_set(v_result.game_data,'{_sync,revision}','4'),'pending1','pending',1800,gen_random_uuid());
  IF NOT v_result.accepted OR v_result.gold_after<>3530 OR v_result.game_data->'pendingMonsterAcquisition' IS DISTINCT FROM 'null'::JSONB THEN
    RAISE EXCEPTION 'Pending RPC failed'; END IF;
  INSERT INTO release_audit_results VALUES('pending RPC awards compensation');
  v_failed:=FALSE;
  BEGIN
    PERFORM * FROM release_pokemon_with_compensation(v_user,jsonb_set(jsonb_set(v_result.game_data,'{_sync,revision}','5'),'{_sync,playtimeSessionId}','"invalid-session-for-audit"'),'s2','storage',2200,v_request2);
  EXCEPTION WHEN OTHERS THEN v_failed:=TRUE; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'Invalid playtime session accepted'; END IF;
  INSERT INTO release_audit_results VALUES('invalid session rejected');
END;
$$;
SELECT COUNT(*) AS release_checks_passed FROM release_audit_results;
ROLLBACK;
