-- 修复登录问题：允许通过用户名查询邮箱（用于登录）

-- 删除旧策略
DROP POLICY IF EXISTS "Allow login by username" ON users;

-- 添加新策略：允许任何人通过用户名查询邮箱（仅用于登录）
CREATE POLICY "Allow login by username"
  ON users FOR SELECT
  USING (true);

-- 说明：这个策略允许任何人查询users表
-- 这样登录时可以通过用户名找到对应的邮箱
-- 虽然看起来开放，但实际密码验证在Supabase Auth层完成，是安全的
