-- Atomic perfect-combo rewards, per-piece treasure appraisal and teacher fishing records.
BEGIN;
LOCK TABLE fishing_accounts, fishing_sessions, fishing_requests IN ACCESS EXCLUSIVE MODE;
UPDATE fishing_catalog SET data=jsonb_set(jsonb_set(jsonb_set(data,
  '{tiers,rare}', '{"label":"稀有","width":0.09,"seconds":1.08,"color":"#61aeea"}'::JSONB),
  '{tiers,epic}', '{"label":"珍稀","width":0.0675,"seconds":0.99,"color":"#b294ed"}'::JSONB),
  '{tiers,legendary}', '{"label":"传说","width":0.0495,"seconds":0.9,"color":"#e6bc67"}'::JSONB) WHERE version=1;
CREATE TABLE fishing_treasures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catch_id TEXT NOT NULL CHECK(catch_id IN ('t01','t02','t03','t04','t05','t06','t07','t08')),
  catch_session_id UUID UNIQUE REFERENCES fishing_sessions(id),
  appraisal_grade TEXT CHECK(appraisal_grade IN ('ordinary','great','precious','exquisite','legendary')),
  appraisal_price INT CHECK(appraisal_price BETWEEN 1 AND 21900),
  caught_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(), appraised_at TIMESTAMPTZ, sold_at TIMESTAMPTZ,
  CHECK((appraisal_price IS NULL AND appraisal_grade IS NULL AND appraised_at IS NULL) OR
        (appraisal_price IS NOT NULL AND appraisal_grade IS NOT NULL AND appraised_at IS NOT NULL))
);
CREATE INDEX fishing_treasures_owned ON fishing_treasures(student_id,caught_at,id) WHERE sold_at IS NULL;
ALTER TABLE fishing_treasures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fishing_treasures FROM PUBLIC,anon,authenticated;
-- Legacy species-wide flags cannot identify individual appraisals. Existing unsold pieces start unappraised.
INSERT INTO fishing_treasures(student_id,catch_id)
  SELECT a.student_id,c.key FROM fishing_accounts a CROSS JOIN LATERAL jsonb_each(a.state->'catches') c
  CROSS JOIN LATERAL generate_series(1,(c.value #>> '{}')::BIGINT)
  WHERE c.key IN ('t01','t02','t03','t04','t05','t06','t07','t08');
UPDATE fishing_accounts SET state=jsonb_set(jsonb_set(state-'appraised','{perfectStreak}','0'),'{totals,comboEarned}','0');
ALTER TABLE fishing_accounts ALTER COLUMN state SET DEFAULT '{"hasRod":false,"baitUses":{},"catches":{},"records":{},"perfectStreak":0,"totals":{"casts":0,"caught":0,"perfect":0,"sold":0,"earned":0,"comboEarned":0}}'::JSONB;

-- Both rolls are supplied only by the private RPC; explicit arguments make range/probability tests deterministic.
CREATE FUNCTION fishing_roll_appraisal(p_base INT,p_grade_roll NUMERIC,p_price_roll NUMERIC)
RETURNS TABLE(grade TEXT,price INT) LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE low NUMERIC; high NUMERIC;
BEGIN
  IF p_base IS NULL OR p_grade_roll IS NULL OR p_price_roll IS NULL OR p_base NOT IN (40,60,90,140,200,320,500,730) OR p_grade_roll<0 OR p_grade_roll>=1 OR p_price_roll<0 OR p_price_roll>=1 THEN RAISE EXCEPTION '无效鉴定参数'; END IF;
  IF p_grade_roll<.50 THEN grade:='ordinary'; low:=.5;high:=1;
  ELSIF p_grade_roll<.80 THEN grade:='great'; low:=1.25;high:=2;
  ELSIF p_grade_roll<.95 THEN grade:='precious'; low:=2.5;high:=4;
  ELSIF p_grade_roll<.99 THEN grade:='exquisite'; low:=6;high:=10;
  ELSE grade:='legendary';low:=15;high:=30; END IF;
  price:=FLOOR(p_base*low)::INT+FLOOR(p_price_roll*(FLOOR(p_base*high)-FLOOR(p_base*low)+1))::INT;
  RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION fishing_roll_appraisal(INT,NUMERIC,NUMERIC) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION fishing_snapshot(p_student UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_state JSONB;v_session JSONB;v_treasures JSONB;
BEGIN
  SELECT state INTO v_state FROM fishing_accounts WHERE student_id=p_student;
  SELECT jsonb_build_object('id',id,'spotId',spot_id,'baitId',bait_id,'tier',tier,'width',width,'seconds',seconds,
    'targetCenter',target_center,'waitMs',wait_ms,'deadlineMs',deadline_ms,
    'elapsedMs',FLOOR(EXTRACT(EPOCH FROM(clock_timestamp()-started_at))*1000),'resume',TRUE)
    INTO v_session FROM fishing_sessions WHERE student_id=p_student AND status='active';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'catchId',t.catch_id,'caughtAt',t.caught_at)||
    CASE WHEN t.appraisal_price IS NULL THEN '{}'::JSONB ELSE jsonb_build_object('price',t.appraisal_price,'appraisalGrade',t.appraisal_grade,'appraisedAt',t.appraised_at) END
    ORDER BY t.caught_at,t.id),'[]'::JSONB) INTO v_treasures FROM fishing_treasures t WHERE t.student_id=p_student AND t.sold_at IS NULL;
  RETURN(COALESCE(v_state,'{}'::JSONB)-'locked'-'appraised')||jsonb_build_object('treasures',v_treasures,'activeSession',v_session,'fishingVersion',2);
END $$;
CREATE OR REPLACE FUNCTION fishing_action(
  p_user_id UUID, p_playtime_session_id TEXT, p_request_id TEXT, p_action TEXT, p_payload JSONB DEFAULT '{}'::JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_wallet BIGINT; v_delta BIGINT := 0; v_remaining INT; v_catalog JSONB; v_state JSONB; v_game JSONB;
  v_previous fishing_requests%ROWTYPE; v_session fishing_sessions%ROWTYPE;
  v_spot JSONB; v_bait JSONB; v_item JSONB; v_merchant JSONB; v_difficulty JSONB;
  v_id TEXT; v_map TEXT; v_quantity BIGINT; v_available BIGINT; v_old_count BIGINT;
  v_uses BIGINT; v_cost BIGINT; v_result JSONB; v_response JSONB; v_reason TEXT;
  v_categories TEXT[] := ARRAY['common','uncommon','rare','epic','legendary','treasure','junk'];
  v_baits TEXT[] := ARRAY['common','aroma','pearl','starlight','secret'];
  v_prob NUMERIC[]; v_groups JSONB; v_group JSONB; v_category TEXT; v_max_rank INT; v_bait_rank INT;
  v_lower INT; v_roll NUMERIC; v_sum NUMERIC := 0; v_index INT; v_entry RECORD;
  v_width NUMERIC; v_seconds NUMERIC; v_center NUMERIC; v_wait INT; v_deadline NUMERIC;
  v_elapsed NUMERIC; v_actual NUMERIC; v_phase NUMERIC; v_position NUMERIC; v_success BOOLEAN; v_perfect BOOLEAN;
  v_weight NUMERIC; v_record JSONB; v_total_sold BIGINT := 0; v_sold JSONB := '[]'::JSONB;
  v_expired_session fishing_sessions%ROWTYPE; v_treasure fishing_treasures%ROWTYPE; v_treasure_id UUID; v_grade TEXT; v_price INT;
  v_streak BIGINT; v_bonus INT := 0; v_expired INT; v_log BOOLEAN := TRUE;
  v_title TEXT; v_summary TEXT; v_details JSONB; v_map_label TEXT; v_teacher UUID;
BEGIN
  IF p_user_id IS NULL OR p_action NOT IN ('state','purchase','start','settle','cancel','sell','appraise')
    OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION '无效钓鱼操作'; END IF;
  -- Lock the same wallet row used by cloud saves and the bank before any mutation.
  SELECT gold INTO v_wallet FROM users WHERE id = p_user_id AND role = 'student' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '玩家不存在'; END IF;
  IF p_playtime_session_id IS NULL OR length(p_playtime_session_id) NOT BETWEEN 16 AND 128 OR NOT EXISTS (
    SELECT 1 FROM student_playtime_sessions WHERE student_id = p_user_id AND session_id = p_playtime_session_id
  ) THEN RAISE EXCEPTION '游玩会话无效，请重新登录'; END IF;
  SELECT data INTO STRICT v_catalog FROM fishing_catalog WHERE version = 1;
  INSERT INTO fishing_accounts(student_id) VALUES(p_user_id) ON CONFLICT(student_id) DO NOTHING;
  SELECT state - 'locked' - 'appraised' INTO STRICT v_state FROM fishing_accounts WHERE student_id = p_user_id FOR UPDATE;
  -- Expired/cancelled casts never refund spent bait; refreshing cannot reroll them.
  UPDATE fishing_sessions SET status = 'expired', ended_at = clock_timestamp(),
    result = '{"success":false,"reason":"timed_out"}'::JSONB
  WHERE student_id = p_user_id AND status = 'active'
    AND EXTRACT(EPOCH FROM (clock_timestamp() - started_at)) * 1000 > wait_ms + deadline_ms + 1800 RETURNING * INTO v_expired_session;
  GET DIAGNOSTICS v_expired = ROW_COUNT;
  IF v_expired > 0 THEN
    v_state := jsonb_set(v_state,'{perfectStreak}','0'::JSONB);
    UPDATE fishing_accounts SET state=v_state WHERE student_id=p_user_id;
    INSERT INTO student_gameplay_logs(student_id,teacher_id,event_type,category,title,summary,map_name,map_display_name,details)
      SELECT p_user_id,u.teacher_id,'fishing_expired','fishing','钓鱼超时','收杆机会已过，连击中断；鱼饵不返还。',
        v_catalog #>> ARRAY['spots',v_expired_session.spot_id,'mapId'],
        CASE WHEN v_expired_session.spot_id IN ('valley_pond','valley_shallows') THEN '新手山谷' WHEN v_expired_session.spot_id IN ('lake_reeds','lake_deep') THEN '雾湖苇岸' ELSE '贝壳海岸' END,
        jsonb_build_object('expiredCasts',v_expired,'spotName',v_catalog #>> ARRAY['spots',v_expired_session.spot_id,'name'],'baitName',v_catalog #>> ARRAY['baits',v_expired_session.bait_id,'name'])
      FROM users u WHERE u.id=p_user_id;
  END IF;
  IF p_action = 'state' THEN
    RETURN jsonb_build_object('success', TRUE, 'state', fishing_snapshot(p_user_id), 'walletGold', v_wallet);
  END IF;
  IF p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 16 AND 128 THEN RAISE EXCEPTION '操作编号无效'; END IF;
  SELECT * INTO v_previous FROM fishing_requests WHERE student_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    IF v_previous.action <> p_action OR v_previous.payload <> p_payload THEN RAISE EXCEPTION '操作编号已被其他操作使用'; END IF;
    v_response := v_previous.response;
    IF p_action='settle' AND v_catalog #>> ARRAY['catches',v_response #>> '{result,catchId}','kind']='treasure' THEN
      v_response := v_response #- '{result,price}';
    END IF;
    RETURN v_response || jsonb_build_object('state', fishing_snapshot(p_user_id), 'walletGold', v_wallet,
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
      v_log := FALSE;
      v_result := COALESCE(v_session.result,jsonb_build_object('success',FALSE,'reason',v_session.status))||jsonb_build_object('alreadySettled',TRUE);
    ELSIF p_action = 'cancel' THEN
      v_state := jsonb_set(v_state,'{perfectStreak}','0'::JSONB);
      v_result := '{"success":false,"reason":"cancelled","perfectStreak":0,"bonusGold":0}'::JSONB;
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
      v_streak := CASE WHEN v_perfect THEN LEAST(2147483647,COALESCE((v_state->>'perfectStreak')::BIGINT,0)+1) ELSE 0 END;
      v_bonus := CASE WHEN v_streak>=3 THEN LEAST(8,v_streak-1)::INT ELSE 0 END;
      v_state := jsonb_set(v_state,'{perfectStreak}',to_jsonb(v_streak));
      v_state := jsonb_set(v_state,'{totals,comboEarned}',to_jsonb(COALESCE((v_state #>> '{totals,comboEarned}')::BIGINT,0)+v_bonus));
      v_delta := v_bonus;
      IF v_bonus>0 THEN v_reason := '钓鱼完美连击奖励'; END IF;
      v_result := v_result || jsonb_build_object('perfectStreak',v_streak,'bonusGold',v_bonus);
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
        v_state := jsonb_set(v_state,'{totals,caught}',to_jsonb((v_state #>> '{totals,caught}')::BIGINT+1));
        v_state := jsonb_set(v_state,'{totals,perfect}',to_jsonb((v_state #>> '{totals,perfect}')::BIGINT+CASE WHEN v_perfect THEN 1 ELSE 0 END));
        v_result := v_result || jsonb_build_object('catchId',v_id,'weight',v_session.weight,'firstCatch',v_old_count=0);
        IF v_item->>'kind'='treasure' THEN
          INSERT INTO fishing_treasures(student_id,catch_id,catch_session_id)
            VALUES(p_user_id,v_id,v_session.id) RETURNING id INTO v_treasure_id;
          v_result := v_result || jsonb_build_object('treasureId',v_treasure_id,'needsAppraisal',TRUE);
        ELSE
          v_result := v_result || jsonb_build_object('price',(v_item->>'price')::INT);
        END IF;
      END IF;
      UPDATE fishing_sessions SET status = 'settled',ended_at = clock_timestamp(),result = v_result WHERE id = v_session.id;
    END IF;

  WHEN 'sell', 'appraise' THEN
    v_merchant := v_catalog #> ARRAY['merchants',p_payload->>'merchantId'];
    IF v_merchant IS NULL OR v_merchant->>'mapId' <> v_map OR NOT fishing_map_unlocked(v_game,v_map) THEN
      RAISE EXCEPTION '请到对应地图的鱼商处交易'; END IF;
    v_id := p_payload->>'catchId';
    IF p_payload ? 'treasureId' THEN
      IF COALESCE(p_payload->>'treasureId','') !~ '^[a-fA-F0-9-]{36}$' THEN RAISE EXCEPTION '宝藏编号无效'; END IF;
      v_treasure_id := (p_payload->>'treasureId')::UUID;
      SELECT * INTO v_treasure FROM fishing_treasures
        WHERE id=v_treasure_id AND student_id=p_user_id AND sold_at IS NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION '鱼篓中没有这件宝藏'; END IF;
      IF v_id IS NOT NULL AND v_id<>v_treasure.catch_id THEN RAISE EXCEPTION '宝藏种类不匹配'; END IF;
      v_id := v_treasure.catch_id;
    END IF;
    IF p_action = 'appraise' THEN
      IF v_treasure_id IS NULL THEN RAISE EXCEPTION '请选择一件待鉴定宝藏'; END IF;
      v_item := v_catalog #> ARRAY['catches',v_id];
      IF NOT (v_merchant->'treasureIds' ? v_id) THEN RAISE EXCEPTION '这位鱼商无法鉴定这个宝藏'; END IF;
      IF v_treasure.appraisal_price IS NULL THEN
        SELECT grade,price INTO v_grade,v_price FROM fishing_roll_appraisal((v_item->>'price')::INT,random()::NUMERIC,random()::NUMERIC);
        UPDATE fishing_treasures SET appraisal_grade=v_grade,appraisal_price=v_price,appraised_at=clock_timestamp()
          WHERE id=v_treasure_id RETURNING * INTO v_treasure;
      ELSE v_log := FALSE;
      END IF;
      v_result := jsonb_build_object('catchId',v_id,'treasureId',v_treasure_id,'price',v_treasure.appraisal_price,
        'appraisalGrade',v_treasure.appraisal_grade,'appraised',TRUE);
    ELSE
      IF p_payload->>'all' IS DISTINCT FROM 'true' THEN
        IF v_catalog #> ARRAY['catches',v_id] IS NULL THEN RAISE EXCEPTION '鱼获不存在'; END IF;
        IF COALESCE(p_payload->>'quantity','') !~ '^[0-9]+$' OR (p_payload->>'quantity')::NUMERIC NOT BETWEEN 1 AND 2147483647 THEN RAISE EXCEPTION '出售数量无效'; END IF;
        IF v_catalog #>> ARRAY['catches',v_id,'kind']='treasure' AND (v_treasure_id IS NULL OR (p_payload->>'quantity')::INT<>1) THEN
          RAISE EXCEPTION '请逐件选择已经鉴定的宝藏'; END IF;
      END IF;
      FOR v_entry IN SELECT key,value FROM jsonb_each(v_state->'catches') LOOP
        IF p_payload->>'all' IS DISTINCT FROM 'true' AND v_entry.key<>v_id THEN CONTINUE; END IF;
        v_item := v_catalog #> ARRAY['catches',v_entry.key];
        IF v_item->>'kind'='treasure' THEN CONTINUE; END IF;
        v_available := (v_entry.value #>> '{}')::BIGINT;
        v_quantity := CASE WHEN p_payload->>'all'='true' THEN v_available ELSE (p_payload->>'quantity')::BIGINT END;
        IF v_quantity<=0 THEN CONTINUE; END IF;
        IF v_quantity>v_available THEN RAISE EXCEPTION '出售数量超过持有鱼获'; END IF;
        v_price := (v_item->>'price')::INT;
        v_delta := v_delta+v_quantity*v_price; v_total_sold := v_total_sold+v_quantity;
        v_state := jsonb_set(v_state,ARRAY['catches',v_entry.key],to_jsonb(v_available-v_quantity));
        v_sold := v_sold||jsonb_build_object('catchId',v_entry.key,'quantity',v_quantity,'price',v_price);
      END LOOP;
      FOR v_treasure IN SELECT t.* FROM fishing_treasures t
        WHERE t.student_id=p_user_id AND t.sold_at IS NULL
        AND (p_payload->>'all'='true' OR t.id=v_treasure_id) ORDER BY t.id FOR UPDATE LOOP
        IF v_treasure.appraisal_price IS NULL OR NOT(v_merchant->'treasureIds' ? v_treasure.catch_id) THEN
          IF p_payload->>'all' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '请先到可鉴定的鱼商处免费鉴定宝藏'; END IF;
          CONTINUE;
        END IF;
        v_available := COALESCE((v_state #>> ARRAY['catches',v_treasure.catch_id])::BIGINT,0);
        IF v_available<=0 THEN RAISE EXCEPTION '宝藏库存需要重新同步'; END IF;
        UPDATE fishing_treasures SET sold_at=clock_timestamp() WHERE id=v_treasure.id;
        v_state := jsonb_set(v_state,ARRAY['catches',v_treasure.catch_id],to_jsonb(v_available-1));
        v_delta := v_delta+v_treasure.appraisal_price; v_total_sold := v_total_sold+1;
        v_sold := v_sold||jsonb_build_object('catchId',v_treasure.catch_id,'treasureId',v_treasure.id,'quantity',1,
          'price',v_treasure.appraisal_price,'appraisalGrade',v_treasure.appraisal_grade);
      END LOOP;
      IF v_total_sold=0 THEN RAISE EXCEPTION '没有可以出售的鱼获'; END IF;
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
  -- The teacher feed is part of the committed action, never a best-effort browser duplicate.
  IF v_log THEN
    SELECT teacher_id INTO v_teacher FROM users WHERE id=p_user_id;
    v_map_label := CASE v_map WHEN 'GodotMap' THEN '新手山谷' WHEN 'GodotMapV2_MistLake' THEN '雾湖苇岸' WHEN 'GodotMapV2_PirateShore' THEN '贝壳海岸' ELSE v_map END;
    v_details := jsonb_build_object('action',p_action,'result',v_result,'gold',v_delta);
    CASE p_action
      WHEN 'purchase' THEN
        v_title := '购买渔具';
        v_summary := CASE WHEN v_id='fishing_rod' THEN '购买旅行钓鱼竿，赠送5次普通鱼饵。' ELSE format('购买%s %s包，增加%s次鱼饵。',v_bait->>'name',v_quantity,(v_bait->>'uses')::INT*v_quantity) END;
      WHEN 'start' THEN
        v_title := '钓鱼抛竿'; v_summary := format('在%s使用%s抛竿，消耗1次鱼饵。',v_spot->>'name',v_bait->>'name');
      WHEN 'settle' THEN
        v_title := CASE WHEN v_success THEN CASE WHEN v_perfect THEN '完美钓获' ELSE '钓获鱼获' END ELSE '钓鱼失手' END;
        v_summary := CASE WHEN v_success THEN format('钓到%s%s。',v_item->>'name',CASE WHEN v_item->>'kind'='treasure' THEN '，待鉴定' ELSE '' END) ELSE '没有钓到鱼获，连击中断。' END;
        IF v_perfect THEN v_summary := v_summary||format('连续完美%s次，奖励%s金币。',v_streak,v_bonus); END IF;
        v_details := v_details||jsonb_build_object('catchName',v_item->>'name','perfect',v_perfect,'perfectStreak',v_streak,'bonusGold',v_bonus);
      WHEN 'cancel' THEN v_title := '收起鱼竿'; v_summary := '本竿取消，连击中断；已消耗的鱼饵不返还。';
      WHEN 'appraise' THEN
        v_title := '宝藏鉴定'; v_summary := format('%s鉴定为%s，售价%s金币。',v_item->>'name',
          CASE v_treasure.appraisal_grade WHEN 'ordinary' THEN '普通' WHEN 'great' THEN '优良' WHEN 'precious' THEN '珍贵' WHEN 'exquisite' THEN '极品' WHEN 'legendary' THEN '罕世' END,v_treasure.appraisal_price);
      WHEN 'sell' THEN v_title := '出售鱼获'; v_summary := format('向%s出售%s件鱼获，获得%s金币。',v_merchant->>'name',v_total_sold,v_delta);
    END CASE;
    IF v_session.id IS NOT NULL THEN
      v_spot := v_catalog #> ARRAY['spots',v_session.spot_id];
      v_bait := v_catalog #> ARRAY['baits',v_session.bait_id];
    END IF;
    v_details := v_details||jsonb_build_object('spotName',v_spot->>'name','baitName',v_bait->>'name','merchantName',v_merchant->>'name');
    INSERT INTO student_gameplay_logs(student_id,teacher_id,event_type,category,title,summary,map_name,map_display_name,player_position,details)
      VALUES(p_user_id,v_teacher,'fishing_'||p_action,'fishing',v_title,v_summary,v_map,v_map_label,COALESCE(v_game->'playerPos','{}'::JSONB),v_details);
  END IF;
  UPDATE fishing_accounts SET state = v_state,updated_at = clock_timestamp() WHERE student_id = p_user_id;
  v_response := jsonb_build_object('success',TRUE,'result',v_result,'state',fishing_snapshot(p_user_id),
    'walletGold',v_wallet+v_delta,'session',fishing_snapshot(p_user_id)->'activeSession');
  INSERT INTO fishing_requests(student_id,request_id,action,payload,response) VALUES(p_user_id,p_request_id,p_action,p_payload,v_response);
  RETURN v_response;
END $$;

REVOKE ALL ON FUNCTION fishing_snapshot(UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION fishing_action(UUID,TEXT,TEXT,TEXT,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fishing_action(UUID,TEXT,TEXT,TEXT,JSONB) TO anon,authenticated;
COMMIT;
NOTIFY pgrst,'reload schema';
