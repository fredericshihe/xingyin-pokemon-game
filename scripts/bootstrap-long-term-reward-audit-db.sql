-- Minimal Supabase-compatible baseline for the disposable long-term reward audit DB.
-- This file is test-only. Production continues to use the real migration history.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END;
$$;

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  username TEXT UNIQUE,
  nickname TEXT,
  role TEXT NOT NULL,
  teacher_id UUID REFERENCES users(id) ON DELETE CASCADE,
  gold INT NOT NULL DEFAULT 0,
  energy INT NOT NULL DEFAULT 0,
  max_energy INT NOT NULL DEFAULT 10,
  registration_status TEXT DEFAULT 'approved',
  daily_playtime_limit_minutes INT NOT NULL DEFAULT 30
);

CREATE TABLE game_saves (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  game_data JSONB NOT NULL DEFAULT '{}'::JSONB,
  last_saved TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  save_revision BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE student_playtime_sessions (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  play_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT clock_timestamp(),
  ended_at TIMESTAMP WITH TIME ZONE
);

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
  v_limit_minutes INT;
  v_today DATE := (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE;
BEGIN
  SELECT u.daily_playtime_limit_minutes
  INTO v_limit_minutes
  FROM users u
  WHERE u.id = p_student_id
    AND u.role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  RETURN QUERY SELECT v_limit_minutes, 0, v_limit_minutes * 60, v_today;
END;
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
BEGIN
  SELECT * INTO v_status
  FROM settle_student_playtime_session(p_student_id, p_session_id, 'begin')
  LIMIT 1;

  INSERT INTO student_playtime_sessions (
    student_id,
    session_id,
    play_date,
    active,
    last_heartbeat_at,
    updated_at,
    ended_at
  )
  VALUES (
    p_student_id,
    LEFT(p_session_id, 128),
    v_status.play_date,
    TRUE,
    clock_timestamp(),
    clock_timestamp(),
    NULL
  )
  ON CONFLICT (student_id) DO UPDATE
  SET session_id = EXCLUDED.session_id,
      play_date = EXCLUDED.play_date,
      active = TRUE,
      last_heartbeat_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      ended_at = NULL;

  RETURN QUERY SELECT v_status.limit_minutes, v_status.played_seconds, v_status.remaining_seconds, v_status.play_date;
END;
$$;

CREATE OR REPLACE FUNCTION student_playtime_lease_is_valid(
  p_student_id UUID,
  p_session_id TEXT,
  p_allow_recent_end BOOLEAN DEFAULT TRUE
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM student_playtime_sessions s
    WHERE s.student_id = p_student_id
      AND s.session_id = LEFT(COALESCE(p_session_id, ''), 128)
      AND s.play_date = (clock_timestamp() AT TIME ZONE 'Asia/Shanghai')::DATE
      AND (
        s.active
        OR (
          p_allow_recent_end
          AND s.ended_at >= clock_timestamp() - INTERVAL '15 seconds'
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION preserve_game_data_world_string_array(
  p_game_data JSONB,
  p_existing_game_data JSONB,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_game_data $$;

CREATE OR REPLACE FUNCTION preserve_game_data_world_trainer_victory_counts(
  p_game_data JSONB,
  p_existing_game_data JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_game_data $$;

CREATE OR REPLACE FUNCTION preserve_game_data_world_hidden_gate_flags(
  p_game_data JSONB,
  p_existing_game_data JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$ SELECT p_game_data $$;

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
  v_existing_data JSONB;
  v_existing_saved TIMESTAMP WITH TIME ZONE;
  v_existing_revision BIGINT := 0;
  v_incoming_revision BIGINT := 0;
BEGIN
  IF COALESCE(p_game_data #>> '{_sync,revision}', '') ~ '^[0-9]+$' THEN
    v_incoming_revision := (p_game_data #>> '{_sync,revision}')::BIGINT;
  END IF;

  SELECT gs.game_data, gs.last_saved, gs.save_revision
  INTO v_existing_data, v_existing_saved, v_existing_revision
  FROM game_saves gs
  WHERE gs.user_id = p_user_id
  FOR UPDATE;

  IF FOUND AND v_incoming_revision <> v_existing_revision + 1 THEN
    RETURN QUERY SELECT v_existing_data, v_existing_saved, v_existing_revision, FALSE, '后端拒绝了旧版本存档。'::TEXT;
    RETURN;
  END IF;

  INSERT INTO game_saves (user_id, game_data, last_saved, save_revision)
  VALUES (p_user_id, p_game_data, clock_timestamp(), GREATEST(1, v_incoming_revision))
  ON CONFLICT (user_id) DO UPDATE
  SET game_data = EXCLUDED.game_data,
      last_saved = EXCLUDED.last_saved,
      save_revision = EXCLUDED.save_revision
  RETURNING game_saves.game_data, game_saves.last_saved, game_saves.save_revision
  INTO v_existing_data, v_existing_saved, v_existing_revision;

  RETURN QUERY SELECT v_existing_data, v_existing_saved, v_existing_revision, TRUE, NULL::TEXT;
END;
$$;
