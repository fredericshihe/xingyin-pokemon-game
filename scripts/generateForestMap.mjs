import fs from 'fs'

const W = 36
const H = 34

// 0草 1树 2出口 3道具 5治疗 6告示 7训练家 8高草 9树果 10挑战点 11水 12路 15桥 16花 17浅草
const T = {
  grass: 0,
  tree: 1,
  exit: 2,
  item: 3,
  heal: 5,
  sign: 6,
  trainer: 7,
  tall: 8,
  berry: 9,
  challenge: 10,
  water: 11,
  road: 12,
  bridge: 15,
  flower: 16,
  pale: 17
}

const grid = Array.from({ length: H }, () => Array(W).fill(T.grass))

const set = (x, y, v) => {
  if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = v
}

const fillRect = (x, y, w, h, v) => {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) set(x + dx, y + dy, v)
  }
}

// 外圈密林
for (let x = 0; x < W; x++) {
  set(x, 0, T.tree)
  set(x, 1, T.tree)
  set(x, H - 1, T.tree)
  set(x, H - 2, T.tree)
}
for (let y = 0; y < H; y++) {
  set(0, y, T.tree)
  set(1, y, T.tree)
  set(W - 1, y, T.tree)
  set(W - 2, y, T.tree)
}

// 南侧入口大道
fillRect(2, H - 4, W - 4, 2, T.road)
set(3, H - 5, T.exit)
set(W - 4, H - 5, T.exit)

// 中央精灵之泉（空地 + 治疗）
fillRect(15, 14, 6, 5, T.pale)
set(17, 16, T.heal)
set(16, 15, T.flower)
set(19, 15, T.flower)
set(16, 17, T.flower)
set(19, 17, T.flower)

// 东侧镜湖
fillRect(26, 8, 7, 12, T.water)
fillRect(25, 12, 1, 4, T.bridge)
fillRect(24, 13, 2, 2, T.road)

// 主环路（连接各区域）
for (let x = 4; x < W - 4; x++) {
  set(x, 10, T.road)
  set(x, 22, T.road)
}
for (let y = 6; y < H - 6; y++) {
  set(10, y, T.road)
  set(23, y, T.road)
}

// 西北「苔原猎场」— 大片高草
fillRect(4, 4, 10, 8, T.tall)
fillRect(5, 5, 8, 6, T.tall)

// 东北「萤火树林」— 高草 + 浅草交错
fillRect(24, 4, 8, 7, T.pale)
fillRect(25, 5, 6, 5, T.tall)

// 西南「花之草甸」— 花丛 + 夹杂高草
fillRect(4, 20, 9, 7, T.flower)
fillRect(5, 21, 7, 5, T.pale)
fillRect(6, 22, 5, 3, T.tall)
fillRect(4, 24, 3, 2, T.tall)

// 零散装饰树（不堵主路）
const scatterTrees = [
  [13, 6], [14, 7], [20, 6], [21, 8], [12, 18], [22, 19],
  [8, 14], [27, 20], [7, 8], [28, 6], [30, 18]
]
scatterTrees.forEach(([x, y]) => {
  if (grid[y][x] === T.grass || grid[y][x] === T.pale) set(x, y, T.tree)
})

// 秘密树洞：两侧树，中间道具
set(6, 12, T.tree)
set(8, 12, T.tree)
set(7, 12, T.item)

// 古树守卫（训练家）
set(23, 16, T.trainer)

// 树果丛
set(12, 21, T.berry)
set(13, 22, T.berry)
set(11, 22, T.berry)

// 告示牌（放在可站立的路/草地上）
set(8, H - 5, T.sign)   // 南门
set(17, 12, T.sign)     // 泉边
set(25, 7, T.sign)      // 湖畔
set(8, 5, T.sign)       // 猎场入口

// 补充高草：林间小径两侧
fillRect(14, 18, 4, 3, T.tall)
fillRect(20, 20, 3, 4, T.tall)

// 确保入口与环路可走
fillRect(3, H - 5, W - 6, 1, T.road)
set(3, H - 5, T.exit)
set(W - 4, H - 5, T.exit)

// 起点
const startPosition = { x: 5, y: H - 6 }

const encounterZones = [
  {
    id: 'moss_grove',
    name: '苔原猎场',
    x: 3,
    y: 3,
    width: 12,
    height: 10,
    encounterTableId: 'forest_moss',
    tallGrassRate: 0.38
  },
  {
    id: 'spirit_grove',
    name: '萤火树林',
    x: 23,
    y: 3,
    width: 10,
    height: 9,
    encounterTableId: 'forest_spirit',
    tallGrassRate: 0.34
  },
  {
    id: 'flower_meadow',
    name: '花之草甸',
    x: 3,
    y: 19,
    width: 11,
    height: 9,
    encounterTableId: 'forest_meadow',
    tallGrassRate: 0.28
  },
  {
    id: 'mirror_pond',
    name: '镜湖岸',
    x: 24,
    y: 7,
    width: 10,
    height: 14,
    encounterTableId: 'forest_pond',
    tallGrassRate: 0.22
  }
]

const signs = {
  [`8,${H - 5}`]: '南门：由此进入迷雾森林。左右出口可通往森林另一侧。深色高草区更容易遇到野生宝可梦。',
  '17,12': '精灵之泉：站上去可恢复全队体力。森林各区域栖息着不同种类的宝可梦。',
  '25,7': '镜湖：水边能遇到可达鸭和鲤鱼王。沿着湖岸能找到额外补给。',
  '8,5': '苔原猎场：以草系和虫系宝可梦为主。西北角是萤火树林，幽灵系较多。'
}

const fileContent = `// 迷雾森林 — 手工布局（${W}x${H}）
export const ADVENTURE_MAP_CHAIN = ['ForestMap']

export const ADVENTURE_MAP_INFO = {
  ForestMap: {
    name: 'ForestMap',
    width: ${W},
    height: ${H},
    startPosition: ${JSON.stringify(startPosition)},
    exitPosition: { x: ${W - 4}, y: ${H - 5} },
    theme: 'forest',
    displayName: '迷雾森林',
    tallGrassRate: 0.30,
    encounterZones: ${JSON.stringify(encounterZones, null, 4).replace(/\n/g, '\n    ')},
    signs: ${JSON.stringify(signs, null, 4).replace(/\n/g, '\n    ')}
  }
}

export const FOREST_MAP_GRID = ${JSON.stringify(grid)}

export function hasAdventureMap(mapName) {
  return mapName === 'ForestMap'
}

export function getAdventureMapInfo(mapName) {
  return ADVENTURE_MAP_INFO.ForestMap
}

export function loadAdventureMapGrid(mapName) {
  return FOREST_MAP_GRID.map((row) => [...row])
}

export function getEncounterZoneAt(mapName, tileX, tileY) {
  const info = getAdventureMapInfo(mapName)
  if (!info?.encounterZones) return null
  return (
    info.encounterZones.find(
      (z) =>
        tileX >= z.x &&
        tileX < z.x + z.width &&
        tileY >= z.y &&
        tileY < z.y + z.height
    ) || null
  )
}

export function getMapSignMessage(mapName, tileX, tileY) {
  const info = getAdventureMapInfo(mapName)
  if (!info?.signs) return null
  return info.signs[\`\${tileX},\${tileY}\`] || null
}
`

fs.writeFileSync('src/game/data/overworldMaps.js', fileContent)
console.log('Generated overworldMaps.js', W, 'x', H)
