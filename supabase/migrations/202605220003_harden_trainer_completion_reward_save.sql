-- Extend the reward-phase battle completion guard from bosses to all
-- configured trainer events. A paid victory reward is authoritative progress:
-- later stale snapshots must not remove lieutenant clears, same-day normal
-- trainer locks, or trainer victory counts.

CREATE OR REPLACE FUNCTION apply_configured_battle_completion_to_game_data(
  p_game_data JSONB,
  p_force_complete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_battle_phase TEXT;
  v_event_type TEXT;
  v_event_role TEXT;
  v_event_id TEXT;
  v_map_name TEXT;
  v_scoped_id TEXT;
  v_world JSONB;
  v_progress_ids JSONB;
  v_daily_ids JSONB;
  v_trainer_counts JSONB;
  v_current_trainer_count INT := 0;
  v_enemy_team JSONB;
  v_enemy_count INT := 0;
  v_remaining_enemy_count INT := 0;
  v_is_completed_battle_save BOOLEAN := FALSE;
  v_completion_key TEXT;
  v_is_reward_forced_event BOOLEAN := FALSE;
  v_is_daily_variant BOOLEAN := FALSE;
BEGIN
  IF p_game_data IS NULL THEN
    RETURN p_game_data;
  END IF;

  IF COALESCE(p_game_data #>> '{battleKind}', '') <> 'trainer' THEN
    RETURN p_game_data;
  END IF;

  v_battle_phase := COALESCE(p_game_data #>> '{battlePhase}', '');
  v_event_type := COALESCE(
    NULLIF(p_game_data #>> '{battleEventCompletion,eventType}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,battleEventCompletion,eventType}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEventCompletion,eventType}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,eventType}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEnvironment,eventType}', '')
  );
  v_event_role := COALESCE(
    NULLIF(p_game_data #>> '{battleEnvironment,eventRole}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEnvironment,eventRole}', ''),
    CASE
      WHEN v_event_type = 'boss' THEN 'boss'
      WHEN v_event_type = 'challenge' THEN 'challenge'
      WHEN v_event_type = 'trainer' THEN 'normal'
      ELSE NULL
    END
  );
  v_event_id := COALESCE(
    NULLIF(p_game_data #>> '{battleEventCompletion,eventId}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,battleEventCompletion,eventId}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEventCompletion,eventId}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,eventId}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEnvironment,eventId}', '')
  );
  v_map_name := COALESCE(
    NULLIF(p_game_data #>> '{battleEventCompletion,mapName}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,battleEventCompletion,mapName}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEventCompletion,mapName}', ''),
    NULLIF(p_game_data #>> '{battleEnvironment,mapName}', ''),
    NULLIF(p_game_data #>> '{battlePhaseData,battleEnvironment,mapName}', ''),
    NULLIF(p_game_data #>> '{world,currentMapName}', ''),
    NULLIF(p_game_data #>> '{currentMapName}', '')
  );

  IF v_event_type NOT IN ('boss', 'trainer', 'challenge') OR v_event_id IS NULL OR v_map_name IS NULL THEN
    RETURN p_game_data;
  END IF;

  v_completion_key := CASE
    WHEN v_event_type = 'boss' THEN 'defeatedBossIds'
    WHEN v_event_type = 'trainer' THEN 'defeatedTrainerIds'
    WHEN v_event_type = 'challenge' THEN 'completedChallengeIds'
    ELSE NULL
  END;

  IF v_completion_key IS NULL THEN
    RETURN p_game_data;
  END IF;

  v_enemy_team := CASE
    WHEN jsonb_typeof(p_game_data -> 'enemyTeam') = 'array' THEN p_game_data -> 'enemyTeam'
    ELSE '[]'::JSONB
  END;

  SELECT
    COUNT(*)::INT,
    COUNT(*) FILTER (
      WHERE (
        CASE
          WHEN enemy ->> 'currentHp' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (enemy ->> 'currentHp')::NUMERIC
          WHEN enemy ->> 'hp' ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (enemy ->> 'hp')::NUMERIC
          ELSE 1
        END
      ) > 0
    )::INT
  INTO v_enemy_count, v_remaining_enemy_count
  FROM jsonb_array_elements(v_enemy_team) AS enemy;

  v_is_reward_forced_event := COALESCE(p_force_complete, FALSE)
    AND v_event_type IN ('boss', 'trainer');
  v_is_completed_battle_save := (
    v_is_reward_forced_event
    OR v_battle_phase = 'victory'
    OR (v_event_type IN ('boss', 'trainer') AND v_enemy_count > 0 AND v_remaining_enemy_count = 0)
  );

  IF NOT v_is_completed_battle_save THEN
    RETURN p_game_data;
  END IF;

  v_scoped_id := v_map_name || ':' || v_event_id;
  v_world := CASE
    WHEN jsonb_typeof(p_game_data -> 'world') = 'object' THEN p_game_data -> 'world'
    ELSE '{}'::JSONB
  END;
  v_progress_ids := CASE
    WHEN jsonb_typeof(v_world -> v_completion_key) = 'array' THEN v_world -> v_completion_key
    ELSE '[]'::JSONB
  END;

  IF NOT (v_progress_ids ? v_scoped_id) THEN
    v_progress_ids := v_progress_ids || to_jsonb(v_scoped_id);
  END IF;
  v_world := jsonb_set(v_world, ARRAY[v_completion_key], v_progress_ids, TRUE);

  v_is_daily_variant := v_event_type = 'challenge'
    OR (v_event_type = 'trainer' AND COALESCE(v_event_role, 'normal') = 'normal');

  IF v_is_daily_variant THEN
    v_daily_ids := CASE
      WHEN jsonb_typeof(v_world -> 'dailyTrainerBattleIds') = 'array' THEN v_world -> 'dailyTrainerBattleIds'
      ELSE '[]'::JSONB
    END;
    v_trainer_counts := CASE
      WHEN jsonb_typeof(v_world -> 'trainerVictoryCounts') = 'object' THEN v_world -> 'trainerVictoryCounts'
      ELSE '{}'::JSONB
    END;

    IF NOT (v_daily_ids ? v_scoped_id) THEN
      v_daily_ids := v_daily_ids || to_jsonb(v_scoped_id);
      IF v_trainer_counts ->> v_scoped_id ~ '^[0-9]+$' THEN
        v_current_trainer_count := GREATEST((v_trainer_counts ->> v_scoped_id)::INT, 0);
      ELSE
        v_current_trainer_count := 0;
      END IF;
      v_trainer_counts := jsonb_set(
        v_trainer_counts,
        ARRAY[v_scoped_id],
        to_jsonb(LEAST(999, v_current_trainer_count + 1)),
        TRUE
      );
    END IF;

    v_world := jsonb_set(v_world, '{dailyTrainerBattleIds}', v_daily_ids, TRUE);
    v_world := jsonb_set(v_world, '{trainerVictoryCounts}', v_trainer_counts, TRUE);
  END IF;

  RETURN jsonb_set(p_game_data, '{world}', v_world, TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION apply_configured_boss_completion_to_game_data(
  p_game_data JSONB,
  p_force_complete BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT apply_configured_battle_completion_to_game_data($1, $2);
$$;

CREATE OR REPLACE FUNCTION apply_configured_boss_completion_to_game_data(
  p_game_data JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT apply_configured_battle_completion_to_game_data($1, FALSE);
$$;

CREATE OR REPLACE FUNCTION preserve_game_data_world_string_array(
  p_game_data JSONB,
  p_existing_game_data JSONB,
  p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_world JSONB;
  v_merged_values JSONB;
  v_incoming_daily_key TEXT;
  v_existing_daily_key TEXT;
  v_merged_daily_ids JSONB;
  v_merged_trainer_counts JSONB;
BEGIN
  IF p_game_data IS NULL OR p_existing_game_data IS NULL OR p_key IS NULL OR p_key = '' THEN
    RETURN p_game_data;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY value), '[]'::JSONB)
  INTO v_merged_values
  FROM (
    SELECT DISTINCT value
    FROM (
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(p_game_data #> ARRAY['world', p_key]) = 'array'
            THEN p_game_data #> ARRAY['world', p_key]
          ELSE '[]'::JSONB
        END
      ) AS value
      UNION
      SELECT jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(p_existing_game_data #> ARRAY['world', p_key]) = 'array'
            THEN p_existing_game_data #> ARRAY['world', p_key]
          ELSE '[]'::JSONB
        END
      ) AS value
    ) merged_source
    WHERE value <> ''
  ) merged_distinct;

  IF v_merged_values = '[]'::JSONB
    AND jsonb_typeof(p_game_data #> ARRAY['world', p_key]) IS DISTINCT FROM 'array'
    AND jsonb_typeof(p_existing_game_data #> ARRAY['world', p_key]) IS DISTINCT FROM 'array'
    AND (
      p_key <> 'defeatedTrainerIds'
      OR (
        jsonb_typeof(p_game_data #> '{world,dailyTrainerBattleIds}') IS DISTINCT FROM 'array'
        AND jsonb_typeof(p_existing_game_data #> '{world,dailyTrainerBattleIds}') IS DISTINCT FROM 'array'
        AND jsonb_typeof(p_game_data #> '{world,trainerVictoryCounts}') IS DISTINCT FROM 'object'
        AND jsonb_typeof(p_existing_game_data #> '{world,trainerVictoryCounts}') IS DISTINCT FROM 'object'
      )
    ) THEN
    RETURN p_game_data;
  END IF;

  v_world := CASE
    WHEN jsonb_typeof(p_game_data -> 'world') = 'object' THEN p_game_data -> 'world'
    ELSE '{}'::JSONB
  END;
  v_world := jsonb_set(v_world, ARRAY[p_key], v_merged_values, TRUE);

  IF p_key = 'defeatedTrainerIds' THEN
    v_incoming_daily_key := COALESCE(NULLIF(p_game_data #>> '{world,dailyRefreshKey}', ''), '');
    v_existing_daily_key := COALESCE(NULLIF(p_existing_game_data #>> '{world,dailyRefreshKey}', ''), '');

    IF v_incoming_daily_key <> '' AND v_incoming_daily_key = v_existing_daily_key THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(value) ORDER BY value), '[]'::JSONB)
      INTO v_merged_daily_ids
      FROM (
        SELECT DISTINCT value
        FROM (
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(p_game_data #> '{world,dailyTrainerBattleIds}') = 'array'
                THEN p_game_data #> '{world,dailyTrainerBattleIds}'
              ELSE '[]'::JSONB
            END
          ) AS value
          UNION
          SELECT jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof(p_existing_game_data #> '{world,dailyTrainerBattleIds}') = 'array'
                THEN p_existing_game_data #> '{world,dailyTrainerBattleIds}'
              ELSE '[]'::JSONB
            END
          ) AS value
        ) merged_daily_source
        WHERE value <> ''
      ) merged_daily_distinct;

      v_world := jsonb_set(v_world, '{dailyTrainerBattleIds}', v_merged_daily_ids, TRUE);
    END IF;

    SELECT COALESCE(jsonb_object_agg(key, to_jsonb(count_value) ORDER BY key), '{}'::JSONB)
    INTO v_merged_trainer_counts
    FROM (
      SELECT key, MAX(count_value)::INT AS count_value
      FROM (
        SELECT key, LEAST(999, GREATEST(0, value::INT)) AS count_value
        FROM jsonb_each_text(
          CASE
            WHEN jsonb_typeof(p_game_data #> '{world,trainerVictoryCounts}') = 'object'
              THEN p_game_data #> '{world,trainerVictoryCounts}'
            ELSE '{}'::JSONB
          END
        )
        WHERE key <> '' AND value ~ '^[0-9]+$'
        UNION ALL
        SELECT key, LEAST(999, GREATEST(0, value::INT)) AS count_value
        FROM jsonb_each_text(
          CASE
            WHEN jsonb_typeof(p_existing_game_data #> '{world,trainerVictoryCounts}') = 'object'
              THEN p_existing_game_data #> '{world,trainerVictoryCounts}'
            ELSE '{}'::JSONB
          END
        )
        WHERE key <> '' AND value ~ '^[0-9]+$'
      ) trainer_count_source
      GROUP BY key
      HAVING MAX(count_value) > 0
    ) trainer_count_merged;

    v_world := jsonb_set(v_world, '{trainerVictoryCounts}', v_merged_trainer_counts, TRUE);
  END IF;

  RETURN jsonb_set(p_game_data, '{world}', v_world, TRUE);
END;
$$;

NOTIFY pgrst, 'reload schema';
