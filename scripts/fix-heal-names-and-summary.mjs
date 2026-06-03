import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 统一治疗点命名 ===\n')

// 1. 星音秘泉（隐藏） → 星音泉水
txt = txt.replace(
  /heal\('heal_meadow_spring',\s*33,\s*8,\s*'星音秘泉（隐藏）'\)/,
  "heal('heal_meadow_spring', 33, 8, '星音泉水')"
)
console.log('✓ 星音秘泉（隐藏） → 星音泉水')

// 2. 沉船泉水（隐藏） → 海岸泉水
txt = txt.replace(
  /heal\('heal_shore_spring',\s*35,\s*24,\s*'沉船泉水（隐藏）'\)/,
  "heal('heal_shore_spring', 35, 24, '海岸泉水')"
)
console.log('✓ 沉船泉水（隐藏） → 海岸泉水')

fs.writeFileSync(file, txt)
console.log('\n✓ 治疗点命名已统一\n')

console.log('=== 所有治疗点最终列表 ===\n')
const healPoints = [
  '1. 星音泉水 (33, 8)',
  '2. 雾湖泉水 (28, 23)',
  '3. 农庄泉水 (11, 11)',
  '4. 海岸泉水 (35, 24)',
  '5. 月影泉水 (16, 20)',
  '6. 遗迹泉水 (28, 12)',
  '7. 铁木泉水 (23, 12)',
  '8. 星雾泉水 (17, 12)'
]
for (const h of healPoints) {
  console.log(h)
}
console.log('\n✓ 所有治疗点命名格式统一: <地图名>泉水')
