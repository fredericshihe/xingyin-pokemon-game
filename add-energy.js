import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://waesizzoqodntrlvrwhw.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhZXNpenpvcW9kbnRybHZyd2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4MjIyOTYsImV4cCI6MjA3MzM5ODI5Nn0.kE5gSV68q1nLo4z2IqgwqfTBVqNOJw5qs08f6r0SQH0'

const supabase = createClient(supabaseUrl, supabaseKey)

async function addEnergy(username, amount) {
  if (!username || !amount) {
    console.log('用法: node add-energy.js <用户名> <能量数量>')
    console.log('例如: node add-energy.js student001 100')
    return
  }

  const energyAmount = parseInt(amount)
  if (isNaN(energyAmount) || energyAmount <= 0) {
    console.log('❌ 能量数量必须是正整数')
    return
  }

  console.log(`🔍 查找用户: ${username}...`)

  // 查找用户
  const { data: user, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single()

  if (findError || !user) {
    console.log(`❌ 找不到用户: ${username}`)
    return
  }

  console.log(`✅ 找到用户: ${user.nickname || user.username} (当前能量: ${user.energy})`)

  // 更新能量
  const newEnergy = user.energy + energyAmount
  const { error: updateError } = await supabase
    .from('users')
    .update({ energy: newEnergy })
    .eq('id', user.id)

  if (updateError) {
    console.log('❌ 更新失败:', updateError.message)
    return
  }

  console.log(`✅ 成功添加 ${energyAmount} 能量！`)
  console.log(`   ${user.energy} → ${newEnergy}`)
  console.log('\n💡 提示: 刷新浏览器页面查看更新后的能量')
}

const username = process.argv[2]
const amount = process.argv[3]

addEnergy(username, amount)
