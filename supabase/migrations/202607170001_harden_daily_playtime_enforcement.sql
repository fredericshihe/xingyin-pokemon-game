-- Make daily playtime server-authoritative and enforce it at every game-save write path.
-- Client clocks are used only for display; persisted time is derived from server timestamps.

BEGIN;

CREATE TABLE IF NOT EXISTS student_playtime_sessions (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL DEFAULT '',
  play_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT FALSE,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT student_playtime_sessions_session_id_length_check
    CHECK (char_length(session_id) <= 128)
);

ALTER TABLE student_playtime_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct student playtime session access" ON student_playtime_sessions;
CREATE POLICY "No direct student playtime session access"
  ON student_playtime_sessions
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

REVOKE ALL ON TABLE student_playtime_sessions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION settle_student_playtime_session(
  p_student_id UUID,
  p_session_id TEXT DEFAULT NULL,
  p_action TEXT DEFAULT 'status'
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMP WITH TIME ZONE := clock_timestamp();
  v_today DATE := (v_now AT TIME ZONE 'Asia/Shanghai')::DATE;
  v_action TEXT := LOWER(TRIM(COALESCE(p_action, 'status')));
  v_requested_session_id TEXT := LEFT(
    COALESCE(NULLIF(TRIM(COALESCE(p_session_id, '')), ''), 'legacy'),
    128
  );
  v_limit_minutes INT;
  v_limit_seconds INT;
  v_played_seconds INT := 0;
  v_session_id TEXT;
  v_session_date DATE;
  v_session_active BOOLEAN := FALSE;
  v_last_heartbeat_at TIMESTAMP WITH TIME ZONE;
  v_elapsed_seconds NUMERIC := 0;
  v_delta_seconds INT := 0;
  v_max_heartbeat_gap_seconds CONSTANT INT := 15;
  v_next_heartbeat_at TIMESTAMP WITH TIME ZONE;
BEGIN
  IF v_action NOT IN ('status', 'begin', 'heartbeat', 'end', 'check') THEN
    RAISE EXCEPTION 'Invalid playtime session action';
  END IF;

  -- The user row is the common lock for heartbeats, saves and resource mutations.
  SELECT GREATEST(0, LEAST(COALESCE(u.daily_playtime_limit_minutes, 30), 1440))
  INTO v_limit_minutes
  FROM users u
  WHERE u.id = p_student_id
    AND u.role = 'student'
    AND (u.registration_status IS NULL OR u.registration_status = 'approved')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit_seconds := v_limit_minutes * 60;

  INSERT INTO student_playtime_daily (student_id, play_date, played_seconds)
  VALUES (p_student_id, v_today, 0)
  ON CONFLICT ON CONSTRAINT student_playtime_daily_pkey DO NOTHING;

  SELECT GREATEST(COALESCE(d.played_seconds, 0), 0)
  INTO v_played_seconds
  FROM student_playtime_daily d
  WHERE d.student_id = p_student_id
    AND d.play_date = v_today
  FOR UPDATE;

  INSERT INTO student_playtime_sessions (
    student_id,
    session_id,
    play_date,
    active,
    last_heartbeat_at,
    updated_at
  )
  VALUES (
    p_student_id,
    v_requested_session_id,
    v_today,
    FALSE,
    v_now,
    v_now
  )
  ON CONFLICT (student_id) DO NOTHING;

  SELECT s.session_id, s.play_date, s.active, s.last_heartbeat_at
  INTO v_session_id, v_session_date, v_session_active, v_last_heartbeat_at
  FROM student_playtime_sessions s
  WHERE s.student_id = p_student_id
  FOR UPDATE;

  -- Never carry an active lease across a China-calendar day boundary.
  IF v_session_date IS DISTINCT FROM v_today THEN
    UPDATE student_playtime_sessions s
    SET session_id = v_requested_session_id,
        play_date = v_today,
        active = FALSE,
        last_heartbeat_at = v_now,
        updated_at = v_now
    WHERE s.student_id = p_student_id;

    v_session_id := v_requested_session_id;
    v_session_date := v_today;
    v_session_active := FALSE;
    v_last_heartbeat_at := v_now;
  ELSIF v_session_active AND v_last_heartbeat_at IS NOT NULL THEN
    v_elapsed_seconds := GREATEST(
      0,
      EXTRACT(EPOCH FROM (v_now - v_last_heartbeat_at))
    );

    IF v_elapsed_seconds > v_max_heartbeat_gap_seconds THEN
      -- A stale lease may represent a closed browser. Charge only the final lease window.
      v_delta_seconds := v_max_heartbeat_gap_seconds;
      v_next_heartbeat_at := v_now;
    ELSE
      v_delta_seconds := FLOOR(v_elapsed_seconds)::INT;
      -- Preserve sub-second remainder so frequent heartbeats cannot lose time.
      v_next_heartbeat_at := v_last_heartbeat_at + (v_delta_seconds * INTERVAL '1 second');
    END IF;

    v_delta_seconds := LEAST(
      GREATEST(v_delta_seconds, 0),
      GREATEST(v_limit_seconds - v_played_seconds, 0)
    );

    IF v_delta_seconds > 0 THEN
      UPDATE student_playtime_daily d
      SET played_seconds = LEAST(v_limit_seconds, d.played_seconds + v_delta_seconds),
          updated_at = v_now
      WHERE d.student_id = p_student_id
        AND d.play_date = v_today
      RETURNING d.played_seconds INTO v_played_seconds;
    END IF;

    IF v_elapsed_seconds >= 1 OR v_elapsed_seconds > v_max_heartbeat_gap_seconds THEN
      UPDATE student_playtime_sessions s
      SET last_heartbeat_at = v_next_heartbeat_at,
          updated_at = v_now
      WHERE s.student_id = p_student_id;
      v_last_heartbeat_at := v_next_heartbeat_at;
    END IF;
  END IF;

  IF v_action IN ('begin', 'heartbeat') THEN
    IF v_action = 'begin'
      OR v_session_id IS DISTINCT FROM v_requested_session_id THEN
      UPDATE student_playtime_sessions s
      SET session_id = v_requested_session_id,
          play_date = v_today,
          active = v_played_seconds < v_limit_seconds,
          last_heartbeat_at = v_now,
          updated_at = v_now
      WHERE s.student_id = p_student_id;

      v_session_id := v_requested_session_id;
      v_session_active := v_played_seconds < v_limit_seconds;
      v_last_heartbeat_at := v_now;
    ELSE
      UPDATE student_playtime_sessions s
      SET updated_at = v_now
      WHERE s.student_id = p_student_id;
    END IF;
  ELSIF v_action = 'end' AND v_session_id = v_requested_session_id THEN
    UPDATE student_playtime_sessions s
    SET active = FALSE,
        last_heartbeat_at = v_now,
        updated_at = v_now
    WHERE s.student_id = p_student_id;
    v_session_active := FALSE;
  END IF;

  IF v_played_seconds >= v_limit_seconds THEN
    UPDATE student_playtime_sessions s
    SET active = FALSE,
        updated_at = v_now
    WHERE s.student_id = p_student_id
      AND s.active;
  END IF;

  RETURN QUERY
  SELECT
    v_limit_minutes,
    GREATEST(v_played_seconds, 0),
    GREATEST(0, v_limit_seconds - GREATEST(v_played_seconds, 0)),
    v_today;
END;
$$;

REVOKE ALL ON FUNCTION settle_student_playtime_session(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_student_playtime_status(
  p_student_id UUID
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status.limit_minutes, status.played_seconds, status.remaining_seconds, status.play_date
  FROM settle_student_playtime_session(p_student_id, NULL, 'status') AS status;
$$;

CREATE OR REPLACE FUNCTION begin_student_playtime_session(
  p_student_id UUID,
  p_session_id TEXT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status.limit_minutes, status.played_seconds, status.remaining_seconds, status.play_date
  FROM settle_student_playtime_session(p_student_id, p_session_id, 'begin') AS status;
$$;

CREATE OR REPLACE FUNCTION heartbeat_student_playtime(
  p_student_id UUID,
  p_session_id TEXT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status.limit_minutes, status.played_seconds, status.remaining_seconds, status.play_date
  FROM settle_student_playtime_session(p_student_id, p_session_id, 'heartbeat') AS status;
$$;

CREATE OR REPLACE FUNCTION end_student_playtime_session(
  p_student_id UUID,
  p_session_id TEXT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status.limit_minutes, status.played_seconds, status.remaining_seconds, status.play_date
  FROM settle_student_playtime_session(p_student_id, p_session_id, 'end') AS status;
$$;

-- Keep the legacy signature for deployed clients, but never trust p_seconds.
CREATE OR REPLACE FUNCTION record_student_playtime(
  p_student_id UUID,
  p_seconds INT
)
RETURNS TABLE (
  limit_minutes INT,
  played_seconds INT,
  remaining_seconds INT,
  play_date DATE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT status.limit_minutes, status.played_seconds, status.remaining_seconds, status.play_date
  FROM settle_student_playtime_session(
    p_student_id,
    'legacy:' || p_student_id::TEXT,
    'begin'
  ) AS status;
$$;

GRANT EXECUTE ON FUNCTION get_student_playtime_status(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION begin_student_playtime_session(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION heartbeat_student_playtime(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION end_student_playtime_session(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_student_playtime(UUID, INT) TO anon, authenticated;

-- Preserve the battle/revision implementation while removing it from the API surface.
ALTER FUNCTION save_cloud_game_save(UUID, JSONB)
  RENAME TO save_cloud_game_save_unchecked;
ALTER FUNCTION save_cloud_game_state_with_resources(UUID, JSONB, INT, TEXT, INT, TEXT)
  RENAME TO save_cloud_game_state_with_resources_unchecked;
ALTER FUNCTION begin_teacher_reward_claim(UUID)
  RENAME TO begin_teacher_reward_claim_unchecked;

REVOKE ALL ON FUNCTION save_cloud_game_save_unchecked(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION save_cloud_game_state_with_resources_unchecked(UUID, JSONB, INT, TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION begin_teacher_reward_claim_unchecked(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION begin_teacher_reward_claim(
  p_student_id UUID
)
RETURNS TABLE (
  claim_token UUID,
  reward_id UUID,
  reward_type TEXT,
  item_type TEXT,
  item_key TEXT,
  quantity INT,
  pokemon_id INT,
  pokemon_level INT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
BEGIN
  SELECT *
  INTO v_status
  FROM settle_student_playtime_session(p_student_id, NULL, 'check')
  LIMIT 1;

  IF COALESCE(v_status.remaining_seconds, 0) <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    reward.claim_token,
    reward.reward_id,
    reward.reward_type,
    reward.item_type,
    reward.item_key,
    reward.quantity,
    reward.pokemon_id,
    reward.pokemon_level,
    reward.reason,
    reward.created_at
  FROM begin_teacher_reward_claim_unchecked(p_student_id) AS reward;
END;
$$;

GRANT EXECUTE ON FUNCTION begin_teacher_reward_claim(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION save_cloud_game_save(
  p_user_id UUID,
  p_game_data JSONB
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  accepted BOOLEAN,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
  v_session_id TEXT := LEFT(
    COALESCE(NULLIF(p_game_data #>> '{_sync,sessionId}', ''), 'save:' || p_user_id::TEXT),
    128
  );
  v_game_data JSONB;
  v_last_saved TIMESTAMP WITH TIME ZONE;
  v_save_revision BIGINT := 0;
BEGIN
  SELECT *
  INTO v_status
  FROM settle_student_playtime_session(p_user_id, v_session_id, 'heartbeat')
  LIMIT 1;

  IF COALESCE(v_status.remaining_seconds, 0) <= 0 THEN
    SELECT gs.game_data, gs.last_saved, COALESCE(gs.save_revision, 0)
    INTO v_game_data, v_last_saved, v_save_revision
    FROM game_saves gs
    WHERE gs.user_id = p_user_id;

    RETURN QUERY
    SELECT v_game_data, v_last_saved, v_save_revision, FALSE, '今日游玩时间已用完。'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    saved.game_data,
    saved.last_saved,
    saved.save_revision,
    saved.accepted,
    CASE WHEN saved.accepted THEN NULL::TEXT ELSE '后端拒绝了旧版本存档。'::TEXT END
  FROM save_cloud_game_save_unchecked(p_user_id, p_game_data) AS saved;
END;
$$;

CREATE OR REPLACE FUNCTION save_cloud_game_state_with_resources(
  p_user_id UUID,
  p_game_data JSONB,
  p_gold_delta INT DEFAULT 0,
  p_gold_reason TEXT DEFAULT '游戏金币变动',
  p_energy_delta INT DEFAULT 0,
  p_energy_reason TEXT DEFAULT '能量变动'
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  accepted BOOLEAN,
  error_message TEXT,
  gold_after INT,
  energy_after INT,
  max_energy_after INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
  v_session_id TEXT := LEFT(
    COALESCE(NULLIF(p_game_data #>> '{_sync,sessionId}', ''), 'save:' || p_user_id::TEXT),
    128
  );
  v_game_data JSONB;
  v_last_saved TIMESTAMP WITH TIME ZONE;
  v_save_revision BIGINT := 0;
  v_gold INT := 0;
  v_energy INT := 0;
  v_max_energy INT := 0;
BEGIN
  SELECT *
  INTO v_status
  FROM settle_student_playtime_session(p_user_id, v_session_id, 'heartbeat')
  LIMIT 1;

  IF COALESCE(v_status.remaining_seconds, 0) <= 0 THEN
    SELECT
      gs.game_data,
      gs.last_saved,
      COALESCE(gs.save_revision, 0),
      COALESCE(u.gold, 0),
      COALESCE(u.energy, 0),
      GREATEST(COALESCE(u.max_energy, 10), COALESCE(u.energy, 0), 0)
    INTO
      v_game_data,
      v_last_saved,
      v_save_revision,
      v_gold,
      v_energy,
      v_max_energy
    FROM users u
    LEFT JOIN game_saves gs ON gs.user_id = u.id
    WHERE u.id = p_user_id
      AND u.role = 'student';

    RETURN QUERY
    SELECT
      v_game_data,
      v_last_saved,
      v_save_revision,
      FALSE,
      '今日游玩时间已用完。'::TEXT,
      v_gold,
      v_energy,
      v_max_energy;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    saved.game_data,
    saved.last_saved,
    saved.save_revision,
    saved.accepted,
    saved.error_message,
    saved.gold_after,
    saved.energy_after,
    saved.max_energy_after
  FROM save_cloud_game_state_with_resources_unchecked(
    p_user_id,
    p_game_data,
    p_gold_delta,
    p_gold_reason,
    p_energy_delta,
    p_energy_reason
  ) AS saved;
END;
$$;

GRANT EXECUTE ON FUNCTION save_cloud_game_save(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_cloud_game_state_with_resources(UUID, JSONB, INT, TEXT, INT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION reject_expired_student_game_save_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit_seconds INT;
  v_played_seconds INT;
  v_today DATE := playtime_today_cn();
BEGIN
  SELECT
    GREATEST(0, LEAST(COALESCE(u.daily_playtime_limit_minutes, 30), 1440)) * 60,
    GREATEST(COALESCE(d.played_seconds, 0), 0)
  INTO v_limit_seconds, v_played_seconds
  FROM users u
  LEFT JOIN student_playtime_daily d
    ON d.student_id = u.id
   AND d.play_date = v_today
  WHERE u.id = NEW.user_id
    AND u.role = 'student';

  IF FOUND AND v_played_seconds >= v_limit_seconds THEN
    RAISE EXCEPTION '今日游玩时间已用完。';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION reject_expired_student_game_save_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_student_playtime_before_game_save ON game_saves;
CREATE TRIGGER enforce_student_playtime_before_game_save
BEFORE INSERT OR UPDATE ON game_saves
FOR EACH ROW
EXECUTE FUNCTION reject_expired_student_game_save_write();

NOTIFY pgrst, 'reload schema';

COMMIT;
