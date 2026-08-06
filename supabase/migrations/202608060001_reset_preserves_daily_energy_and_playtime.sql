-- 重置进度 = 彻底重开一局，但当天已经消耗掉的额度必须留在账号上。
--
-- 背景：进度全部存在 game_saves.game_data 里（队伍、背包、图鉴、探索度、Boss/训练家
-- 完成标记、冠军塔记录、阶段奖励领取标记……），删掉这一行就等于全新开局，没有任何残留。
-- 但能量、能量上限和每日游玩时长是记在 users / student_playtime_daily 上的账号级额度，
-- 旧实现在重置时把 energy 无条件写回 6、max_energy 写回 10，等于把"重置"变成了
-- 每日能量的刷新按钮：打完 6 场 → 重置 → 又拿 6 点，可无限循环。
--
-- 本次修正后的规则：
--   * game_saves                      —— 整行删除，游戏进度零保留
--   * users.gold                      —— 回到新账号开局值（金币买到的东西都在存档里，一起没了）
--   * users.energy                    —— 保持不变，当天花掉的能量不返还
--   * users.max_energy                —— 保持不变（这是教师配置的上限，重置不得覆盖）
--   * users.last_energy_refilled_on   —— 保持不变，避免额外触发一次每日补满
--   * student_playtime_daily / student_playtime_sessions —— 完全不碰，今日已玩时长照常累计
--
-- 外层 clear_cloud_game_save（202607180002）已有"今日时长用完 / 会话租约无效则拒绝"的门禁，
-- 本迁移只替换内层实现，不改动那层包装与授权。

BEGIN;

CREATE OR REPLACE FUNCTION clear_cloud_game_save_unchecked(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_starting_gold CONSTANT INT := 500;
  v_gold_before INT;
  v_gold INT;
  v_energy INT;
  v_max_energy INT;
  v_gold_delta INT;
BEGIN
  SELECT COALESCE(u.gold, 0)
  INTO v_gold_before
  FROM users u
  WHERE u.id = p_user_id
    AND u.role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  DELETE FROM game_saves
  WHERE user_id = p_user_id;

  -- 只写 gold。energy / max_energy / last_energy_refilled_on 一律不出现在 SET 子句里，
  -- 这样重置无法成为能量来源。
  UPDATE users u
  SET gold = v_starting_gold
  WHERE u.id = p_user_id
  RETURNING
    u.gold,
    GREATEST(COALESCE(u.energy, 0), 0),
    GREATEST(COALESCE(u.max_energy, 10), COALESCE(u.energy, 0), 0)
  INTO v_gold, v_energy, v_max_energy;

  -- 让教师能在金币流水里看到重置行为。
  v_gold_delta := v_gold - v_gold_before;
  IF v_gold_delta <> 0 THEN
    INSERT INTO gold_logs (student_id, amount, reason, balance_after)
    VALUES (p_user_id, v_gold_delta, '重新开始游戏（清空进度）', v_gold);
  END IF;

  RETURN json_build_object(
    'success', true,
    'goldAfter', v_gold,
    'energyAfter', v_energy,
    'maxEnergyAfter', v_max_energy
  );
END;
$$;

REVOKE ALL ON FUNCTION clear_cloud_game_save_unchecked(UUID) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
