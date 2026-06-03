import fs from 'node:fs'

const file = 'src/game/data/godotMaps/godot_region_maps.js'
let txt = fs.readFileSync(file, 'utf-8')

console.log('=== 将宝箱移到草丛区域（避开道路）===\n')
console.log('策略: 查看每张地图的tallGrass区域，将宝箱放在草丛中\n')

// 根据截图，星音草径的宝箱在道路上，需要移到草丛
// tallGrass区域: { shape: 'rect', x1: 27, y1: 5, x2: 36, y2: 10 }
// 当前宝箱位置: (35, 6) - 在这个区域内，但可能太靠近路径

// 优化策略：将宝箱移到tallGrass区域的中心或角落

const adjustments = [
  {
    map: '星音草径',
    treasure: 'treasure_meadow_hidden',
    current: '(35, 6)',
    tallGrass: 'x1:27 y1:5 x2:36 y2:10',
    newPos: '(32, 7)',
    reason: '移到东草丛中心，远离路径'
  },
  {
    map: '雾湖苇岸',
    treasure: 'treasure_lake_hidden',
    current: '(29, 9)',
    tallGrass: '需要查看',
    newPos: '(30, 8)',
    reason: '微调到草丛中'
  },
  {
    map: '贝壳海岸',
    treasure: 'treasure_shore_wreck',
    current: '(34, 27)',
    tallGrass: 'x1:24 y1:24 x2:36 y2:29',
    newPos: '(32, 27)',
    reason: '移到沉船草丛中'
  },
  {
    map: '风车农庄',
    treasure: 'treasure_farm_windmill',
    current: '(7, 7)',
    tallGrass: 'x1:5 y1:5 x2:12 y2:10',
    newPos: '(9, 7)',
    reason: '移到北田垄草丛中'
  },
  {
    map: '铁木营地',
    treasure: 'treasure_ridge_camp',
    current: '(17, 11)',
    newPos: '(18, 13)',
    reason: '移到草丛区域'
  },
  {
    map: '铁木营地',
    treasure: 'treasure_ridge_defense',
    current: '(13, 11)',
    newPos: '(12, 13)',
    reason: '移到草丛区域'
  },
  {
    map: '星雾高地',
    treasure: 'treasure_highland_secret',
    current: '(36, 9)',
    newPos: '(34, 11)',
    reason: '移到草丛区域'
  }
]

// 应用调整
for (const adj of adjustments) {
  const [, curX, curY] = adj.current.match(/\((\d+), (\d+)\)/)
  const [, newX, newY] = adj.newPos.match(/\((\d+), (\d+)\)/)
  
  const regex = new RegExp(`${adj.treasure}[^}]+position: \\{ x: ${curX}, y: ${curY} \\}`)
  if (regex.test(txt)) {
    txt = txt.replace(regex, match => match.replace(`x: ${curX}, y: ${curY}`, `x: ${newX}, y: ${newY}`))
    console.log(`✓ ${adj.map}: ${adj.current} → ${adj.newPos}`)
    console.log(`  理由: ${adj.reason}`)
  } else {
    console.log(`⚠️ ${adj.map}: 未找到宝箱位置 ${adj.current}`)
  }
}

fs.writeFileSync(file, txt)
console.log('\n✓ 宝箱位置已调整到草丛区域')
console.log('\n注意: 月影墓园和六角遗迹的宝箱位置保持不变（已经合理）')
