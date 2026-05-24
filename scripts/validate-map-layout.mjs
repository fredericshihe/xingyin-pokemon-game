import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(repoRoot, 'src/game/data/mapSources/godotMapV2.source.json')

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
const errors = []
const warnings = []

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)

const pointKey = (x, y) => `${Math.round(x)},${Math.round(y)}`

function inMap(x, y) {
  return x >= 0 && y >= 0 && x < source.dimensions.width && y < source.dimensions.height
}

function isInsideWaterBody(body, x, y, padding = 0) {
  if (body.type === 'rect') {
    return (
      x >= body.x - padding &&
      x <= body.x + body.width - 1 + padding &&
      y >= body.y - padding &&
      y <= body.y + body.height - 1 + padding
    )
  }

  const rx = Number(body.rx) + padding
  const ry = Number(body.ry) + padding
  if (rx <= 0 || ry <= 0) return false
  const rotation = Number(body.rotation) || 0
  const dx = x - body.x
  const dy = y - body.y
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1
}

function isInsideAnyWater(x, y, padding = 0) {
  return source.waterBodies.some((body) => isInsideWaterBody(body, x, y, padding))
}

function validateBounds(label, bounds) {
  if (!bounds) {
    addError(`${label} 缺少 bounds`)
    return
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    addError(`${label} bounds 尺寸必须为正数`)
  }
  if (!inMap(bounds.x, bounds.y) || !inMap(bounds.x + bounds.width - 1, bounds.y + bounds.height - 1)) {
    addError(`${label} bounds 越界: ${JSON.stringify(bounds)}`)
  }
}

function boundsContains(bounds, x, y) {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
}

function findArea(areaId) {
  return source.areas.find((area) => area.id === areaId) || null
}

function findAreaForPoint(x, y) {
  return source.areas.find((area) => boundsContains(area.bounds, x, y)) || null
}

function assertUniqueIds(label, items) {
  const seen = new Set()
  items.forEach((item) => {
    if (!item.id) {
      addError(`${label} 存在缺少 id 的条目`)
      return
    }
    if (seen.has(item.id)) addError(`${label} id 重复: ${item.id}`)
    seen.add(item.id)
  })
}

function rasterizeSegment(a, b, radius = 1) {
  const cells = []
  const dx = b.x - a.x
  const dy = b.y - a.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 3
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps
    const cx = a.x + dx * t
    const cy = a.y + dy * t
    const minX = Math.floor(cx - radius)
    const maxX = Math.ceil(cx + radius)
    const minY = Math.floor(cy - radius)
    const maxY = Math.ceil(cy + radius)
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = Math.hypot(x - cx, y - cy)
        if (dist <= radius && inMap(x, y)) cells.push([x, y])
      }
    }
  }
  return cells
}

function rasterizeRoutes(routes) {
  const cells = new Set()
  routes.filter((route) => route.role === 'main').forEach((route) => {
    const radius = Math.max(0.5, route.width / 2)
    for (let i = 0; i < route.anchors.length - 1; i += 1) {
      rasterizeSegment(route.anchors[i], route.anchors[i + 1], radius).forEach(([x, y]) => {
        cells.add(pointKey(x, y))
      })
    }
  })
  return cells
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

function findBridgeRouteConnection(bridge, side, routeCells) {
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
      if (!inMap(tileX, tileY)) continue
      if (!routeCells.has(pointKey(tileX, tileY))) continue
      if (isInsideAnyWater(tileX, tileY, 0.05)) continue
      return { x: tileX, y: tileY }
    }
  }

  return null
}

function validateBridgeCrossing(bridge, routeCells) {
  const length = Number(bridge.length) || 0
  const direction = bridgeDirection(bridge)
  const samples = Math.max(8, Math.ceil(length * 4))
  let waterSamples = 0

  for (let index = 0; index <= samples; index += 1) {
    const offset = -length / 2 + (length * index) / samples
    const x = Number(bridge.x) + direction.x * offset
    const y = Number(bridge.y) + direction.y * offset
    if (isInsideAnyWater(x, y)) waterSamples += 1
  }

  if (waterSamples <= 0) {
    addError(`bridge ${bridge.id} 必须跨过水域`)
  }

  const startConnection = findBridgeRouteConnection(bridge, -1, routeCells)
  const endConnection = findBridgeRouteConnection(bridge, 1, routeCells)
  if (!startConnection || !endConnection) {
    const startText = startConnection ? `${startConnection.x},${startConnection.y}` : '缺失'
    const endText = endConnection ? `${endConnection.x},${endConnection.y}` : '缺失'
    addError(`bridge ${bridge.id} 两端必须接到非水面主路，当前 ${startText} -> ${endText}`)
  }
}

function circleCells(circle) {
  const cells = new Set()
  const minX = Math.floor(circle.x - circle.radius)
  const maxX = Math.ceil(circle.x + circle.radius)
  const minY = Math.floor(circle.y - circle.radius)
  const maxY = Math.ceil(circle.y + circle.radius)
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!inMap(x, y)) continue
      if (Math.hypot(x - circle.x, y - circle.y) <= circle.radius) cells.add(pointKey(x, y))
    }
  }
  return cells
}

function footprintCells(placement, asset) {
  const width = Math.max(1, Math.ceil(asset.footprint?.width || 1))
  const height = Math.max(1, Math.ceil(asset.footprint?.height || 1))
  const startX = Math.floor(placement.x - (width - 1) / 2)
  const startY = Math.floor(placement.y - (height - 1) / 2)
  const cells = []
  for (let y = startY; y < startY + height; y += 1) {
    for (let x = startX; x < startX + width; x += 1) cells.push([x, y])
  }
  return cells
}

if (source.dimensions?.width !== 100 || source.dimensions?.height !== 100) {
  addError(`地图尺寸必须是 100x100，当前是 ${source.dimensions?.width}x${source.dimensions?.height}`)
}

validateBounds('preserveRegion', source.preserveRegion)

assertUniqueIds('areas', source.areas)
assertUniqueIds('routes', source.routes)
assertUniqueIds('waterBodies', source.waterBodies)
assertUniqueIds('bridges', source.bridges)
assertUniqueIds('safeClearings', source.safeClearings)
assertUniqueIds('encounterZones', source.encounterZones)
assertUniqueIds('events', source.events)
assertUniqueIds('assetPlacements', source.assetPlacements)
assertUniqueIds('decorationRules', source.decorationRules)

source.areas.forEach((area) => {
  validateBounds(`area ${area.id}`, area.bounds)
})

source.routes.forEach((route) => {
  if (!Array.isArray(route.anchors) || route.anchors.length < 2) {
    addError(`route ${route.id} 至少需要 2 个 anchors`)
  }
  if (route.role === 'main' && route.width < 3) {
    addError(`主路 ${route.id} width 至少应为 3`)
  }
  route.anchors.forEach((anchor, index) => {
    if (!inMap(anchor.x, anchor.y)) addError(`route ${route.id} anchor ${index} 越界`)
  })
})

const mainRoute = source.routes.find((route) => route.role === 'main')
if (!mainRoute) {
  addError('缺少 role=main 的主路线')
} else {
  const first = mainRoute.anchors[0]
  const last = mainRoute.anchors[mainRoute.anchors.length - 1]
  if (!boundsContains(source.preserveRegion, first.x, first.y)) {
    addError('主路线起点必须位于旧图保留区')
  }
  if (last.x < 80 || last.y < 60) {
    addError('主路线终点应落在后段 Boss 区附近')
  }
}

source.waterBodies.forEach((body) => {
  const area = findArea(body.areaId)
  if (!area) addError(`waterBody ${body.id} areaId 不存在: ${body.areaId}`)
  if (!inMap(body.x, body.y)) addError(`waterBody ${body.id} 中心越界`)
  if (body.type === 'rect') validateBounds(`waterBody ${body.id}`, body)
})

source.bridges.forEach((bridge) => {
  if (!inMap(bridge.x, bridge.y)) addError(`bridge ${bridge.id} 越界`)
  if (bridge.clearanceRadius < 1.2) addWarning(`bridge ${bridge.id} clearanceRadius 偏小`)
  if (bridge.width > 1.25) addWarning(`bridge ${bridge.id} 宽度偏大，应接近道路中心宽度`)
})

const routeCells = rasterizeRoutes(source.routes)
source.bridges.forEach((bridge) => validateBridgeCrossing(bridge, routeCells))
const protectedCells = new Set(routeCells)
source.safeClearings.forEach((clearing) => {
  if (!findArea(clearing.areaId)) addError(`safeClearing ${clearing.id} areaId 不存在`)
  if (!inMap(clearing.x, clearing.y)) addError(`safeClearing ${clearing.id} 越界`)
  const blockingRadius = Number.isFinite(clearing.blockingClearanceRadius)
    ? clearing.blockingClearanceRadius
    : Math.min(2, clearing.radius)
  circleCells({ ...clearing, radius: blockingRadius }).forEach((key) => protectedCells.add(key))
})
source.bridges.forEach((bridge) => {
  circleCells({ x: bridge.x, y: bridge.y, radius: bridge.clearanceRadius || 3 }).forEach((key) => protectedCells.add(key))
})

source.encounterZones.forEach((zone) => {
  const area = findArea(zone.areaId)
  if (!area) addError(`encounterZone ${zone.id} areaId 不存在: ${zone.areaId}`)
  validateBounds(`encounterZone ${zone.id}`, zone.bounds)
  if (area && !boundsContains(area.bounds, zone.bounds.x, zone.bounds.y)) {
    addWarning(`encounterZone ${zone.id} 起点不在声明区域 ${zone.areaId} 内`)
  }
  source.safeClearings.forEach((clearing) => {
    if (boundsContains(zone.bounds, clearing.x, clearing.y)) {
      addError(`encounterZone ${zone.id} 覆盖安全区中心 ${clearing.id}`)
    }
  })
  source.bridges.forEach((bridge) => {
    if (boundsContains(zone.bounds, bridge.x, bridge.y)) {
      addError(`encounterZone ${zone.id} 覆盖桥面 ${bridge.id}`)
    }
  })
})

source.events.forEach((event) => {
  if (!findArea(event.areaId)) addError(`event ${event.id} areaId 不存在: ${event.areaId}`)
  if (!inMap(event.position?.x, event.position?.y)) addError(`event ${event.id} 坐标越界`)
  const actualArea = findAreaForPoint(event.position.x, event.position.y)
  if (actualArea && actualArea.id !== event.areaId) {
    addWarning(`event ${event.id} 声明在 ${event.areaId}，实际落点也属于 ${actualArea.id}`)
  }
})

const lieutenants = source.events.filter((event) => event.type === 'trainer' && event.role === 'lieutenant')
const bosses = source.events.filter((event) => event.type === 'boss')
if (lieutenants.length !== 3) addError(`部下训练师必须为 3 名，当前 ${lieutenants.length}`)
if (bosses.length !== 1) addError(`Boss 必须为 1 名，当前 ${bosses.length}`)
if (!source.events.some((event) => event.type === 'heal')) addError('缺少恢复点事件')
if (!source.events.some((event) => event.type === 'challenge')) addError('缺少连战挑战事件')

source.assetPlacements.forEach((placement) => {
  const asset = MAP_ASSET_CATALOG[placement.assetId]
  if (!asset) {
    addError(`assetPlacement ${placement.id} 引用未知素材 ${placement.assetId}`)
    return
  }

  if (!findArea(placement.areaId)) addError(`assetPlacement ${placement.id} areaId 不存在: ${placement.areaId}`)
  if (!asset.allowedAreas.includes(placement.areaId)) {
    addError(`assetPlacement ${placement.id} 素材 ${asset.id} 不允许放在区域 ${placement.areaId}`)
  }
  if (!inMap(placement.x, placement.y)) addError(`assetPlacement ${placement.id} 坐标越界`)

  if (asset.status === 'active') {
    if (!asset.assetPath) {
      addError(`active 素材 ${asset.id} 缺少 assetPath`)
    } else {
      const publicPath = path.join(repoRoot, 'public', asset.assetPath.replace(/^\//, ''))
      if (!fs.existsSync(publicPath)) addError(`active 素材文件不存在: ${asset.id} -> ${asset.assetPath}`)
    }
  } else {
    addWarning(`planned 素材尚未接入运行时: ${asset.id}`)
  }

  if (asset.defaultBlocking) {
    footprintCells(placement, asset).forEach(([x, y]) => {
      if (!inMap(x, y)) addError(`assetPlacement ${placement.id} footprint 越界`)
      if (protectedCells.has(pointKey(x, y))) {
        addError(`阻挡型素材 ${placement.id} 压到主路/安全区/桥头 (${x},${y})`)
      }
    })
  }
})

source.decorationRules.forEach((rule) => {
  rule.areaIds.forEach((areaId) => {
    if (!findArea(areaId)) addError(`decorationRule ${rule.id} 使用不存在区域 ${areaId}`)
  })
  rule.assetIds.forEach((assetId) => {
    const asset = MAP_ASSET_CATALOG[assetId]
    if (!asset) {
      addError(`decorationRule ${rule.id} 引用未知素材 ${assetId}`)
      return
    }
    const illegalAreas = rule.areaIds.filter((areaId) => !asset.allowedAreas.includes(areaId))
    if (illegalAreas.length > 0) {
      addError(`decorationRule ${rule.id} 的素材 ${assetId} 不允许放在 ${illegalAreas.join(', ')}`)
    }
    if (asset.status === 'active') {
      if (!asset.assetPath) {
        addError(`decorationRule ${rule.id} 的 active 素材 ${asset.id} 缺少 assetPath`)
      } else {
        const publicPath = path.join(repoRoot, 'public', asset.assetPath.replace(/^\//, ''))
        if (!fs.existsSync(publicPath)) addError(`decorationRule ${rule.id} 的 active 素材文件不存在: ${asset.id} -> ${asset.assetPath}`)
      }
    } else {
      addWarning(`decorationRule ${rule.id} 使用 planned 素材: ${asset.id}`)
    }
  })
  const [min, max] = rule.countRange || []
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    addError(`decorationRule ${rule.id} countRange 非法`)
  }
})

console.log(`Map layout validation: ${source.id}`)
console.log(`- areas: ${source.areas.length}`)
console.log(`- routes: ${source.routes.length}`)
console.log(`- encounter zones: ${source.encounterZones.length}`)
console.log(`- events: ${source.events.length}`)
console.log(`- asset placements: ${source.assetPlacements.length}`)
console.log(`- decoration rules: ${source.decorationRules.length}`)

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`)
  warnings.forEach((warning) => console.log(`- ${warning}`))
}

if (errors.length > 0) {
  console.error(`\nErrors (${errors.length}):`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nMap layout validation passed.')
