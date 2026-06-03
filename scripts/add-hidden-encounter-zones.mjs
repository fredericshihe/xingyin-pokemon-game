import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 为隐藏区域添加稀有遭遇区 ===\n')

// 为每张地图的隐藏区域添加特殊遭遇区
const hiddenZones = [
  {
    map: 'GodotMapV2',
    zone: `{ id: 'meadow_hidden_grove', name: '星音秘境', x: 30, y: 5, width: 8, height: 5, encounterTableId: 'region_meadow_east_5_12', tallGrassRate: 0.32 }`
  },
  {
    map: 'GodotMapV2_MistLake',
    zone: `{ id: 'lake_hidden_path', name: '环湖秘径', x: 26, y: 8, width: 6, height: 8, encounterTableId: 'region_lake_east_11_18', tallGrassRate: 0.30 }`
  },
  {
    map: 'GodotMapV2_PirateShore',
    zone: `{ id: 'shore_wreck_inner', name: '沉船内舱', x: 33, y: 22, width: 5, height: 5, encounterTableId: 'region_shore_wreck_23_30', tallGrassRate: 0.35 }`
  },
  {
    map: 'GodotMapV2_FarmTown',
    zone: `{ id: 'farm_windmill_top', name: '风车塔顶', x: 6, y: 6, width: 5, height: 5, encounterTableId: 'region_farm_17_24', tallGrassRate: 0.28 }`
  },
  {
    map: 'GodotMapV2_Graveyard',
    zone: `{ id: 'grave_deep_forest', name: '墓园深林', x: 10, y: 28, width: 6, height: 4, encounterTableId: 'region_grave_south_29_36', tallGrassRate: 0.35 }`
  }
]

for (const { map, zone } of hiddenZones) {
  // 查找encounterZones并在末尾添加
  const regex = new RegExp(`(${map}[\\s\\S]*?encounterZones: \\[[\\s\\S]*?)(\\n    \\],)`, 'm')
  const match = txt.match(regex)
  if (match) {
    const old = match[0]
    const newText = old.replace(/(\n    \],)/, `,\n      ${zone}\n    ],`)
    txt = txt.replace(old, newText)
    console.log(`✓ ${map} 稀有遭遇区已添加`)
  }
}

fs.writeFileSync(file, txt)
console.log('\n✓ 5张地图的稀有遭遇区已添加')
console.log('注意：这些遭遇区使用现有的encounterTableId，遭遇率略高（0.28-0.35）')
