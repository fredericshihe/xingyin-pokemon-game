# 数据库设置检查清单

## Supabase CLI 连接说明

本项目的 `supabase db push` 需要走 pooler 连接，不能直接裸跑。详细原因、恢复步骤和验证命令见：

- `SUPABASE_DB_PUSH_RUNBOOK.md`

## 执行步骤

### 1. 访问Supabase SQL Editor
- URL: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/sql
- 或者：Dashboard → 左侧菜单 → SQL Editor

### 2. 执行SQL脚本
- 点击 "New query"
- 复制 `supabase-setup.sql` 的全部内容
- 粘贴到编辑器
- 点击 "Run" 或按 Ctrl+Enter

### 3. 验证表是否创建成功
执行以下查询验证：

```sql
-- 检查表是否存在
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'game_saves', 'gold_logs', 'teacher_rewards');

-- 应该返回4行：users, game_saves, gold_logs, teacher_rewards
```

### 4. 验证函数是否创建成功
执行以下查询验证：

```sql
-- 检查函数是否存在
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('adjust_gold', 'grant_gold', 'get_my_students', 'grant_item_reward', 'grant_pokemon_reward', 'claim_teacher_rewards');

-- 应该返回6行：adjust_gold, grant_gold, get_my_students, grant_item_reward, grant_pokemon_reward, claim_teacher_rewards
```

### 5. 验证RLS策略是否启用
执行以下查询验证：

```sql
-- 检查RLS是否启用
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'game_saves', 'gold_logs', 'teacher_rewards');

-- 所有表的 rowsecurity 应该都是 true
```

## 如果执行失败

### 错误1: "permission denied"
- 确保你是项目的所有者或管理员
- 在 Settings → Database → Connection string 中确认权限

### 错误2: "already exists"
- 表或函数已经存在，可以忽略
- 或者先删除再重新创建：
```sql
DROP TABLE IF EXISTS gold_logs CASCADE;
DROP TABLE IF EXISTS teacher_rewards CASCADE;
DROP TABLE IF EXISTS game_saves CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS adjust_gold;
DROP FUNCTION IF EXISTS grant_gold;
DROP FUNCTION IF EXISTS grant_item_reward;
DROP FUNCTION IF EXISTS grant_pokemon_reward;
DROP FUNCTION IF EXISTS claim_teacher_rewards;
DROP FUNCTION IF EXISTS get_my_students;
```

### 错误3: "uuid_generate_v4 does not exist"
- 需要启用 uuid-ossp 扩展：
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

## 完成后

✅ 所有表创建成功  
✅ 所有函数创建成功  
✅ RLS策略已启用  

可以继续启动开发服务器：
```bash
npm run dev
```
