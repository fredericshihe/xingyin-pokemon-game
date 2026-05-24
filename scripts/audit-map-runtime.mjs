import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import oldMap from '../src/game/data/godotMaps/my_first_map.js'
import generatedMap from '../src/game/data/godotMaps/godot_map_v2.generated.js'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'

const sourceFileUrl = new URL('../src/game/data/mapSources/godotMapV2.source.json', import.meta.url)
const generatedFileUrl = new URL('../src/game/data/godotMaps/godot_map_v2.generated.js', import.meta.url)
const source = JSON.parse(fs.readFileSync(sourceFileUrl, 'utf8'))
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const BLOCKED_TILES = new Set([1, 5, 6, 11, 14, 18, 20])
const HARD_INTERACTION_TILES = new Set([2, 5, 6, 7, 10])
const ROAD_CONNECTION_TILES = new Set([2, 12])
const BRIDGE_TILE = 15
const GLB_TEXTURE_REF_PATTERN = /Textures\/[A-Za-z0-9_.-]+\.png/g
const EVENT_TILE_BY_TYPE = {
  item: 3,
  pickup: 3,
  heal: 5,
  trainer: 7,
  boss: 7,
  challenge: 10,
  info: 6,
  sign: 6,
  warp: 2
}

const REQUIRED_POINTS = [
  { id: 'S', x: 5, y: 30, mode: 'stand' },
  { id: 'old_east_gate', x: 39, y: 15, mode: 'stand' },
  { id: 'new_world_gate', x: 44, y: 18, mode: 'stand' },
  { id: 'B1', x: 61, y: 33, mode: 'stand' },
  { id: 'O', x: 48, y: 47, mode: 'stand' },
  { id: 'H', x: 72, y: 78, mode: 'adjacent' },
  { id: 'B2', x: 88, y: 62, mode: 'stand' },
  { id: 'Boss', x: 88, y: 72, mode: 'adjacent' }
]

const errors = []
const warnings = []

function addError(message) {
  errors.push(message)
}

function addWarning(message) {
  warnings.push(message)
}

function cloneGrid(grid) {
  return grid.map((row) => [...row])
}

function inMap(map, x, y) {
  return x >= 0 && y >= 0 && y < map.mapGrid.length && x < map.mapGrid[0].length
}

function isBlocked(tile) {
  return BLOCKED_TILES.has(tile)
}

function isMovementBlocked(tile) {
  return BLOCKED_TILES.has(tile) || HARD_INTERACTION_TILES.has(tile)
}

function applyEventsToGrid(map) {
  const grid = cloneGrid(map.mapGrid)
  for (const event of map.runtimeEvents || []) {
    const tile = EVENT_TILE_BY_TYPE[event.type]
    if (!tile) continue
    const { x, y } = event.position || {}
    if (!inMap(map, x, y)) continue
    if (isBlocked(grid[y][x])) continue
    grid[y][x] = tile
  }
  return grid
}

function movementReachable(grid, start) {
  const height = grid.length
  const width = grid[0].length
  const startKey = `${start.x},${start.y}`
  const visited = new Set()
  const queue = []

  if (!isMovementBlocked(grid[start.y]?.[start.x])) {
    visited.add(startKey)
    queue.push(start)
  }

  while (queue.length > 0) {
    const point = queue.shift()
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = point.x + dx
      const y = point.y + dy
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      if (isMovementBlocked(grid[y][x])) continue
      const key = `${x},${y}`
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ x, y })
    }
  }

  return visited
}

function neighbors(point) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ]
}

function isInsideWaterBody(body, x, y, padding = 0) {
  const rx = Number(body?.rx) + padding
  const ry = Number(body?.ry) + padding
  const cx = Number(body?.x)
  const cy = Number(body?.y)
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rx <= 0 || ry <= 0) return false

  const rotation = Number(body.rotation) || 0
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1
}

function isInsideAnyWater(x, y, padding = 0) {
  return (generatedMap.waterBodies || []).some((body) => isInsideWaterBody(body, x, y, padding))
}

function bridgeDirection(bridge) {
  const rotation = Number(bridge.rotation) || 0
  return {
    x: Math.cos(rotation),
    y: Math.sin(rotation),
    px: -Math.sin(rotation),
    py: Math.cos(rotation)
  }
}

function findBridgeRoadConnection(bridge, side) {
  const length = Number(bridge.length) || 0
  const width = Number(bridge.width) || 1
  const direction = bridgeDirection(bridge)
  const lateralOffsets = [0, -Math.min(width / 2, 0.55), Math.min(width / 2, 0.55)]

  for (let distance = 0.35; distance <= 2.5; distance += 0.25) {
    for (const offset of lateralOffsets) {
      const x = Number(bridge.x) + direction.x * side * (length / 2 + distance) + direction.px * offset
      const y = Number(bridge.y) + direction.y * side * (length / 2 + distance) + direction.py * offset
      const tileX = Math.round(x)
      const tileY = Math.round(y)
      if (!inMap(generatedMap, tileX, tileY)) continue
      const tile = generatedMap.mapGrid[tileY]?.[tileX]
      if (!ROAD_CONNECTION_TILES.has(tile)) continue
      if (isInsideAnyWater(tileX, tileY, 0.05)) continue
      return { x: tileX, y: tileY }
    }
  }

  return null
}

function isInsideBridgeFootprint(bridge, x, y, padding = 0.35) {
  const rotation = Number(bridge.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - Number(bridge.x)
  const dy = y - Number(bridge.y)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (
    Math.abs(localX) <= (Number(bridge.length) || 1) / 2 + padding &&
    Math.abs(localY) <= (Number(bridge.width) || 1) / 2 + padding
  )
}

function isAllowedPreserveChange(x, y) {
  const preserve = generatedMap.preserveRegion
  const nearEastExit = x >= preserve.x + preserve.width - 5 && y >= 13 && y <= 22
  const nearSouthExit = y >= preserve.y + preserve.height - 3 && x >= 16 && x <= 24
  return nearEastExit || nearSouthExit
}

function countTilesInBounds(grid, bounds, tile) {
  let count = 0
  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      if (grid[y]?.[x] === tile) count += 1
    }
  }
  return count
}

function validateDimensions() {
  if (generatedMap.width !== 100 || generatedMap.height !== 100) {
    addError(`GodotMapV2 尺寸必须是 100x100，当前 ${generatedMap.width}x${generatedMap.height}`)
  }
  if (generatedMap.mapGrid.length !== generatedMap.height) {
    addError('mapGrid 行数与 height 不一致')
  }
  generatedMap.mapGrid.forEach((row, index) => {
    if (row.length !== generatedMap.width) {
      addError(`mapGrid 第 ${index} 行宽度与 width 不一致`)
    }
  })
}

function validatePreserveRegion() {
  const preserve = generatedMap.preserveRegion
  let changed = 0
  for (let y = 0; y < preserve.height; y += 1) {
    for (let x = 0; x < preserve.width; x += 1) {
      if (isAllowedPreserveChange(x, y)) continue
      const oldTile = oldMap.mapGrid[y]?.[x]
      if (oldTile == null) continue
      if (generatedMap.mapGrid[y]?.[x] !== oldTile) changed += 1
    }
  }
  if (changed > 0) {
    addError(`旧 44x36 保留区存在 ${changed} 个非出口格被改变`)
  }
}

function validateRuntimeFreshness() {
  const sourceMtime = fs.statSync(sourceFileUrl).mtimeMs
  const generatedMtime = fs.statSync(generatedFileUrl).mtimeMs
  if (sourceMtime > generatedMtime + 5) {
    addError('运行时地图产物已落后于 source.json，请先执行 npm run map:build')
  }
}

function validateConnectivity(eventGrid) {
  const start = generatedMap.startPosition
  if (!inMap(generatedMap, start.x, start.y)) {
    addError('出生点越界')
    return
  }
  if (isMovementBlocked(eventGrid[start.y][start.x])) {
    addError(`出生点不可行走: (${start.x},${start.y}) tile=${eventGrid[start.y][start.x]}`)
    return
  }

  const reachable = movementReachable(eventGrid, start)
  REQUIRED_POINTS.forEach((point) => {
    if (!inMap(generatedMap, point.x, point.y)) {
      addError(`关键点 ${point.id} 越界`)
      return
    }

    if (point.mode === 'adjacent') {
      const hasReachableNeighbor = neighbors(point).some((neighbor) => reachable.has(`${neighbor.x},${neighbor.y}`))
      if (!hasReachableNeighbor) addError(`关键点 ${point.id} 没有相邻可达格`)
      return
    }

    if (!reachable.has(`${point.x},${point.y}`)) {
      addError(`关键点 ${point.id} 不可达: (${point.x},${point.y}) tile=${eventGrid[point.y][point.x]}`)
    }
  })

  const walkableTiles = eventGrid.flat().filter((tile) => !isMovementBlocked(tile)).length
  const reachRatio = walkableTiles > 0 ? reachable.size / walkableTiles : 0
  if (reachRatio < 0.84) {
    addWarning(`可移动区域连通率偏低: ${(reachRatio * 100).toFixed(1)}%`)
  }

  return reachable
}

function validateEvents(eventGrid, reachable) {
  const seen = new Set()
  for (const event of generatedMap.runtimeEvents || []) {
    if (!event.id) addError('存在缺少 id 的 runtimeEvent')
    if (seen.has(event.id)) addError(`runtimeEvent id 重复: ${event.id}`)
    seen.add(event.id)

    const { x, y } = event.position || {}
    if (!inMap(generatedMap, x, y)) {
      addError(`runtimeEvent ${event.id} 越界`)
      continue
    }

    const baseTile = generatedMap.mapGrid[y][x]
    if (isBlocked(baseTile)) {
      addError(`runtimeEvent ${event.id} 落在阻挡/水体格: tile=${baseTile}`)
    }

    const tile = eventGrid[y][x]
    const requiresAdjacent = HARD_INTERACTION_TILES.has(tile)
    if (requiresAdjacent) {
      const hasReachableNeighbor = neighbors({ x, y }).some((neighbor) => reachable.has(`${neighbor.x},${neighbor.y}`))
      if (!hasReachableNeighbor) addError(`runtimeEvent ${event.id} 没有相邻可达格`)
    } else if (!reachable.has(`${x},${y}`)) {
      addWarning(`runtimeEvent ${event.id} 自身格不可达`)
    }
  }
}

function validateEncounterZones() {
  for (const zone of generatedMap.encounterZones || []) {
    const grassCount = countTilesInBounds(generatedMap.mapGrid, zone, 8)
    const totalCells = zone.width * zone.height
    if (grassCount <= 0) {
      addError(`encounterZone ${zone.id} 没有任何高草丛 tile`)
    }
    if (totalCells > 0 && grassCount / totalCells < 0.12) {
      addError(`encounterZone ${zone.id} 高草丛占比过低: ${grassCount}/${totalCells}`)
    }
    if (!zone.encounterTableId) {
      addError(`encounterZone ${zone.id} 缺少 encounterTableId`)
    }
  }
}

function validateDecorations() {
  const ids = new Set()
  let plannedFallbackCount = 0
  for (const object of generatedMap.decorativeObjects || []) {
    if (object.sourceId) {
      if (ids.has(object.sourceId)) addError(`decorativeObject sourceId 重复: ${object.sourceId}`)
      ids.add(object.sourceId)
    }
    if (!inMap(generatedMap, Math.round(object.x), Math.round(object.y))) {
      addError(`decorativeObject ${object.sourceId || object.type} 坐标越界`)
    }
    if (object.sourceAssetStatus === 'planned') plannedFallbackCount += 1
  }

  if (plannedFallbackCount > 0) {
    addWarning(`${plannedFallbackCount} 个装饰来自 planned 素材，目前使用运行时 fallback 模型`)
  }
}

function validateBridges() {
  ;(generatedMap.bridges || []).forEach((bridge, index) => {
    const label = `bridge ${bridge.id || index + 1}`
    const length = Number(bridge.length) || 0
    const direction = bridgeDirection(bridge)
    const samples = Math.max(8, Math.ceil(length * 4))
    const sampledTiles = new Set()
    let waterSamples = 0
    let bridgeTileSamples = 0

    for (let sample = 0; sample <= samples; sample += 1) {
      const offset = -length / 2 + (length * sample) / samples
      const x = Number(bridge.x) + direction.x * offset
      const y = Number(bridge.y) + direction.y * offset
      const tileX = Math.round(x)
      const tileY = Math.round(y)
      if (!inMap(generatedMap, tileX, tileY)) continue
      const tileKey = `${tileX},${tileY}`
      if (sampledTiles.has(tileKey)) continue
      sampledTiles.add(tileKey)
      if (isInsideAnyWater(x, y)) waterSamples += 1
      if (generatedMap.mapGrid[tileY]?.[tileX] === BRIDGE_TILE) bridgeTileSamples += 1
    }

    if (waterSamples <= 0) {
      addError(`${label} 必须跨过水域`)
    }
    if (bridgeTileSamples < Math.max(2, Math.ceil(waterSamples * 0.6))) {
      addError(`${label} 桥面中心线 bridge tile 不足: bridge=${bridgeTileSamples}, water=${waterSamples}`)
    }

    const startConnection = findBridgeRoadConnection(bridge, -1)
    const endConnection = findBridgeRoadConnection(bridge, 1)
    if (!startConnection || !endConnection) {
      const startText = startConnection ? `${startConnection.x},${startConnection.y}` : '缺失'
      const endText = endConnection ? `${endConnection.x},${endConnection.y}` : '缺失'
      addError(`${label} 两端必须接到非水面道路/出口，当前 ${startText} -> ${endText}`)
    }

    ;(generatedMap.decorativeObjects || []).forEach((object) => {
      if (!isInsideBridgeFootprint(bridge, Number(object.x), Number(object.y))) return
      addError(`${label} 桥面上有装饰物 ${object.sourceId || object.type}@${object.x},${object.y}`)
    })

    ;(generatedMap.runtimeEvents || []).forEach((event) => {
      const x = Number(event.position?.x)
      const y = Number(event.position?.y)
      if (!isInsideBridgeFootprint(bridge, x, y, 0.2)) return
      addError(`${label} 桥面上有事件 ${event.id || event.type}@${x},${y}`)
    })

    ;(generatedMap.roadJunctions || []).forEach((junction) => {
      const x = Number(junction.x)
      const y = Number(junction.y)
      const padding = Math.max(Number(junction.rx) || 0, Number(junction.ry) || 0, 0.35)
      if (!isInsideBridgeFootprint(bridge, x, y, padding)) return
      addError(`${label} 桥面上有路口面片 ${junction.id || `${x},${y}`}`)
    })
  })
}

function validateCatalogGlbTextures() {
  const checkedPaths = new Set()

  for (const asset of Object.values(MAP_ASSET_CATALOG)) {
    if (!asset?.assetPath?.endsWith('.glb')) continue

    const publicPath = path.join(repoRoot, 'public', asset.assetPath.replace(/^\//, ''))
    if (!fs.existsSync(publicPath)) {
      addError(`catalog 素材文件不存在: ${asset.id} -> ${asset.assetPath}`)
      continue
    }

    if (checkedPaths.has(publicPath)) continue
    checkedPaths.add(publicPath)

    const modelSource = fs.readFileSync(publicPath).toString('latin1')
    const textureRefs = [...new Set(
      [...modelSource.matchAll(GLB_TEXTURE_REF_PATTERN)].map((match) => match[0])
    )]

    for (const textureRef of textureRefs) {
      const texturePath = path.join(path.dirname(publicPath), textureRef)
      if (!fs.existsSync(texturePath)) {
        addError(`GLB 外部纹理缺失: ${asset.assetPath} -> ${textureRef}`)
      }
    }
  }
}

function validateDecorationRules() {
  const decorations = generatedMap.decorativeObjects || []

  for (const rule of source.decorationRules || []) {
    const count = decorations.filter((object) => object.sourceRuleId === rule.id).length
    const [min, max] = rule.countRange || []
    if (count < min) {
      addError(`decorationRule ${rule.id} 生成数量不足: ${count}/${min}`)
    }
    if (count > max) {
      addWarning(`decorationRule ${rule.id} 生成数量超过上限: ${count}/${max}`)
    }
  }

  for (const area of source.areas || []) {
    if (area.id === 'A') continue
    const count = decorations.filter((object) => object.areaId === area.id).length
    const min = area.densityBudget?.min
    const max = area.densityBudget?.max
    if (Number.isFinite(min) && count < min) {
      addWarning(`区域 ${area.id} 装饰密度偏低: ${count}/${min}`)
    }
    if (Number.isFinite(max) && count > max + 8) {
      addWarning(`区域 ${area.id} 装饰密度偏高: ${count}/${max}`)
    }
  }
}

function validateSigns() {
  for (const key of Object.keys(generatedMap.signs || {})) {
    const [x, y] = key.split(',').map(Number)
    if (!inMap(generatedMap, x, y)) addError(`sign ${key} 越界`)
  }
}

validateDimensions()
validateRuntimeFreshness()
validatePreserveRegion()
const eventGrid = applyEventsToGrid(generatedMap)
const reachable = validateConnectivity(eventGrid) || new Set()
validateEvents(eventGrid, reachable)
validateEncounterZones()
validateDecorations()
validateBridges()
validateCatalogGlbTextures()
validateDecorationRules()
validateSigns()

console.log(`Map runtime audit: ${generatedMap.id}`)
console.log(`- grid: ${generatedMap.width}x${generatedMap.height}`)
console.log(`- runtime events: ${generatedMap.runtimeEvents?.length || 0}`)
console.log(`- encounter zones: ${generatedMap.encounterZones?.length || 0}`)
console.log(`- decorations: ${generatedMap.decorativeObjects?.length || 0}`)
console.log(`- generated rule decorations: ${generatedMap.generationNotes?.generatedRuleDecorationCount || 0}`)
console.log(`- reachable movement cells: ${reachable.size}`)

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`)
  warnings.forEach((warning) => console.log(`- ${warning}`))
}

if (errors.length > 0) {
  console.error(`\nErrors (${errors.length}):`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nMap runtime audit passed.')
