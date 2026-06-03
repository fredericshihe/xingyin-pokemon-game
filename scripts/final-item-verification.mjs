import fs from 'node:fs'

console.log('=== 最终道具验证 ===\n')

// 读取gameData.js查找道具定义
const gameData = fs.readFileSync('src/utils/gameData.js', 'utf-8')

// 我们使用的道具
const usedItems = [
  'pokeball_great',
  'pokeball_ultra', 
  'pokeball_master',
  'super_potion',
  'hyper_potion',
  'revive',
  'max_revive',
  'thunder_stone',
  'leaf_stone'
]

console.log('验证道具是否存在于gameData.js:\n')

let allValid = true
for (const item of usedItems) {
  // 搜索道具定义
  const regex = new RegExp(`${item}:\\s*\\{`, 'i')
  const exists = regex.test(gameData)
  
  if (exists) {
    // 提取道具名称
    const nameMatch = gameData.match(new RegExp(`${item}:\\s*\\{[^}]*name:\\s*'([^']+)'`, 'i'))
    const name = nameMatch ? nameMatch[1] : '?'
    console.log(`✓ ${item.padEnd(20)} - ${name}`)
  } else {
    console.log(`✗ ${item.padEnd(20)} - 未找到定义！`)
    allValid = false
  }
}

if (allValid) {
  console.log('\n✅ 所有道具都在游戏中存在，可以正常使用')
} else {
  console.log('\n❌ 部分道具不存在，需要修正')
}

// 检查是否有pokeball_master
if (!gameData.includes('pokeball_master')) {
  console.log('\n⚠️ 警告: pokeball_master (大师球) 未在gameData.js中定义')
  console.log('建议: 添加大师球定义或替换为其他道具')
}

// 检查是否有max_revive
if (!gameData.includes('max_revive')) {
  console.log('\n⚠️ 警告: max_revive (满复活) 未在gameData.js中定义')
  console.log('建议: 添加满复活定义或替换为revive')
}
