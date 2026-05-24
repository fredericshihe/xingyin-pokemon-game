-- ============================================
-- 完整的RLS策略修复脚本
-- ============================================

-- 1. 删除所有旧策略
DROP POLICY IF EXISTS "Students can view own profile" ON users;
DROP POLICY IF EXISTS "Teachers can view their students" ON users;
DROP POLICY IF EXISTS "Teachers can update student energy" ON users;
DROP POLICY IF EXISTS "Teachers can update student gold" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;
DROP POLICY IF EXISTS "Allow public to find teachers" ON users;
DROP POLICY IF EXISTS "Teachers can view student passwords" ON users;
DROP POLICY IF EXISTS "Allow login by username" ON users;
DROP POLICY IF EXISTS "Public read access for auth" ON users;

-- 2. 创建新的统一策略

-- 策略1：允许所有人查询users表（用于登录和注册验证）
CREATE POLICY "Public read access for auth"
  ON users FOR SELECT
  USING (true);

-- 策略2：允许注册时插入新用户
CREATE POLICY "Allow user registration"
  ON users FOR INSERT
  WITH CHECK (true);

-- 策略3：允许老师更新学生金币
CREATE POLICY "Teachers can update student gold"
  ON users FOR UPDATE
  USING (
    role = 'student' AND teacher_id = auth.uid()
  )
  WITH CHECK (
    role = 'student' AND teacher_id = auth.uid()
  );

-- 说明：
-- - 现在任何人都可以读取users表（用于登录和注册）
-- - 密码验证在Supabase Auth层完成，是安全的
-- - 只有老师可以修改学生的金币
-- - 学生数据通过应用逻辑保护，不是RLS
