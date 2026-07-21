-- Claim long-term progression rewards in one server transaction.
--
-- This migration is deliberately data-neutral: it creates functions only and
-- never updates an existing save. The new RPC is called only by opt-in clients.

BEGIN;

CREATE OR REPLACE FUNCTION long_term_progression_reward_items(
  p_map_id TEXT,
  p_threshold INT
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chapter INT;
BEGIN
  v_chapter := CASE p_map_id
    WHEN 'GodotMap' THEN 1
    WHEN 'GodotMapV2' THEN 2
    WHEN 'GodotMapV2_MistLake' THEN 3
    WHEN 'GodotMapV2_FarmTown' THEN 4
    WHEN 'GodotMapV2_PirateShore' THEN 5
    WHEN 'GodotMapV2_Graveyard' THEN 6
    WHEN 'GodotMapV2_HexRuins' THEN 7
    WHEN 'GodotMapV2_SurvivalRidge' THEN 8
    WHEN 'GodotMapV2_BossHighland' THEN 9
    WHEN 'GodotMapV2_FrostDojo' THEN 10
    WHEN 'GodotMapV2_TideDojo' THEN 11
    WHEN 'GodotMapV2_IronDojo' THEN 12
    WHEN 'GodotMapV2_DragonDojo' THEN 13
    WHEN 'GodotMapV2_ChampionTower' THEN 14
    ELSE NULL
  END;

  IF v_chapter IS NULL OR p_threshold NOT IN (25, 50, 75, 100) THEN
    RETURN NULL;
  END IF;

  IF v_chapter = 14 THEN
    RETURN CASE p_threshold
      WHEN 25 THEN '[{"itemType":"potion","itemKey":"hyper_potion","quantity":2}]'::JSONB
      WHEN 50 THEN '[{"itemType":"pokeball","itemKey":"pokeball_ultra","quantity":2}]'::JSONB
      WHEN 75 THEN '[{"itemType":"expPotion","itemKey":"exp_potion_super","quantity":1}]'::JSONB
      WHEN 100 THEN '[{"itemType":"pokeball","itemKey":"pokeball_master","quantity":1}]'::JSONB
    END;
  ELSIF v_chapter >= 9 THEN
    RETURN CASE p_threshold
      WHEN 25 THEN '[{"itemType":"pokeball","itemKey":"pokeball_ultra","quantity":1}]'::JSONB
      WHEN 50 THEN '[{"itemType":"potion","itemKey":"hyper_potion","quantity":2}]'::JSONB
      WHEN 75 THEN '[{"itemType":"expPotion","itemKey":"exp_potion_large","quantity":1}]'::JSONB
      WHEN 100 THEN '[{"itemType":"pokeball","itemKey":"pokeball_ultra","quantity":2},{"itemType":"potion","itemKey":"max_potion","quantity":1}]'::JSONB
    END;
  ELSIF v_chapter >= 5 THEN
    RETURN CASE p_threshold
      WHEN 25 THEN '[{"itemType":"pokeball","itemKey":"pokeball_great","quantity":1}]'::JSONB
      WHEN 50 THEN '[{"itemType":"potion","itemKey":"super_potion","quantity":2}]'::JSONB
      WHEN 75 THEN '[{"itemType":"expPotion","itemKey":"exp_potion_medium","quantity":1}]'::JSONB
      WHEN 100 THEN '[{"itemType":"pokeball","itemKey":"pokeball_ultra","quantity":1},{"itemType":"expPotion","itemKey":"exp_potion_medium","quantity":1}]'::JSONB
    END;
  END IF;

  RETURN CASE p_threshold
    WHEN 25 THEN '[{"itemType":"pokeball","itemKey":"pokeball_basic","quantity":2}]'::JSONB
    WHEN 50 THEN '[{"itemType":"potion","itemKey":"potion","quantity":2}]'::JSONB
    WHEN 75 THEN '[{"itemType":"expPotion","itemKey":"exp_potion_small","quantity":1}]'::JSONB
    WHEN 100 THEN '[{"itemType":"pokeball","itemKey":"pokeball_great","quantity":1},{"itemType":"expPotion","itemKey":"exp_potion_small","quantity":1}]'::JSONB
  END;
END;
$$;

REVOKE ALL ON FUNCTION long_term_progression_reward_items(TEXT, INT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION merge_long_term_reward_inventory(
  p_inventory JSONB,
  p_reward_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inventory JSONB := CASE WHEN jsonb_typeof(p_inventory) = 'array' THEN p_inventory ELSE '[]'::JSONB END;
  v_rewards JSONB := CASE WHEN jsonb_typeof(p_reward_items) = 'array' THEN p_reward_items ELSE '[]'::JSONB END;
  v_reward JSONB;
  v_index INT;
  v_reward_quantity INT;
  v_existing_quantity INT;
BEGIN
  FOR v_reward IN SELECT value FROM jsonb_array_elements(v_rewards)
  LOOP
    v_reward_quantity := CASE
      WHEN COALESCE(v_reward ->> 'quantity', '') ~ '^[0-9]+$'
        THEN LEAST(999999, (v_reward ->> 'quantity')::INT)
      ELSE 0
    END;
    IF v_reward_quantity <= 0 OR COALESCE(v_reward ->> 'itemType', '') = '' OR COALESCE(v_reward ->> 'itemKey', '') = '' THEN
      CONTINUE;
    END IF;

    v_index := NULL;
    SELECT (entry.ordinality - 1)::INT
    INTO v_index
    FROM jsonb_array_elements(v_inventory) WITH ORDINALITY AS entry(value, ordinality)
    WHERE entry.value ->> 'itemType' = v_reward ->> 'itemType'
      AND entry.value ->> 'itemKey' = v_reward ->> 'itemKey'
    ORDER BY entry.ordinality
    LIMIT 1;

    IF v_index IS NULL THEN
      v_inventory := v_inventory || jsonb_build_array(jsonb_build_object(
        'itemType', v_reward ->> 'itemType',
        'itemKey', v_reward ->> 'itemKey',
        'quantity', v_reward_quantity
      ));
    ELSE
      v_existing_quantity := CASE
        WHEN COALESCE(v_inventory #>> ARRAY[v_index::TEXT, 'quantity'], '') ~ '^[0-9]+$'
          THEN (v_inventory #>> ARRAY[v_index::TEXT, 'quantity'])::INT
        ELSE 0
      END;
      v_inventory := jsonb_set(
        v_inventory,
        ARRAY[v_index::TEXT, 'quantity'],
        to_jsonb(LEAST(999999, GREATEST(0, v_existing_quantity) + v_reward_quantity)),
        TRUE
      );
    END IF;
  END LOOP;

  RETURN v_inventory;
END;
$$;

REVOKE ALL ON FUNCTION merge_long_term_reward_inventory(JSONB, JSONB) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS claim_long_term_progression_reward(UUID, TEXT, TEXT, INT, TEXT, INT, BIGINT, TEXT, INT);

CREATE OR REPLACE FUNCTION claim_long_term_progression_reward(
  p_user_id UUID,
  p_reward_kind TEXT,
  p_map_id TEXT,
  p_threshold INT,
  p_season_key TEXT,
  p_catalog_version INT,
  p_expected_revision BIGINT,
  p_playtime_session_id TEXT,
  p_observed_completion_percent INT
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  accepted BOOLEAN,
  error_message TEXT,
  reward_claim_id TEXT,
  reward_items JSONB,
  already_claimed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status RECORD;
  v_saved_at TIMESTAMP WITH TIME ZONE := clock_timestamp();
  v_game_data JSONB;
  v_last_saved TIMESTAMP WITH TIME ZONE;
  v_revision BIGINT := 0;
  v_next_revision BIGINT;
  v_world JSONB;
  v_tower JSONB;
  v_weekly JSONB;
  v_claim_ids JSONB;
  v_claim_id TEXT;
  v_reward_items JSONB;
  v_current_season_key TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
  v_weekly_story_floor INT := 0;
  v_weekly_highest_floor INT := 0;
BEGIN
  IF p_catalog_version IS DISTINCT FROM 1 THEN
    RETURN QUERY SELECT NULL::JSONB, NULL::TIMESTAMP WITH TIME ZONE, 0::BIGINT, FALSE,
      '奖励目录版本不一致，请刷新游戏后重试。'::TEXT, NULL::TEXT, '[]'::JSONB, FALSE;
    RETURN;
  END IF;

  IF p_reward_kind = 'map_completion' THEN
    v_reward_items := long_term_progression_reward_items(p_map_id, p_threshold);
    IF v_reward_items IS NULL THEN
      RETURN QUERY SELECT NULL::JSONB, NULL::TIMESTAMP WITH TIME ZONE, 0::BIGINT, FALSE,
        '奖励目录不存在。'::TEXT, NULL::TEXT, '[]'::JSONB, FALSE;
      RETURN;
    END IF;
    v_claim_id := 'map:' || p_map_id || ':completion:v1:' || p_threshold::TEXT;
  ELSIF p_reward_kind = 'tower_weekly' THEN
    IF p_season_key IS DISTINCT FROM v_current_season_key THEN
      RETURN QUERY SELECT NULL::JSONB, NULL::TIMESTAMP WITH TIME ZONE, 0::BIGINT, FALSE,
        '冠军塔赛季已经刷新，请重新读取。'::TEXT, NULL::TEXT, '[]'::JSONB, FALSE;
      RETURN;
    END IF;
    v_claim_id := 'tower:weekly:' || v_current_season_key || ':clear';
    v_reward_items := '[{"itemType":"pokeball","itemKey":"pokeball_ultra","quantity":2},{"itemType":"potion","itemKey":"super_potion","quantity":2}]'::JSONB;
  ELSE
    RETURN QUERY SELECT NULL::JSONB, NULL::TIMESTAMP WITH TIME ZONE, 0::BIGINT, FALSE,
      '未知的长期进度奖励。'::TEXT, NULL::TEXT, '[]'::JSONB, FALSE;
    RETURN;
  END IF;

  SELECT *
  INTO v_status
  FROM settle_student_playtime_session(p_user_id, NULL, 'check')
  LIMIT 1;

  SELECT gs.game_data, gs.last_saved, COALESCE(gs.save_revision, 0)
  INTO v_game_data, v_last_saved, v_revision
  FROM game_saves gs
  WHERE gs.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::JSONB, NULL::TIMESTAMP WITH TIME ZONE, 0::BIGINT, FALSE,
      '未找到云端存档。'::TEXT, v_claim_id, v_reward_items, FALSE;
    RETURN;
  END IF;

  IF COALESCE(v_status.remaining_seconds, 0) <= 0 THEN
    RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, FALSE,
      '今日游玩时间已用完。'::TEXT, v_claim_id, v_reward_items, FALSE;
    RETURN;
  END IF;

  IF NOT student_playtime_lease_is_valid(p_user_id, p_playtime_session_id, TRUE) THEN
    RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, FALSE,
      '无法确认当前游玩会话，请重新校验时长。'::TEXT, v_claim_id, v_reward_items, FALSE;
    RETURN;
  END IF;

  v_world := CASE WHEN jsonb_typeof(v_game_data -> 'world') = 'object' THEN v_game_data -> 'world' ELSE '{}'::JSONB END;
  v_claim_ids := CASE WHEN jsonb_typeof(v_world -> 'completionRewardClaimIds') = 'array' THEN v_world -> 'completionRewardClaimIds' ELSE '[]'::JSONB END;

  IF v_claim_ids ? v_claim_id THEN
    RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, TRUE,
      NULL::TEXT, v_claim_id, v_reward_items, TRUE;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision <> v_revision THEN
    RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, FALSE,
      '后端拒绝了旧版本存档。'::TEXT, v_claim_id, v_reward_items, FALSE;
    RETURN;
  END IF;

  IF p_reward_kind = 'map_completion' THEN
    IF p_observed_completion_percent IS NULL
      OR p_observed_completion_percent < p_threshold
      OR p_observed_completion_percent > 100 THEN
      RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, FALSE,
        '地图完成度尚未达到领取条件。'::TEXT, v_claim_id, v_reward_items, FALSE;
      RETURN;
    END IF;
  ELSE
    v_tower := CASE WHEN jsonb_typeof(v_world -> 'championTower') = 'object' THEN v_world -> 'championTower' ELSE '{}'::JSONB END;
    v_weekly := CASE WHEN jsonb_typeof(v_tower -> 'weekly') = 'object' THEN v_tower -> 'weekly' ELSE '{}'::JSONB END;
    v_weekly_story_floor := CASE
      WHEN COALESCE(v_tower ->> 'highestStoryFloor', '') ~ '^[0-9]+$' THEN (v_tower ->> 'highestStoryFloor')::INT
      ELSE 0
    END;
    v_weekly_highest_floor := CASE
      WHEN COALESCE(v_weekly ->> 'highestFloor', '') ~ '^[0-9]+$' THEN (v_weekly ->> 'highestFloor')::INT
      ELSE 0
    END;
    IF v_weekly ->> 'seasonKey' IS DISTINCT FROM v_current_season_key
      OR v_weekly_story_floor < 10
      OR v_weekly_highest_floor < 10 THEN
      RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, FALSE,
        '本周尚未完成冠军塔第 10 层。'::TEXT, v_claim_id, v_reward_items, FALSE;
      RETURN;
    END IF;
    v_weekly := jsonb_set(v_weekly, '{rewardClaimed}', 'true'::JSONB, TRUE);
    v_tower := jsonb_set(v_tower, '{weekly}', v_weekly, TRUE);
    v_world := jsonb_set(v_world, '{championTower}', v_tower, TRUE);
  END IF;

  v_world := jsonb_set(
    v_world,
    '{completionRewardClaimIds}',
    merge_long_term_progress_string_arrays(jsonb_build_array(v_claim_id), v_claim_ids),
    TRUE
  );

  IF p_reward_kind = 'map_completion'
    AND p_map_id = 'GodotMapV2_ChampionTower'
    AND p_threshold = 100 THEN
    v_tower := CASE WHEN jsonb_typeof(v_world -> 'championTower') = 'object' THEN v_world -> 'championTower' ELSE '{}'::JSONB END;
    v_tower := jsonb_set(v_tower, '{championTrophyEarned}', 'true'::JSONB, TRUE);
    v_world := jsonb_set(v_world, '{championTower}', v_tower, TRUE);
  END IF;

  v_game_data := jsonb_set(v_game_data, '{world}', v_world, TRUE);
  v_game_data := jsonb_set(
    v_game_data,
    '{playerInventory}',
    merge_long_term_reward_inventory(v_game_data -> 'playerInventory', v_reward_items),
    TRUE
  );
  v_next_revision := v_revision + 1;
  v_game_data := jsonb_set(
    v_game_data,
    '{_sync}',
    CASE WHEN jsonb_typeof(v_game_data -> '_sync') = 'object' THEN v_game_data -> '_sync' ELSE '{}'::JSONB END,
    TRUE
  );
  v_game_data := jsonb_set(v_game_data, '{_sync,revision}', to_jsonb(v_next_revision), TRUE);

  UPDATE game_saves gs
  SET game_data = v_game_data,
      last_saved = v_saved_at,
      save_revision = v_next_revision
  WHERE gs.user_id = p_user_id
  RETURNING gs.game_data, gs.last_saved, gs.save_revision
  INTO v_game_data, v_last_saved, v_revision;

  RETURN QUERY SELECT v_game_data, v_last_saved, v_revision, TRUE,
    NULL::TEXT, v_claim_id, v_reward_items, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION claim_long_term_progression_reward(UUID, TEXT, TEXT, INT, TEXT, INT, BIGINT, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_long_term_progression_reward(UUID, TEXT, TEXT, INT, TEXT, INT, BIGINT, TEXT, INT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
