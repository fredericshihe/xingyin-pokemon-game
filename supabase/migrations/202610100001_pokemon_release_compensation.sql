-- Fixed species rarity, server-authoritative release payouts and idempotent receipts.
-- Catalog v1: src/utils/pokemonReleaseCatalog.json; existing saves remain intact.
BEGIN;
CREATE TABLE IF NOT EXISTS public.pokemon_release_species (
  base_id INT PRIMARY KEY, dex_no INT NOT NULL UNIQUE, pokemon_name TEXT NOT NULL,
  rarity TEXT NOT NULL CHECK (rarity IN ('common','uncommon','rare','precious')),
  rarity_label TEXT NOT NULL, multiplier NUMERIC NOT NULL CHECK (multiplier IN (1,1.5,2.5,4))
);
ALTER TABLE public.pokemon_release_species ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pokemon_release_species FROM PUBLIC, anon, authenticated;
INSERT INTO public.pokemon_release_species(base_id,dex_no,pokemon_name,rarity,rarity_label,multiplier) VALUES
(1,1,'妙蛙种子','uncommon','少见',1.5),
(2,4,'小火龙','uncommon','少见',1.5),
(3,7,'杰尼龟','uncommon','少见',1.5),
(4,25,'皮卡丘','uncommon','少见',1.5),
(5,79,'呆呆兽','common','常见',1),
(6,94,'耿鬼','rare','稀有',2.5),
(7,59,'风速狗','rare','稀有',2.5),
(8,130,'暴鲤龙','rare','稀有',2.5),
(9,131,'拉普拉斯','rare','稀有',2.5),
(10,143,'卡比兽','rare','稀有',2.5),
(11,65,'胡地','rare','稀有',2.5),
(12,149,'快龙','rare','稀有',2.5),
(13,133,'伊布','uncommon','少见',1.5),
(14,54,'可达鸭','common','常见',1),
(15,39,'胖丁','uncommon','少见',1.5),
(16,129,'鲤鱼王','common','常见',1),
(17,34,'尼多王','uncommon','少见',1.5),
(18,67,'豪力','uncommon','少见',1.5),
(19,85,'嘟嘟利','uncommon','少见',1.5),
(20,92,'鬼斯','uncommon','少见',1.5),
(21,93,'鬼斯通','uncommon','少见',1.5),
(22,95,'大岩蛇','uncommon','少见',1.5),
(23,123,'飞天螳螂','rare','稀有',2.5),
(24,142,'化石翼龙','rare','稀有',2.5),
(25,146,'火焰鸟','precious','珍稀',4),
(26,144,'急冻鸟','precious','珍稀',4),
(27,145,'闪电鸟','precious','珍稀',4),
(28,26,'雷丘','uncommon','少见',1.5),
(29,38,'九尾','uncommon','少见',1.5),
(30,45,'霸王花','uncommon','少见',1.5),
(31,53,'猫老大','uncommon','少见',1.5),
(32,57,'火暴猴','uncommon','少见',1.5),
(33,62,'蚊香泳士','rare','稀有',2.5),
(34,68,'怪力','rare','稀有',2.5),
(35,76,'隆隆岩','rare','稀有',2.5),
(36,78,'烈焰马','uncommon','少见',1.5),
(37,80,'呆壳兽','uncommon','少见',1.5),
(38,82,'三合一磁怪','rare','稀有',2.5),
(39,83,'大葱鸭','uncommon','少见',1.5),
(40,87,'白海狮','uncommon','少见',1.5),
(41,89,'臭臭泥','uncommon','少见',1.5),
(42,91,'刺甲贝','rare','稀有',2.5),
(43,97,'引梦貘人','uncommon','少见',1.5),
(44,99,'巨钳蟹','uncommon','少见',1.5),
(45,101,'顽皮雷弹','uncommon','少见',1.5),
(46,103,'椰蛋树','rare','稀有',2.5),
(47,105,'嘎啦嘎啦','uncommon','少见',1.5),
(48,106,'飞腿郎','rare','稀有',2.5),
(49,107,'快拳郎','rare','稀有',2.5),
(50,110,'双弹瓦斯','rare','稀有',2.5),
(51,112,'钻角犀兽','rare','稀有',2.5),
(52,113,'吉利蛋','rare','稀有',2.5),
(53,115,'袋兽','rare','稀有',2.5),
(54,117,'海刺龙','uncommon','少见',1.5),
(55,121,'宝石海星','rare','稀有',2.5),
(56,122,'魔墙人偶','rare','稀有',2.5),
(57,124,'迷唇姐','rare','稀有',2.5),
(58,125,'电击兽','rare','稀有',2.5),
(59,126,'鸭嘴火兽','rare','稀有',2.5),
(60,127,'凯罗斯','rare','稀有',2.5),
(61,128,'肯泰罗','rare','稀有',2.5),
(62,134,'水伊布','rare','稀有',2.5),
(63,135,'雷伊布','rare','稀有',2.5),
(64,136,'火伊布','rare','稀有',2.5),
(65,137,'多边兽','rare','稀有',2.5),
(66,139,'多刺菊石兽','rare','稀有',2.5),
(67,141,'镰刀盔','rare','稀有',2.5),
(68,150,'超梦','precious','珍稀',4),
(69,151,'梦幻','precious','珍稀',4),
(70,55,'哥达鸭','uncommon','少见',1.5),
(71,2,'妙蛙草','uncommon','少见',1.5),
(72,3,'妙蛙花','rare','稀有',2.5),
(73,5,'火恐龙','uncommon','少见',1.5),
(74,6,'喷火龙','rare','稀有',2.5),
(75,8,'卡咪龟','uncommon','少见',1.5),
(76,9,'水箭龟','rare','稀有',2.5),
(77,116,'墨海马','common','常见',1),
(78,90,'大舌贝','common','常见',1),
(79,98,'大钳蟹','common','常见',1),
(80,120,'海星星','uncommon','少见',1.5),
(81,138,'菊石兽','rare','稀有',2.5),
(82,140,'化石盔','rare','稀有',2.5),
(83,58,'卡蒂狗','uncommon','少见',1.5),
(84,37,'六尾','uncommon','少见',1.5),
(85,77,'小火马','uncommon','少见',1.5),
(86,230,'刺龙王','rare','稀有',2.5),
(87,44,'臭臭花','uncommon','少见',1.5),
(88,102,'蛋蛋','common','常见',1),
(89,10,'绿毛虫','common','常见',1),
(90,81,'小磁怪','common','常见',1),
(91,100,'霹雳电球','common','常见',1),
(92,239,'电击怪','uncommon','少见',1.5),
(93,238,'迷唇娃','rare','稀有',2.5),
(94,467,'鸭嘴炎兽','rare','稀有',2.5),
(95,240,'鸭嘴宝宝','uncommon','少见',1.5),
(96,66,'腕力','uncommon','少见',1.5),
(97,56,'猴怪','common','常见',1),
(98,32,'尼多朗','common','常见',1),
(99,33,'尼多力诺','uncommon','少见',1.5),
(100,88,'臭泥','common','常见',1),
(101,109,'瓦斯弹','common','常见',1),
(102,74,'小拳石','common','常见',1),
(103,75,'隆隆石','uncommon','少见',1.5),
(104,464,'超甲狂犀','rare','稀有',2.5),
(105,111,'独角犀牛','common','常见',1),
(106,84,'嘟嘟','common','常见',1),
(107,96,'催眠貘','common','常见',1),
(108,233,'多边兽２型','rare','稀有',2.5),
(109,474,'多边兽乙型','rare','稀有',2.5),
(110,63,'凯西','uncommon','少见',1.5),
(111,64,'勇基拉','uncommon','少见',1.5),
(112,439,'魔尼尼','rare','稀有',2.5),
(113,446,'小卡比兽','rare','稀有',2.5),
(114,174,'宝宝丁','common','常见',1),
(115,40,'胖可丁','uncommon','少见',1.5),
(116,440,'小福蛋','uncommon','少见',1.5),
(117,242,'幸福蛋','rare','稀有',2.5),
(118,11,'铁甲蛹','common','常见',1),
(119,52,'喵喵','common','常见',1),
(120,438,'盆才怪','uncommon','少见',1.5),
(121,236,'无畏小子','rare','稀有',2.5),
(122,466,'电击魔兽','rare','稀有',2.5),
(123,12,'巴大蝶','uncommon','少见',1.5),
(124,108,'大舌头','uncommon','少见',1.5),
(125,900,'劈斧螳螂','rare','稀有',2.5),
(126,979,'弃世猴','rare','稀有',2.5),
(127,463,'大舌舔','rare','稀有',2.5),
(128,147,'迷你龙','rare','稀有',2.5),
(129,148,'哈克龙','rare','稀有',2.5),
(130,246,'幼基拉斯','rare','稀有',2.5),
(131,247,'沙基拉斯','rare','稀有',2.5),
(132,196,'太阳伊布','rare','稀有',2.5),
(133,470,'叶伊布','rare','稀有',2.5),
(134,471,'冰伊布','rare','稀有',2.5),
(135,185,'树才怪','rare','稀有',2.5),
(136,182,'美丽花','rare','稀有',2.5),
(137,197,'月亮伊布','rare','稀有',2.5),
(138,199,'呆呆王','rare','稀有',2.5),
(139,208,'大钢蛇','rare','稀有',2.5),
(140,212,'巨钳螳螂','rare','稀有',2.5),
(141,237,'战舞郎','rare','稀有',2.5),
(142,248,'班基拉斯','rare','稀有',2.5),
(143,462,'自爆磁怪','rare','稀有',2.5),
(144,700,'仙子伊布','rare','稀有',2.5),
(145,863,'喵头目','rare','稀有',2.5),
(146,865,'葱游兵','rare','稀有',2.5),
(147,866,'踏冰人偶','rare','稀有',2.5),
(148,13,'独角虫','common','常见',1),
(149,14,'铁壳蛹','common','常见',1),
(150,15,'大针蜂','uncommon','少见',1.5),
(151,16,'波波','common','常见',1),
(152,17,'比比鸟','uncommon','少见',1.5),
(153,18,'大比鸟','uncommon','少见',1.5),
(154,19,'小拉达','common','常见',1),
(155,20,'拉达','uncommon','少见',1.5),
(156,21,'烈雀','common','常见',1),
(157,22,'大嘴雀','uncommon','少见',1.5),
(158,23,'阿柏蛇','common','常见',1),
(159,24,'阿柏怪','uncommon','少见',1.5),
(160,27,'穿山鼠','common','常见',1),
(161,28,'穿山王','uncommon','少见',1.5),
(162,29,'尼多兰','common','常见',1),
(163,30,'尼多娜','uncommon','少见',1.5),
(164,31,'尼多后','uncommon','少见',1.5),
(165,35,'皮皮','uncommon','少见',1.5),
(166,36,'皮可西','uncommon','少见',1.5),
(167,41,'超音蝠','common','常见',1),
(168,42,'大嘴蝠','uncommon','少见',1.5),
(169,43,'走路草','common','常见',1),
(170,46,'派拉斯','common','常见',1),
(171,47,'派拉斯特','uncommon','少见',1.5),
(172,48,'毛球','common','常见',1),
(173,49,'摩鲁蛾','uncommon','少见',1.5),
(174,50,'地鼠','common','常见',1),
(175,51,'三地鼠','uncommon','少见',1.5),
(176,60,'蚊香蝌蚪','common','常见',1),
(177,61,'蚊香君','uncommon','少见',1.5),
(178,69,'喇叭芽','common','常见',1),
(179,70,'口呆花','uncommon','少见',1.5),
(180,71,'大食花','rare','稀有',2.5),
(181,72,'玛瑙水母','common','常见',1),
(182,73,'毒刺水母','uncommon','少见',1.5),
(183,86,'小海狮','common','常见',1),
(184,104,'卡拉卡拉','common','常见',1),
(185,114,'蔓藤怪','uncommon','少见',1.5),
(186,118,'角金鱼','common','常见',1),
(187,119,'金鱼王','uncommon','少见',1.5),
(188,132,'百变怪','rare','稀有',2.5),
(189,282,'沙奈朵','rare','稀有',2.5),
(190,407,'罗丝雷朵','rare','稀有',2.5),
(191,468,'波克基斯','rare','稀有',2.5),
(192,350,'美纳斯','rare','稀有',2.5),
(193,245,'水君','precious','珍稀',4),
(194,272,'乐天河童','rare','稀有',2.5),
(195,257,'火焰鸡','rare','稀有',2.5),
(196,286,'斗笠菇','rare','稀有',2.5),
(197,241,'大奶罐','rare','稀有',2.5),
(198,160,'大力鳄','rare','稀有',2.5),
(199,260,'巨沼怪','rare','稀有',2.5),
(200,319,'巨牙鲨','rare','稀有',2.5),
(201,169,'叉字蝠','uncommon','少见',1.5),
(202,477,'黑夜魔灵','rare','稀有',2.5),
(203,609,'水晶灯火灵','rare','稀有',2.5),
(204,376,'巨金怪','rare','稀有',2.5),
(205,448,'路卡利欧','rare','稀有',2.5),
(206,681,'坚盾剑怪','rare','稀有',2.5),
(207,373,'暴飞龙','rare','稀有',2.5),
(208,445,'烈咬陆鲨','uncommon','少见',1.5),
(209,635,'三首恶龙','rare','稀有',2.5)
ON CONFLICT (base_id) DO UPDATE SET dex_no=EXCLUDED.dex_no,pokemon_name=EXCLUDED.pokemon_name,rarity=EXCLUDED.rarity,rarity_label=EXCLUDED.rarity_label,multiplier=EXCLUDED.multiplier;

CREATE TABLE IF NOT EXISTS public.pokemon_release_receipts (
  student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  monster_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('party','storage','pending')),
  gold INT NOT NULL CHECK (gold > 0),
  rarity TEXT NOT NULL,
  pokemon_name TEXT NOT NULL,
  pokemon_level INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, request_id)
);
ALTER TABLE public.pokemon_release_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pokemon_release_receipts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.game_pokemon_release_quote(p_monster JSONB)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_species public.pokemon_release_species%ROWTYPE;
  v_base TEXT := COALESCE(NULLIF(p_monster ->> 'baseId',''), NULLIF(p_monster ->> 'speciesId',''),
    NULLIF(p_monster ->> 'templateId',''), NULLIF(p_monster ->> 'monsterId',''));
  v_dex TEXT := COALESCE(NULLIF(p_monster ->> 'dexNo',''), NULLIF(p_monster ->> 'pokedexId',''));
  v_level INT;
  v_gold INT;
BEGIN
  IF jsonb_typeof(p_monster) IS DISTINCT FROM 'object' OR p_monster ->> 'level' !~ '^[0-9]{1,3}$'
    OR p_monster ->> 'level' IS NULL THEN RAISE EXCEPTION '无法确认放生补偿，请重新读取进度。'; END IF;
  v_level := (p_monster ->> 'level')::INT;
  IF v_level < 1 OR v_level > 100 THEN RAISE EXCEPTION '宝可梦等级无效。'; END IF;
  IF v_base IS NOT NULL THEN
    IF v_base !~ '^[0-9]{1,6}$' THEN RAISE EXCEPTION '宝可梦物种无效。'; END IF;
    SELECT * INTO v_species FROM pokemon_release_species WHERE base_id = v_base::INT;
  ELSIF v_dex ~ '^[0-9]{1,6}$' THEN
    SELECT * INTO v_species FROM pokemon_release_species WHERE dex_no = v_dex::INT;
  END IF;
  IF v_species.base_id IS NULL THEN RAISE EXCEPTION '宝可梦物种无效。'; END IF;
  IF v_dex IS NOT NULL AND (v_dex !~ '^[0-9]{1,6}$' OR v_dex::INT <> v_species.dex_no) THEN
    RAISE EXCEPTION '宝可梦物种信息不一致。';
  END IF;
  v_gold := (ROUND(((50 + v_level * 5) * v_species.multiplier) / 10) * 10)::INT;
  RETURN jsonb_build_object('version',1,'baseId',v_species.base_id,'dexNo',v_species.dex_no,
    'name',v_species.pokemon_name,'level',v_level,'rarity',v_species.rarity,
    'rarityLabel',v_species.rarity_label,'gold',v_gold);
END;
$$;

CREATE OR REPLACE FUNCTION public.game_prepare_pokemon_release(
  p_previous JSONB, p_monster_id TEXT, p_from TEXT, p_expected_gold INT
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_next JSONB := p_previous;
  v_monster JSONB;
  v_roster JSONB;
  v_remaining JSONB;
  v_quote JSONB;
  v_key TEXT;
  v_id_count INT;
BEGIN
  IF game_save_has_active_battle(p_previous) OR p_previous ->> 'view' = 'battle'
    OR p_previous #>> '{battleCheckpoint,status}' = 'active' THEN RAISE EXCEPTION '战斗中不能放生。'; END IF;
  IF p_monster_id IS NULL OR p_monster_id = '' OR p_from IS NULL OR p_from NOT IN ('party','storage','pending') THEN
    RAISE EXCEPTION '放生来源或宝可梦无效。';
  END IF;
  IF p_from = 'pending' THEN
    v_monster := p_previous #> '{pendingMonsterAcquisition,monster}';
    IF v_monster ->> 'id' IS DISTINCT FROM p_monster_id THEN RAISE EXCEPTION '宝可梦已变化，请重新选择。'; END IF;
    v_next := jsonb_set(v_next, '{pendingMonsterAcquisition}', 'null'::JSONB);
  ELSE
    v_key := CASE WHEN p_from = 'party' THEN 'playerTeam' ELSE 'storageBox' END;
    v_roster := CASE WHEN jsonb_typeof(p_previous -> v_key) = 'array' THEN p_previous -> v_key ELSE '[]'::JSONB END;
    IF p_from = 'party' AND jsonb_array_length(v_roster) <= 1 THEN RAISE EXCEPTION '队伍至少保留一只。'; END IF;
    SELECT mon INTO v_monster FROM jsonb_array_elements(v_roster) AS r(mon) WHERE mon ->> 'id' = p_monster_id LIMIT 1;
    IF v_monster IS NULL THEN RAISE EXCEPTION '宝可梦已变化，请重新选择。'; END IF;
    SELECT COALESCE(jsonb_agg(mon ORDER BY ordinal), '[]'::JSONB) INTO v_remaining
      FROM jsonb_array_elements(v_roster) WITH ORDINALITY AS r(mon, ordinal) WHERE mon ->> 'id' IS DISTINCT FROM p_monster_id;
    v_next := jsonb_set(v_next, ARRAY[v_key], v_remaining);
    IF p_from = 'party' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_remaining) AS r(mon)
      WHERE mon ->> 'id' = p_previous ->> 'activePlayerId') THEN
      v_next := jsonb_set(v_next, '{activePlayerId}', v_remaining -> 0 -> 'id');
    END IF;
  END IF;
  -- Reject corrupt duplicate instance identities instead of deleting several partners for one payout.
  SELECT COUNT(*) INTO v_id_count FROM jsonb_array_elements(
    (CASE WHEN jsonb_typeof(p_previous -> 'playerTeam') = 'array' THEN p_previous -> 'playerTeam' ELSE '[]'::JSONB END) ||
    (CASE WHEN jsonb_typeof(p_previous -> 'storageBox') = 'array' THEN p_previous -> 'storageBox' ELSE '[]'::JSONB END) ||
    (CASE WHEN jsonb_typeof(p_previous #> '{pendingMonsterAcquisition,monster}') = 'object'
      THEN jsonb_build_array(p_previous #> '{pendingMonsterAcquisition,monster}') ELSE '[]'::JSONB END)
  ) AS r(mon) WHERE mon ->> 'id' = p_monster_id;
  IF v_id_count <> 1 THEN RAISE EXCEPTION '宝可梦记录重复，请重新读取进度。'; END IF;
  v_quote := game_pokemon_release_quote(v_monster);
  IF p_expected_gold IS DISTINCT FROM (v_quote ->> 'gold')::INT THEN RAISE EXCEPTION '补偿金额已变化，请重新确认。'; END IF;
  RETURN jsonb_build_object('snapshot',v_next,'quote',v_quote);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_pokemon_with_compensation(
  p_user_id UUID, p_game_data JSONB, p_monster_id TEXT, p_from TEXT, p_expected_gold INT, p_request_id UUID
)
RETURNS TABLE (
  game_data JSONB, last_saved TIMESTAMPTZ, save_revision BIGINT, accepted BOOLEAN, error_message TEXT,
  gold_after INT, energy_after INT, max_energy_after INT, released_gold INT, release_rarity TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user RECORD;
  v_existing RECORD;
  v_receipt RECORD;
  v_saved RECORD;
  v_status RECORD;
  v_prepared JSONB;
  v_next JSONB;
  v_quote JSONB;
  v_session TEXT := p_game_data #>> '{_sync,playtimeSessionId}';
  v_reason TEXT;
BEGIN
  IF p_request_id IS NULL THEN RAISE EXCEPTION '放生请求无效。'; END IF;
  -- Match the existing resource RPC's lock order: user first, save second.
  SELECT u.* INTO v_user FROM users u WHERE u.id = p_user_id AND u.role = 'student'
    AND COALESCE(u.registration_status,'approved') = 'approved' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在。'; END IF;
  SELECT * INTO v_status FROM settle_student_playtime_session(p_user_id, v_session, 'check') LIMIT 1;
  IF COALESCE(v_status.remaining_seconds,0) <= 0 THEN RAISE EXCEPTION '今日游玩时间已用完。'; END IF;
  IF v_session IS NULL OR length(v_session) < 16 OR NOT student_playtime_lease_is_valid(p_user_id,v_session,FALSE) THEN
    RAISE EXCEPTION '无法确认当前游玩会话，请重新校验时长。'; END IF;
  SELECT gs.* INTO v_existing FROM game_saves gs WHERE gs.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '请先读取云端进度。'; END IF;
  SELECT r.* INTO v_receipt FROM pokemon_release_receipts r WHERE r.student_id = p_user_id AND r.request_id = p_request_id;
  IF FOUND THEN
    IF v_receipt.monster_id IS DISTINCT FROM p_monster_id OR v_receipt.source IS DISTINCT FROM p_from
      OR v_receipt.gold IS DISTINCT FROM p_expected_gold THEN RAISE EXCEPTION '放生请求不一致。'; END IF;
    RETURN QUERY SELECT v_existing.game_data, v_existing.last_saved, v_existing.save_revision, TRUE, NULL::TEXT,
      v_user.gold, v_user.energy, v_user.max_energy, v_receipt.gold, v_receipt.rarity;
    RETURN;
  END IF;
  IF p_game_data #>> '{_sync,revision}' IS NULL OR p_game_data #>> '{_sync,revision}' !~ '^[0-9]{1,18}$'
    OR (p_game_data #>> '{_sync,revision}')::BIGINT <> COALESCE(v_existing.save_revision,0) + 1 THEN
    RAISE EXCEPTION '后端拒绝了旧版本存档。'; END IF;
  IF game_save_has_active_battle(p_game_data) OR p_game_data ->> 'view' = 'battle' THEN RAISE EXCEPTION '战斗中不能放生。'; END IF;
  v_prepared := game_prepare_pokemon_release(v_existing.game_data,p_monster_id,p_from,p_expected_gold);
  v_next := v_prepared -> 'snapshot';
  v_quote := v_prepared -> 'quote';
  v_reason := '放生补偿：' || (v_quote ->> 'name') || ' Lv.' || (v_quote ->> 'level') || '（' || (v_quote ->> 'rarityLabel') || '）';
  -- The server constructs the removal from its saved roster. Incoming levels,
  -- rarity, balance, inventory, map unlocks and other partners are never trusted.
  v_next := jsonb_set(v_next,'{_sync}',p_game_data -> '_sync');
  IF p_game_data ->> 'view' IN ('map','team','dex','bag') THEN
    v_next := jsonb_set(v_next,'{view}',p_game_data -> 'view');
  END IF;
  v_next := jsonb_set(v_next,'{playerGold}',to_jsonb(v_user.gold + (v_quote ->> 'gold')::INT));
  v_next := jsonb_set(v_next,'{logs}',(CASE WHEN jsonb_typeof(v_next -> 'logs') = 'array' THEN v_next -> 'logs' ELSE '[]'::JSONB END)
    || jsonb_build_array(v_reason || '，获得 ' || (v_quote ->> 'gold') || ' 金币。'));
  SELECT * INTO v_saved FROM save_cloud_game_state_with_resources(p_user_id,v_next,(v_quote ->> 'gold')::INT,v_reason,0,'放生不消耗能量');
  IF v_saved.accepted IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT v_saved.game_data,v_saved.last_saved,v_saved.save_revision,FALSE,v_saved.error_message,
      v_saved.gold_after,v_saved.energy_after,v_saved.max_energy_after,0,NULL::TEXT;
    RETURN;
  END IF;
  INSERT INTO pokemon_release_receipts(student_id,request_id,monster_id,source,gold,rarity,pokemon_name,pokemon_level)
    VALUES(p_user_id,p_request_id,p_monster_id,p_from,(v_quote ->> 'gold')::INT,v_quote ->> 'rarity',v_quote ->> 'name',(v_quote ->> 'level')::INT);
  PERFORM append_student_gameplay_log(p_user_id,'pokemon_released','progress','放生补偿',
    v_reason || '，获得 ' || (v_quote ->> 'gold') || ' 金币。',v_next ->> 'currentMapName',NULL,
    COALESCE(v_next -> 'playerPos','{}'::JSONB),
    v_quote || jsonb_build_object('monsterId',p_monster_id,'source',p_from,'pokemonName',v_quote ->> 'name',
      'pokemonLevel',(v_quote ->> 'level')::INT,'gold',(v_quote ->> 'gold')::INT,'rewardSource','pokemon_release'));
  RETURN QUERY SELECT v_saved.game_data,v_saved.last_saved,v_saved.save_revision,TRUE,NULL::TEXT,
    v_saved.gold_after,v_saved.energy_after,v_saved.max_energy_after,(v_quote ->> 'gold')::INT,v_quote ->> 'rarity';
END;
$$;
REVOKE ALL ON FUNCTION public.game_pokemon_release_quote(JSONB),
  public.game_prepare_pokemon_release(JSONB,TEXT,TEXT,INT),
  public.release_pokemon_with_compensation(UUID,JSONB,TEXT,TEXT,INT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_pokemon_with_compensation(UUID,JSONB,TEXT,TEXT,INT,UUID) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
