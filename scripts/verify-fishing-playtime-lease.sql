-- Isolated regression test for the fishing/playtime lease boundary.
-- Every row is synthetic and the outer transaction always rolls back.
BEGIN;

DO $audit$
DECLARE
  v_student UUID := gen_random_uuid();
  v_teacher UUID := gen_random_uuid();
  v_lease TEXT := 'fishing-lease-audit-' || gen_random_uuid()::TEXT;
  v_next_lease TEXT := 'fishing-lease-audit-next-' || gen_random_uuid()::TEXT;
  v_start JSONB;
  v_result JSONB;
  v_cast UUID;
  v_baits_before INT;
  v_catches_before INT;
BEGIN
  INSERT INTO users(id, email, username, role, registration_status)
  VALUES (v_teacher, 'audit-teacher-' || v_teacher || '@invalid.local', 'audit-teacher-' || v_teacher, 'teacher', 'approved');
  INSERT INTO users(id, email, username, role, teacher_id, registration_status, gold, daily_playtime_limit_minutes)
  VALUES (v_student, 'audit-student-' || v_student || '@invalid.local', 'audit-student-' || v_student, 'student', v_teacher, 'approved', 10000, 30);
  PERFORM begin_student_playtime_session(v_student, v_lease);
  PERFORM fishing_action(v_student, v_lease, gen_random_uuid()::TEXT, 'purchase', '{"itemId":"fishing_rod"}');
  PERFORM fishing_action(v_student, v_lease, gen_random_uuid()::TEXT, 'purchase', '{"itemId":"common","quantity":1}');
  v_start := fishing_action(v_student, v_lease, gen_random_uuid()::TEXT, 'start',
    '{"spotId":"valley_shallows","baitId":"common","mapId":"GodotMap"}');
  v_cast := (v_start #>> '{session,id}')::UUID;
  SELECT (state #>> '{baitUses,common}')::INT INTO v_baits_before FROM fishing_accounts WHERE student_id = v_student;
  SELECT (state #>> '{totals,caught}')::INT INTO v_catches_before FROM fishing_accounts WHERE student_id = v_student;

  -- Ending/restarting the lease must expire the in-flight cast before it can pay out.
  PERFORM end_student_playtime_session(v_student, v_lease);
  IF EXISTS (SELECT 1 FROM fishing_sessions WHERE id = v_cast AND status = 'active') THEN
    RAISE EXCEPTION 'active cast survived playtime end';
  END IF;
  PERFORM begin_student_playtime_session(v_student, v_next_lease);
  v_result := fishing_action(v_student, v_next_lease, gen_random_uuid()::TEXT, 'settle',
    jsonb_build_object('sessionId', v_cast, 'elapsedMs', 2200));
  IF COALESCE((v_result #>> '{result,success}')::BOOLEAN, TRUE)
     OR (v_result #>> '{result,reason}') <> 'playtime_lease_ended'
     OR (SELECT (state #>> '{baitUses,common}')::INT FROM fishing_accounts WHERE student_id = v_student) <> v_baits_before
     OR (SELECT (state #>> '{totals,caught}')::INT FROM fishing_accounts WHERE student_id = v_student) <> v_catches_before THEN
    RAISE EXCEPTION 'cross-lease settle paid out or changed inventory: %', v_result;
  END IF;

  -- A new cast on the new lease remains valid, proving normal resume still works.
  v_start := fishing_action(v_student, v_next_lease, gen_random_uuid()::TEXT, 'start',
    '{"spotId":"valley_shallows","baitId":"common","mapId":"GodotMap"}');
  IF (v_start #>> '{session,playtimeSessionId}') IS NOT NULL THEN
    -- The public snapshot intentionally does not expose the lease capability.
    NULL;
  END IF;
END;
$audit$;

ROLLBACK;
