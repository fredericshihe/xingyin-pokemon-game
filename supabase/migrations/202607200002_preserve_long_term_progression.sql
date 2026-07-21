-- Preserve every permanent fact introduced by the long-term progression update.
--
-- This is intentionally a table-level BEFORE UPDATE guard. It protects writes
-- from every current save RPC, older clients, retries, and future server paths.
-- Missing fields remain valid, so existing saves do not require a destructive
-- backfill and acquire the new shape only when they are next saved.

BEGIN;

CREATE OR REPLACE FUNCTION merge_long_term_progress_string_arrays(
  p_incoming JSONB,
  p_existing JSONB,
  p_limit INT DEFAULT 4096
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY value), '[]'::JSONB)
  FROM (
    SELECT DISTINCT value
    FROM (
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_incoming) = 'array' THEN p_incoming ELSE '[]'::JSONB END
      ) AS value
      UNION ALL
      SELECT jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(p_existing) = 'array' THEN p_existing ELSE '[]'::JSONB END
      ) AS value
    ) source_values
    WHERE value <> ''
    ORDER BY value
    LIMIT LEAST(4096, GREATEST(1, COALESCE(p_limit, 4096)))
  ) merged_values;
$$;

REVOKE ALL ON FUNCTION merge_long_term_progress_string_arrays(JSONB, JSONB, INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION preserve_game_data_long_term_progress(
  p_game_data JSONB,
  p_existing_game_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_game_data JSONB := COALESCE(p_game_data, '{}'::JSONB);
  v_world JSONB;
  v_incoming_world JSONB;
  v_existing_world JSONB;
  v_dex JSONB;
  v_incoming_dex JSONB;
  v_existing_dex JSONB;
  v_tower JSONB;
  v_incoming_tower JSONB;
  v_existing_tower JSONB;
  v_incoming_weekly JSONB;
  v_existing_weekly JSONB;
  v_weekly JSONB;
  v_incoming_season TEXT;
  v_existing_season TEXT;
  v_latest_season TEXT;
  v_incoming_number BIGINT;
  v_existing_number BIGINT;
  v_first_cleared_at TEXT;
BEGIN
  IF p_game_data IS NULL OR p_existing_game_data IS NULL THEN
    RETURN p_game_data;
  END IF;

  v_incoming_world := CASE WHEN jsonb_typeof(p_game_data -> 'world') = 'object' THEN p_game_data -> 'world' ELSE '{}'::JSONB END;
  v_existing_world := CASE WHEN jsonb_typeof(p_existing_game_data -> 'world') = 'object' THEN p_existing_game_data -> 'world' ELSE '{}'::JSONB END;
  v_world := v_incoming_world;

  v_world := jsonb_set(
    v_world,
    '{completedUnlockTaskIds}',
    merge_long_term_progress_string_arrays(v_incoming_world -> 'completedUnlockTaskIds', v_existing_world -> 'completedUnlockTaskIds'),
    TRUE
  );
  v_world := jsonb_set(
    v_world,
    '{completedUnlockTaskStepIds}',
    merge_long_term_progress_string_arrays(v_incoming_world -> 'completedUnlockTaskStepIds', v_existing_world -> 'completedUnlockTaskStepIds'),
    TRUE
  );
  v_world := jsonb_set(
    v_world,
    '{completionRewardClaimIds}',
    merge_long_term_progress_string_arrays(v_incoming_world -> 'completionRewardClaimIds', v_existing_world -> 'completionRewardClaimIds'),
    TRUE
  );

  v_incoming_dex := CASE WHEN jsonb_typeof(v_incoming_world -> 'dexProgress') = 'object' THEN v_incoming_world -> 'dexProgress' ELSE '{}'::JSONB END;
  v_existing_dex := CASE WHEN jsonb_typeof(v_existing_world -> 'dexProgress') = 'object' THEN v_existing_world -> 'dexProgress' ELSE '{}'::JSONB END;
  v_dex := v_incoming_dex;
  v_dex := jsonb_set(v_dex, '{registeredSpeciesKeys}', merge_long_term_progress_string_arrays(v_incoming_dex -> 'registeredSpeciesKeys', v_existing_dex -> 'registeredSpeciesKeys'), TRUE);
  v_dex := jsonb_set(v_dex, '{wildCapturedSpeciesKeys}', merge_long_term_progress_string_arrays(v_incoming_dex -> 'wildCapturedSpeciesKeys', v_existing_dex -> 'wildCapturedSpeciesKeys'), TRUE);
  v_incoming_number := CASE WHEN COALESCE(v_incoming_dex ->> 'migrationVersion', '') ~ '^[0-9]+$' THEN (v_incoming_dex ->> 'migrationVersion')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_dex ->> 'migrationVersion', '') ~ '^[0-9]+$' THEN (v_existing_dex ->> 'migrationVersion')::BIGINT ELSE 0 END;
  v_dex := jsonb_set(v_dex, '{migrationVersion}', to_jsonb(GREATEST(v_incoming_number, v_existing_number)), TRUE);
  v_incoming_number := CASE WHEN COALESCE(v_incoming_dex ->> 'version', '') ~ '^[0-9]+$' THEN (v_incoming_dex ->> 'version')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_dex ->> 'version', '') ~ '^[0-9]+$' THEN (v_existing_dex ->> 'version')::BIGINT ELSE 0 END;
  v_dex := jsonb_set(v_dex, '{version}', to_jsonb(GREATEST(v_incoming_number, v_existing_number, 1)), TRUE);
  v_world := jsonb_set(v_world, '{dexProgress}', v_dex, TRUE);

  v_incoming_tower := CASE WHEN jsonb_typeof(v_incoming_world -> 'championTower') = 'object' THEN v_incoming_world -> 'championTower' ELSE '{}'::JSONB END;
  v_existing_tower := CASE WHEN jsonb_typeof(v_existing_world -> 'championTower') = 'object' THEN v_existing_world -> 'championTower' ELSE '{}'::JSONB END;
  v_tower := v_incoming_tower;

  v_incoming_number := CASE WHEN COALESCE(v_incoming_tower ->> 'highestStoryFloor', '') ~ '^[0-9]+$' THEN (v_incoming_tower ->> 'highestStoryFloor')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_tower ->> 'highestStoryFloor', '') ~ '^[0-9]+$' THEN (v_existing_tower ->> 'highestStoryFloor')::BIGINT ELSE 0 END;
  v_tower := jsonb_set(v_tower, '{highestStoryFloor}', to_jsonb(LEAST(10, GREATEST(v_incoming_number, v_existing_number))), TRUE);

  v_incoming_number := CASE WHEN COALESCE(v_incoming_tower ->> 'totalWeeklyClears', '') ~ '^[0-9]+$' THEN (v_incoming_tower ->> 'totalWeeklyClears')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_tower ->> 'totalWeeklyClears', '') ~ '^[0-9]+$' THEN (v_existing_tower ->> 'totalWeeklyClears')::BIGINT ELSE 0 END;
  v_tower := jsonb_set(v_tower, '{totalWeeklyClears}', to_jsonb(LEAST(9999, GREATEST(v_incoming_number, v_existing_number))), TRUE);

  v_incoming_number := CASE WHEN COALESCE(v_incoming_tower ->> 'bestWinStreak', '') ~ '^[0-9]+$' THEN (v_incoming_tower ->> 'bestWinStreak')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_tower ->> 'bestWinStreak', '') ~ '^[0-9]+$' THEN (v_existing_tower ->> 'bestWinStreak')::BIGINT ELSE 0 END;
  v_tower := jsonb_set(v_tower, '{bestWinStreak}', to_jsonb(LEAST(9999, GREATEST(v_incoming_number, v_existing_number))), TRUE);

  v_tower := jsonb_set(
    v_tower,
    '{championTrophyEarned}',
    to_jsonb(COALESCE(v_incoming_tower ->> 'championTrophyEarned', 'false') = 'true' OR COALESCE(v_existing_tower ->> 'championTrophyEarned', 'false') = 'true'),
    TRUE
  );
  v_first_cleared_at := COALESCE(NULLIF(v_existing_tower ->> 'firstClearedAt', ''), NULLIF(v_incoming_tower ->> 'firstClearedAt', ''));
  IF v_first_cleared_at IS NOT NULL THEN
    v_tower := jsonb_set(v_tower, '{firstClearedAt}', to_jsonb(v_first_cleared_at), TRUE);
  END IF;

  v_incoming_weekly := CASE WHEN jsonb_typeof(v_incoming_tower -> 'weekly') = 'object' THEN v_incoming_tower -> 'weekly' ELSE '{}'::JSONB END;
  v_existing_weekly := CASE WHEN jsonb_typeof(v_existing_tower -> 'weekly') = 'object' THEN v_existing_tower -> 'weekly' ELSE '{}'::JSONB END;
  v_incoming_season := CASE WHEN COALESCE(v_incoming_weekly ->> 'seasonKey', '') ~ '^[0-9]{4}-W[0-9]{2}$' THEN v_incoming_weekly ->> 'seasonKey' ELSE NULL END;
  v_existing_season := CASE WHEN COALESCE(v_existing_weekly ->> 'seasonKey', '') ~ '^[0-9]{4}-W[0-9]{2}$' THEN v_existing_weekly ->> 'seasonKey' ELSE NULL END;
  v_latest_season := GREATEST(COALESCE(v_incoming_season, ''), COALESCE(v_existing_season, ''));

  IF v_latest_season = '' THEN
    v_weekly := jsonb_build_object('seasonKey', NULL, 'highestFloor', 0, 'rewardClaimed', FALSE);
  ELSIF v_incoming_season = v_existing_season THEN
    v_incoming_number := CASE WHEN COALESCE(v_incoming_weekly ->> 'highestFloor', '') ~ '^[0-9]+$' THEN (v_incoming_weekly ->> 'highestFloor')::BIGINT ELSE 0 END;
    v_existing_number := CASE WHEN COALESCE(v_existing_weekly ->> 'highestFloor', '') ~ '^[0-9]+$' THEN (v_existing_weekly ->> 'highestFloor')::BIGINT ELSE 0 END;
    v_weekly := jsonb_build_object(
      'seasonKey', v_latest_season,
      'highestFloor', LEAST(10, GREATEST(v_incoming_number, v_existing_number)),
      'rewardClaimed', COALESCE(v_incoming_weekly ->> 'rewardClaimed', 'false') = 'true' OR COALESCE(v_existing_weekly ->> 'rewardClaimed', 'false') = 'true'
    );
  ELSE
    v_weekly := CASE WHEN v_incoming_season = v_latest_season THEN v_incoming_weekly ELSE v_existing_weekly END;
  END IF;
  v_tower := jsonb_set(v_tower, '{weekly}', v_weekly, TRUE);
  v_tower := jsonb_set(v_tower, '{version}', to_jsonb(1), TRUE);
  v_world := jsonb_set(v_world, '{championTower}', v_tower, TRUE);

  v_incoming_number := CASE WHEN COALESCE(v_incoming_world ->> 'longTermProgressVersion', '') ~ '^[0-9]+$' THEN (v_incoming_world ->> 'longTermProgressVersion')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_world ->> 'longTermProgressVersion', '') ~ '^[0-9]+$' THEN (v_existing_world ->> 'longTermProgressVersion')::BIGINT ELSE 0 END;
  v_world := jsonb_set(v_world, '{longTermProgressVersion}', to_jsonb(GREATEST(v_incoming_number, v_existing_number, 1)), TRUE);
  v_incoming_number := CASE WHEN COALESCE(v_incoming_world ->> 'unlockTaskMigrationVersion', '') ~ '^[0-9]+$' THEN (v_incoming_world ->> 'unlockTaskMigrationVersion')::BIGINT ELSE 0 END;
  v_existing_number := CASE WHEN COALESCE(v_existing_world ->> 'unlockTaskMigrationVersion', '') ~ '^[0-9]+$' THEN (v_existing_world ->> 'unlockTaskMigrationVersion')::BIGINT ELSE 0 END;
  v_world := jsonb_set(v_world, '{unlockTaskMigrationVersion}', to_jsonb(GREATEST(v_incoming_number, v_existing_number)), TRUE);

  RETURN jsonb_set(v_game_data, '{world}', v_world, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION preserve_game_data_long_term_progress(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION preserve_game_save_monotonic_world_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.game_data IS NOT NULL AND OLD.game_data IS NOT NULL THEN
    NEW.game_data := preserve_game_data_world_string_array(NEW.game_data, OLD.game_data, 'defeatedBossIds');
    NEW.game_data := preserve_game_data_world_string_array(NEW.game_data, OLD.game_data, 'defeatedTrainerIds');
    NEW.game_data := preserve_game_data_world_string_array(NEW.game_data, OLD.game_data, 'completedChallengeIds');
    NEW.game_data := preserve_game_data_world_string_array(NEW.game_data, OLD.game_data, 'collectedEventIds');
    NEW.game_data := preserve_game_data_world_trainer_victory_counts(NEW.game_data, OLD.game_data);
    NEW.game_data := preserve_game_data_world_hidden_gate_flags(NEW.game_data, OLD.game_data);
    NEW.game_data := preserve_game_data_long_term_progress(NEW.game_data, OLD.game_data);
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION preserve_game_save_monotonic_world_progress() FROM PUBLIC, anon, authenticated;

-- Recreate explicitly so schema drift cannot leave an older trigger binding.
DROP TRIGGER IF EXISTS preserve_game_save_monotonic_world_progress ON game_saves;
CREATE TRIGGER preserve_game_save_monotonic_world_progress
BEFORE UPDATE OF game_data ON game_saves
FOR EACH ROW
EXECUTE FUNCTION preserve_game_save_monotonic_world_progress();

NOTIFY pgrst, 'reload schema';

COMMIT;
