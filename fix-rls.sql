-- 添加一个公共查询策略，允许查找老师用户名
-- 这样学生注册时可以验证老师是否存在

-- 删除旧策略
DROP POLICY IF EXISTS "Allow public to find teachers" ON users;

-- 添加新策略：允许任何人查询老师的基本信息（仅用于注册验证）
CREATE POLICY "Allow public to find teachers"
  ON users FOR SELECT
  USING (role = 'teacher');

-- 说明：这个策略允许任何人查询role='teacher'的用户
-- 这样学生注册时可以验证老师用户名是否存在
-- 但只能看到老师的信息，看不到其他学生的信息
