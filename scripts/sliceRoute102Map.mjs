/**
 * 将 Route 102 GBA 地图图切成 16x16 瓦片，生成图集、瓦片索引与碰撞/区域数据
 */
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'

const SOURCE = path.resolve(
  process.cwd(),
  'public/assets/maps/route102/source.webp'
)
const OUT_DIR = path.resolve(process.cwd(), 'public/assets/maps/route102')
const OUT_JS = path.resolve(process.cwd(), 'src/game/data/route102MapData.js')

const TILE = 16
const DISPLAY_TILE = 64

async function main() {
  const altSource = path.resolve(
    process.cwd(),
    'public/assets/maps/route102/source.webp'
  )
  let input = SOURCE
  if (!fs.existsSync(SOURCE)) {
    if (!fs.existsSync(altSource)) {
      console.error('Source map image not found:', SOURCE)
      process.exit(1)
    }
    input = altSource
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  const img = sharp(input)
  const meta = await img.metadata()
  const width = meta.width
  const height = meta.height
  const cols = Math.floor(width / TILE)
  const rows = Math.floor(height / TILE)

  console.log(`Map ${width}x${height} => ${cols}x${rows} tiles`)

  // 复制/转换图集（供 Phaser 使用，保持像素风）
  const tilesetPath = path.join(OUT_DIR, 'tileset.png')
  await sharp(input).png().toFile(tilesetPath)

  const { data } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  const tileIndices = []
  const mapGrid = []
  const collision = []

  for (let y = 0; y < rows; y++) {
    const rowIdx = []
    const rowGrid = []
    const rowCol = []
    for (let x = 0; x < cols; x++) {
      const stats = sampleTile(data, width, x, y)
      const legacy = classifyTile(stats, x, y, cols, rows)
      rowIdx.push(y * cols + x)
      rowGrid.push(legacy)
      rowCol.push(legacy === 1 || legacy === 11 || legacy === 14 ? 1 : 0)
    }
    tileIndices.push(rowIdx)
    mapGrid.push(rowGrid)
    collision.push(rowCol)
  }

  // 确保入口与通路可走
  carvePath(mapGrid, collision, cols, rows)

  const encounterZones = [
    {
      id: 'west_meadow',
      name: '西部草地',
      x: 1,
      y: 2,
      width: 20,
      height: 9,
      encounterTableId: 'route102_meadow',
      tallGrassRate: 0.34
    },
    {
      id: 'central_thicket',
      name: '林间密丛',
      x: 18,
      y: 4,
      width: 18,
      height: 10,
      encounterTableId: 'route102_thicket',
      tallGrassRate: 0.38
    },
    {
      id: 'mirror_lake',
      name: '镜湖',
      x: 34,
      y: 1,
      width: 14,
      height: 9,
      encounterTableId: 'route102_lake',
      tallGrassRate: 0.18
    },
    {
      id: 'south_clearing',
      name: '南边空地',
      x: 28,
      y: 12,
      width: 20,
      height: 7,
      encounterTableId: 'route102_clearing',
      tallGrassRate: 0.22
    },
    {
      id: 'southwest_pass',
      name: '西南小径',
      x: 1,
      y: 12,
      width: 16,
      height: 7,
      encounterTableId: 'route102_pass',
      tallGrassRate: 0.28
    }
  ]

  const signs = {
    '8,3': '西部草地：高草丛里容易遇到草系和虫系宝可梦。',
    '25,6': '林间密丛：穿过草丛时要小心，这里的野生宝可梦更活跃。',
    '42,4': '镜湖：湖水很深，无法通行。水边偶尔有可达鸭出没。',
    '38,14': '南边空地：通往森林深处的开阔地带，适合休整。',
    '6,14': '西南小径：沿着小径向东可进入密林核心区。'
  }

  // 放置告示牌（若该格可走则改为 sign=6）
  Object.keys(signs).forEach((key) => {
    const [sx, sy] = key.split(',').map(Number)
    if (mapGrid[sy]?.[sx] !== undefined && mapGrid[sy][sx] !== 1 && mapGrid[sy][sx] !== 11) {
      mapGrid[sy][sx] = 6
    }
  })

  // 出口与道具点
  setIfWalkable(mapGrid, collision, 1, rows - 2, 2)
  setIfWalkable(mapGrid, collision, cols - 2, rows - 2, 2)
  setIfWalkable(mapGrid, collision, 10, 5, 3) // 隐藏道具

  const startPosition = { x: 3, y: rows - 3 }

  const js = `// 由 scripts/sliceRoute102Map.mjs 自动生成 — Route 102 瓦片地图
export const ROUTE102_TILE = ${TILE}
export const ROUTE102_COLS = ${cols}
export const ROUTE102_ROWS = ${rows}
export const ROUTE102_TILESET_URL = '/assets/maps/route102/tileset.png'

export const ROUTE102_TILE_INDICES = ${JSON.stringify(tileIndices)}

/** 玩法层：0草 1树 2出口 3道具 6告示 8高草 11水 12路 14崖 */
export const ROUTE102_MAP_GRID = ${JSON.stringify(mapGrid)}

export const ROUTE102_COLLISION = ${JSON.stringify(collision)}

export const ROUTE102_META = {
  id: 'Route102',
  name: 'Route102',
  displayName: '102号道路',
  width: ${cols},
  height: ${rows},
  sourceTileSize: ${TILE},
  displayTileSize: ${DISPLAY_TILE},
  tilesetColumns: ${cols},
  startPosition: ${JSON.stringify(startPosition)},
  exitPosition: { x: ${cols - 2}, y: ${rows - 2} },
  theme: 'forest-route',
  renderMode: 'tileset',
  tallGrassRate: 0.30,
  encounterZones: ${JSON.stringify(encounterZones, null, 2)},
  signs: ${JSON.stringify(signs, null, 2)}
}
`

  fs.writeFileSync(OUT_JS, js)
  console.log('Wrote', tilesetPath)
  console.log('Wrote', OUT_JS)
}

function sampleTile(raw, imgW, tx, ty) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  let dark = 0
  let light = 0
  let blueish = 0

  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const x = tx * TILE + px
      const y = ty * TILE + py
      const i = (y * imgW + x) * 4
      const pr = raw[i]
      const pg = raw[i + 1]
      const pb = raw[i + 2]
      r += pr
      g += pg
      b += pb
      n++
      const lum = (pr + pg + pb) / 3
      if (lum < 70) dark++
      if (lum > 170) light++
      if (pb > pr + 18 && pb > pg + 8) blueish++
    }
  }

  r /= n
  g /= n
  b /= n
  const variance = computeVariance(raw, imgW, tx, ty)
  return { r, g, b, dark: dark / n, light: light / n, blueish: blueish / n, variance }
}

function computeVariance(raw, imgW, tx, ty) {
  const vals = []
  for (let py = 0; py < TILE; py += 2) {
    for (let px = 0; px < TILE; px += 2) {
      const x = tx * TILE + px
      const y = ty * TILE + py
      const i = (y * imgW + x) * 4
      vals.push((raw[i] + raw[i + 1] + raw[i + 2]) / 3)
    }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length
  return vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
}

function classifyTile(s, tx, ty, cols, rows) {
  // 水
  if (s.blueish > 0.1 && s.b > s.r + 10 && s.b > 50) return 11

  const isGreenDominant = s.g > s.r + 12 && s.g > s.b + 8
  const lum = (s.r + s.g + s.b) / 3

  // 树冠：圆形树木的深/中绿块（GBA 常见 #58A048 ~ #306830）
  if (isGreenDominant) {
    if (lum < 95 || s.dark > 0.22) return 1
    if (s.g < 115 && s.r < 100 && s.variance < 320) return 1
  }

  // 地图外缘默认密林（防止走出边界）
  if (tx < 2 || ty < 2 || tx >= cols - 2 || ty >= rows - 2) {
    if (isGreenDominant && lum < 130) return 1
  }

  // 高草：纹理方差大、较亮绿
  if (s.variance > 320 && s.g > 75 && s.g < 175 && s.dark < 0.18) return 8
  if (s.g > 88 && s.g < 155 && s.variance > 240 && lum > 90 && lum < 150) return 8

  // 崖/土坡
  if (s.r > 95 && s.g > 65 && s.g < 125 && s.b < 85 && s.r >= s.g) return 14

  return 0
}

function carvePath(grid, collision, cols, rows) {
  // 底部横向主路
  for (let x = 2; x < cols - 2; x++) {
    const y = rows - 3
    if (grid[y][x] !== 11 && grid[y][x] !== 1) {
      grid[y][x] = 12
      collision[y][x] = 0
    }
  }
  // 左侧纵向通路
  for (let y = 3; y < rows - 2; y++) {
    const x = 3
    if (grid[y][x] !== 11 && grid[y][x] !== 1) {
      grid[y][x] = 12
      collision[y][x] = 0
    }
  }
}

function setIfWalkable(grid, collision, x, y, tile) {
  if (!grid[y]?.[x]) return
  if (grid[y][x] === 1 || grid[y][x] === 11) return
  grid[y][x] = tile
  collision[y][x] = 0
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
