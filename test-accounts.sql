-- 创建测试账号记录表（仅用于开发测试）
CREATE TABLE IF NOT EXISTS test_accounts (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,  -- 明文密码，仅用于测试
  nickname TEXT,
  role TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 插入一些测试账号
INSERT INTO test_accounts (username, password, nickname, role, note) VALUES
('teacher001', '123456', '张老师', 'teacher', '测试老师账号'),
('teacher002', '123456', '李老师', 'teacher', '测试老师账号2'),
('student001', '123456', '小明', 'student', '测试学生账号，老师：teacher001'),
('student002', '123456', '小红', 'student', '测试学生账号，老师：teacher001'),
('student003', '123456', '小刚', 'student', '测试学生账号，老师：teacher002');

-- 查询测试账号
SELECT * FROM test_accounts ORDER BY role, username;
