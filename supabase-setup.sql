-- ============================================
-- 宝可梦养成游戏 - Supabase数据库设置脚本
-- ============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
  teacher_id UUID REFERENCES users(id),
  gold INT DEFAULT 0 CHECK (gold >= 0),
  energy INT DEFAULT 6 CHECK (energy >= 0),
  max_energy INT DEFAULT 10 CHECK (max_energy >= 0),
  plain_password TEXT,
  registration_status TEXT NOT NULL DEFAULT 'approved' CHECK (registration_status IN ('pending', 'approved', 'rejected')),
  registration_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  registration_reviewed_at TIMESTAMP WITH TIME ZONE,
  registration_rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 兼容已存在的旧表
ALTER TABLE users ADD COLUMN IF NOT EXISTS gold INT DEFAULT 0 CHECK (gold >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS energy INT DEFAULT 6 CHECK (energy >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_energy INT DEFAULT 10 CHECK (max_energy >= 0);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_status TEXT NOT NULL DEFAULT 'approved' CHECK (registration_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_reviewed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_rejection_reason TEXT;
UPDATE users
SET registration_status = 'approved',
    registration_requested_at = COALESCE(registration_requested_at, created_at, NOW()),
    registration_reviewed_at = COALESCE(registration_reviewed_at, created_at, NOW())
WHERE registration_status IS NULL;
UPDATE users
SET max_energy = GREATEST(COALESCE(max_energy, 10), COALESCE(energy, 6), 0),
    energy = LEAST(GREATEST(COALESCE(energy, 6), 0), GREATEST(COALESCE(max_energy, 10), COALESCE(energy, 6), 0))
WHERE role = 'student';

-- 2. 创建游戏存档表
CREATE TABLE IF NOT EXISTS game_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE NOT NULL,
  game_data JSONB NOT NULL,
  last_saved TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  save_revision BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE game_saves ADD COLUMN IF NOT EXISTS save_revision BIGINT NOT NULL DEFAULT 0;
UPDATE game_saves
SET save_revision = CASE
  WHEN game_data #>> '{_sync,revision}' ~ '^[0-9]+$'
    THEN GREATEST(save_revision, (game_data #>> '{_sync,revision}')::BIGINT)
  ELSE save_revision
END;

-- 3. 创建金币记录表
CREATE TABLE IF NOT EXISTS gold_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  teacher_id UUID REFERENCES users(id),
  amount INT NOT NULL,
  reason TEXT,
  balance_after INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 创建能量记录表
CREATE TABLE IF NOT EXISTS energy_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  teacher_id UUID REFERENCES users(id),
  amount INT NOT NULL,
  reason TEXT,
  energy_after INT NOT NULL,
  max_energy_after INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 创建老师奖励表
CREATE TABLE IF NOT EXISTS teacher_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES users(id) NOT NULL,
  teacher_id UUID REFERENCES users(id) NOT NULL,
  reward_type TEXT NOT NULL CHECK (reward_type IN ('item', 'pokemon')),
  item_type TEXT CHECK (item_type IN ('pokeball', 'potion', 'expPotion', 'evolutionItem')),
  item_key TEXT,
  quantity INT CHECK (quantity > 0),
  pokemon_id INT,
  pokemon_level INT CHECK (pokemon_level BETWEEN 1 AND 100),
  reason TEXT,
  claim_token UUID,
  claim_reserved_at TIMESTAMP WITH TIME ZONE,
  claimed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CHECK (
    (reward_type = 'item' AND item_type IS NOT NULL AND item_key IS NOT NULL AND quantity IS NOT NULL AND pokemon_id IS NULL AND pokemon_level IS NULL)
    OR
    (reward_type = 'pokemon' AND pokemon_id IS NOT NULL AND pokemon_level IS NOT NULL AND item_type IS NULL AND item_key IS NULL AND quantity IS NULL)
  )
);

ALTER TABLE teacher_rewards ADD COLUMN IF NOT EXISTS claim_token UUID;
ALTER TABLE teacher_rewards ADD COLUMN IF NOT EXISTS claim_reserved_at TIMESTAMP WITH TIME ZONE;

-- 6. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_users_teacher_id ON users(teacher_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_plain_password ON users(plain_password);
CREATE INDEX IF NOT EXISTS idx_users_registration_status ON users(registration_status);
CREATE INDEX IF NOT EXISTS idx_gold_logs_student_id ON gold_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_gold_logs_created_at ON gold_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_energy_logs_student_id ON energy_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_energy_logs_created_at ON energy_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_teacher_rewards_student_id ON teacher_rewards(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_rewards_teacher_id ON teacher_rewards(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_rewards_claimed_at ON teacher_rewards(claimed_at);
CREATE INDEX IF NOT EXISTS idx_teacher_rewards_claim_token ON teacher_rewards(claim_token);

-- ============================================
-- Row Level Security (RLS) 策略
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_rewards ENABLE ROW LEVEL SECURITY;

-- 删除旧策略（如果存在）
DROP POLICY IF EXISTS "Students can view own profile" ON users;
DROP POLICY IF EXISTS "Teachers can view their students" ON users;
DROP POLICY IF EXISTS "Teachers can update student energy" ON users;
DROP POLICY IF EXISTS "Teachers can update student gold" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;
DROP POLICY IF EXISTS "Allow public to find teachers" ON users;
DROP POLICY IF EXISTS "Teachers can view student passwords" ON users;
DROP POLICY IF EXISTS "Allow login by username" ON users;
DROP POLICY IF EXISTS "Public read access for auth" ON users;
DROP POLICY IF EXISTS "Students can manage own saves" ON game_saves;
DROP POLICY IF EXISTS "Students can view own gold logs" ON gold_logs;
DROP POLICY IF EXISTS "Teachers can view student gold logs" ON gold_logs;
DROP POLICY IF EXISTS "System can insert gold logs" ON gold_logs;
DROP POLICY IF EXISTS "Students can view own energy logs" ON energy_logs;
DROP POLICY IF EXISTS "Teachers can view student energy logs" ON energy_logs;
DROP POLICY IF EXISTS "System can insert energy logs" ON energy_logs;
DROP POLICY IF EXISTS "Students can view own rewards" ON teacher_rewards;
DROP POLICY IF EXISTS "Teachers can view student rewards" ON teacher_rewards;
DROP POLICY IF EXISTS "Teachers can insert student rewards" ON teacher_rewards;
DROP POLICY IF EXISTS "System can manage rewards" ON teacher_rewards;

CREATE POLICY "Allow user registration"
  ON users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Teachers can update student gold"
  ON users FOR UPDATE
  USING (
    role = 'student' AND EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  )
  WITH CHECK (
    role = 'student'
  );

CREATE POLICY "Teachers can update student energy"
  ON users FOR UPDATE
  USING (
    role = 'student' AND EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  )
  WITH CHECK (
    role = 'student'
  );

-- Game_saves表策略
CREATE POLICY "Students can manage own saves"
  ON game_saves FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Gold_logs表策略
CREATE POLICY "Students can view own gold logs"
  ON gold_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view student gold logs"
  ON gold_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  );

CREATE POLICY "System can insert gold logs"
  ON gold_logs FOR INSERT
  WITH CHECK (true);

-- Energy_logs表策略
CREATE POLICY "Students can view own energy logs"
  ON energy_logs FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view student energy logs"
  ON energy_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  );

CREATE POLICY "System can insert energy logs"
  ON energy_logs FOR INSERT
  WITH CHECK (true);

-- Teacher_rewards表策略
CREATE POLICY "Students can view own rewards"
  ON teacher_rewards FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view student rewards"
  ON teacher_rewards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users teacher
      WHERE teacher.id = auth.uid()
      AND teacher.role = 'teacher'
    )
  );

-- ============================================
-- 数据库函数
-- ============================================

DROP FUNCTION IF EXISTS consume_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS adjust_energy(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_energy(UUID, UUID, INT, TEXT, BOOLEAN, INT);
DROP FUNCTION IF EXISTS register_table_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS review_student_registration(UUID, UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS login_with_table_password(TEXT, TEXT);
DROP FUNCTION IF EXISTS teacher_reset_student_password(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS get_table_user_profile(UUID);
DROP FUNCTION IF EXISTS get_user_resources(UUID);
DROP FUNCTION IF EXISTS get_teacher_students(UUID);
DROP FUNCTION IF EXISTS get_teacher_pending_students(UUID);
DROP FUNCTION IF EXISTS load_cloud_game_save();
DROP FUNCTION IF EXISTS load_cloud_game_save(UUID);
DROP FUNCTION IF EXISTS load_cloud_game_state_with_resources(UUID);
DROP FUNCTION IF EXISTS save_cloud_game_save(JSONB);
DROP FUNCTION IF EXISTS save_cloud_game_save(UUID, JSONB);
DROP FUNCTION IF EXISTS save_cloud_game_state_with_resources(UUID, JSONB, INT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS clear_cloud_game_save();
DROP FUNCTION IF EXISTS clear_cloud_game_save(UUID);
DROP FUNCTION IF EXISTS grant_gold(UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_gold(UUID, UUID, INT, TEXT);
DROP FUNCTION IF EXISTS grant_item_reward(UUID, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS grant_item_reward(UUID, UUID, TEXT, TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS grant_pokemon_reward(UUID, INT, INT, TEXT);
DROP FUNCTION IF EXISTS grant_pokemon_reward(UUID, UUID, INT, INT, TEXT);
DROP FUNCTION IF EXISTS begin_teacher_reward_claim(UUID);
DROP FUNCTION IF EXISTS confirm_teacher_reward_claim(UUID, UUID);
DROP FUNCTION IF EXISTS claim_teacher_rewards();
DROP FUNCTION IF EXISTS claim_teacher_rewards(UUID);
DROP FUNCTION IF EXISTS get_my_students();
DROP FUNCTION IF EXISTS get_student_gold_logs(UUID, UUID, INT);
DROP FUNCTION IF EXISTS get_student_energy_logs(UUID, UUID, INT);

-- 函数0-0: 课堂系统注册。老师注册必须提供专属注册密码；学生注册进入待审核。
CREATE OR REPLACE FUNCTION register_table_user(
  p_username TEXT,
  p_password TEXT,
  p_nickname TEXT,
  p_role TEXT,
  p_teacher_username TEXT DEFAULT NULL,
  p_teacher_registration_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_username TEXT := TRIM(COALESCE(p_username, ''));
  v_role TEXT := CASE WHEN p_role = 'teacher' THEN 'teacher' ELSE 'student' END;
  v_teacher_id UUID;
  v_profile users%ROWTYPE;
BEGIN
  IF v_username = '' THEN
    RETURN jsonb_build_object('success', false, 'error', '请输入用户名');
  END IF;

  IF LENGTH(TRIM(COALESCE(p_password, ''))) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '密码至少6位');
  END IF;

  IF EXISTS (SELECT 1 FROM users WHERE username = v_username) THEN
    RETURN jsonb_build_object('success', false, 'error', '用户名已存在');
  END IF;

  IF v_role = 'teacher' THEN
    IF TRIM(COALESCE(p_teacher_registration_code, '')) <> '198985' THEN
      RETURN jsonb_build_object('success', false, 'error', '老师注册密码不正确，无法创建教师账号');
    END IF;
  ELSE
    SELECT id INTO v_teacher_id
    FROM users
    WHERE username = TRIM(COALESCE(p_teacher_username, ''))
      AND role = 'teacher'
      AND COALESCE(registration_status, 'approved') = 'approved'
    LIMIT 1;

    IF v_teacher_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '找不到该老师，请检查老师用户名');
    END IF;
  END IF;

  INSERT INTO users (
    email,
    username,
    nickname,
    role,
    teacher_id,
    gold,
    energy,
    max_energy,
    plain_password,
    registration_status,
    registration_requested_at,
    registration_reviewed_at
  )
  VALUES (
    v_username || '@pokemon-game.local',
    v_username,
    NULLIF(TRIM(COALESCE(p_nickname, '')), ''),
    v_role,
    v_teacher_id,
    CASE WHEN v_role = 'student' THEN 500 ELSE 0 END,
    CASE WHEN v_role = 'student' THEN 6 ELSE 0 END,
    CASE WHEN v_role = 'student' THEN 10 ELSE 0 END,
    p_password,
    CASE WHEN v_role = 'student' THEN 'pending' ELSE 'approved' END,
    NOW(),
    CASE WHEN v_role = 'teacher' THEN NOW() ELSE NULL END
  )
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'success', true,
    'pendingApproval', v_role = 'student',
    'message', CASE
      WHEN v_role = 'student' THEN '注册申请已提交，请尽快通知老师登录教师工作台确认。老师通过后，你就可以使用该账号登录。'
      ELSE '注册成功！'
    END,
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'username', v_profile.username,
      'nickname', v_profile.nickname,
      'role', v_profile.role,
      'teacher_id', v_profile.teacher_id,
      'gold', v_profile.gold,
      'energy', v_profile.energy,
      'max_energy', v_profile.max_energy,
      'registration_status', COALESCE(v_profile.registration_status, 'approved'),
      'registration_rejection_reason', v_profile.registration_rejection_reason,
      'registration_requested_at', v_profile.registration_requested_at,
      'registration_reviewed_at', v_profile.registration_reviewed_at,
      'created_at', v_profile.created_at
    )
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', '用户名已存在');
END;
$$;

GRANT EXECUTE ON FUNCTION register_table_user(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 函数0-0-1: 老师审核学生注册申请。
CREATE OR REPLACE FUNCTION review_student_registration(
  p_teacher_id UUID,
  p_student_id UUID,
  p_approved BOOLEAN,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student users%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_teacher_id
      AND role = 'teacher'
      AND COALESCE(registration_status, 'approved') = 'approved'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '只有已通过的老师账号可以审核学生');
  END IF;

  SELECT * INTO v_student
  FROM users
  WHERE id = p_student_id
    AND role = 'student'
    AND teacher_id = p_teacher_id
  LIMIT 1;

  IF v_student.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '找不到该学生申请');
  END IF;

  UPDATE users
  SET registration_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      registration_reviewed_at = NOW(),
      registration_rejection_reason = CASE WHEN p_approved THEN NULL ELSE NULLIF(TRIM(COALESCE(p_rejection_reason, '')), '') END
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION review_student_registration(UUID, UUID, BOOLEAN, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION teacher_reset_student_password(
  p_teacher_id UUID,
  p_student_id UUID,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_password TEXT := TRIM(COALESCE(p_new_password, ''));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_teacher_id
      AND role = 'teacher'
      AND COALESCE(registration_status, 'approved') = 'approved'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '只有已通过的老师账号可以重置学生密码');
  END IF;

  IF LENGTH(v_clean_password) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', '新密码至少6位');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_student_id
      AND role = 'student'
      AND teacher_id = p_teacher_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', '找不到该学生，无法重置密码');
  END IF;

  UPDATE users
  SET plain_password = v_clean_password
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '学生密码已更新，旧密码立即失效。'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION teacher_reset_student_password(UUID, UUID, TEXT) TO anon, authenticated;

-- 函数0-1: 课堂系统登录。只验证 public.users 表中的用户名和 plain_password。
CREATE OR REPLACE FUNCTION login_with_table_password(
  p_username TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  nickname TEXT,
  role TEXT,
  teacher_id UUID,
  gold INT,
  energy INT,
  max_energy INT,
  registration_status TEXT,
  registration_rejection_reason TEXT,
  registration_requested_at TIMESTAMP WITH TIME ZONE,
  registration_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NULLIF(TRIM(p_username), '') IS NULL OR p_password IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.username,
    u.nickname,
    u.role,
    u.teacher_id,
    u.gold,
    u.energy,
    u.max_energy,
    COALESCE(u.registration_status, 'approved') AS registration_status,
    u.registration_rejection_reason,
    u.registration_requested_at,
    u.registration_reviewed_at,
    u.created_at
  FROM users u
  WHERE TRIM(u.username) = TRIM(p_username)
  AND COALESCE(TRIM(u.plain_password), '') = TRIM(p_password)
  ORDER BY
    CASE WHEN u.username = p_username THEN 0 ELSE 1 END,
    u.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION login_with_table_password(TEXT, TEXT) TO anon, authenticated;

-- 函数0-1: 读取当前登录学生的云端游戏进度。
CREATE OR REPLACE FUNCTION load_cloud_game_save(
  p_user_id UUID
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT gs.game_data, gs.last_saved, COALESCE(gs.save_revision, 0)
  FROM game_saves gs
  JOIN users u ON u.id = gs.user_id
  WHERE gs.user_id = p_user_id
  AND u.role = 'student';
END;
$$;

CREATE OR REPLACE FUNCTION load_cloud_game_state_with_resources(
  p_user_id UUID
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  gold INT,
  energy INT,
  max_energy INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  RETURN QUERY
  SELECT
    gs.game_data,
    gs.last_saved,
    COALESCE(gs.save_revision, 0),
    COALESCE(u.gold, 0),
    COALESCE(u.energy, 0),
    COALESCE(u.max_energy, 0)
  FROM users u
  LEFT JOIN game_saves gs ON gs.user_id = u.id
  WHERE u.id = p_user_id
  AND u.role = 'student';
END;
$$;

-- 函数0-2: 保存当前登录学生的完整云端游戏进度。
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

-- 函数0-2b: 在同一事务内同时提交云存档与金币/能量变化，避免“资源已改但进度未存”的窗口。
CREATE OR REPLACE FUNCTION save_cloud_game_state_with_resources(
  p_user_id UUID,
  p_game_data JSONB,
  p_gold_delta INT DEFAULT 0,
  p_gold_reason TEXT DEFAULT '游戏金币变动',
  p_energy_delta INT DEFAULT 0,
  p_energy_reason TEXT DEFAULT '能量变动'
)
RETURNS TABLE (
  game_data JSONB,
  last_saved TIMESTAMP WITH TIME ZONE,
  save_revision BIGINT,
  accepted BOOLEAN,
  error_message TEXT,
  gold_after INT,
  energy_after INT,
  max_energy_after INT
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
  v_has_existing_save BOOLEAN := FALSE;
  v_current_gold INT;
  v_current_energy INT;
  v_max_energy INT;
  v_existing_battle_energy_cost INT := 0;
  v_incoming_battle_energy_cost INT := 0;
  v_is_escape_refund BOOLEAN := FALSE;
  v_next_energy INT;
  v_energy_log_amount INT;
BEGIN
  SELECT gold, energy, max_energy
  INTO v_current_gold, v_current_energy, v_max_energy
  FROM users
  WHERE id = p_user_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
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
  v_has_existing_save := FOUND;

  v_current_gold := COALESCE(v_current_gold, 0);
  v_current_energy := COALESCE(v_current_energy, 0);
  v_max_energy := GREATEST(COALESCE(v_max_energy, 10), v_current_energy, 0);

  IF v_has_existing_save THEN
    v_next_revision := COALESCE(NULLIF(v_incoming_revision, 0), v_existing_revision + 1);

    IF v_next_revision < v_existing_revision THEN
      RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE, '后端拒绝了旧版本存档。', v_current_gold, v_current_energy, v_max_energy;
      RETURN;
    END IF;

    IF v_next_revision = v_existing_revision THEN
      IF v_existing_game_data = p_game_data THEN
        RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE, NULL::TEXT, v_current_gold, v_current_energy, v_max_energy;
      ELSE
        RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE, '后端拒绝了旧版本存档。', v_current_gold, v_current_energy, v_max_energy;
      END IF;
      RETURN;
    END IF;
  ELSE
    v_next_revision := COALESCE(NULLIF(v_incoming_revision, 0), 1);
  END IF;

  IF v_existing_game_data #>> '{activeBattleEnergyCost}' ~ '^[0-9]+$' THEN
    v_existing_battle_energy_cost := GREATEST((v_existing_game_data #>> '{activeBattleEnergyCost}')::INT, 0);
  END IF;

  IF p_game_data #>> '{activeBattleEnergyCost}' ~ '^[0-9]+$' THEN
    v_incoming_battle_energy_cost := GREATEST((p_game_data #>> '{activeBattleEnergyCost}')::INT, 0);
  END IF;

  v_is_escape_refund :=
    p_energy_delta > 0
    AND p_energy_reason = '逃跑成功退回能量'
    AND v_has_existing_save
    AND COALESCE(v_existing_game_data #>> '{view}', '') = 'battle'
    AND COALESCE(v_existing_game_data #>> '{battleKind}', 'wild') = 'wild'
    AND COALESCE(v_existing_game_data #>> '{battlePhase}', '') = 'escape'
    AND COALESCE(v_existing_game_data #>> '{battleEnergyRefundEligible}', 'false') = 'true'
    AND v_existing_battle_energy_cost >= p_energy_delta
    AND COALESCE(p_game_data #>> '{view}', '') = 'map'
    AND COALESCE(p_game_data #>> '{battleEnergyRefundEligible}', 'false') = 'false'
    AND v_incoming_battle_energy_cost = 0;

  IF p_gold_delta <> 0 AND v_current_gold + p_gold_delta < 0 THEN
    RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE, '金币不足', v_current_gold, v_current_energy, v_max_energy;
    RETURN;
  END IF;

  IF p_energy_delta > 0 AND NOT v_is_escape_refund THEN
    RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE, '能量只能由老师恢复或增加', v_current_gold, v_current_energy, v_max_energy;
    RETURN;
  END IF;

  IF p_energy_delta < 0 AND v_current_energy + p_energy_delta < 0 THEN
    RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, FALSE, '能量不足', v_current_gold, v_current_energy, v_max_energy;
    RETURN;
  END IF;

  IF p_gold_delta <> 0 THEN
    v_current_gold := v_current_gold + p_gold_delta;
    UPDATE users
    SET gold = v_current_gold
    WHERE id = p_user_id;

    INSERT INTO gold_logs (student_id, amount, reason, balance_after)
    VALUES (p_user_id, p_gold_delta, p_gold_reason, v_current_gold);
  END IF;

  IF p_energy_delta <> 0 THEN
    v_next_energy := CASE
      WHEN p_energy_delta > 0 THEN LEAST(v_max_energy, v_current_energy + p_energy_delta)
      ELSE v_current_energy + p_energy_delta
    END;
    v_energy_log_amount := v_next_energy - v_current_energy;
    v_current_energy := v_next_energy;

    UPDATE users
    SET energy = v_current_energy,
        max_energy = v_max_energy
    WHERE id = p_user_id;

    IF v_energy_log_amount <> 0 THEN
      INSERT INTO energy_logs (student_id, amount, reason, energy_after, max_energy_after)
      VALUES (p_user_id, v_energy_log_amount, p_energy_reason, v_current_energy, v_max_energy);
    END IF;
  END IF;

  IF v_has_existing_save THEN
    UPDATE game_saves gs
    SET game_data = p_game_data,
        last_saved = v_saved_at,
        save_revision = v_next_revision
    WHERE gs.user_id = p_user_id
    RETURNING gs.game_data, gs.last_saved, gs.save_revision
    INTO v_existing_game_data, v_existing_last_saved, v_existing_revision;

    RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE, NULL::TEXT, v_current_gold, v_current_energy, v_max_energy;
    RETURN;
  END IF;

  INSERT INTO game_saves (user_id, game_data, last_saved, save_revision)
  VALUES (p_user_id, p_game_data, v_saved_at, v_next_revision)
  RETURNING game_saves.game_data, game_saves.last_saved, game_saves.save_revision
  INTO v_existing_game_data, v_existing_last_saved, v_existing_revision;

  RETURN QUERY SELECT v_existing_game_data, v_existing_last_saved, v_existing_revision, TRUE, NULL::TEXT, v_current_gold, v_current_energy, v_max_energy;
END;
$$;

-- 函数0-3: 清空当前登录学生的云端游戏进度。
CREATE OR REPLACE FUNCTION clear_cloud_game_save(
  p_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gold INT := 500;
  v_energy INT := 6;
  v_max_energy INT := 10;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_user_id
    AND role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  DELETE FROM game_saves
  WHERE user_id = p_user_id;

  UPDATE users
  SET gold = 500,
      energy = 6,
      max_energy = 10
  WHERE id = p_user_id
  RETURNING gold, energy, max_energy
  INTO v_gold, v_energy, v_max_energy;

  RETURN json_build_object(
    'success', true,
    'goldAfter', v_gold,
    'energyAfter', v_energy,
    'maxEnergyAfter', v_max_energy
  );
END;
$$;

GRANT EXECUTE ON FUNCTION load_cloud_game_save(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION load_cloud_game_state_with_resources(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_cloud_game_save(UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION save_cloud_game_state_with_resources(UUID, JSONB, INT, TEXT, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION clear_cloud_game_save(UUID) TO anon, authenticated;

-- 函数1: 金币增减。学生购买商城道具时扣金币；战斗小额金币奖励也走这里；老师发放请使用 grant_gold。
CREATE OR REPLACE FUNCTION adjust_gold(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '金币变动'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_gold INT;
  v_new_gold INT;
BEGIN
  IF p_amount = 0 THEN
    RETURN json_build_object('success', true, 'goldBefore', 0, 'goldAfter', 0);
  END IF;

  SELECT gold INTO v_current_gold
  FROM users
  WHERE id = p_user_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_new_gold := v_current_gold + p_amount;

  IF v_new_gold < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', '金币不足',
      'currentGold', v_current_gold
    );
  END IF;

  UPDATE users
  SET gold = v_new_gold
  WHERE id = p_user_id;

  INSERT INTO gold_logs (student_id, amount, reason, balance_after)
  VALUES (p_user_id, p_amount, p_reason, v_new_gold);

  RETURN json_build_object(
    'success', true,
    'goldBefore', v_current_gold,
    'goldAfter', v_new_gold,
    'message', CASE
      WHEN p_amount < 0 THEN '花费了' || ABS(p_amount) || '金币'
      ELSE '获得了' || p_amount || '金币'
    END
  );
END;
$$;

-- 函数1-1: 能量增减。学生战斗前扣能量；老师发放请使用 grant_energy。
CREATE OR REPLACE FUNCTION adjust_energy(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '能量变动'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_energy INT;
  v_max_energy INT;
  v_new_energy INT;
BEGIN
  IF p_amount = 0 THEN
    SELECT energy, max_energy INTO v_current_energy, v_max_energy
    FROM users
    WHERE id = p_user_id
    AND role = 'student';

    RETURN json_build_object(
      'success', true,
      'energyBefore', COALESCE(v_current_energy, 0),
      'energyAfter', COALESCE(v_current_energy, 0),
      'maxEnergy', COALESCE(v_max_energy, 0)
    );
  END IF;

  IF p_amount > 0 THEN
    RETURN json_build_object('success', false, 'error', '能量只能由老师恢复或增加');
  END IF;

  SELECT energy, max_energy INTO v_current_energy, v_max_energy
  FROM users
  WHERE id = p_user_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_current_energy := COALESCE(v_current_energy, 0);
  v_max_energy := GREATEST(COALESCE(v_max_energy, 10), v_current_energy, 0);
  v_new_energy := v_current_energy + p_amount;

  IF v_new_energy < 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', '能量不足',
      'currentEnergy', v_current_energy,
      'maxEnergy', v_max_energy
    );
  END IF;

  UPDATE users
  SET energy = v_new_energy,
      max_energy = v_max_energy
  WHERE id = p_user_id;

  INSERT INTO energy_logs (student_id, amount, reason, energy_after, max_energy_after)
  VALUES (p_user_id, p_amount, p_reason, v_new_energy, v_max_energy);

  RETURN json_build_object(
    'success', true,
    'energyBefore', v_current_energy,
    'energyAfter', v_new_energy,
    'maxEnergy', v_max_energy,
    'message', '消耗了' || ABS(p_amount) || '点能量'
  );
END;
$$;

-- 函数1-2: 兼容旧命名，战斗前扣除能量。
CREATE OR REPLACE FUNCTION consume_energy(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '战斗消耗'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN adjust_energy(p_user_id, -ABS(p_amount), p_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_energy(UUID, INT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION consume_energy(UUID, INT, TEXT) TO anon, authenticated;

-- 函数2: 发放金币（老师专用）
CREATE OR REPLACE FUNCTION grant_gold(
  p_teacher_id UUID,
  p_student_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '老师发放'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_current_gold INT;
  v_new_gold INT;
  v_student_nickname TEXT;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_amount <= 0 THEN
    RETURN json_build_object('success', false, 'error', '金币数量必须大于0');
  END IF;

  v_teacher_id := p_teacher_id;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT gold, nickname INTO v_current_gold, v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  v_new_gold := v_current_gold + p_amount;

  UPDATE users
  SET gold = v_new_gold
  WHERE id = p_student_id;

  INSERT INTO gold_logs (student_id, teacher_id, amount, reason, balance_after)
  VALUES (p_student_id, v_teacher_id, p_amount, p_reason, v_new_gold);

  RETURN json_build_object(
    'success', true,
    'studentName', v_student_nickname,
    'goldBefore', v_current_gold,
    'goldAfter', v_new_gold,
    'message', '成功给' || v_student_nickname || '发放了' || p_amount || '金币'
  );
END;
$$;

-- 函数2-1: 老师恢复或增加学生能量
CREATE OR REPLACE FUNCTION grant_energy(
  p_teacher_id UUID,
  p_student_id UUID,
  p_amount INT,
  p_reason TEXT DEFAULT '老师恢复能量',
  p_fill_to_max BOOLEAN DEFAULT FALSE,
  p_max_energy INT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_energy INT;
  v_current_max_energy INT;
  v_new_energy INT;
  v_new_max_energy INT;
  v_student_nickname TEXT;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_amount < 0 THEN
    RETURN json_build_object('success', false, 'error', '能量数量不能为负数');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = p_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT energy, max_energy, nickname INTO v_current_energy, v_current_max_energy, v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  v_current_energy := COALESCE(v_current_energy, 0);
  v_current_max_energy := GREATEST(COALESCE(v_current_max_energy, 10), v_current_energy, 0);
  v_new_max_energy := CASE
    WHEN p_max_energy IS NULL THEN v_current_max_energy
    ELSE GREATEST(p_max_energy, 0, v_current_energy)
  END;

  IF p_fill_to_max THEN
    v_new_energy := v_new_max_energy;
  ELSE
    v_new_energy := LEAST(v_new_max_energy, v_current_energy + p_amount);
  END IF;

  UPDATE users
  SET energy = v_new_energy,
      max_energy = v_new_max_energy
  WHERE id = p_student_id;

  INSERT INTO energy_logs (student_id, teacher_id, amount, reason, energy_after, max_energy_after)
  VALUES (p_student_id, p_teacher_id, v_new_energy - v_current_energy, p_reason, v_new_energy, v_new_max_energy);

  RETURN json_build_object(
    'success', true,
    'studentName', v_student_nickname,
    'energyBefore', v_current_energy,
    'energyAfter', v_new_energy,
    'maxEnergyBefore', v_current_max_energy,
    'maxEnergyAfter', v_new_max_energy,
    'message', '成功给' || v_student_nickname || '恢复到 ' || v_new_energy || '/' || v_new_max_energy || ' 能量'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION grant_energy(UUID, UUID, INT, TEXT, BOOLEAN, INT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_table_user_profile(
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  nickname TEXT,
  role TEXT,
  teacher_id UUID,
  gold INT,
  energy INT,
  max_energy INT,
  registration_status TEXT,
  registration_rejection_reason TEXT,
  registration_requested_at TIMESTAMP WITH TIME ZONE,
  registration_reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.username,
    u.nickname,
    u.role,
    u.teacher_id,
    u.gold,
    u.energy,
    u.max_energy,
    COALESCE(u.registration_status, 'approved') AS registration_status,
    u.registration_rejection_reason,
    u.registration_requested_at,
    u.registration_reviewed_at,
    u.created_at
  FROM users u
  WHERE u.id = p_user_id
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_table_user_profile(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_user_resources(
  p_user_id UUID
)
RETURNS TABLE (
  gold INT,
  energy INT,
  max_energy INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(u.gold, 0),
    COALESCE(u.energy, 0),
    COALESCE(u.max_energy, 0)
  FROM users u
  WHERE u.id = p_user_id
    AND u.role = 'student'
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_resources(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_teacher_students(
  p_teacher_id UUID
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  gold INT,
  energy INT,
  max_energy INT,
  created_at TIMESTAMP WITH TIME ZONE,
  registration_status TEXT,
  registration_requested_at TIMESTAMP WITH TIME ZONE,
  registration_reviewed_at TIMESTAMP WITH TIME ZONE,
  registration_rejection_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users teacher
    WHERE teacher.id = p_teacher_id
      AND teacher.role = 'teacher'
      AND COALESCE(teacher.registration_status, 'approved') = 'approved'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.nickname,
    u.gold,
    u.energy,
    u.max_energy,
    u.created_at,
    COALESCE(u.registration_status, 'approved') AS registration_status,
    u.registration_requested_at,
    u.registration_reviewed_at,
    u.registration_rejection_reason
  FROM users u
  WHERE u.role = 'student'
    AND u.teacher_id = p_teacher_id
    AND (u.registration_status IS NULL OR u.registration_status = 'approved')
  ORDER BY u.nickname, u.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_students(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION get_teacher_pending_students(
  p_teacher_id UUID
)
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  teacher_id UUID,
  registration_status TEXT,
  registration_requested_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users teacher
    WHERE teacher.id = p_teacher_id
      AND teacher.role = 'teacher'
      AND COALESCE(teacher.registration_status, 'approved') = 'approved'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.username,
    u.nickname,
    u.created_at,
    u.teacher_id,
    COALESCE(u.registration_status, 'approved') AS registration_status,
    u.registration_requested_at
  FROM users u
  WHERE u.role = 'student'
    AND u.teacher_id = p_teacher_id
    AND u.registration_status = 'pending'
  ORDER BY u.registration_requested_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_teacher_pending_students(UUID) TO anon, authenticated;

-- 函数3: 获取学生列表（老师专用）
CREATE OR REPLACE FUNCTION get_my_students()
RETURNS TABLE (
  id UUID,
  username TEXT,
  nickname TEXT,
  gold INT,
  energy INT,
  max_energy INT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.nickname, u.gold, u.energy, u.max_energy, u.created_at
  FROM users u
  WHERE u.role = 'student'
  AND EXISTS (
    SELECT 1 FROM users teacher
    WHERE teacher.id = auth.uid()
    AND teacher.role = 'teacher'
  )
  ORDER BY u.nickname;
END;
$$;

-- 函数3-1: 老师读取任意学生金币记录（显式传入老师ID）
CREATE OR REPLACE FUNCTION get_student_gold_logs(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  teacher_id UUID,
  amount INT,
  reason TEXT,
  balance_after INT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_teacher_id
    AND u.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));

  RETURN QUERY
  SELECT
    gl.id,
    gl.student_id,
    gl.teacher_id,
    gl.amount,
    gl.reason,
    gl.balance_after,
    gl.created_at
  FROM gold_logs gl
  WHERE gl.student_id = p_student_id
  ORDER BY gl.created_at DESC
  LIMIT v_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION get_student_gold_logs(UUID, UUID, INT) TO anon, authenticated;

-- 函数3-2: 老师读取任意学生能量记录（显式传入老师ID）
CREATE OR REPLACE FUNCTION get_student_energy_logs(
  p_teacher_id UUID,
  p_student_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  student_id UUID,
  teacher_id UUID,
  amount INT,
  reason TEXT,
  energy_after INT,
  max_energy_after INT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_limit INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_teacher_id
    AND u.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 20), 200));

  RETURN QUERY
  SELECT
    el.id,
    el.student_id,
    el.teacher_id,
    el.amount,
    el.reason,
    el.energy_after,
    el.max_energy_after,
    el.created_at
  FROM energy_logs el
  WHERE el.student_id = p_student_id
  ORDER BY el.created_at DESC
  LIMIT v_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION get_student_energy_logs(UUID, UUID, INT) TO anon, authenticated;

-- 函数4: 老师发放商店道具奖励
CREATE OR REPLACE FUNCTION grant_item_reward(
  p_teacher_id UUID,
  p_student_id UUID,
  p_item_type TEXT,
  p_item_key TEXT,
  p_quantity INT,
  p_reason TEXT DEFAULT '老师奖励'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_student_nickname TEXT;
  v_reward_id UUID;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_item_type NOT IN ('pokeball', 'potion', 'expPotion', 'evolutionItem') THEN
    RETURN json_build_object('success', false, 'error', '无效的道具类型');
  END IF;

  IF p_item_key IS NULL OR LENGTH(TRIM(p_item_key)) = 0 THEN
    RETURN json_build_object('success', false, 'error', '无效的道具');
  END IF;

  IF p_quantity <= 0 THEN
    RETURN json_build_object('success', false, 'error', '数量必须大于0');
  END IF;

  v_teacher_id := p_teacher_id;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT nickname INTO v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  INSERT INTO teacher_rewards (
    student_id, teacher_id, reward_type, item_type, item_key, quantity, reason
  )
  VALUES (
    p_student_id, v_teacher_id, 'item', p_item_type, p_item_key, p_quantity, p_reason
  )
  RETURNING id INTO v_reward_id;

  RETURN json_build_object(
    'success', true,
    'rewardId', v_reward_id,
    'studentName', v_student_nickname,
    'message', '已给' || v_student_nickname || '发放道具奖励'
  );
END;
$$;

-- 函数5: 老师发放宝可梦奖励
CREATE OR REPLACE FUNCTION grant_pokemon_reward(
  p_teacher_id UUID,
  p_student_id UUID,
  p_pokemon_id INT,
  p_level INT,
  p_reason TEXT DEFAULT '老师奖励'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_student_nickname TEXT;
  v_reward_id UUID;
  v_is_teacher BOOLEAN;
BEGIN
  IF p_pokemon_id IS NULL OR p_pokemon_id <= 0 THEN
    RETURN json_build_object('success', false, 'error', '无效的宝可梦');
  END IF;

  IF p_level < 1 OR p_level > 100 THEN
    RETURN json_build_object('success', false, 'error', '等级必须在1到100之间');
  END IF;

  v_teacher_id := p_teacher_id;

  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = v_teacher_id
    AND role = 'teacher'
  ) INTO v_is_teacher;

  IF NOT v_is_teacher THEN
    RAISE EXCEPTION 'Teacher role required';
  END IF;

  SELECT nickname INTO v_student_nickname
  FROM users
  WHERE id = p_student_id
  AND role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized or student not found';
  END IF;

  INSERT INTO teacher_rewards (
    student_id, teacher_id, reward_type, pokemon_id, pokemon_level, reason
  )
  VALUES (
    p_student_id, v_teacher_id, 'pokemon', p_pokemon_id, p_level, p_reason
  )
  RETURNING id INTO v_reward_id;

  RETURN json_build_object(
    'success', true,
    'rewardId', v_reward_id,
    'studentName', v_student_nickname,
    'message', '已给' || v_student_nickname || '发放宝可梦奖励'
  );
END;
$$;

-- 函数6: 学生开始领取待发奖励，先预留批次，等待前端云存档成功后再确认。
CREATE OR REPLACE FUNCTION begin_teacher_reward_claim(
  p_student_id UUID
)
RETURNS TABLE (
  claim_token UUID,
  reward_id UUID,
  reward_type TEXT,
  item_type TEXT,
  item_key TEXT,
  quantity INT,
  pokemon_id INT,
  pokemon_level INT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id UUID;
  v_claim_token UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_student_id := p_student_id;

  SELECT tr.claim_token
  INTO v_claim_token
  FROM teacher_rewards tr
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token IS NOT NULL
  ORDER BY tr.created_at, tr.id
  LIMIT 1;

  IF v_claim_token IS NULL THEN
    v_claim_token := gen_random_uuid();

    UPDATE teacher_rewards tr
    SET claim_token = v_claim_token,
        claim_reserved_at = NOW()
    WHERE tr.student_id = v_student_id
    AND tr.claimed_at IS NULL
    AND tr.claim_token IS NULL;
  END IF;

  RETURN QUERY
  SELECT
    v_claim_token,
    tr.id AS reward_id,
    tr.reward_type,
    tr.item_type,
    tr.item_key,
    tr.quantity,
    tr.pokemon_id,
    tr.pokemon_level,
    tr.reason,
    tr.created_at
  FROM teacher_rewards tr
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token = v_claim_token
  ORDER BY tr.created_at, tr.id;
END;
$$;

CREATE OR REPLACE FUNCTION confirm_teacher_reward_claim(
  p_student_id UUID,
  p_claim_token UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id UUID;
  v_claimed_count INT := 0;
BEGIN
  IF p_claim_token IS NULL THEN
    RETURN json_build_object('success', false, 'error', '缺少奖励领取批次');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_student_id := p_student_id;

  UPDATE teacher_rewards tr
  SET claimed_at = COALESCE(tr.claimed_at, NOW()),
      claim_token = NULL,
      claim_reserved_at = NULL
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  AND tr.claim_token = p_claim_token;

  GET DIAGNOSTICS v_claimed_count = ROW_COUNT;

  RETURN json_build_object(
    'success', true,
    'claimedCount', v_claimed_count
  );
END;
$$;

-- 函数6: 学生领取待发奖励
CREATE OR REPLACE FUNCTION claim_teacher_rewards(
  p_student_id UUID
)
RETURNS TABLE (
  reward_id UUID,
  reward_type TEXT,
  item_type TEXT,
  item_key TEXT,
  quantity INT,
  pokemon_id INT,
  pokemon_level INT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = p_student_id
    AND u.role = 'student'
  ) THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  v_student_id := p_student_id;

  RETURN QUERY
  UPDATE teacher_rewards tr
  SET claimed_at = NOW()
  WHERE tr.student_id = v_student_id
  AND tr.claimed_at IS NULL
  RETURNING
    tr.id AS reward_id,
    tr.reward_type,
    tr.item_type,
    tr.item_key,
    tr.quantity,
    tr.pokemon_id,
    tr.pokemon_level,
    tr.reason,
    tr.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION begin_teacher_reward_claim(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_teacher_reward_claim(UUID, UUID) TO anon, authenticated;

-- ============================================
-- 完成提示
-- ============================================

-- 执行完成！
-- 下一步：
-- 1. 启动开发服务器: npm run dev
-- 2. 访问: http://localhost:3000
-- 3. 开始注册和测试

NOTIFY pgrst, 'reload schema';
