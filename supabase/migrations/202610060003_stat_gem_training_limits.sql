-- Keep existing bonuses intact; count only future uses of the six single-stat gems.
BEGIN;

CREATE OR REPLACE FUNCTION public.game_normalize_stat_boosts(p_boosts JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_key TEXT;
  v_value JSONB;
  v_stat TEXT;
  v_amount NUMERIC;
BEGIN
  IF jsonb_typeof(p_boosts) IS DISTINCT FROM 'object' THEN RETURN v_result; END IF;
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_boosts) LOOP
    v_stat := CASE v_key
      WHEN 'hp' THEN 'maxHp' WHEN 'maxHp' THEN 'maxHp'
      WHEN 'attack' THEN 'atk' WHEN 'atk' THEN 'atk'
      WHEN 'defense' THEN 'def' WHEN 'def' THEN 'def'
      WHEN 'spAttack' THEN 'spAtk' WHEN 'specialAttack' THEN 'spAtk' WHEN 'spAtk' THEN 'spAtk'
      WHEN 'spDefense' THEN 'spDef' WHEN 'specialDefense' THEN 'spDef' WHEN 'spDef' THEN 'spDef'
      WHEN 'speed' THEN 'spd' WHEN 'spd' THEN 'spd' ELSE NULL END;
    IF v_stat IS NOT NULL AND (v_value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' THEN
      v_amount := FLOOR((v_value #>> '{}')::NUMERIC);
      v_result := jsonb_set(v_result, ARRAY[v_stat], to_jsonb(COALESCE((v_result ->> v_stat)::NUMERIC, 0) + v_amount));
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.game_inventory_item_quantity(p_data JSONB, p_key TEXT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(SUM(CASE WHEN item ->> 'quantity' ~ '^[0-9]+$'
    THEN (item ->> 'quantity')::NUMERIC ELSE 0 END), 0)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_data -> 'playerInventory') = 'array'
    THEN p_data -> 'playerInventory' ELSE '[]'::JSONB END) AS entries(item)
  WHERE item ->> 'itemKey' = p_key;
$$;

CREATE OR REPLACE FUNCTION public.validate_stat_gem_training(p_previous JSONB, p_next JSONB)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_keys TEXT[] := ARRAY['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd'];
  v_items TEXT[] := ARRAY['hp_stone', 'attack_stone', 'defense_stone', 'sp_attack_stone', 'sp_defense_stone', 'speed_stone'];
  v_amounts INT[] := ARRAY[5, 3, 3, 3, 3, 2];
  v_consumed INT[] := ARRAY[0, 0, 0, 0, 0, 0];
  v_candies NUMERIC := 0;
  v_previous_roster JSONB;
  v_next_roster JSONB;
  v_mon JSONB;
  v_old_mon JSONB;
  v_uses JSONB;
  v_old_uses JSONB;
  v_boosts JSONB;
  v_old_boosts JSONB;
  v_key TEXT;
  v_value JSONB;
  v_count INT;
  v_old_count INT;
  v_total INT;
  v_residual NUMERIC;
  v_candy_residual NUMERIC;
  v_i INT;
BEGIN
  v_previous_roster :=
    (CASE WHEN jsonb_typeof(p_previous -> 'playerTeam') = 'array' THEN p_previous -> 'playerTeam' ELSE '[]'::JSONB END) ||
    (CASE WHEN jsonb_typeof(p_previous -> 'storageBox') = 'array' THEN p_previous -> 'storageBox' ELSE '[]'::JSONB END);
  v_next_roster :=
    (CASE WHEN jsonb_typeof(p_next -> 'playerTeam') = 'array' THEN p_next -> 'playerTeam' ELSE '[]'::JSONB END) ||
    (CASE WHEN jsonb_typeof(p_next -> 'storageBox') = 'array' THEN p_next -> 'storageBox' ELSE '[]'::JSONB END);

  FOR v_mon IN SELECT value FROM jsonb_array_elements(v_next_roster) LOOP
    v_uses := COALESCE(NULLIF(v_mon -> 'statGemUses', 'null'::JSONB), '{}'::JSONB);
    IF jsonb_typeof(v_uses) <> 'object' THEN RAISE EXCEPTION '宝石使用次数无效。'; END IF;
    v_total := 0;
    FOR v_key, v_value IN SELECT * FROM jsonb_each(v_uses) LOOP
      IF NOT (v_key = ANY(v_keys)) OR jsonb_typeof(v_value) <> 'number'
        OR (v_value #>> '{}') !~ '^[0-4]$' THEN
        RAISE EXCEPTION '同一项最多使用4颗宝石。';
      END IF;
      v_total := v_total + (v_value #>> '{}')::INT;
    END LOOP;
    IF v_total > 10 THEN RAISE EXCEPTION '每只宝可梦最多使用10颗宝石。'; END IF;

    SELECT mon INTO v_old_mon FROM jsonb_array_elements(v_previous_roster) AS roster(mon)
    WHERE mon ->> 'id' = v_mon ->> 'id' LIMIT 1;
    IF v_old_mon IS NULL THEN
      -- Initial legacy imports retain their bonuses but cannot invent a used quota.
      IF v_total > 0 THEN RAISE EXCEPTION '新伙伴的宝石次数必须从0开始。'; END IF;
      CONTINUE;
    END IF;
    v_old_uses := COALESCE(NULLIF(v_old_mon -> 'statGemUses', 'null'::JSONB), '{}'::JSONB);
    v_boosts := game_normalize_stat_boosts(v_mon -> 'statBoosts');
    v_old_boosts := game_normalize_stat_boosts(v_old_mon -> 'statBoosts');
    v_candy_residual := NULL;

    FOR v_i IN 1..6 LOOP
      v_count := COALESCE((v_uses ->> v_keys[v_i])::INT, 0);
      v_old_count := COALESCE((v_old_uses ->> v_keys[v_i])::INT, 0);
      IF v_count < v_old_count THEN RAISE EXCEPTION '宝石使用次数不能回退，请重新读取存档。'; END IF;
      v_consumed[v_i] := v_consumed[v_i] + v_count - v_old_count;
      v_residual := COALESCE((v_boosts ->> v_keys[v_i])::NUMERIC, 0)
        - COALESCE((v_old_boosts ->> v_keys[v_i])::NUMERIC, 0)
        - (v_count - v_old_count) * v_amounts[v_i];
      IF v_residual < 0 OR MOD(v_residual, 5) <> 0
        OR (v_candy_residual IS NOT NULL AND v_residual <> v_candy_residual) THEN
        RAISE EXCEPTION '宝石提升数值或使用次数不匹配，请刷新游戏。';
      END IF;
      v_candy_residual := v_residual;
    END LOOP;
    v_candies := v_candies + v_candy_residual / 5;
  END LOOP;

  FOR v_i IN 1..6 LOOP
    IF v_consumed[v_i] > 0 AND game_inventory_item_quantity(p_previous, v_items[v_i])
      - game_inventory_item_quantity(p_next, v_items[v_i]) < v_consumed[v_i] THEN
      RAISE EXCEPTION '属性宝石库存与使用次数不匹配。';
    END IF;
  END LOOP;
  IF v_candies > 0 AND game_inventory_item_quantity(p_previous, 'rare_candy')
    - game_inventory_item_quantity(p_next, 'rare_candy') < v_candies THEN
    RAISE EXCEPTION '神奇糖果库存与属性提升不匹配。';
  END IF;
  IF v_candies > 0 OR EXISTS (SELECT 1 FROM unnest(v_consumed) AS spent(n) WHERE n > 0) THEN
    IF COALESCE(p_previous ->> 'activeEnemyId', '') <> '' OR COALESCE(p_next ->> 'activeEnemyId', '') <> ''
      OR p_previous ->> 'view' = 'battle' OR p_next ->> 'view' = 'battle' THEN
      RAISE EXCEPTION '属性宝石只能在战斗外使用。';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_stat_gem_training_limits()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_previous JSONB := CASE WHEN TG_OP = 'UPDATE' THEN OLD.game_data ELSE '{}'::JSONB END;
  v_roster JSONB;
BEGIN
  v_roster :=
    (CASE WHEN jsonb_typeof(NEW.game_data -> 'playerTeam') = 'array' THEN NEW.game_data -> 'playerTeam' ELSE '[]'::JSONB END) ||
    (CASE WHEN jsonb_typeof(NEW.game_data -> 'storageBox') = 'array' THEN NEW.game_data -> 'storageBox' ELSE '[]'::JSONB END);
  -- A staged rollout must not invalidate saves from the currently deployed client.
  -- Once adopted, the rule version stays enabled even if an old tab drops it.
  IF v_previous ->> 'statGemTrainingVersion' = '1' OR NEW.game_data ->> 'statGemTrainingVersion' = '1'
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_roster) AS roster(mon) WHERE mon ? 'statGemUses') THEN
    NEW.game_data := jsonb_set(NEW.game_data, '{statGemTrainingVersion}', '1'::JSONB);
    PERFORM validate_stat_gem_training(v_previous, NEW.game_data);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_stat_gem_training_before_save ON public.game_saves;
CREATE TRIGGER enforce_stat_gem_training_before_save
BEFORE INSERT OR UPDATE OF game_data ON public.game_saves
FOR EACH ROW EXECUTE FUNCTION public.enforce_stat_gem_training_limits();

REVOKE ALL ON FUNCTION public.game_normalize_stat_boosts(JSONB), public.game_inventory_item_quantity(JSONB, TEXT),
  public.validate_stat_gem_training(JSONB, JSONB), public.enforce_stat_gem_training_limits() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
