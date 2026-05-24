-- 为users表添加明文密码字段（用于老师查看和帮助学生找回密码）
ALTER TABLE users ADD COLUMN IF NOT EXISTS plain_password TEXT;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_plain_password ON users(plain_password);

-- 更新RLS策略：允许老师查看学生的密码
DROP POLICY IF EXISTS "Teachers can view student passwords" ON users;

CREATE POLICY "Teachers can view student passwords"
  ON users FOR SELECT
  USING (
    role = 'student' AND teacher_id = auth.uid()
  );

-- 说明：现在老师可以在管理后台看到学生的密码
