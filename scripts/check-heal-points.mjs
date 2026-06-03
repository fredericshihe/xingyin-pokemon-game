import fs from 'node:fs'

console.log('=== 治疗点（泉水）样式检查 ===\n')

const maps = fs.readFileSync('src/game/data/godotMaps/godot_region_maps.js', 'utf-8')

// 提取所有治疗点
const healPoints = [...maps.matchAll(/heal\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\)/g)]

console.log('## 当前所有治疗点:\n')

const healData = []
for (const [full, id, x, y, name] of healPoints) {
  healData.push({ id, x, y, name })
  console.log(`${name}`)
  console.log(`  ID: ${id}`)
  console.log(`  位置: (${x}, ${y})`)
  console.log(`  配置: heal('${id}', ${x}, ${y}, '${name}')`)
  console.log()
}

console.log(`\n总计: ${healData.length}个治疗点\n`)

console.log('## 样式统一性检查\n')

console.log('### 命名规范检查:')
const namingIssues = []
for (const h of healData) {
  if (h.name.includes('（隐藏）')) {
    namingIssues.push(`${h.name} - 包含"（隐藏）"标记`)
  }
}

if (namingIssues.length > 0) {
  console.log('⚠️ 发现命名不统一:')
  for (const issue of namingIssues) {
    console.log(`  - ${issue}`)
  }
  console.log('\n建议: 移除"（隐藏）"标记，保持命名简洁统一')
} else {
  console.log('✓ 命名规范统一')
}

console.log('\n### ID命名规范检查:')
const idPattern = /^heal_\w+_spring$/
const idIssues = []
for (const h of healData) {
  if (!idPattern.test(h.id)) {
    idIssues.push(`${h.id} - 不符合heal_xxx_spring格式`)
  }
}

if (idIssues.length > 0) {
  console.log('⚠️ 发现ID命名不统一:')
  for (const issue of idIssues) {
    console.log(`  - ${issue}`)
  }
} else {
  console.log('✓ ID命名规范统一')
}

console.log('\n## 建议的统一格式\n')
console.log('标准格式: heal(\'heal_<map>_spring\', x, y, \'<地图名>泉水\')')
console.log('\n示例:')
console.log('  heal(\'heal_meadow_spring\', 33, 8, \'星音泉水\')')
console.log('  heal(\'heal_lake_spring\', 28, 23, \'雾湖泉水\')')
console.log('  heal(\'heal_shore_spring\', 35, 24, \'海岸泉水\')')
console.log('\n注意: 不要添加"（隐藏）"等额外标记')
