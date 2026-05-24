-- Reject same-revision cloud saves unless they are byte-for-byte identical.
-- This prevents a stale tab or late request with the same revision number from
-- overwriting newer progress while still allowing idempotent retries.

DROP FUNCTION IF EXISTS save_cloud_game_save(UUID, JSONB);

CREATE OR REPLACE FUNCTION save_cloud_game_save(
  p_user_id UUID,
  p_game_data JSONB
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  accepted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saved_at TIMESTAMP WITH TIME ZONE := NOW();
  v_existing_game_data JSONB;
  v_existing_last_saved TIMESTAMP WITH TIME ZONE;
  v_existing_revision BIGINT := 0;
  v_incoming_revision BIGINT;
  v_next_revision BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF p_game_data #>> '{_sync,revision}' ~ '^[0-9]+$' THEN
    v_incoming_revision := (p_game_data #>> '{_sync,revision}')::BIGINT;
  END IF;

  SELECT gs.game_data, gs.last_saved, COALESCE(gs.save_revision, 0)
  INTO v_existing_game_data, v_existing_last_saved, v_existing_revision
  FROM game_saves gs
  WHERE gs.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    v_next_revision := COALESCE(NULLIF(v_incoming_revision, 0), v_existing_revision + 1);

    IF v_next_revision < v_existing_revision THEN
      RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE;
      RETURN;
    END IF;

    IF v_next_revision = v_existing_revision THEN
      IF v_existing_game_data = p_game_data THEN
        RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE;
      ELSE
        RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE;
      END IF;
      RETURN;
    END IF;

    UPDATE game_saves gs
    SET game_data = p_game_data,
        last_saved = v_saved_at,
        save_revision = v_next_revision
    WHERE gs.user_id = p_user_id
    RETURNING gs.game_data, gs.last_saved, gs.save_revision
    INTO v_existing_game_data, v_existing_last_saved, v_existing_revision;

    RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE;
    RETURN;
  END IF;

  v_next_revision := COALESCE(NULLIF(v_incoming_revision, 0), 1);

  INSERT INTO game_saves (user_id, game_data, last_saved, save_revision)
  VALUES (p_user_id, p_game_data, v_saved_at, v_next_revision)
  RETURNING game_saves.game_data, game_saves.last_saved, game_saves.save_revision
  INTO v_existing_game_data, v_existing_last_saved, v_existing_revision;

  RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION save_cloud_game_save(UUID, JSONB) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
