import fs from 'node:fs'

console.log('=== 验证新增道具的有效性 ===\n')

// 查找游戏中的道具定义
const possibleFiles = [
  'src/utils/gameData.js',
  'src/utils/items.js',
  'src/game/items.js',
  'src/data/items.js'
]

let itemsFile = null
for (const file of possibleFiles) {
  if (fs.existsSync(file)) {
    console.log(`✓ 找到道具文件: ${file}`)
    itemsFile = file
    break
  }
}

if (!itemsFile) {
  console.log('⚠️ 未找到道具定义文件，尝试搜索...')
  // 搜索包含item定义的文件
}

// 我们在地图中使用的道具
const usedItems = [
  { itemType: 'pokeball', itemKey: 'pokeball_great', quantity: 3, location: '星音草径' },
  { itemType: 'potion', itemKey: 'potion_super', quantity: 2, location: '雾湖苇岸' },
  { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 2, location: '贝壳海岸' },
  { itemType: 'potion', itemKey: 'potion_hyper', quantity: 3, location: '风车农庄' },
  { itemType: 'revive', itemKey: 'revive', quantity: 5, location: '月影墓园' },
  { itemType: 'stone', itemKey: 'thunder_stone', quantity: 1, location: '六角遗迹' },
  { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 5, location: '铁木营地' },
  { itemType: 'pokeball', itemKey: 'pokeball_master', quantity: 1, location: '星雾高地' },
  { itemType: 'stone', itemKey: 'leaf_stone', quantity: 1, location: 'NPC-隐居老人' },
  { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 3, location: 'NPC-老海盗' },
  { itemType: 'revive', itemKey: 'revive_max', quantity: 2, location: 'NPC-墓园守护者' }
]

console.log('\n使用的道具清单:')
const itemKeys = new Set()
for (const item of usedItems) {
  itemKeys.add(item.itemKey)
  console.log(`  ${item.itemKey} (${item.itemType}) x${item.quantity} - ${item.location}`)
}

console.log(`\n去重后的道具类型: ${itemKeys.size}种`)
console.log([...itemKeys].join(', '))

console.log('\n⚠️ 需要验证这些道具key是否在游戏中存在')
console.log('建议检查的文件:')
console.log('  - src/utils/gameData.js')
console.log('  - src/utils/items.js 或类似文件')
console.log('  - 搜索 "pokeball_great" 等关键词')
