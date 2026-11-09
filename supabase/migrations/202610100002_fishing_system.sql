-- Server-authoritative fishing. No daily cast limit; existing playtime applies.
-- The table-password login model uses an existing opaque playtime session as
-- its identity capability, following the Timber Bank session-only contract.
BEGIN;
DO $$ BEGIN
  IF to_regprocedure('settle_student_playtime_session(uuid,text,text)') IS NULL
     OR to_regprocedure('student_playtime_lease_is_valid(uuid,text,boolean)') IS NULL
     OR to_regclass('student_playtime_sessions') IS NULL THEN
    RAISE EXCEPTION '请先部署现行游玩时长和会话迁移';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS fishing_catalog (
  version INT PRIMARY KEY CHECK (version = 1), data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
INSERT INTO fishing_catalog(version, data) VALUES (1, $catalog${"catches":{"c01":{"id":"c01","name":"麦穗鱼","kind":"fish","tier":"common","price":12,"spotIds":["valley_shallows","valley_pond","lake_reeds"],"weightMin":0.03,"weightMax":0.12},"c02":{"id":"c02","name":"小鲫鱼","kind":"fish","tier":"common","price":16,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":0.1,"weightMax":0.5},"c03":{"id":"c03","name":"泥鳅","kind":"fish","tier":"common","price":12,"spotIds":["valley_pond","lake_reeds"],"weightMin":0.05,"weightMax":0.2},"c04":{"id":"c04","name":"溪虾","kind":"shrimp","tier":"common","price":14,"spotIds":["valley_shallows","valley_pond","lake_reeds"],"weightMin":0.02,"weightMax":0.06},"c05":{"id":"c05","name":"小河蟹","kind":"crab","tier":"common","price":16,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":0.1,"weightMax":0.3},"c06":{"id":"c06","name":"沙丁鱼","kind":"fish","tier":"common","price":14,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.08,"weightMax":0.3},"c07":{"id":"c07","name":"银鳀鱼","kind":"fish","tier":"common","price":10,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.03,"weightMax":0.12},"c08":{"id":"c08","name":"沙虾","kind":"shrimp","tier":"common","price":14,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.02,"weightMax":0.08},"c09":{"id":"c09","name":"沙蟹","kind":"crab","tier":"common","price":16,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.1,"weightMax":0.35},"c10":{"id":"c10","name":"银鳍白条","kind":"fish","tier":"common","price":14,"spotIds":["valley_shallows","lake_reeds","lake_deep"],"weightMin":0.05,"weightMax":0.25},"u01":{"id":"u01","name":"青背鲤","kind":"fish","tier":"uncommon","price":38,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":0.6,"weightMax":3.5},"u02":{"id":"u02","name":"花纹鲫","kind":"fish","tier":"uncommon","price":34,"spotIds":["valley_shallows","valley_pond","lake_reeds"],"weightMin":0.3,"weightMax":1.2},"u03":{"id":"u03","name":"黄鳝","kind":"fish","tier":"uncommon","price":44,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":0.15,"weightMax":0.7},"u04":{"id":"u04","name":"竹纹鲈","kind":"fish","tier":"uncommon","price":48,"spotIds":["valley_shallows","lake_reeds","lake_deep"],"weightMin":0.4,"weightMax":2.5},"u05":{"id":"u05","name":"大河虾","kind":"shrimp","tier":"uncommon","price":38,"spotIds":["valley_shallows","valley_pond","lake_reeds"],"weightMin":0.05,"weightMax":0.15},"u06":{"id":"u06","name":"青壳河蟹","kind":"crab","tier":"uncommon","price":50,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":0.2,"weightMax":0.8},"u07":{"id":"u07","name":"海鲈","kind":"fish","tier":"uncommon","price":42,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.8,"weightMax":4},"u08":{"id":"u08","name":"青花鲭","kind":"fish","tier":"uncommon","price":38,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.2,"weightMax":1},"u09":{"id":"u09","name":"梭子蟹","kind":"crab","tier":"uncommon","price":54,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.3,"weightMax":1},"u10":{"id":"u10","name":"斑节虾","kind":"shrimp","tier":"uncommon","price":54,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.08,"weightMax":0.25},"r01":{"id":"r01","name":"镜鳞鲤","kind":"fish","tier":"rare","price":130,"spotIds":["valley_pond","lake_reeds","lake_deep"],"weightMin":1.2,"weightMax":5},"r02":{"id":"r02","name":"斑点鳜","kind":"fish","tier":"rare","price":140,"spotIds":["lake_reeds","lake_deep"],"weightMin":0.6,"weightMax":3.5},"r03":{"id":"r03","name":"雾湖银鳗","kind":"fish","tier":"rare","price":160,"spotIds":["lake_deep"],"weightMin":0.8,"weightMax":4},"r04":{"id":"r04","name":"蓝晶河虾","kind":"shrimp","tier":"rare","price":150,"spotIds":["lake_reeds","lake_deep"],"weightMin":0.08,"weightMax":0.3},"r05":{"id":"r05","name":"绯壳河蟹","kind":"crab","tier":"rare","price":140,"spotIds":["valley_pond","lake_deep"],"weightMin":0.3,"weightMax":1.2},"r06":{"id":"r06","name":"珊瑚石斑","kind":"fish","tier":"rare","price":180,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":1,"weightMax":7},"r07":{"id":"r07","name":"银环海鲷","kind":"fish","tier":"rare","price":160,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.7,"weightMax":4},"r08":{"id":"r08","name":"月纹海鲈","kind":"fish","tier":"rare","price":150,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":1,"weightMax":5},"r09":{"id":"r09","name":"雪纹梭蟹","kind":"crab","tier":"rare","price":150,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.4,"weightMax":1.4},"r10":{"id":"r10","name":"绯尾对虾","kind":"shrimp","tier":"rare","price":160,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.08,"weightMax":0.35},"e01":{"id":"e01","name":"月纱鳗","kind":"fish","tier":"epic","price":400,"spotIds":["lake_deep"],"weightMin":1.5,"weightMax":6},"e02":{"id":"e02","name":"紫晶螯虾","kind":"shrimp","tier":"epic","price":360,"spotIds":["lake_deep"],"weightMin":0.12,"weightMax":0.5},"e03":{"id":"e03","name":"琥珀巨蟹","kind":"crab","tier":"epic","price":420,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":1,"weightMax":3},"e04":{"id":"e04","name":"翡翠龙虾","kind":"shrimp","tier":"epic","price":440,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":0.6,"weightMax":2.5},"e05":{"id":"e05","name":"星斑金枪鱼","kind":"fish","tier":"epic","price":460,"spotIds":["shore_dock","shipwreck_bay"],"weightMin":6,"weightMax":25},"e06":{"id":"e06","name":"幽蓝灯笼鱼","kind":"fish","tier":"epic","price":400,"spotIds":["shipwreck_bay"],"weightMin":0.3,"weightMax":1.8},"l01":{"id":"l01","name":"雾湖金鳞王","kind":"fish","tier":"legendary","price":1000,"spotIds":["lake_deep"],"weightMin":5,"weightMax":15},"l02":{"id":"l02","name":"星河银鳟","kind":"fish","tier":"legendary","price":1100,"spotIds":["lake_deep"],"weightMin":2,"weightMax":8},"l03":{"id":"l03","name":"潮汐皇冠蟹","kind":"crab","tier":"legendary","price":1200,"spotIds":["shipwreck_bay"],"weightMin":2,"weightMax":6},"l04":{"id":"l04","name":"沉船虹鳍鱼","kind":"fish","tier":"legendary","price":1200,"spotIds":["shipwreck_bay"],"weightMin":1.5,"weightMax":6},"t01":{"id":"t01","name":"锈蚀铜币","kind":"treasure","tier":"uncommon","price":40,"spotIds":["valley_shallows","valley_pond","lake_reeds","lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"common"},"t02":{"id":"t02","name":"磨圆彩贝","kind":"treasure","tier":"uncommon","price":60,"spotIds":["valley_pond","lake_reeds","shore_dock"],"weightMin":0,"weightMax":0,"minimumBaitId":"common"},"t03":{"id":"t03","name":"遗失银饰","kind":"treasure","tier":"rare","price":90,"spotIds":["lake_reeds","lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"aroma"},"t04":{"id":"t04","name":"白珍珠","kind":"treasure","tier":"rare","price":140,"spotIds":["lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"aroma"},"t05":{"id":"t05","name":"沉水古币","kind":"treasure","tier":"epic","price":200,"spotIds":["lake_deep","shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"pearl"},"t06":{"id":"t06","name":"船长怀表","kind":"treasure","tier":"epic","price":320,"spotIds":["shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"pearl"},"t07":{"id":"t07","name":"珊瑚宝匣","kind":"treasure","tier":"legendary","price":500,"spotIds":["shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"starlight"},"t08":{"id":"t08","name":"星辉遗物","kind":"treasure","tier":"legendary","price":730,"spotIds":["shipwreck_bay"],"weightMin":0,"weightMax":0,"minimumBaitId":"secret"},"j01":{"id":"j01","name":"旧靴子","kind":"junk","tier":"common","price":2,"spotIds":["valley_shallows","valley_pond","lake_reeds","lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0},"j02":{"id":"j02","name":"断钩","kind":"junk","tier":"common","price":3,"spotIds":["valley_shallows","valley_pond","lake_reeds","lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0},"j03":{"id":"j03","name":"水草团","kind":"junk","tier":"common","price":1,"spotIds":["valley_shallows","valley_pond","lake_reeds","lake_deep","shore_dock","shipwreck_bay"],"weightMin":0,"weightMax":0}},"baits":{"common":{"id":"common","name":"普通蚯蚓饵","price":60,"uses":10,"probabilities":[70,23,5,0.5,0,1,0.5],"description":"一包可抛竿 10 次。价格实惠，适合浅滩与入门垂钓。"},"aroma":{"id":"aroma","name":"香味谷物饵","price":180,"uses":12,"probabilities":[50,31,14,2,0.1,2.4,0.5],"requiredMapId":"GodotMapV2_MistLake","description":"一包可抛竿 12 次。更容易吸引不常见和稀有鱼获。"},"pearl":{"id":"pearl","name":"珍珠诱鱼饵","price":350,"uses":10,"probabilities":[28,35,26,6,0.3,4.2,0.5],"requiredBossMapId":"GodotMapV2_MistLake","description":"一包可抛竿 10 次。适合雾湖深水鱼、稀有虾蟹与沉水宝藏。"},"starlight":{"id":"starlight","name":"星辉混合饵","price":460,"uses":8,"probabilities":[12,29,39,13,0.8,5.7,0.5],"requiredMapId":"GodotMapV2_PirateShore","description":"一包可抛竿 8 次。稀有与珍稀海货机会更高，适合宝藏收藏。"},"secret":{"id":"secret","name":"深潮秘制饵","price":540,"uses":6,"probabilities":[5,17,43,27.5,1.5,5.5,0.5],"requiredBossMapId":"GodotMapV2_PirateShore","description":"一包可抛竿 6 次。专注珍稀与传说鱼获，需要准确收杆。"}},"spots":{"valley_shallows":{"id":"valley_shallows","name":"山谷浅滩","mapId":"GodotMap","maxTier":"uncommon","waterType":"freshwater"},"valley_pond":{"id":"valley_pond","name":"营地南池","mapId":"GodotMap","maxTier":"rare","waterType":"freshwater"},"lake_reeds":{"id":"lake_reeds","name":"西岸苇台","mapId":"GodotMapV2_MistLake","maxTier":"rare","waterType":"freshwater"},"lake_deep":{"id":"lake_deep","name":"雾湖深湾","mapId":"GodotMapV2_MistLake","maxTier":"legendary","requiredBossMapId":"GodotMapV2_MistLake","waterType":"freshwater"},"shore_dock":{"id":"shore_dock","name":"贝壳码头","mapId":"GodotMapV2_PirateShore","maxTier":"epic","waterType":"saltwater"},"shipwreck_bay":{"id":"shipwreck_bay","name":"沉船外湾","mapId":"GodotMapV2_PirateShore","maxTier":"legendary","requiredBossMapId":"GodotMapV2_PirateShore","waterType":"saltwater"}},"merchants":{"valley":{"id":"valley","name":"山谷渔夫·阿川","mapId":"GodotMap","treasureIds":["t01","t02","t03","t04"]},"lake":{"id":"lake","name":"雾湖鱼商·芦伯","mapId":"GodotMapV2_MistLake","treasureIds":["t01","t02","t03","t04","t05"]},"shore":{"id":"shore","name":"海产商·贝露","mapId":"GodotMapV2_PirateShore","treasureIds":["t01","t02","t03","t04","t05","t06","t07","t08"]}},"tiers":{"common":{"label":"普通","width":0.32,"seconds":2.8,"color":"#8dc5a5"},"uncommon":{"label":"不常见","width":0.26,"seconds":2.6,"color":"#62c8ba"},"rare":{"label":"稀有","width":0.2,"seconds":2.4,"color":"#61aeea"},"epic":{"label":"珍稀","width":0.15,"seconds":2.2,"color":"#b294ed"},"legendary":{"label":"传说","width":0.11,"seconds":2,"color":"#e6bc67"}},"rod":{"id":"fishing_rod","name":"旅行钓鱼竿","price":400,"sprite":"/assets/fishing/fishing_rod.svg","permanent":true,"giftBaitId":"common","giftBaitUses":5,"description":"购买一次永久拥有，可使用所有鱼饵，在开放的钓点垂钓。附赠普通鱼饵 5 次。"}}$catalog$::JSONB)
ON CONFLICT(version) DO UPDATE SET data = EXCLUDED.data;

CREATE TABLE IF NOT EXISTS fishing_accounts (
  student_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{"hasRod":false,"baitUses":{},"catches":{},"locked":{},"records":{},"appraised":{},"totals":{"casts":0,"caught":0,"perfect":0,"sold":0,"earned":0}}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), CHECK (jsonb_typeof(state) = 'object')
);
CREATE TABLE IF NOT EXISTS fishing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  spot_id TEXT NOT NULL, bait_id TEXT NOT NULL, catch_id TEXT NOT NULL, weight NUMERIC(12,3) NOT NULL DEFAULT 0,
  tier TEXT NOT NULL, width NUMERIC NOT NULL CHECK (width > 0 AND width <= 1),
  seconds NUMERIC NOT NULL CHECK (seconds > 0), target_center NUMERIC NOT NULL,
  wait_ms INT NOT NULL CHECK (wait_ms BETWEEN 1500 AND 3000), deadline_ms NUMERIC NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','settled','cancelled','expired')),
  result JSONB, CHECK (target_center BETWEEN 0.35 AND 0.65)
);
CREATE UNIQUE INDEX IF NOT EXISTS fishing_one_active_session ON fishing_sessions(student_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS fishing_sessions_recent ON fishing_sessions(student_id, started_at DESC);
CREATE TABLE IF NOT EXISTS fishing_requests (
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, request_id TEXT NOT NULL CHECK (length(request_id) BETWEEN 16 AND 128),
  action TEXT NOT NULL, payload JSONB NOT NULL, response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(student_id, request_id)
);
ALTER TABLE fishing_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE fishing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fishing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fishing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fishing_catalog, fishing_accounts, fishing_sessions, fishing_requests FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fishing_has_boss(p_game JSONB, p_map TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE((p_game #> '{world,defeatedBossIds}') ? CASE p_map
    WHEN 'GodotMapV2' THEN 'region_boss' WHEN 'GodotMapV2_MistLake' THEN 'mistlake_boss'
    WHEN 'GodotMapV2_FarmTown' THEN 'farmtown_boss' WHEN 'GodotMapV2_PirateShore' THEN 'pirateshore_boss' END, FALSE)
    OR COALESCE((p_game #> '{world,defeatedBossIds}') ? (p_map || ':' || CASE p_map
    WHEN 'GodotMapV2' THEN 'region_boss' WHEN 'GodotMapV2_MistLake' THEN 'mistlake_boss'
    WHEN 'GodotMapV2_FarmTown' THEN 'farmtown_boss' WHEN 'GodotMapV2_PirateShore' THEN 'pirateshore_boss' END), FALSE);
$$;
CREATE OR REPLACE FUNCTION fishing_map_unlocked(p_game JSONB, p_map TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_map WHEN 'GodotMap' THEN TRUE
    WHEN 'GodotMapV2_MistLake' THEN fishing_has_boss(p_game, 'GodotMapV2')
    WHEN 'GodotMapV2_PirateShore' THEN fishing_has_boss(p_game, 'GodotMapV2')
      AND fishing_has_boss(p_game, 'GodotMapV2_MistLake') AND fishing_has_boss(p_game, 'GodotMapV2_FarmTown')
    ELSE FALSE END;
$$;
CREATE OR REPLACE FUNCTION fishing_snapshot(p_student UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_state JSONB; v_session JSONB;
BEGIN
  SELECT state INTO v_state FROM fishing_accounts WHERE student_id = p_student;
  SELECT jsonb_build_object('id', id, 'spotId', spot_id, 'baitId', bait_id, 'tier', tier,
    'width', width, 'seconds', seconds, 'targetCenter', target_center, 'waitMs', wait_ms,
    'deadlineMs', deadline_ms, 'elapsedMs', FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000),
    'resume', TRUE)
  INTO v_session FROM fishing_sessions WHERE student_id = p_student AND status = 'active';
  RETURN COALESCE(v_state, '{}'::JSONB) || jsonb_build_object('activeSession', v_session);
END $$;

CREATE OR REPLACE FUNCTION fishing_action(
  p_user_id UUID, p_playtime_session_id TEXT, p_request_id TEXT, p_action TEXT, p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_wallet BIGINT; v_delta BIGINT := 0; v_remaining INT; v_catalog JSONB; v_state JSONB; v_game JSONB;
  v_previous fishing_requests%ROWTYPE; v_session fishing_sessions%ROWTYPE;
  v_spot JSONB; v_bait JSONB; v_item JSONB; v_merchant JSONB; v_difficulty JSONB;
  v_id TEXT; v_map TEXT; v_quantity BIGINT; v_available BIGINT; v_locked BIGINT; v_old_count BIGINT;
  v_uses BIGINT; v_cost BIGINT; v_result JSONB; v_response JSONB; v_reason TEXT;
  v_categories TEXT[] := ARRAY['common','uncommon','rare','epic','legendary','treasure','junk'];
  v_baits TEXT[] := ARRAY['common','aroma','pearl','starlight','secret'];
  v_prob NUMERIC[]; v_groups JSONB; v_group JSONB; v_category TEXT; v_max_rank INT; v_bait_rank INT;
  v_lower INT; v_roll NUMERIC; v_sum NUMERIC := 0; v_index INT; v_entry RECORD;
  v_width NUMERIC; v_seconds NUMERIC; v_center NUMERIC; v_wait INT; v_deadline NUMERIC;
  v_elapsed NUMERIC; v_actual NUMERIC; v_phase NUMERIC; v_position NUMERIC; v_success BOOLEAN; v_perfect BOOLEAN;
  v_weight NUMERIC; v_record JSONB; v_total_sold BIGINT := 0; v_sold JSONB := '[]'::JSONB;
BEGIN
  IF p_user_id IS NULL OR p_action NOT IN ('state','purchase','start','settle','cancel','lock','sell','appraise')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION '无效钓鱼操作'; END IF;
  -- Lock the same wallet row used by cloud saves and the bank before any mutation.
  SELECT gold INTO v_wallet FROM users WHERE id = p_user_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  IF p_playtime_session_id IS NULL OR length(p_playtime_session_id) NOT BETWEEN 16 AND 128 OR NOT EXISTS (
    SELECT 1 FROM student_playtime_sessions WHERE student_id = p_user_id AND session_id = p_playtime_session_id
  ) THEN RAISE EXCEPTION '游玩会话无效，请重新登录'; END IF;
  SELECT data INTO STRICT v_catalog FROM fishing_catalog WHERE version = 1;
  INSERT INTO fishing_accounts(student_id) VALUES(p_user_id) ON CONFLICT(student_id) DO NOTHING;
  SELECT state INTO STRICT v_state FROM fishing_accounts WHERE student_id = p_user_id FOR UPDATE;
  -- Expired/cancelled casts never refund spent bait; refreshing cannot reroll them.
  UPDATE fishing_sessions SET status = 'expired', ended_at = clock_timestamp(),
    result = '{"success":false,"reason":"timed_out"}'::JSONB
  WHERE student_id = p_user_id AND status = 'active'
    AND EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000 > wait_ms + deadline_ms + 1800;
  IF p_action = 'state' THEN
    RETURN jsonb_build_object('success', TRUE, 'state', fishing_snapshot(p_user_id), 'walletGold', v_wallet);
  END IF;
  IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 16 AND 128 THEN RAISE EXCEPTION '操作编号无效'; END IF;
  SELECT * INTO v_previous FROM fishing_requests WHERE student_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.action <> p_action OR v_previous.payload <> p_payload THEN RAISE EXCEPTION '操作编号已被其他操作使用'; END IF;
    RETURN v_previous.response || jsonb_build_object('state', fishing_snapshot(p_user_id), 'walletGold', v_wallet,
      'session', fishing_snapshot(p_user_id)->'activeSession', 'replayed', TRUE);
  END IF;
  SELECT remaining_seconds INTO v_remaining FROM settle_student_playtime_session(p_user_id, p_playtime_session_id, 'check') LIMIT 1;
  IF COALESCE(v_remaining, 0) <= 0 THEN RAISE EXCEPTION '今日游玩时间已用完'; END IF;
  IF NOT student_playtime_lease_is_valid(p_user_id, p_playtime_session_id, FALSE) THEN RAISE EXCEPTION '游玩会话已结束，请重新读取进度'; END IF;
  SELECT game_data INTO v_game FROM game_saves WHERE user_id = p_user_id;
  v_game := COALESCE(v_game, '{}'::JSONB);
  v_map := COALESCE(v_game->>'currentMapName', v_game #>> '{world,currentMapName}', 'GodotMap');
  IF p_action IN ('start','sell','appraise') AND p_payload->>'mapId' IS DISTINCT FROM v_map THEN
    RAISE EXCEPTION '地图位置尚未同步，请返回地图后重试';
  END IF;

  CASE p_action
  WHEN 'purchase' THEN
    IF COALESCE(p_payload->>'quantity','1') !~ '^[0-9]+$' THEN RAISE EXCEPTION '请输入正整数购买数量'; END IF;
    v_quantity := COALESCE(p_payload->>'quantity','1')::BIGINT;
    IF v_quantity NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION '单次可购买 1 至 99 包'; END IF;
    v_id := p_payload->>'itemId';
    IF v_id = 'fishing_rod' THEN
      IF (v_state->>'hasRod')::BOOLEAN THEN RAISE EXCEPTION '已经拥有鱼竿，无需重复购买'; END IF;
      IF v_quantity <> 1 THEN RAISE EXCEPTION '永久鱼竿只需购买一次'; END IF;
      v_cost := 400; v_state := jsonb_set(v_state,'{hasRod}','true'::JSONB);
      v_state := jsonb_set(v_state,'{baitUses,common}',to_jsonb(COALESCE((v_state #>> '{baitUses,common}')::BIGINT,0)+5));
    ELSE
      IF NOT (v_state->>'hasRod')::BOOLEAN THEN RAISE EXCEPTION '请先购买钓鱼竿'; END IF;
      v_bait := v_catalog #> ARRAY['baits',v_id];
      IF v_bait IS NULL THEN RAISE EXCEPTION '鱼饵不存在'; END IF;
      IF v_bait ? 'requiredBossMapId' AND NOT fishing_has_boss(v_game,v_bait->>'requiredBossMapId') THEN
        RAISE EXCEPTION '击败对应区域首领后才能购买这种鱼饵'; END IF;
      IF v_bait ? 'requiredMapId' AND NOT fishing_map_unlocked(v_game,v_bait->>'requiredMapId') THEN
        RAISE EXCEPTION '到达对应区域后才能购买这种鱼饵'; END IF;
      v_cost := (v_bait->>'price')::INT * v_quantity;
      v_uses := COALESCE((v_state #>> ARRAY['baitUses',v_id])::BIGINT,0) + (v_bait->>'uses')::INT * v_quantity;
      IF v_uses > 2147483647 THEN RAISE EXCEPTION '鱼饵库存超出上限'; END IF;
      v_state := jsonb_set(v_state,ARRAY['baitUses',v_id],to_jsonb(v_uses));
    END IF;
    IF v_wallet < v_cost THEN RAISE EXCEPTION '金币不足'; END IF;
    v_delta := -v_cost; v_reason := '购买钓鱼用品';
    v_result := jsonb_build_object('itemId',v_id,'quantity',v_quantity,'totalPrice',v_cost);

  WHEN 'start' THEN
    IF v_remaining < 15 THEN RAISE EXCEPTION '剩余游玩时间不足 15 秒，暂不能抛竿'; END IF;
    IF NOT (v_state->>'hasRod')::BOOLEAN THEN RAISE EXCEPTION '请先购买钓鱼竿'; END IF;
    IF EXISTS(SELECT 1 FROM fishing_sessions WHERE student_id = p_user_id AND status = 'active') THEN
      RAISE EXCEPTION '请先完成或收起当前鱼竿'; END IF;
    v_spot := v_catalog #> ARRAY['spots',p_payload->>'spotId'];
    v_bait := v_catalog #> ARRAY['baits',p_payload->>'baitId'];
    IF v_spot IS NULL OR v_bait IS NULL THEN RAISE EXCEPTION '钓点或鱼饵不存在'; END IF;
    IF v_spot->>'mapId' <> v_map OR NOT fishing_map_unlocked(v_game,v_map) THEN RAISE EXCEPTION '当前钓点尚未开放'; END IF;
    IF v_spot ? 'requiredBossMapId' AND NOT fishing_has_boss(v_game,v_spot->>'requiredBossMapId') THEN
      RAISE EXCEPTION '击败区域首领后才开放这个钓点'; END IF;
    v_id := v_bait->>'id';
    IF v_bait ? 'requiredBossMapId' AND NOT fishing_has_boss(v_game,v_bait->>'requiredBossMapId') THEN RAISE EXCEPTION '这种鱼饵尚未开放'; END IF;
    IF v_bait ? 'requiredMapId' AND NOT fishing_map_unlocked(v_game,v_bait->>'requiredMapId') THEN RAISE EXCEPTION '这种鱼饵尚未开放'; END IF;
    v_uses := COALESCE((v_state #>> ARRAY['baitUses',v_id])::BIGINT,0);
    IF v_uses <= 0 THEN RAISE EXCEPTION '这种鱼饵已用完'; END IF;
    v_bait_rank := array_position(v_baits,v_id);
    v_max_rank := array_position(v_categories,v_spot->>'maxTier');
    v_groups := '{"common":[],"uncommon":[],"rare":[],"epic":[],"legendary":[],"treasure":[],"junk":[]}'::JSONB;
    FOR v_entry IN SELECT key,value FROM jsonb_each(v_catalog->'catches') LOOP
      v_item := v_entry.value;
      IF NOT (v_item->'spotIds' ? (v_spot->>'id')) THEN CONTINUE; END IF;
      v_category := CASE WHEN v_item->>'kind' IN ('treasure','junk') THEN v_item->>'kind' ELSE v_item->>'tier' END;
      IF v_category = 'treasure' AND array_position(v_baits,v_item->>'minimumBaitId') > v_bait_rank THEN CONTINUE; END IF;
      IF v_category NOT IN ('treasure','junk') AND array_position(v_categories,v_category) > v_max_rank THEN CONTINUE; END IF;
      v_groups := jsonb_set(v_groups,ARRAY[v_category],(v_groups->v_category)||to_jsonb(v_entry.key));
    END LOOP;
    SELECT array_agg(value::NUMERIC ORDER BY ordinality) INTO v_prob FROM jsonb_array_elements_text(v_bait->'probabilities') WITH ORDINALITY;
    FOR v_index IN REVERSE 5..1 LOOP
      IF jsonb_array_length(v_groups->v_categories[v_index]) > 0 THEN CONTINUE; END IF;
      v_lower := v_index-1;
      WHILE v_lower >= 1 AND jsonb_array_length(v_groups->v_categories[v_lower]) = 0 LOOP v_lower := v_lower-1; END LOOP;
      IF v_lower >= 1 THEN v_prob[v_lower] := v_prob[v_lower]+v_prob[v_index]; END IF;
      v_prob[v_index] := 0;
    END LOOP;
    v_roll := random()*100;
    FOR v_index IN 1..7 LOOP
      v_sum := v_sum+v_prob[v_index];
      IF v_roll < v_sum THEN v_category := v_categories[v_index]; EXIT; END IF;
    END LOOP;
    v_group := v_groups->v_category;
    IF jsonb_array_length(v_group) = 0 THEN RAISE EXCEPTION '钓点鱼池配置无效'; END IF;
    v_id := v_group->>FLOOR(random()*jsonb_array_length(v_group))::INT;
    v_item := v_catalog #> ARRAY['catches',v_id];
    v_difficulty := v_catalog #> ARRAY['tiers',v_item->>'tier'];
    v_width := (v_difficulty->>'width')::NUMERIC; v_seconds := (v_difficulty->>'seconds')::NUMERIC;
    v_center := .35 + random()*.3; v_wait := 1500+FLOOR(random()*1501)::INT;
    v_deadline := LEAST(10000, v_seconds*1000*(2+v_center+v_width/2));
    v_weight := ROUND(((v_item->>'weightMin')::NUMERIC+random()*((v_item->>'weightMax')::NUMERIC-(v_item->>'weightMin')::NUMERIC))::NUMERIC,3);
    INSERT INTO fishing_sessions(student_id,spot_id,bait_id,catch_id,weight,tier,width,seconds,target_center,wait_ms,deadline_ms)
      VALUES(p_user_id,v_spot->>'id',v_bait->>'id',v_id,v_weight,v_item->>'tier',v_width,v_seconds,v_center,v_wait,v_deadline);
    v_state := jsonb_set(v_state,ARRAY['baitUses',v_bait->>'id'],to_jsonb(v_uses-1));
    v_state := jsonb_set(v_state,'{totals,casts}',to_jsonb((v_state #>> '{totals,casts}')::BIGINT+1));
    v_result := jsonb_build_object('started',TRUE);

  WHEN 'settle', 'cancel' THEN
    IF COALESCE(p_payload->>'sessionId','') !~ '^[a-fA-F0-9-]{36}$' THEN RAISE EXCEPTION '钓鱼会话无效'; END IF;
    SELECT * INTO v_session FROM fishing_sessions WHERE id = (p_payload->>'sessionId')::UUID AND student_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '钓鱼会话不存在'; END IF;
    IF v_session.status <> 'active' THEN
      v_result := COALESCE(v_session.result,jsonb_build_object('success',FALSE,'reason',v_session.status))||jsonb_build_object('alreadySettled',TRUE);
    ELSIF p_action = 'cancel' THEN
      v_result := '{"success":false,"reason":"cancelled"}'::JSONB;
      UPDATE fishing_sessions SET status = 'cancelled',ended_at = clock_timestamp(),result = v_result WHERE id = v_session.id;
    ELSE
      IF COALESCE(p_payload->>'elapsedMs','') !~ '^[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION '收杆时间无效'; END IF;
      v_elapsed := (p_payload->>'elapsedMs')::NUMERIC;
      v_actual := EXTRACT(EPOCH FROM (clock_timestamp()-v_session.started_at))*1000;
      -- Do not widen the target for latency. Only allow a recent reported click,
      -- reject future clicks, and enforce the same three-pass deadline as the UI.
      IF v_elapsed < v_session.wait_ms OR v_actual < v_session.wait_ms-100 OR v_elapsed > v_actual+100 OR v_actual-v_elapsed > 1800 THEN RAISE EXCEPTION '收杆时机已过期，请收起鱼竿重试'; END IF;
      v_elapsed := v_elapsed-v_session.wait_ms;
      v_phase := MOD(v_elapsed/(v_session.seconds*1000),2);
      v_position := CASE WHEN v_phase <= 1 THEN v_phase ELSE 2-v_phase END;
      v_success := v_elapsed <= v_session.deadline_ms AND ABS(v_position-v_session.target_center) <= v_session.width/2+.000000001;
      v_perfect := v_success AND ABS(v_position-v_session.target_center) <= v_session.width/6+.000000001;
      v_result := jsonb_build_object('success',v_success,'perfect',v_perfect,'position',v_position,
        'reason',CASE WHEN v_success THEN 'caught' WHEN v_elapsed > v_session.deadline_ms THEN 'timed_out' ELSE 'missed' END);
      IF v_success THEN
        v_id := v_session.catch_id; v_item := v_catalog #> ARRAY['catches',v_id];
        v_old_count := COALESCE((v_state #>> ARRAY['records',v_id,'count'])::BIGINT,0);
        v_quantity := COALESCE((v_state #>> ARRAY['catches',v_id])::BIGINT,0);
        IF v_quantity >= 2147483647 THEN RAISE EXCEPTION '鱼篓数量超出上限'; END IF;
        v_state := jsonb_set(v_state,ARRAY['catches',v_id],to_jsonb(v_quantity+1));
        v_record := jsonb_build_object('firstCaughtAt',COALESCE(v_state #>> ARRAY['records',v_id,'firstCaughtAt'],clock_timestamp()::TEXT),
          'count',v_old_count+1,'maxWeight',GREATEST(COALESCE((v_state #>> ARRAY['records',v_id,'maxWeight'])::NUMERIC,0),v_session.weight),
          'perfectCount',COALESCE((v_state #>> ARRAY['records',v_id,'perfectCount'])::BIGINT,0)+CASE WHEN v_perfect THEN 1 ELSE 0 END);
        v_state := jsonb_set(v_state,ARRAY['records',v_id],v_record);
        IF v_old_count = 0 AND v_item->>'kind' IN ('fish','shrimp','crab') AND v_item->>'tier' IN ('epic','legendary') THEN
          v_state := jsonb_set(v_state,ARRAY['locked',v_id],'1'::JSONB); END IF;
        v_state := jsonb_set(v_state,'{totals,caught}',to_jsonb((v_state #>> '{totals,caught}')::BIGINT+1));
        v_state := jsonb_set(v_state,'{totals,perfect}',to_jsonb((v_state #>> '{totals,perfect}')::BIGINT+CASE WHEN v_perfect THEN 1 ELSE 0 END));
        v_result := v_result || jsonb_build_object('catchId',v_id,'weight',v_session.weight,'firstCatch',v_old_count=0,'price',(v_item->>'price')::INT);
      END IF;
      UPDATE fishing_sessions SET status = 'settled',ended_at = clock_timestamp(),result = v_result WHERE id = v_session.id;
    END IF;

  WHEN 'lock' THEN
    v_id := p_payload->>'catchId';
    IF v_catalog #> ARRAY['catches',v_id] IS NULL THEN RAISE EXCEPTION '鱼获不存在'; END IF;
    IF COALESCE(p_payload->>'quantity','') !~ '^[0-9]+$' THEN RAISE EXCEPTION '锁定数量无效'; END IF;
    v_quantity := (p_payload->>'quantity')::BIGINT;
    v_available := COALESCE((v_state #>> ARRAY['catches',v_id])::BIGINT,0);
    IF v_quantity > v_available THEN RAISE EXCEPTION '锁定数量不能超过持有数量'; END IF;
    v_state := jsonb_set(v_state,ARRAY['locked',v_id],to_jsonb(v_quantity));
    v_result := jsonb_build_object('catchId',v_id,'quantity',v_quantity);

  WHEN 'sell', 'appraise' THEN
    v_merchant := v_catalog #> ARRAY['merchants',p_payload->>'merchantId'];
    IF v_merchant IS NULL OR v_merchant->>'mapId' <> v_map OR NOT fishing_map_unlocked(v_game,v_map) THEN
      RAISE EXCEPTION '请到对应地图的鱼商处交易'; END IF;
    v_id := p_payload->>'catchId';
    IF p_action = 'appraise' THEN
      v_item := v_catalog #> ARRAY['catches',v_id];
      IF v_item IS NULL OR v_item->>'kind' <> 'treasure' THEN RAISE EXCEPTION '这不是需要鉴定的宝藏'; END IF;
      IF NOT (v_merchant->'treasureIds' ? v_id) THEN RAISE EXCEPTION '这位鱼商无法鉴定这个宝藏'; END IF;
      IF COALESCE((v_state #>> ARRAY['catches',v_id])::BIGINT,0) <= 0 THEN RAISE EXCEPTION '鱼篓中没有这个宝藏'; END IF;
      v_state := jsonb_set(v_state,ARRAY['appraised',v_id],'true'::JSONB);
      v_result := jsonb_build_object('catchId',v_id,'price',(v_item->>'price')::INT,'appraised',TRUE);
    ELSE
      IF p_payload->>'all' IS DISTINCT FROM 'true' THEN
        IF v_catalog #> ARRAY['catches',v_id] IS NULL THEN RAISE EXCEPTION '鱼获不存在'; END IF;
        IF COALESCE(p_payload->>'quantity','') !~ '^[0-9]+$' OR (p_payload->>'quantity')::NUMERIC NOT BETWEEN 1 AND 2147483647 THEN
          RAISE EXCEPTION '出售数量无效'; END IF;
      END IF;
      FOR v_entry IN SELECT key,value FROM jsonb_each(v_state->'catches') LOOP
        IF p_payload->>'all' IS DISTINCT FROM 'true' AND v_entry.key <> v_id THEN CONTINUE; END IF;
        v_item := v_catalog #> ARRAY['catches',v_entry.key];
        v_available := (v_entry.value #>> '{}')::BIGINT;
        v_locked := COALESCE((v_state #>> ARRAY['locked',v_entry.key])::BIGINT,0);
        IF v_item->>'kind' = 'treasure' AND (NOT (v_merchant->'treasureIds' ? v_entry.key)
          OR COALESCE((v_state #>> ARRAY['appraised',v_entry.key])::BOOLEAN,FALSE) = FALSE) THEN
          IF p_payload->>'all' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '请先到可鉴定的鱼商处免费鉴定宝藏'; END IF;
          CONTINUE;
        END IF;
        v_quantity := CASE WHEN p_payload->>'all' = 'true' THEN GREATEST(0,v_available-v_locked) ELSE (p_payload->>'quantity')::BIGINT END;
        IF v_quantity <= 0 THEN CONTINUE; END IF;
        IF v_quantity > v_available-v_locked THEN RAISE EXCEPTION '出售数量超过未锁定鱼获'; END IF;
        v_delta := v_delta+v_quantity*(v_item->>'price')::INT; v_total_sold := v_total_sold+v_quantity;
        v_state := jsonb_set(v_state,ARRAY['catches',v_entry.key],to_jsonb(v_available-v_quantity));
        v_sold := v_sold||jsonb_build_object('catchId',v_entry.key,'quantity',v_quantity,'price',(v_item->>'price')::INT);
      END LOOP;
      IF v_total_sold = 0 THEN RAISE EXCEPTION '没有可以出售的未锁定鱼获'; END IF;
      v_state := jsonb_set(v_state,'{totals,sold}',to_jsonb((v_state #>> '{totals,sold}')::BIGINT+v_total_sold));
      v_state := jsonb_set(v_state,'{totals,earned}',to_jsonb((v_state #>> '{totals,earned}')::BIGINT+v_delta));
      v_reason := '出售钓鱼收获';
      v_result := jsonb_build_object('sold',v_sold,'quantity',v_total_sold,'totalGold',v_delta);
    END IF;
  END CASE;
  IF v_wallet+v_delta NOT BETWEEN 0 AND 2147483647 THEN RAISE EXCEPTION '钱包余额超出上限'; END IF;
  IF v_delta <> 0 THEN
    UPDATE users SET gold = v_wallet+v_delta WHERE id = p_user_id;
    INSERT INTO gold_logs(student_id,amount,reason,balance_after) VALUES(p_user_id,v_delta::INT,v_reason,(v_wallet+v_delta)::INT);
  END IF;
  UPDATE fishing_accounts SET state = v_state,updated_at = clock_timestamp() WHERE student_id = p_user_id;
  v_response := jsonb_build_object('success',TRUE,'result',v_result,'state',fishing_snapshot(p_user_id),
    'walletGold',v_wallet+v_delta,'session',fishing_snapshot(p_user_id)->'activeSession');
  INSERT INTO fishing_requests(student_id,request_id,action,payload,response) VALUES(p_user_id,p_request_id,p_action,p_payload,v_response);
  RETURN v_response;
END $$;
REVOKE ALL ON FUNCTION fishing_has_boss(JSONB,TEXT), fishing_map_unlocked(JSONB,TEXT), fishing_snapshot(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION fishing_action(UUID,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fishing_action(UUID,TEXT,TEXT,TEXT,JSONB) TO anon, authenticated;
COMMIT;
NOTIFY pgrst, 'reload schema';
