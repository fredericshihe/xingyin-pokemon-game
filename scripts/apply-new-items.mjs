import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 应用新道具分配方案 ===\n')

// 1. 替换复活草/满复活为厉害伤药（已经在之前完成）
console.log('✓ 复活草/满复活已替换为厉害伤药')

// 2. 月影墓园宝箱：3个厉害伤药 → 1个HP之石
txt = txt.replace(
  /treasure_grave_deep[^}]+properties: \{ itemType: 'super_potion', itemKey: 'super_potion', quantity: 3 \}/,
  match => match.replace("itemType: 'super_potion', itemKey: 'super_potion', quantity: 3", "itemType: 'boost', itemKey: 'hp_stone', quantity: 1")
)
console.log('✓ 月影墓园宝箱: 3个好伤药 → 1个HP之石')

// 3. 六角遗迹宝箱：1个雷之石 → 1个特攻之石
txt = txt.replace(
  /treasure_hex_chamber[^}]+properties: \{ itemType: 'stone', itemKey: 'thunder_stone', quantity: 1 \}/,
  match => match.replace("itemType: 'stone', itemKey: 'thunder_stone'", "itemType: 'boost', itemKey: 'sp_attack_stone'")
)
console.log('✓ 六角遗迹宝箱: 1个雷之石 → 1个特攻之石')

// 4. 铁木营地宝箱：5个究极球 → 1个攻击之石
txt = txt.replace(
  /treasure_ridge_camp[^}]+properties: \{ itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 5 \}/,
  match => match.replace("itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 5", "itemType: 'boost', itemKey: 'attack_stone', quantity: 1")
)
console.log('✓ 铁木营地宝箱: 5个究极球 → 1个攻击之石')

// 5. 铁木营地：新增第二个宝箱（防御之石）
const ridgeEventMatch = txt.match(/(GodotMapV2_SurvivalRidge[\s\S]*?treasure_ridge_camp[^\}]+\})/m)
if (ridgeEventMatch) {
  const ridgeEventOld = ridgeEventMatch[0]
  const ridgeEventNew = ridgeEventOld + `,\n      { id: 'treasure_ridge_defense', type: 'item', position: { x: 16, y: 10 }, properties: { itemType: 'boost', itemKey: 'defense_stone', quantity: 1 } }`
  txt = txt.replace(ridgeEventOld, ridgeEventNew)
  console.log('✓ 铁木营地: 新增防御之石宝箱')
}

// 6. 星雾高地宝箱：3个高级球 → 1个大师球
txt = txt.replace(
  /treasure_highland_secret[^}]+properties: \{ itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 3 \}/,
  match => match.replace("itemKey: 'pokeball_ultra', quantity: 3", "itemKey: 'pokeball_master', quantity: 1")
)
console.log('✓ 星雾高地宝箱: 3个高级球 → 1个大师球')

// 7. 隐居老人NPC：1个叶之石 → 1个速度之石
txt = txt.replace(
  /npc_meadow_hermit[^}]+reward: \{ itemType: 'stone', itemKey: 'leaf_stone', quantity: 1 \}/,
  match => match.replace("itemType: 'stone', itemKey: 'leaf_stone'", "itemType: 'boost', itemKey: 'speed_stone'")
)
console.log('✓ 隐居老人NPC: 1个叶之石 → 1个速度之石')

// 8. 墓园守护者NPC：3个厉害伤药 → 1个特防之石
txt = txt.replace(
  /npc_grave_keeper[^}]+reward: \{ itemType: 'hyper_potion', itemKey: 'hyper_potion', quantity: 2 \}/,
  match => match.replace("itemType: 'hyper_potion', itemKey: 'hyper_potion', quantity: 2", "itemType: 'boost', itemKey: 'sp_defense_stone', quantity: 1")
)
console.log('✓ 墓园守护者NPC: 3个厉害伤药 → 1个特防之石')

// 9. 新增遗迹研究员NPC（神奇糖果）
const hexEventMatch = txt.match(/(GodotMapV2_HexRuins[\s\S]*?treasure_hex_chamber[^\}]+\})/m)
if (hexEventMatch) {
  const hexEventOld = hexEventMatch[0]
  const hexEventNew = hexEventOld + `,\n      { id: 'npc_hex_researcher', type: 'npc', position: { x: 33, y: 13 }, properties: { name: '遗迹研究员', dialogue: '你发现了密室...这是我的研究成果。', reward: { itemType: 'boost', itemKey: 'rare_candy', quantity: 1 } } }`
  txt = txt.replace(hexEventOld, hexEventNew)
  console.log('✓ 六角遗迹: 新增遗迹研究员NPC（神奇糖果）')
}

fs.writeFileSync(file, txt)
console.log('\n✓ 新道具分配方案已应用')
