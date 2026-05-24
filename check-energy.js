import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://waesizzoqodntrlvrwhw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhZXNpenpvcW9kbnRybHZyd2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MjIyOTYsImV4cCI6MjA3MzM5ODI5Nn0.kE5gSV68q1nLo4z2IqgwqfTBVqNOJw5qs08f6r0SQH0'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkEnergy() {
  console.log('🔍 检查所有用户的能量...\n')

  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.log('❌ 查询失败:', error.message)
    return
  }

  if (!users || users.length === 0) {
    console.log('⚠️  没有找到任何用户')
    return
  }

  console.log('用户列表：\n')
  users.forEach(user => {
    const energyStatus = user.energy >= 10 ? '✅' : '⚠️ '
    console.log(`${energyStatus} ${user.role === 'teacher' ? '👨‍🏫' : '👨‍🎓'} ${user.username} (${user.nickname || '无昵称'})`)
    console.log(`   能量: ${user.energy} ${user.energy < 10 ? '❌ 不足以战斗（需要10）' : ''}`)
    console.log(`   角色: ${user.role}`)
    if (user.role === 'student') {
      console.log(`   老师ID: ${user.teacher_id || '未关联'}`)
    }
    console.log('')
  })

  // 检查是否有能量不足的学生
  const lowEnergyStudents = users.filter(u => u.role === 'student' && u.energy < 10)
  if (lowEnergyStudents.length > 0) {
    console.log('=' .repeat(50))
    console.log('⚠️  发现能量不足的学生：')
    lowEnergyStudents.forEach(student => {
      console.log(`   - ${student.username}: ${student.energy} 能量`)
    })
    console.log('\n💡 解决方案：')
    console.log('   1. 使用老师账号登录')
    console.log('   2. 在老师后台给学生发放能量')
    console.log('   3. 或者运行以下命令直接添加能量：')
    console.log(`   node add-energy.js ${lowEnergyStudents[0].username} 100`)
  }
}

checkEnergy()
