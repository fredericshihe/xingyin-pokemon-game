import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 替换不存在的道具 ===\n')

// 替换方案
const replacements = [
  {
    old: "itemKey: 'pokeball_master'",
    new: "itemKey: 'pokeball_ultra'",
    reason: '大师球不存在 → 替换为高级球（数量改为3）'
  },
  {
    old: "itemKey: 'revive'",
    new: "itemKey: 'super_potion'",
    reason: '复活草不存在 → 替换为好伤药'
  },
  {
    old: "itemKey: 'max_revive'",
    new: "itemKey: 'hyper_potion'",
    reason: '满复活不存在 → 替换为厉害伤药'
  }
]

for (const { old, new: newKey, reason } of replacements) {
  const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
  const count = (txt.match(regex) || []).length
  if (count > 0) {
    txt = txt.replace(regex, newKey)
    console.log(`✓ ${reason} (${count}处)`)
  }
}

// 特殊处理：大师球数量从1改为3
txt = txt.replace(
  /treasure_highland_secret[^}]+pokeball_ultra', quantity: 1/,
  match => match.replace('quantity: 1', 'quantity: 3')
)
console.log('✓ 星雾高地宝箱数量调整: 1个 → 3个高级球')

// 特殊处理：墓园宝箱数量从5改为3
txt = txt.replace(
  /treasure_grave_deep[^}]+super_potion', quantity: 5/,
  match => match.replace('quantity: 5', 'quantity: 3')
)
console.log('✓ 月影墓园宝箱数量调整: 5个 → 3个好伤药')

fs.writeFileSync(file, txt)
console.log('\n✓ 道具替换完成')

// 最终验证
console.log('\n=== 最终道具清单 ===')
const items = [...txt.matchAll(/itemKey: '([^']+)'/g)].map(m => m[1])
const uniqueItems = [...new Set(items)]
console.log('使用的道具类型:')
for (const item of uniqueItems) {
  const count = items.filter(i => i === item).length
  console.log(`  ${item.padEnd(20)} - 使用${count}次`)
}
