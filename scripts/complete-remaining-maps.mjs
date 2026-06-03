import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 批量优化剩余3张地图 ===\n')

// 为月影墓园添加视觉线索（之前漏了）
const graveDecoMatch = txt.match(/(decorativeObjects: \[\s*\/\/ 墓园[\s\S]*?\],\s*scatter:)/m)
if (graveDecoMatch) {
  const graveDecoOld = graveDecoMatch[0]
  const graveDecoNew = graveDecoOld.replace(
    /(\],\s*scatter:)/,
    `,\n      // 新增：墓园深处视觉线索\n      themeLandmark('grave_lantern_glass', 16, 28, { scale: 1.5 }),  // 灯笼标记入口\n      themeLandmark('grave_stone_wall_damaged', 12, 30, { scale: 2.0 })  // 墓碑标记深处\n    ],\n    scatter:`
  )
  txt = txt.replace(graveDecoOld, graveDecoNew)
  console.log('✓ 月影墓园视觉线索已添加')
}

// 六角遗迹：添加隐藏支路、宝箱、视觉线索
// 查找roadPaths并添加隐藏支路
const hexRoadMatch = txt.match(/(GodotMapV2_HexRuins[\s\S]*?roadPaths: \[[\s\S]*?\n    \],)/m)
if (hexRoadMatch) {
  const hexRoadOld = hexRoadMatch[0]
  const hexRoadNew = hexRoadOld.replace(
    /(\n    \],)/,
    `,\n      // 新增：隐藏支路通往遗迹密室\n      { points: [[28, 16], [33, 16], [33, 12]], width: 1.5 }\n    ],`
  )
  txt = txt.replace(hexRoadOld, hexRoadNew)
  console.log('✓ 六角遗迹隐藏支路已添加')
}

// 六角遗迹：添加宝箱
const hexEventMatch = txt.match(/(GodotMapV2_HexRuins[\s\S]*?runtimeEvents: \[[\s\S]*?sign\([^\)]+\))/m)
if (hexEventMatch) {
  const hexEventOld = hexEventMatch[0]
  const hexEventNew = hexEventOld + `,\n      // 新增：遗迹密室宝箱\n      { id: 'treasure_hex_chamber', type: 'item', position: { x: 33, y: 12 }, properties: { itemType: 'stone', itemKey: 'thunder_stone', quantity: 1 } }`
  txt = txt.replace(hexEventOld, hexEventNew)
  console.log('✓ 六角遗迹宝箱已添加')
}

// 铁木营地：添加隐藏支路、宝箱
const ridgeRoadMatch = txt.match(/(GodotMapV2_SurvivalRidge[\s\S]*?roadPaths: \[[\s\S]*?\n    \],)/m)
if (ridgeRoadMatch) {
  const ridgeRoadOld = ridgeRoadMatch[0]
  const ridgeRoadNew = ridgeRoadOld.replace(
    /(\n    \],)/,
    `,\n      // 新增：隐藏支路通往营地深处\n      { points: [[20, 16], [20, 12], [16, 12]], width: 1.5 }\n    ],`
  )
  txt = txt.replace(ridgeRoadOld, ridgeRoadNew)
  console.log('✓ 铁木营地隐藏支路已添加')
}

const ridgeEventMatch = txt.match(/(GodotMapV2_SurvivalRidge[\s\S]*?runtimeEvents: \[[\s\S]*?sign\([^\)]+\))/m)
if (ridgeEventMatch) {
  const ridgeEventOld = ridgeEventMatch[0]
  const ridgeEventNew = ridgeEventOld + `,\n      // 新增：营地深处宝箱\n      { id: 'treasure_ridge_camp', type: 'item', position: { x: 16, y: 12 }, properties: { itemType: 'pokeball', itemKey: 'pokeball_ultra', quantity: 5 } }`
  txt = txt.replace(ridgeEventOld, ridgeEventNew)
  console.log('✓ 铁木营地宝箱已添加')
}

// 星雾高地：添加隐藏支路、宝箱
const highlandRoadMatch = txt.match(/(GodotMapV2_BossHighland[\s\S]*?roadPaths: \[[\s\S]*?\n    \],)/m)
if (highlandRoadMatch) {
  const highlandRoadOld = highlandRoadMatch[0]
  const highlandRoadNew = highlandRoadOld.replace(
    /(\n    \],)/,
    `,\n      // 新增：隐藏支路通往高地秘境\n      { points: [[28, 16], [35, 16], [35, 10]], width: 1.5 }\n    ],`
  )
  txt = txt.replace(highlandRoadOld, highlandRoadNew)
  console.log('✓ 星雾高地隐藏支路已添加')
}

const highlandEventMatch = txt.match(/(GodotMapV2_BossHighland[\s\S]*?runtimeEvents: \[[\s\S]*?sign\([^\)]+\))/m)
if (highlandEventMatch) {
  const highlandEventOld = highlandEventMatch[0]
  const highlandEventNew = highlandEventOld + `,\n      // 新增：高地秘境宝箱（终极奖励）\n      { id: 'treasure_highland_secret', type: 'item', position: { x: 35, y: 10 }, properties: { itemType: 'pokeball', itemKey: 'pokeball_master', quantity: 1 } }`
  txt = txt.replace(highlandEventOld, highlandEventNew)
  console.log('✓ 星雾高地宝箱已添加（大师球）')
}

fs.writeFileSync(file, txt)
console.log('\n✓ 剩余3张地图优化完成')
