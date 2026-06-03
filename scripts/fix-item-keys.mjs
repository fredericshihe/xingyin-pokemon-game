import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 修正道具key命名 ===\n')

// 修正映射表
const fixes = [
  // potion类
  { wrong: "itemKey: 'potion_super'", correct: "itemKey: 'super_potion'" },
  { wrong: "itemKey: 'potion_hyper'", correct: "itemKey: 'hyper_potion'" },
  
  // pokeball类 - 这些是正确的，无需修改
  // pokeball_great, pokeball_ultra, pokeball_master 都是正确的
  
  // revive类 - 需要检查
  { wrong: "itemKey: 'revive_max'", correct: "itemKey: 'max_revive'" },
  
  // stone类 - 这些是正确的
  // thunder_stone, leaf_stone 都是正确的
]

let fixCount = 0
for (const { wrong, correct } of fixes) {
  const count = (txt.match(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  if (count > 0) {
    txt = txt.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), correct)
    console.log(`✓ 修正: ${wrong} → ${correct} (${count}处)`)
    fixCount += count
  }
}

// 检查是否还有其他需要修正的
const potentialIssues = [
  txt.match(/itemKey: 'potion_\w+'/g),
  txt.match(/itemKey: 'revive_\w+'/g)
].filter(Boolean).flat()

if (potentialIssues.length > 0) {
  console.log('\n⚠️ 发现可能的问题:')
  for (const issue of potentialIssues) {
    console.log(`  ${issue}`)
  }
}

fs.writeFileSync(file, txt)
console.log(`\n✓ 共修正 ${fixCount} 处道具key`)

// 验证修正后的道具
console.log('\n=== 验证修正后的道具 ===')
const items = [
  ...txt.matchAll(/itemKey: '([^']+)'/g)
].map(m => m[1])

const uniqueItems = [...new Set(items)]
console.log(`使用的道具类型: ${uniqueItems.length}种`)
console.log(uniqueItems.join(', '))
