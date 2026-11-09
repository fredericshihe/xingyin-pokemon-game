-- Run with psql -v ON_ERROR_STOP=1 in an isolated database after the fishing
-- migration and normal playtime dependencies. Everything below rolls back.
BEGIN;
INSERT INTO users(id,role,gold,daily_playtime_limit_minutes)
VALUES('00000000-0000-0000-0000-000000001010','student',10000,30);
INSERT INTO game_saves(user_id,game_data)
VALUES('00000000-0000-0000-0000-000000001010','{"currentMapName":"GodotMap","world":{"currentMapName":"GodotMap","defeatedBossIds":[]}}');
-- Real production session schema has additional defaulted metadata columns.
INSERT INTO student_playtime_sessions(student_id,session_id,play_date,active,last_heartbeat_at)
VALUES('00000000-0000-0000-0000-000000001010','fishing-test-session-1010',(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE,TRUE,clock_timestamp());

DO $$
DECLARE
  student UUID := '00000000-0000-0000-0000-000000001010';
  lease TEXT := 'fishing-test-session-1010'; response JSONB; repeated JSONB;
  v_cast fishing_sessions%ROWTYPE; elapsed NUMERIC; failed BOOLEAN; before_gold INT; before_bait INT;
  req TEXT; i INT; caught_id TEXT; casts BIGINT; treasure_id UUID; appraised_price INT;
BEGIN
  IF (SELECT COUNT(*) FROM fishing_catalog,jsonb_object_keys(data->'catches')) <> 51 THEN RAISE EXCEPTION 'catalogue count mismatch'; END IF;
  IF has_table_privilege('anon','fishing_accounts','SELECT') OR has_table_privilege('authenticated','fishing_sessions','SELECT')
    OR has_function_privilege('anon','fishing_snapshot(uuid)','EXECUTE') THEN RAISE EXCEPTION 'private fishing data is directly exposed'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,'wrong-session-1010',NULL,'state','{}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'state accepted another identity'; END IF;
  response := fishing_action(student,lease,NULL,'state','{}');
  IF (response #>> '{state,hasRod}')::BOOLEAN OR (response #>> '{state,totals,casts}')::INT <> 0 THEN RAISE EXCEPTION 'new account has items'; END IF;

  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-before-rod-1010','purchase','{"itemId":"common","quantity":1}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'bait bought without rod'; END IF;
  response := fishing_action(student,lease,'test-buy-rod-1010','purchase','{"itemId":"fishing_rod","quantity":1,"price":1}');
  IF (response->>'walletGold')::INT <> 9600 OR (response #>> '{state,baitUses,common}')::INT <> 5 THEN RAISE EXCEPTION 'rod price/gift mismatch'; END IF;
  repeated := fishing_action(student,lease,'test-buy-rod-1010','purchase','{"itemId":"fishing_rod","quantity":1,"price":1}');
  IF (repeated->>'walletGold')::INT <> 9600 OR (repeated #>> '{state,baitUses,common}')::INT <> 5 THEN RAISE EXCEPTION 'rod retry duplicated'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-buy-rod-1010','purchase','{"itemId":"common","quantity":1}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'request payload mismatch accepted'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-buy-rod-again-1010','purchase','{"itemId":"fishing_rod"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'second rod purchase accepted'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-buy-secret-1010','purchase','{"itemId":"secret"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'locked bait purchase accepted'; END IF;
  response := fishing_action(student,lease,'test-buy-bait-1010','purchase','{"itemId":"common","quantity":2}');
  IF (response->>'walletGold')::INT <> 9480 OR (response #>> '{state,baitUses,common}')::INT <> 25 THEN RAISE EXCEPTION 'bait pack price/uses mismatch'; END IF;

  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-wrong-map-1010','start','{"spotId":"shore_dock","baitId":"common","mapId":"GodotMapV2_PirateShore"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'remote map cast accepted'; END IF;
  UPDATE fishing_accounts SET state=jsonb_set(state,'{totals,casts}','50') WHERE student_id=student;
  response := fishing_action(student,lease,'test-start-cast-1010','start','{"spotId":"valley_shallows","baitId":"common","mapId":"GodotMap"}');
  IF (response #>> '{state,baitUses,common}')::INT <> 24 OR (response #>> '{state,totals,casts}')::INT <> 51 THEN RAISE EXCEPTION 'cast must consume once without a daily limit'; END IF;
  IF response->'session' ? 'catchId' OR response->'session' ? 'weight' THEN RAISE EXCEPTION 'target leaked before result'; END IF;
  SELECT * INTO STRICT v_cast FROM fishing_sessions WHERE student_id=student AND status='active';
  IF (SELECT data #>> ARRAY['catches',v_cast.catch_id,'tier'] FROM fishing_catalog) NOT IN ('common','uncommon') THEN RAISE EXCEPTION 'shallow tier overflow'; END IF;
  repeated := fishing_action(student,lease,'test-start-cast-1010','start','{"spotId":"valley_shallows","baitId":"common","mapId":"GodotMap"}');
  IF repeated #>> '{session,id}' <> v_cast.id::TEXT OR (repeated #>> '{state,baitUses,common}')::INT <> 24 THEN RAISE EXCEPTION 'start retry rerolled'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-second-start-1010','start','{"spotId":"valley_shallows","baitId":"common","mapId":"GodotMap"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'parallel active session accepted'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-future-reel-1010','settle',jsonb_build_object('sessionId',v_cast.id,'elapsedMs',10000)); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'future click accepted'; END IF;
  -- Keep deterministic clocks and a known epic result inside this rollback-only fixture.
  UPDATE fishing_sessions SET catch_id='e01',weight=2,width=.15,seconds=2.2,target_center=.5,wait_ms=1500,
    deadline_ms=5665,started_at=clock_timestamp()-INTERVAL '2.6 seconds' WHERE id=v_cast.id;
  response := fishing_action(student,lease,'test-settle-cast-1010','settle',jsonb_build_object('sessionId',v_cast.id,'elapsedMs',2600));
  IF NOT (response #>> '{result,success}')::BOOLEAN OR NOT (response #>> '{result,perfect}')::BOOLEAN
    OR (response #>> '{state,catches,e01}')::INT <> 1 OR response->'state' ? 'locked'
    OR (response #>> '{state,records,e01,maxWeight}')::NUMERIC <> 2 THEN RAISE EXCEPTION 'epic catch should not be protected and must preserve its record'; END IF;
  response := fishing_action(student,lease,'test-repeated-settle-1010','settle',jsonb_build_object('sessionId',v_cast.id,'elapsedMs',2600));
  IF (response #>> '{state,catches,e01}')::INT <> 1 OR (response #>> '{state,totals,caught}')::INT <> 1 THEN RAISE EXCEPTION 'double settle duplicated catch'; END IF;

  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-removed-lock-1010','lock','{"catchId":"e01","quantity":1}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'removed collection action still accepted'; END IF;
  response := fishing_action(student,lease,'test-sell-epic-1010','sell','{"merchantId":"valley","mapId":"GodotMap","catchId":"e01","quantity":1,"price":9000}');
  IF (response->>'walletGold')::INT <> 9880 OR (response #>> '{state,totals,earned}')::INT <> 400
    OR (response #>> '{state,catches,e01}')::INT <> 0 OR (response #>> '{state,records,e01,count}')::INT <> 1 THEN RAISE EXCEPTION 'atomic sale/price/record mismatch'; END IF;
  response := fishing_action(student,lease,'test-sell-epic-1010','sell','{"merchantId":"valley","mapId":"GodotMap","catchId":"e01","quantity":1,"price":9000}');
  IF (response->>'walletGold')::INT <> 9880 THEN RAISE EXCEPTION 'sale retry credited twice'; END IF;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-oversell-1010','sell','{"merchantId":"valley","mapId":"GodotMap","catchId":"e01","quantity":1}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'empty fish sold'; END IF;

  UPDATE fishing_accounts SET state=jsonb_set(jsonb_set(jsonb_set(state,'{catches,c01}','3'),'{locked}','{"c01":1}'),'{catches,t08}','1') WHERE student_id=student;
  INSERT INTO fishing_treasures(student_id,catch_id) VALUES(student,'t08') RETURNING id INTO treasure_id;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-high-appraise-1010','appraise',jsonb_build_object('merchantId','valley','mapId','GodotMap','treasureId',treasure_id)); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'valley appraised advanced treasure'; END IF;
  response := fishing_action(student,lease,'test-sell-all-1010','sell','{"merchantId":"valley","mapId":"GodotMap","all":true}');
  IF (response #>> '{result,totalGold}')::INT <> 36 OR (response #>> '{state,catches,c01}')::INT <> 0
    OR (response #>> '{state,catches,t08}')::INT <> 1 THEN RAISE EXCEPTION 'sell all must ignore legacy protection but respect appraisal'; END IF;
  UPDATE game_saves SET game_data='{"currentMapName":"GodotMapV2_PirateShore","world":{"defeatedBossIds":["region_boss","mistlake_boss","farmtown_boss","pirateshore_boss"]}}' WHERE user_id=student;
  response := fishing_action(student,lease,'test-appraise-shore-1010','appraise',jsonb_build_object('merchantId','shore','mapId','GodotMapV2_PirateShore','treasureId',treasure_id));
  appraised_price := (response #>> '{result,price}')::INT;
  IF appraised_price NOT BETWEEN 365 AND 21900 THEN RAISE EXCEPTION 'advanced treasure appraisal mismatch'; END IF;
  response := fishing_action(student,lease,'test-sell-treasure-1010','sell',jsonb_build_object('merchantId','shore','mapId','GodotMapV2_PirateShore','treasureId',treasure_id,'quantity',1));
  IF (response #>> '{result,totalGold}')::INT <> appraised_price THEN RAISE EXCEPTION 'treasure sale mismatch'; END IF;
  response := fishing_action(student,lease,'test-buy-secret-open-1010','purchase','{"itemId":"secret","quantity":1}');
  IF (response #>> '{state,baitUses,secret}')::INT <> 6 THEN RAISE EXCEPTION 'secret uses mismatch'; END IF;

  response := fishing_action(student,lease,'test-cancel-start-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}');
  response := fishing_action(student,lease,'test-cancel-1010','cancel',jsonb_build_object('sessionId',response #>> '{session,id}'));
  IF (response #>> '{state,baitUses,secret}')::INT <> 5 OR response #> '{state,activeSession}' <> 'null'::JSONB THEN RAISE EXCEPTION 'cancel refunded bait or kept active'; END IF;
  response := fishing_action(student,lease,'test-expire-start-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}');
  UPDATE fishing_sessions SET started_at=clock_timestamp()-INTERVAL '30 seconds' WHERE student_id=student AND status='active';
  response := fishing_action(student,lease,NULL,'state','{}');
  IF response #> '{state,activeSession}' <> 'null'::JSONB OR (response #>> '{state,baitUses,secret}')::INT <> 4 THEN RAISE EXCEPTION 'expiry refunded/rerolled cast'; END IF;

  -- A missed click still spends one bait and never creates an item.
  response := fishing_action(student,lease,'test-miss-start-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}');
  SELECT * INTO STRICT v_cast FROM fishing_sessions WHERE id=(response #>> '{session,id}')::UUID;
  UPDATE fishing_sessions SET wait_ms=1500,target_center=.5,started_at=clock_timestamp()-INTERVAL '1.7 seconds' WHERE id=v_cast.id;
  response := fishing_action(student,lease,'test-miss-settle-1010','settle',jsonb_build_object('sessionId',v_cast.id,'elapsedMs',1700));
  IF (response #>> '{result,success}')::BOOLEAN OR response->'result' ? 'catchId'
    OR (response #>> '{state,baitUses,secret}')::INT <> 3 OR (response #>> '{state,totals,caught}')::INT <> 1 THEN
    RAISE EXCEPTION 'miss spawned an item or refunded bait'; END IF;
  -- Server time and ownership matter independently of the browser timestamp.
  response := fishing_action(student,lease,'test-old-click-start-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}');
  SELECT * INTO STRICT v_cast FROM fishing_sessions WHERE id=(response #>> '{session,id}')::UUID;
  UPDATE fishing_sessions SET started_at=clock_timestamp()-INTERVAL '6 seconds' WHERE id=v_cast.id;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-old-click-1010','settle',jsonb_build_object('sessionId',v_cast.id,'elapsedMs',3000)); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'stale reported click accepted'; END IF;
  response := fishing_action(student,lease,'test-old-click-cancel-1010','cancel',jsonb_build_object('sessionId',v_cast.id));
  UPDATE fishing_accounts SET state=jsonb_set(state,'{baitUses,secret}','0') WHERE student_id=student;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-empty-bait-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'empty bait cast accepted'; END IF;
  UPDATE fishing_accounts SET state=jsonb_set(state,'{baitUses,secret}','4') WHERE student_id=student;
  UPDATE student_playtime_sessions SET last_heartbeat_at=clock_timestamp()-INTERVAL '30 seconds' WHERE student_id=student;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-stale-lease-1010','purchase','{"itemId":"common"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'stale lease allowed a fishing purchase'; END IF;
  UPDATE student_playtime_sessions SET last_heartbeat_at=clock_timestamp(),active=TRUE WHERE student_id=student;

  SELECT gold INTO before_gold FROM users WHERE id=student;
  UPDATE users SET gold=0 WHERE id=student;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-poor-purchase-1010','purchase','{"itemId":"secret","quantity":1}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed OR (SELECT (state #>> '{baitUses,secret}')::INT FROM fishing_accounts WHERE student_id=student) <> 4 THEN RAISE EXCEPTION 'poor purchase changed inventory'; END IF;
  UPDATE users SET gold=before_gold,daily_playtime_limit_minutes=0 WHERE id=student;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-time-block-1010','start','{"spotId":"shipwreck_bay","baitId":"secret","mapId":"GodotMapV2_PirateShore"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'expired playtime allowed a cast'; END IF;
  UPDATE users SET daily_playtime_limit_minutes=30 WHERE id=student;
  UPDATE student_playtime_sessions SET active=FALSE WHERE student_id=student;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-lease-block-1010','purchase','{"itemId":"common"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'inactive lease allowed purchase'; END IF;
  response := fishing_action(student,lease,NULL,'state','{}');
  IF NOT (response->>'success')::BOOLEAN THEN RAISE EXCEPTION 'inactive identity cannot read its fish'; END IF;
  -- A cast needs at least 15 seconds; other positive-time transactions remain available.
  UPDATE student_playtime_sessions SET active=TRUE,last_heartbeat_at=clock_timestamp() WHERE student_id=student;
  UPDATE student_playtime_daily SET played_seconds=1786 WHERE student_id=student;
  response := fishing_action(student,lease,'test-last-seconds-buy-1010','purchase','{"itemId":"common"}');
  IF NOT (response->>'success')::BOOLEAN THEN RAISE EXCEPTION 'under-15-second gate incorrectly blocked purchasing'; END IF;
  before_bait := (response #>> '{state,baitUses,common}')::INT;
  failed := FALSE;
  BEGIN PERFORM fishing_action(student,lease,'test-under15-cast-1010','start','{"spotId":"shipwreck_bay","baitId":"common","mapId":"GodotMapV2_PirateShore"}'); EXCEPTION WHEN OTHERS THEN failed := TRUE; END;
  IF NOT failed OR (SELECT (state #>> '{baitUses,common}')::INT FROM fishing_accounts WHERE student_id=student) <> before_bait THEN
    RAISE EXCEPTION 'under-15-second cast accepted or consumed bait'; END IF;
  UPDATE student_playtime_daily SET played_seconds=1785 WHERE student_id=student;
  UPDATE student_playtime_sessions SET active=TRUE,last_heartbeat_at=clock_timestamp() WHERE student_id=student;
  response := fishing_action(student,lease,'test-exact15-cast-1010','start','{"spotId":"shipwreck_bay","baitId":"common","mapId":"GodotMapV2_PirateShore"}');
  IF (response #>> '{state,baitUses,common}')::INT <> before_bait-1 THEN RAISE EXCEPTION 'exactly-15-second cast rejected'; END IF;
  response := fishing_action(student,lease,'test-exact15-cancel-1010','cancel',jsonb_build_object('sessionId',response #>> '{session,id}'));
  RAISE NOTICE 'Fishing SQL verification passed: authoritative price and target, idempotency, 51 entries, gates, no daily limit, no collection protection, appraisal, atomic sale, expiry and playtime.';
END $$;
ROLLBACK;
