-- Synthetic users only. The entire test, including all DDL, is rolled back.
BEGIN;
CREATE TABLE public._teacher_delete_audit_blocker (student_id uuid REFERENCES public.users(id));
DO $$
DECLARE
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  tp uuid := gen_random_uuid();
  s1 uuid := gen_random_uuid();
  s2 uuid := gen_random_uuid();
  sp uuid := gen_random_uuid();
  sr uuid := gen_random_uuid();
  sb uuid := gen_random_uuid();
  reused uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  prefix text := 'ui_delete_audit_' || replace(gen_random_uuid()::text, '-', '');
  result jsonb;
  n integer;
  child record;
BEGIN
  INSERT INTO public.users(id,email,username,nickname,role,plain_password,registration_status)
    VALUES(t1,prefix||'t1@test.invalid',prefix||'t1','合成老师甲','teacher','audit-teacher-1','approved'),
          (t2,prefix||'t2@test.invalid',prefix||'t2','合成老师乙','teacher','audit-teacher-2','approved'),
          (tp,prefix||'tp@test.invalid',prefix||'tp','合成待审核老师','teacher','audit-teacher-p','pending');
  INSERT INTO public.users(id,email,username,nickname,role,teacher_id,plain_password,registration_status)
    VALUES(s1,prefix||'s1@test.invalid',prefix||'s1','合成学生甲','student',t1,'audit-student','approved'),
          (s2,prefix||'s2@test.invalid',prefix||'s2','合成其他班学生','student',t2,'audit-student','approved'),
          (sp,prefix||'sp@test.invalid',prefix||'sp','合成待审核学生','student',t1,'audit-student','pending'),
          (sr,prefix||'sr@test.invalid',prefix||'sr','合成拒绝学生','student',t1,'audit-student','rejected'),
          (sb,prefix||'sb@test.invalid',prefix||'sb','合成回滚学生','student',t1,'audit-student','approved');

  -- Match the production save trigger: an active lease must precede a save.
  INSERT INTO public.student_playtime_daily(student_id,play_date)
    VALUES(s1,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date),(sb,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date);
  INSERT INTO public.student_playtime_sessions(student_id,play_date,session_id,active,last_heartbeat_at)
    VALUES(s1,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date,'audit-session',true,clock_timestamp()),
          (sb,(clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::date,'audit-session-blocked',true,clock_timestamp());
  INSERT INTO public.game_saves(user_id,game_data)
    VALUES(s1,'{"_sync":{"playtimeSessionId":"audit-session"}}'),(sb,'{"_sync":{"playtimeSessionId":"audit-session-blocked"}}');
  INSERT INTO public.gold_logs(student_id,teacher_id,amount,balance_after) VALUES(s1,t1,10,10),(sb,t1,10,10);
  INSERT INTO public.energy_logs(student_id,teacher_id,amount,energy_after,max_energy_after) VALUES(s1,t1,1,5,10);
  INSERT INTO public.teacher_rewards(student_id,teacher_id,reward_type,item_type,item_key,quantity) VALUES(s1,t1,'item','pokeball','pokeball_basic',1),(sb,t1,'item','pokeball','pokeball_basic',1);
  INSERT INTO public.student_gameplay_logs(student_id,teacher_id,event_type) VALUES(s1,t1,'fishing_catch');
  INSERT INTO public.timber_bank_accounts(student_id) VALUES(s1);
  INSERT INTO public.timber_bank_ledger(student_id,request_id,action) VALUES(s1,gen_random_uuid(),'stable_deposit');
  INSERT INTO public.timber_bank_limit_orders(student_id,request_id,side,target_price,amount_gold) VALUES(s1,gen_random_uuid(),'buy',100,10);
  INSERT INTO public.fishing_accounts(student_id) VALUES(s1);
  INSERT INTO public.fishing_sessions(id,student_id,spot_id,bait_id,catch_id,tier,width,seconds,target_center,wait_ms,deadline_ms)
    VALUES(session_id,s1,'valley_pond','common','c01','common',0.2,2,0.5,1500,10000);
  INSERT INTO public.fishing_requests(student_id,request_id,action,payload,response) VALUES(s1,'audit-request-123456','state','{}','{}');
  INSERT INTO public.fishing_treasures(student_id,catch_id,catch_session_id) VALUES(s1,'t01',session_id);
  INSERT INTO public.pokemon_release_receipts(student_id,request_id,monster_id,source,gold,rarity,pokemon_name,pokemon_level)
    VALUES(s1,gen_random_uuid(),'audit-pokemon','party',10,'common','合成伙伴',5);

  IF (public.teacher_delete_student(t1,s1,'wrong',prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'wrong password accepted'; END IF;
  IF (public.teacher_delete_student(t1,s1,NULL,prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'empty password accepted'; END IF;
  IF (public.teacher_delete_student(t2,s1,'audit-teacher-2',prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'cross-teacher deletion accepted'; END IF;
  IF (public.teacher_delete_student(tp,s1,'audit-teacher-p',prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'pending teacher accepted'; END IF;
  IF (public.teacher_delete_student(s1,s2,'audit-student',prefix||'s2')->>'success')::boolean THEN RAISE EXCEPTION 'student impersonation accepted'; END IF;
  IF (public.teacher_delete_student(t1,t1,'audit-teacher-1',prefix||'t1')->>'success')::boolean THEN RAISE EXCEPTION 'teacher account deletion accepted'; END IF;
  IF (public.teacher_delete_student(t1,s1,'audit-teacher-1','wrong-target')->>'success')::boolean THEN RAISE EXCEPTION 'stale target accepted'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.game_saves WHERE user_id=s1) THEN RAISE EXCEPTION 'denied operation altered save'; END IF;

  INSERT INTO public._teacher_delete_audit_blocker VALUES(sb);
  BEGIN
    PERFORM public.teacher_delete_student(t1,sb,'audit-teacher-1',prefix||'sb');
    RAISE EXCEPTION 'expected restrictive FK to reject deletion';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=sb)
    OR NOT EXISTS(SELECT 1 FROM public.game_saves WHERE user_id=sb)
    OR NOT EXISTS(SELECT 1 FROM public.gold_logs WHERE student_id=sb)
    OR NOT EXISTS(SELECT 1 FROM public.teacher_rewards WHERE student_id=sb)
    OR EXISTS(SELECT 1 FROM public.teacher_account_deletions WHERE student_id=sb) THEN
    RAISE EXCEPTION 'failed deletion was not fully rolled back';
  END IF;

  result := public.teacher_delete_student(t1,s1,'audit-teacher-1',prefix||'s1');
  IF NOT (result->>'success')::boolean THEN RAISE EXCEPTION 'owned deletion failed: %',result; END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE id=s1) THEN RAISE EXCEPTION 'user retained'; END IF;
  FOR child IN SELECT * FROM (VALUES
    ('game_saves','user_id'),('gold_logs','student_id'),('energy_logs','student_id'),('teacher_rewards','student_id'),
    ('student_gameplay_logs','student_id'),('student_playtime_daily','student_id'),('student_playtime_sessions','student_id'),
    ('timber_bank_accounts','student_id'),('timber_bank_ledger','student_id'),('timber_bank_limit_orders','student_id'),
    ('fishing_accounts','student_id'),('fishing_sessions','student_id'),('fishing_requests','student_id'),('fishing_treasures','student_id'),
    ('pokemon_release_receipts','student_id')) AS owned(table_name,column_name)
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I=$1',child.table_name,child.column_name) INTO n USING s1;
    IF n<>0 THEN RAISE EXCEPTION 'associated data retained in %',child.table_name; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=s2) OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=t1) THEN RAISE EXCEPTION 'unrelated account altered'; END IF;
  result := public.teacher_delete_student(t1,s1,'audit-teacher-1',prefix||'s1');
  IF result->>'alreadyDeleted'<>'true' THEN RAISE EXCEPTION 'timeout replay was not idempotent'; END IF;
  IF (public.teacher_delete_student(t2,s1,'audit-teacher-2',prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'receipt disclosed to foreign teacher'; END IF;
  IF (public.teacher_delete_student(t1,s1,'wrong',prefix||'s1')->>'success')::boolean THEN RAISE EXCEPTION 'retry skipped teacher credential'; END IF;
  SELECT count(*) INTO n FROM public.teacher_account_deletions WHERE student_id=s1;
  IF n<>1 THEN RAISE EXCEPTION 'duplicate deletion receipt'; END IF;

  IF NOT (public.teacher_delete_student(t1,sp,'audit-teacher-1',prefix||'sp')->>'success')::boolean THEN RAISE EXCEPTION 'pending student cannot be deleted'; END IF;
  IF NOT (public.teacher_delete_student(t1,sr,'audit-teacher-1',prefix||'sr')->>'success')::boolean THEN RAISE EXCEPTION 'rejected student cannot be deleted'; END IF;
  INSERT INTO public.users(id,email,username,role,teacher_id) VALUES(reused,prefix||'reuse@test.invalid',prefix||'s1','student',t1);
  PERFORM public.teacher_delete_student(t1,s1,'audit-teacher-1',prefix||'s1');
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=reused) THEN RAISE EXCEPTION 'retry removed new account with reused username'; END IF;
  IF has_table_privilege('anon','public.teacher_account_deletions','SELECT')
    OR has_table_privilege('authenticated','public.teacher_account_deletions','INSERT') THEN RAISE EXCEPTION 'deletion receipts exposed'; END IF;
  IF NOT has_function_privilege('anon','public.teacher_delete_student(uuid,uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'RPC inaccessible'; END IF;
  RAISE NOTICE 'PASS: ownership, credentials, target, 15 related tables, rollback, private receipts and retries';
END;
$$;
SELECT 'PASS: teacher deletion contract; all synthetic rows rolled back' AS result;
ROLLBACK;
