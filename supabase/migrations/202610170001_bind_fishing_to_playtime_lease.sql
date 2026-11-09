-- Bind every cast to the playtime lease that created it.
-- A client can call the table-password RPCs directly, so a cast must never
-- survive an explicit end, a stale lease, or a lease replacement.
BEGIN;

ALTER TABLE fishing_sessions
  ADD COLUMN IF NOT EXISTS playtime_session_id TEXT;

UPDATE fishing_sessions f
SET playtime_session_id = s.session_id
FROM student_playtime_sessions s
WHERE s.student_id = f.student_id
  AND s.active
  AND f.status = 'active'
  AND f.playtime_session_id IS NULL;

CREATE OR REPLACE FUNCTION bind_fishing_playtime_session()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.playtime_session_id IS NULL THEN
    SELECT s.session_id
    INTO NEW.playtime_session_id
    FROM student_playtime_sessions s
    WHERE s.student_id = NEW.student_id
      AND s.active
      AND s.play_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE
    FOR UPDATE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bind_fishing_playtime_session_before_insert ON fishing_sessions;
CREATE TRIGGER bind_fishing_playtime_session_before_insert
BEFORE INSERT ON fishing_sessions
FOR EACH ROW
EXECUTE FUNCTION bind_fishing_playtime_session();

CREATE OR REPLACE FUNCTION expire_fishing_on_playtime_lease_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.active
     AND (
       NOT NEW.active
       OR NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.play_date IS DISTINCT FROM OLD.play_date
     ) THEN
    UPDATE fishing_sessions
    SET status = 'expired',
        ended_at = clock_timestamp(),
        result = jsonb_build_object(
          'success', FALSE,
          'reason', 'playtime_lease_ended',
          'message', '游玩会话结束，本竿已失效；鱼饵不会返还。'
        )
    WHERE student_id = NEW.student_id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS expire_fishing_on_playtime_lease_change ON student_playtime_sessions;
CREATE TRIGGER expire_fishing_on_playtime_lease_change
AFTER UPDATE OF active, session_id, play_date ON student_playtime_sessions
FOR EACH ROW
EXECUTE FUNCTION expire_fishing_on_playtime_lease_change();

CREATE INDEX IF NOT EXISTS fishing_sessions_playtime_session_idx
  ON fishing_sessions(student_id, playtime_session_id)
  WHERE status = 'active';

NOTIFY pgrst, 'reload schema';
COMMIT;
