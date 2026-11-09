-- Isolated database only. Includes synthetic teachers/students and deterministic cast clocks; all rows roll back.
BEGIN;
INSERT INTO users(id,role,gold,daily_playtime_limit_minutes,registration_status,username)
VALUES('00000000-0000-0000-0000-000000002001','teacher',0,30,'approved','fishing-teacher'),
      ('00000000-0000-0000-0000-000000002002','teacher',0,30,'approved','other-teacher');
INSERT INTO users(id,role,gold,daily_playtime_limit_minutes,teacher_id,registration_status,username)
VALUES('00000000-0000-0000-0000-000000002010','student',10000,30,'00000000-0000-0000-0000-000000002001','approved','fishing-student'),
      ('00000000-0000-0000-0000-000000002011','student',10000,30,'00000000-0000-0000-0000-000000002002','approved','other-student');
INSERT INTO game_saves(user_id,game_data)
VALUES('00000000-0000-0000-0000-000000002010','{"currentMapName":"GodotMap","playerPos":{"x":2,"y":3},"world":{"defeatedBossIds":[]}}'),
      ('00000000-0000-0000-0000-000000002011','{"currentMapName":"GodotMap"}');
INSERT INTO student_playtime_sessions(student_id,session_id,play_date,active,last_heartbeat_at)
VALUES('00000000-0000-0000-0000-000000002010','fishing-rewards-session-2010',(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE,TRUE,clock_timestamp()),
      ('00000000-0000-0000-0000-000000002011','fishing-rewards-session-2011',(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE,TRUE,clock_timestamp());

DO $$
DECLARE
  student UUID:='00000000-0000-0000-0000-000000002010';
  teacher UUID:='00000000-0000-0000-0000-000000002001';
  lease TEXT:='fishing-rewards-session-2010';
  response JSONB; repeated JSONB; session_id UUID; treasure_a UUID; treasure_b UUID;
  wallet INT; before_wallet INT; price_a INT; before_logs INT; expected_bonus INT; i INT; grade_row RECORD;
  expected_grade TEXT; grade_count INT; failed BOOLEAN; elapsed NUMERIC;
BEGIN
  IF has_table_privilege('anon','fishing_treasures','SELECT') OR has_table_privilege('authenticated','fishing_treasures','UPDATE')
     OR has_function_privilege('anon','fishing_roll_appraisal(integer,numeric,numeric)','EXECUTE') THEN RAISE EXCEPTION 'treasure internals publicly exposed'; END IF;
  FOR i IN 0..9999 LOOP
    SELECT * INTO grade_row FROM fishing_roll_appraisal(730,(i+.5)/10000,.5);
    expected_grade:=CASE WHEN i<5000 THEN 'ordinary' WHEN i<8000 THEN 'great' WHEN i<9500 THEN 'precious' WHEN i<9900 THEN 'exquisite' ELSE 'legendary' END;
    IF grade_row.grade<>expected_grade THEN RAISE EXCEPTION 'appraisal probability bucket incorrect at %',i; END IF;
  END LOOP;
  FOR i IN SELECT unnest(ARRAY[40,60,90,140,200,320,500,730]) LOOP
    FOR grade_row IN SELECT * FROM fishing_roll_appraisal(i,.999,.999999) LOOP
      IF grade_row.price<>i*30 THEN RAISE EXCEPTION 'maximum price bound incorrect'; END IF;
    END LOOP;
    SELECT * INTO grade_row FROM fishing_roll_appraisal(i,0,0);
    IF grade_row.price<>FLOOR(i*.5) THEN RAISE EXCEPTION 'minimum price bound incorrect'; END IF;
  END LOOP;

  response:=fishing_action(student,lease,'reward-buy-rod-2010','purchase','{"itemId":"fishing_rod","quantity":1}');
  response:=fishing_action(student,lease,'reward-buy-baits-2010','purchase','{"itemId":"common","quantity":3}');
  before_wallet:=(response->>'walletGold')::INT;
  FOR i IN 1..10 LOOP
    response:=fishing_action(student,lease,'reward-cast-'||LPAD(i::TEXT,8,'0'),'start','{"spotId":"valley_pond","baitId":"common","mapId":"GodotMap"}');
    session_id:=(response #>> '{session,id}')::UUID;
    UPDATE fishing_sessions SET catch_id='c01',weight=.1,tier='common',width=.16,seconds=1.4,target_center=.5,
      wait_ms=1500,deadline_ms=3612,started_at=clock_timestamp()-INTERVAL '2.2 seconds' WHERE id=session_id;
    response:=fishing_action(student,lease,'reward-settle-'||LPAD(i::TEXT,8,'0'),'settle',jsonb_build_object('sessionId',session_id,'elapsedMs',2200));
    expected_bonus:=CASE WHEN i>=2 THEN LEAST(8,i-1)+LEAST(4,1+FLOOR((i-2)/2)) ELSE 0 END;
    IF (response #>> '{result,hitStreak}')::INT<>i OR (response #>> '{result,bonusGold}')::INT<>expected_bonus THEN RAISE EXCEPTION 'streak reward mismatch at %',i; END IF;
    wallet:=(response->>'walletGold')::INT;
    SELECT COUNT(*) INTO before_logs FROM student_gameplay_logs WHERE student_id=student;
    repeated:=fishing_action(student,lease,'reward-settle-'||LPAD(i::TEXT,8,'0'),'settle',jsonb_build_object('sessionId',session_id,'elapsedMs',2200));
    IF (repeated->>'walletGold')::INT<>wallet OR (repeated #>> '{state,hitStreak}')::INT<>i THEN RAISE EXCEPTION 'request retry paid twice'; END IF;
    repeated:=fishing_action(student,lease,'new-settle-'||LPAD(i::TEXT,8,'0'),'settle',jsonb_build_object('sessionId',session_id,'elapsedMs',2200));
    IF (repeated->>'walletGold')::INT<>wallet OR (SELECT COUNT(*) FROM student_gameplay_logs WHERE student_id=student)<>before_logs THEN RAISE EXCEPTION 'new request duplicated terminal reward/log'; END IF;
  END LOOP;
  IF wallet<>before_wallet+68 OR (response #>> '{state,totals,comboEarned}')::INT<>68 THEN RAISE EXCEPTION 'ten perfects should award 68 total'; END IF;
  IF (SELECT COUNT(*) FROM gold_logs WHERE student_id=student AND reason='钓鱼连击奖励')<>9 THEN RAISE EXCEPTION 'bonus money logs missing'; END IF;

  -- A successful but non-perfect reel keeps the hit streak and only omits the perfect add-on.
  response:=fishing_action(student,lease,'reward-normal-cast-2010','start','{"spotId":"valley_pond","baitId":"common","mapId":"GodotMap"}');
  session_id:=(response #>> '{session,id}')::UUID;
  elapsed:=1500+.54*1400;
  UPDATE fishing_sessions SET catch_id='c01',tier='common',width=.16,seconds=1.4,target_center=.5,wait_ms=1500,deadline_ms=3612,
    started_at=clock_timestamp()-elapsed*INTERVAL '1 millisecond' WHERE id=session_id;
  response:=fishing_action(student,lease,'reward-normal-settle-2010','settle',jsonb_build_object('sessionId',session_id,'elapsedMs',elapsed));
  IF NOT (response #>> '{result,success}')::BOOLEAN OR (response #>> '{result,perfect}')::BOOLEAN OR (response #>> '{state,hitStreak}')::INT<>11
     OR (response #>> '{result,bonusGold}')::INT<>8 OR (response #>> '{result,perfectBonusGold}')::INT<>0
     OR (response->>'walletGold')::INT<>wallet+8 THEN RAISE EXCEPTION 'normal catch did not preserve hit streak'; END IF;

  -- Two pieces of the same treasure are independent and unknown until each appraisal.
  FOR i IN 1..2 LOOP
    response:=fishing_action(student,lease,'treasure-cast-'||LPAD(i::TEXT,8,'0'),'start','{"spotId":"valley_pond","baitId":"common","mapId":"GodotMap"}');
    session_id:=(response #>> '{session,id}')::UUID;
    UPDATE fishing_sessions SET catch_id='t01',weight=0,tier='uncommon',width=.13,seconds=1.3,target_center=.5,wait_ms=1500,deadline_ms=3334.5,
      started_at=clock_timestamp()-INTERVAL '2.15 seconds' WHERE id=session_id;
    response:=fishing_action(student,lease,'treasure-settle-'||LPAD(i::TEXT,8,'0'),'settle',jsonb_build_object('sessionId',session_id,'elapsedMs',2150));
    IF response->'result' ? 'price' OR EXISTS(SELECT 1 FROM jsonb_array_elements(response #> '{state,treasures}') t WHERE t ? 'price') THEN RAISE EXCEPTION 'unappraised price leaked'; END IF;
    IF i=1 THEN treasure_a:=(response #>> '{result,treasureId}')::UUID; ELSE treasure_b:=(response #>> '{result,treasureId}')::UUID; END IF;
  END LOOP;
  IF treasure_a=treasure_b THEN RAISE EXCEPTION 'piece IDs reused'; END IF;
  failed:=FALSE;
  BEGIN PERFORM fishing_action(student,lease,'treasure-unappraised-sell','sell',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a,'quantity',1)); EXCEPTION WHEN OTHERS THEN failed:=TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'unknown treasure sold'; END IF;
  response:=fishing_action(student,lease,'treasure-appraise-a-2010','appraise',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a,'price',999999,'appraisalGrade','legendary'));
  price_a:=(response #>> '{result,price}')::INT;
  IF price_a NOT BETWEEN 20 AND 1200 OR response #>> '{result,appraisalGrade}' NOT IN ('ordinary','great','precious','exquisite','legendary') THEN RAISE EXCEPTION 'random appraisal out of bounds'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(response #> '{state,treasures}') t WHERE t->>'id'=treasure_b::TEXT AND t ? 'price') THEN RAISE EXCEPTION 'one appraisal valued the entire species'; END IF;
  SELECT COUNT(*) INTO before_logs FROM student_gameplay_logs WHERE student_id=student;
  repeated:=fishing_action(student,lease,'treasure-reroll-a-2010','appraise',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a));
  IF (repeated #>> '{result,price}')::INT<>price_a OR (SELECT COUNT(*) FROM student_gameplay_logs WHERE student_id=student)<>before_logs THEN RAISE EXCEPTION 'appraisal rerolled or duplicated log'; END IF;
  failed:=FALSE;
  BEGIN PERFORM fishing_action('00000000-0000-0000-0000-000000002011','fishing-rewards-session-2011','treasure-stolen-2011','appraise',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a)); EXCEPTION WHEN OTHERS THEN failed:=TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'another student appraised treasure'; END IF;

  wallet:=(repeated->>'walletGold')::INT;
  response:=fishing_action(student,lease,'treasure-sell-a-2010','sell',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a,'quantity',1,'price',99999));
  IF (response #>> '{result,totalGold}')::INT<>price_a OR (response->>'walletGold')::INT<>wallet+price_a THEN RAISE EXCEPTION 'stored appraisal not used for sale'; END IF;
  repeated:=fishing_action(student,lease,'treasure-sell-a-2010','sell',jsonb_build_object('mapId','GodotMap','merchantId','valley','treasureId',treasure_a,'quantity',1,'price',99999));
  IF (repeated->>'walletGold')::INT<>wallet+price_a THEN RAISE EXCEPTION 'treasure sale duplicated'; END IF;
  response:=fishing_action(student,lease,'treasure-sell-all-2010','sell','{"mapId":"GodotMap","merchantId":"valley","all":true}');
  IF (response #>> '{state,catches,t01}')::INT<>1 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(response #> '{state,treasures}') t WHERE t->>'id'=treasure_b::TEXT) THEN RAISE EXCEPTION 'sell all consumed unappraised treasure'; END IF;

  -- Cancellation and expiry also break a live combo. Refresh itself never grants a bonus.
  UPDATE fishing_accounts SET state=jsonb_set(state,'{hitStreak}','5') WHERE student_id=student;
  response:=fishing_action(student,lease,'reward-cancel-start-2010','start','{"spotId":"valley_pond","baitId":"common","mapId":"GodotMap"}');
  response:=fishing_action(student,lease,'reward-cancel-end-2010','cancel',jsonb_build_object('sessionId',response #>> '{session,id}'));
  IF (response #>> '{state,hitStreak}')::INT<>0 THEN RAISE EXCEPTION 'cancel kept streak'; END IF;
  UPDATE fishing_accounts SET state=jsonb_set(state,'{hitStreak}','5') WHERE student_id=student;
  response:=fishing_action(student,lease,'reward-expire-start-2010','start','{"spotId":"valley_pond","baitId":"common","mapId":"GodotMap"}');
  UPDATE fishing_sessions SET started_at=clock_timestamp()-INTERVAL '30 seconds' WHERE id=(response #>> '{session,id}')::UUID;
  response:=fishing_action(student,lease,NULL,'state','{}');
  IF (response #>> '{state,hitStreak}')::INT<>0 THEN RAISE EXCEPTION 'expiry kept streak'; END IF;

  FOR expected_grade IN SELECT unnest(ARRAY['fishing_purchase','fishing_start','fishing_settle','fishing_cancel','fishing_appraise','fishing_sell','fishing_expired']) LOOP
    IF NOT EXISTS(SELECT 1 FROM get_student_gameplay_logs(teacher,student,300) WHERE event_type=expected_grade AND category='fishing') THEN RAISE EXCEPTION 'teacher missing % record',expected_grade; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM get_teacher_gameplay_logs_page(teacher,1000,0) WHERE event_type='fishing_settle' AND details #>> '{result,bonusGold}'='2') THEN RAISE EXCEPTION 'teacher-wide reward details absent'; END IF;
  failed:=FALSE;
  BEGIN PERFORM * FROM get_student_gameplay_logs('00000000-0000-0000-0000-000000002002',student,300); EXCEPTION WHEN OTHERS THEN failed:=TRUE; END;
  IF NOT failed THEN RAISE EXCEPTION 'other teacher read student logs'; END IF;
  IF EXISTS(SELECT 1 FROM get_teacher_gameplay_logs_page('00000000-0000-0000-0000-000000002002',1000,0) WHERE student_id=student) THEN RAISE EXCEPTION 'teacher feed crossed ownership'; END IF;
  RAISE NOTICE 'Fishing rewards verified: 68-gold mixed combo, reset rules, repeat guards, exact appraisal buckets, hidden prices, piece ownership, stored-value sales and complete teacher history.';
END $$;
ROLLBACK;
