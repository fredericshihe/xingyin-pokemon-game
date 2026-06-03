import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 应用位置优化方案A ===\n')

// 1. 星音草径NPC: (33,7) → (31,8)
txt = txt.replace(
  /npc_meadow_hermit[^}]+position: \{ x: 33, y: 7 \}/,
  match => match.replace('x: 33, y: 7', 'x: 31, y: 8')
)
console.log('✓ 1. 星音草径NPC: (33,7) → (31,8)')

// 2. 贝壳海岸宝箱: (35,26) → (33,26)
txt = txt.replace(
  /treasure_shore_wreck[^}]+position: \{ x: 35, y: 26 \}/,
  match => match.replace('x: 35, y: 26', 'x: 33, y: 26')
)
console.log('✓ 2. 贝壳海岸宝箱: (35,26) → (33,26)')

// 3. 六角遗迹NPC: (33,13) → (35,12)
txt = txt.replace(
  /npc_hex_researcher[^}]+position: \{ x: 33, y: 13 \}/,
  match => match.replace('x: 33, y: 13', 'x: 35, y: 12')
)
console.log('✓ 3. 六角遗迹NPC: (33,13) → (35,12)')

// 4. 铁木营地防御之石: (16,10) → (14,12)
txt = txt.replace(
  /treasure_ridge_defense[^}]+position: \{ x: 16, y: 10 \}/,
  match => match.replace('x: 16, y: 10', 'x: 14, y: 12')
)
console.log('✓ 4. 铁木营地防御之石: (16,10) → (14,12)')

// 5. 老海盗奖励: 3个 → 2个
txt = txt.replace(
  /npc_shore_pirate[^}]+quantity: 3 \}/,
  match => match.replace('quantity: 3', 'quantity: 2')
)
console.log('✓ 5. 老海盗奖励: 3个究极球 → 2个')

fs.writeFileSync(file, txt)
console.log('\n✓ 位置优化完成')
