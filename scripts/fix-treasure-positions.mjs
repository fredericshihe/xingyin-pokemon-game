import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 宝箱位置隐蔽性优化 ===\n')
console.log('原则: 偏离路径1-2格，靠近边缘/角落\n')

// 1. 星音草径: (33,6) → (35,6) 更靠近边缘
txt = txt.replace(
  /treasure_meadow_hidden[^}]+position: \{ x: 33, y: 6 \}/,
  match => match.replace('x: 33, y: 6', 'x: 35, y: 6')
)
console.log('✓ 星音草径: (33,6) → (35,6) - 靠近东边缘')

// 2. 雾湖苇岸: (28,10) → (29,9) 偏离路径
txt = txt.replace(
  /treasure_lake_hidden[^}]+position: \{ x: 28, y: 10 \}/,
  match => match.replace('x: 28, y: 10', 'x: 29, y: 9')
)
console.log('✓ 雾湖苇岸: (28,10) → (29,9) - 偏离路径')

// 3. 贝壳海岸: (33,26) → (34,27) 更隐蔽
txt = txt.replace(
  /treasure_shore_wreck[^}]+position: \{ x: 33, y: 26 \}/,
  match => match.replace('x: 33, y: 26', 'x: 34, y: 27')
)
console.log('✓ 贝壳海岸: (33,26) → (34,27) - 沉船角落')

// 4. 风车农庄: (8,8) → (7,7) 更靠近角落
txt = txt.replace(
  /treasure_farm_windmill[^}]+position: \{ x: 8, y: 8 \}/,
  match => match.replace('x: 8, y: 8', 'x: 7, y: 7')
)
console.log('✓ 风车农庄: (8,8) → (7,7) - 西北角落')

// 5. 铁木营地攻击之石: (16,12) → (17,11) 偏离路径
txt = txt.replace(
  /treasure_ridge_camp[^}]+position: \{ x: 16, y: 12 \}/,
  match => match.replace('x: 16, y: 12', 'x: 17, y: 11')
)
console.log('✓ 铁木营地攻击: (16,12) → (17,11) - 偏离路径')

// 6. 铁木营地防御之石: (14,12) → (13,11) 更隐蔽
txt = txt.replace(
  /treasure_ridge_defense[^}]+position: \{ x: 14, y: 12 \}/,
  match => match.replace('x: 14, y: 12', 'x: 13, y: 11')
)
console.log('✓ 铁木营地防御: (14,12) → (13,11) - 更隐蔽')

// 7. 星雾高地: (35,10) → (36,9) 靠近边缘
txt = txt.replace(
  /treasure_highland_secret[^}]+position: \{ x: 35, y: 10 \}/,
  match => match.replace('x: 35, y: 10', 'x: 36, y: 9')
)
console.log('✓ 星雾高地: (35,10) → (36,9) - 靠近边缘')

// 月影墓园和六角遗迹位置合理，保持不变
console.log('✓ 月影墓园: (12,30) - 保持（边缘位置合理）')
console.log('✓ 六角遗迹: (33,12) - 保持（密室位置合理）')

fs.writeFileSync(file, txt)
console.log('\n✓ 宝箱位置优化完成')
console.log('\n效果预期:')
console.log('- 宝箱不在主路上，需要"偏离路径"才能发现')
console.log('- 靠近边缘/角落，增加"探索到底"的感觉')
console.log('- 隐蔽性提升，但仍可通过隐藏支路到达')
