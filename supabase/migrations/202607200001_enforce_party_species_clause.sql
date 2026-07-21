-- Enforce the active-party species clause when a student starts a new battle.
-- Existing in-progress battles remain saveable so legacy clients are not trapped.

BEGIN;

CREATE OR REPLACE FUNCTION game_save_has_active_battle(
  p_game_data JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE(p_game_data #>> '{activeEnemyId}', '') <> ''
    OR (
      COALESCE(p_game_data #>> '{view}', '') = 'battle'
      AND jsonb_array_length(
        CASE
          WHEN jsonb_typeof(p_game_data -> 'enemyTeam') = 'array'
            THEN p_game_data -> 'enemyTeam'
          ELSE '[]'::JSONB
        END
      ) > 0
    );
$$;

CREATE OR REPLACE FUNCTION game_save_has_duplicate_party_species(
  p_game_data JSONB
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM (
      SELECT CASE
        WHEN NULLIF(TRIM(monster ->> 'baseId'), '') IS NOT NULL
          THEN 'base:' || LOWER(TRIM(monster ->> 'baseId'))
        WHEN NULLIF(TRIM(monster ->> 'speciesId'), '') IS NOT NULL
          THEN 'base:' || LOWER(TRIM(monster ->> 'speciesId'))
        WHEN NULLIF(TRIM(monster ->> 'templateId'), '') IS NOT NULL
          THEN 'base:' || LOWER(TRIM(monster ->> 'templateId'))
        WHEN NULLIF(TRIM(monster ->> 'monsterId'), '') IS NOT NULL
          THEN 'base:' || LOWER(TRIM(monster ->> 'monsterId'))
        WHEN NULLIF(TRIM(monster ->> 'dexNo'), '') IS NOT NULL
          THEN 'dex:' || LOWER(TRIM(monster ->> 'dexNo'))
        WHEN NULLIF(TRIM(monster ->> 'pokedexId'), '') IS NOT NULL
          THEN 'dex:' || LOWER(TRIM(monster ->> 'pokedexId'))
        ELSE NULL
      END AS species_key
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(p_game_data -> 'playerTeam') = 'array'
            THEN p_game_data -> 'playerTeam'
          ELSE '[]'::JSONB
        END
      ) AS party(monster)
    ) AS species
    WHERE species.species_key IS NOT NULL
    GROUP BY species.species_key
    HAVING COUNT(*) > 1
  );
$$;

REVOKE ALL ON FUNCTION game_save_has_active_battle(JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION game_save_has_duplicate_party_species(JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION reject_expired_student_game_save_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_remaining_seconds INT;
  v_session_id TEXT;
  v_previous_battle_active BOOLEAN := FALSE;
BEGIN
  IF EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = NEW.user_id
      AND u.role = 'student'
  ) THEN
    SELECT status.remaining_seconds
    INTO v_remaining_seconds
    FROM settle_student_playtime_session(NEW.user_id, NULL, 'check') AS status
    LIMIT 1;

    IF COALESCE(v_remaining_seconds, 0) <= 0 THEN
      RAISE EXCEPTION '今日游玩时间已用完。';
    END IF;

    v_session_id := LEFT(
      COALESCE(NULLIF(NEW.game_data #>> '{_sync,playtimeSessionId}', ''), 'legacy:' || NEW.user_id::TEXT),
      128
    );
    IF NOT student_playtime_lease_is_valid(NEW.user_id, v_session_id, TRUE) THEN
      RAISE EXCEPTION '无法确认当前游玩会话，请重新校验时长。';
    END IF;

    IF TG_OP = 'UPDATE' THEN
      v_previous_battle_active := game_save_has_active_battle(OLD.game_data);
    END IF;

    IF game_save_has_active_battle(NEW.game_data)
      AND game_save_has_duplicate_party_species(NEW.game_data)
      AND NOT v_previous_battle_active THEN
      RAISE EXCEPTION '出战队伍不能包含重复物种，请先调整队伍。';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION reject_expired_student_game_save_write() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
