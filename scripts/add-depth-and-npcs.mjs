import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 添加深度标签和特殊NPC ===\n')

// 为隐藏遭遇区添加depth标签
const depthZones = [
  { id: 'meadow_hidden_grove', depth: 'deep' },
  { id: 'lake_hidden_path', depth: 'deep' },
  { id: 'shore_wreck_inner', depth: 'deep' },
  { id: 'farm_windmill_top', depth: 'deep' },
  { id: 'grave_deep_forest', depth: 'deep' }
]

for (const { id, depth } of depthZones) {
  const regex = new RegExp(`(id: '${id}'[^}]+)(\\})`, 'g')
  txt = txt.replace(regex, `$1, depth: '${depth}' $2`)
}
console.log('✓ 5个隐藏遭遇区已添加depth标签')

// 为隐藏区域添加特殊NPC（提供稀有道具/宝可梦交换）
const npcs = [
  {
    map: 'GodotMapV2',
    npc: `{ id: 'npc_meadow_hermit', type: 'npc', position: { x: 33, y: 7 }, properties: { name: '隐居老人', dialogue: '你找到了这片秘境...这是给你的奖励。', reward: { itemType: 'stone', itemKey: 'leaf_stone', quantity: 1 } } }`
  },
  {
    map: 'GodotMapV2_PirateShore',
    npc: `{ id: 'npc_shore_pirate', type: 'npc', position: { x: 35, y: 25 }, properties: { name: '老海盗', dialogue: '沉船的宝藏...都是你的了。', reward: { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 3 } } }`
  },
  {
    map: 'GodotMapV2_Graveyard',
    npc: `{ id: 'npc_grave_keeper', type: 'npc', position: { x: 12, y: 29 }, properties: { name: '墓园守护者', dialogue: '能找到这里的人不多...', reward: { itemType: 'revive', itemKey: 'revive_max', quantity: 2 } } }`
  }
]

for (const { map, npc } of npcs) {
  // 在runtimeEvents中添加NPC
  const regex = new RegExp(`(${map}[\\s\\S]*?runtimeEvents: \\[[\\s\\S]*?)(\\n    \\],)`, 'm')
  const match = txt.match(regex)
  if (match) {
    const old = match[0]
    const newText = old.replace(/(\n    \],)/, `,\n      ${npc}\n    ],`)
    txt = txt.replace(old, newText)
    console.log(`✓ ${map} 特殊NPC已添加`)
  }
}

fs.writeFileSync(file, txt)
console.log('\n✓ 深度标签和特殊NPC已添加')
console.log('注意：depth标签已添加，但需要在遭遇系统中实现差异化逻辑（可选）')
