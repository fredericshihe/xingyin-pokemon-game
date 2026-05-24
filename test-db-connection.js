import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://waesizzoqodntrlvrwhw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhZXNpenpvcW9kbnRybHZyd2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MjIyOTYsImV4cCI6MjA3MzM5ODI5Nn0.kE5gSV68q1nLo4z2IqgwqfTBVqNOJw5qs08f6r0SQH0'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testConnection() {
  console.log('🔍 测试数据库连接...\n')

  // 测试 users 表
  console.log('1. 检查 users 表...')
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .limit(1)

  if (usersError) {
    console.log('❌ users 表不存在或无法访问:', usersError.message)
  } else {
    console.log('✅ users 表存在')
  }

  // 测试 game_saves 表
  console.log('\n2. 检查 game_saves 表...')
  const { data: saves, error: savesError } = await supabase
    .from('game_saves')
    .select('*')
    .limit(1)

  if (savesError) {
    console.log('❌ game_saves 表不存在或无法访问:', savesError.message)
  } else {
    console.log('✅ game_saves 表存在')
  }

  // 测试 gold_logs 表
  console.log('\n3. 检查 gold_logs 表...')
  const { data: logs, error: logsError } = await supabase
    .from('gold_logs')
    .select('*')
    .limit(1)

  if (logsError) {
    console.log('❌ gold_logs 表不存在或无法访问:', logsError.message)
  } else {
    console.log('✅ gold_logs 表存在')
  }

  console.log('\n' + '='.repeat(50))

  if (!usersError && !savesError && !logsError) {
    console.log('✅ 所有数据库表都已正确创建！')
  } else {
    console.log('⚠️  部分表缺失，请在 Supabase Dashboard 中执行 supabase-setup.sql')
    console.log('📝 访问: https://supabase.com/dashboard/project/waesizzoqodntrlvrwhw/editor')
  }
}

testConnection()
