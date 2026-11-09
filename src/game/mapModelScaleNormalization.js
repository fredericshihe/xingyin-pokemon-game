// 同一个模型在所有地图里保持同一尺寸。
//
// 以前尺寸来自三层互相覆盖的来源（作者手写 scale、布局生成时的
// environmentRenderScale 放大、边界 / 场景小品按序号算尺寸），同一块石头
// 在一张图里 0.4、另一张图里 5 倍。这里在地图装配完成后统一一次：
//   - 每个模型一个标准尺寸（modelCanonicalScales.generated.js），实例只允许 ±6% 自然浮动；
//   - 原来被放得很大的自然景物（石头、树、水晶……）不整体缩小，而是在原占地内
//     换成一簇标准尺寸的同款模型，保留原来的视觉覆盖和"墙"；
//   - 原来偏小的放大到标准尺寸，前提是不压路、不压水、不挡事件、不破坏连通；
//     放不下的纯装饰直接去掉（统计在 generationNotes 里）；
//   - 事件物件、NPC、隐藏区机关等受保护对象保持原样。
// 碰撞随后由 alignMapCollisionToVisibleModels 按新的可见模型重新推导。
import { getDecorativeModel } from './decorativeModelSpec.js'
import { MAP_ASSET_CATALOG } from './data/mapAssetCatalog.js'
import { MODEL_CANONICAL_SCALES } from './data/modelCanonicalScales.generated.js'
import { DECORATIVE_FOOTPRINT_OVERRIDES } from './data/godotMaps/godot_region_maps.js'
import { getEnvironmentObjectBounds, isProtectedEnvironmentObject } from './data/mapEnvironmentComposition.js'
import { createEnvironmentConnectivityGuard, getEnvironmentBlockedCells } from './environmentNavigation.js'
import { isLowVegetationType } from './mapVisualCollision.js'
import { PROCEDURAL_MODEL_SCALES, MODEL_SCALE_JITTER, modelScaleJitter } from './proceduralModelScales.js'
import { getTreeModelScale, getTreeModelMinimumScale } from './modelScaleReference.js'

export { PROCEDURAL_MODEL_SCALES, MODEL_SCALE_JITTER, modelScaleJitter }

const SAME_SIZE_TOLERANCE = 1.25
const MIN_GROW_FIT = 0.9
// 自然景物放不到标准尺寸时，最多退让到这个比例，再小就去掉
const MIN_NATURAL_FIT = 0.75
const MAX_CLUSTER = 9


const NATURAL_PATTERN = /rock|stone|tree|bush|crystal|reed|hill|cliff|boundary|pine|palm|willow|log|mushroom|flower|plant|coral|ice|grass|forest|stump|shrub|cactus|fern|lily|boulder|mound|outcrop|island/
const STRUCTURE_PATTERN = /building|house|tower|wall|fence|bridge|dock|ship|boat|mast|cannon|lantern|barrel|crate|sign|tent|cart|fountain|mill|gate|arch|bastion|beacon|statue|obelisk|coffin|character|chest|well|bench|table|pillar|torch|flag/

const BUILDING_PATTERN = /building|windmill|watermill|tent|house|tower|ship_wreck|structure_canvas/
const ROAD_TILES = new Set([12, 15, 2])
const WATER_TILE = 11
const SCENERY_TILES = new Set([0, 1, 13, 17, 20])

function hash01(x, y, salt) {
  const v = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453
  return v - Math.floor(v)
}

export function getModelKeyForObject(object) {
  const spec = getDecorativeModel(object?.type, object)
  return spec?.key || object?.type || null
}

export function getCanonicalModelScale(object) {
  const key = getModelKeyForObject(object)
  const treeScale = getTreeModelScale(key)
  if (treeScale != null) return treeScale
  if (key && PROCEDURAL_MODEL_SCALES[key] != null) return PROCEDURAL_MODEL_SCALES[key]
  if (key && MODEL_CANONICAL_SCALES[key] != null) return MODEL_CANONICAL_SCALES[key]
  const spec = getDecorativeModel(object?.type, object)
  return MAP_ASSET_CATALOG[key]?.defaultScale ?? MAP_ASSET_CATALOG[object?.type]?.defaultScale ?? spec?.scale ?? 1
}

// 渲染器最终使用的尺寸（与 ThreeLowPolyMap 的 resolveThemeLandmarkRenderScale 调用一致）
export function getRenderedObjectScale(object, themeScales = null) {
  const spec = getDecorativeModel(object?.type, object)
  const explicit = Number(object?.environmentRenderScale ?? object?.scale ?? spec?.scale)
  if (Number.isFinite(explicit) && explicit > 0) return explicit
  return themeScales?.[object?.type] ?? 1
}

function isCharacterObject(object) {
  const spec = getDecorativeModel(object?.type, object)
  return Boolean(object?.npcRole || ['trainer', 'boss', 'merchant'].includes(object?.eventType) || (spec && spec.key !== object?.type && spec.scale === 1 && /character|npc|player/i.test(spec.key)))
}

export function isScaleNormalizable(object) {
  // 边界地形每张图专属、每种只一个，不存在跨图不一致，保持原样
  if (!object?.type || object.environmentHiddenBoundary || object.environmentBoundary) return false
  // 建筑（帐篷、房屋、风车、塔……）按作者设计的占地保持原样：碰撞按建筑占地整块阻挡
  if (BUILDING_PATTERN.test(object.type)) return false
  return !isProtectedEnvironmentObject(object) && !isCharacterObject(object)
}

export function isNaturalModelName(name) {
  return NATURAL_PATTERN.test(name) && !STRUCTURE_PATTERN.test(name)
}

function isNaturalObject(object, key) {
  if (object.sourceId?.startsWith('grave_stones_')) return false
  return isNaturalModelName(`${object.type} ${key}`)
}

function withScale(object, scale) {
  const value = Number(Math.max(scale, getTreeModelMinimumScale(object.type)).toFixed(3))
  // scale 是作者占地尺寸（玩法审计 / 路面净空都按它算），只允许变小；
  // 可见尺寸统一走 environmentRenderScale
  const authored = Number(object.scale)
  return {
    ...object,
    scale: Number.isFinite(authored) && authored > 0 ? Math.min(authored, value) : value,
    environmentRenderScale: value,
    environmentScaleNormalized: true
  }
}

function normalizeProtectedTreeScale(object) {
  const canonical = getTreeModelScale(object.type)
  if (canonical == null) return object
  const min = getTreeModelMinimumScale(object.type)
  const max = canonical * (1 + MODEL_SCALE_JITTER)
  const current = getRenderedObjectScale(object)
  const scale = Math.max(min, Math.min(current, max))
  const normalized = withScale(object, scale)
  if (Number(object.hiddenGateLockedScale) > 0) {
    normalized.hiddenGateLockedScale = Number(Math.max(scale, Math.min(Number(object.hiddenGateLockedScale), max)).toFixed(3))
  }
  return normalized
}

function boundsTilesOk(map, bounds, { water = false, shore = false } = {}) {
  for (let y = Math.ceil(bounds.y1 - 0.5); y <= Math.floor(bounds.y2 + 0.5); y++) {
    for (let x = Math.ceil(bounds.x1 - 0.5); x <= Math.floor(bounds.x2 + 0.5); x++) {
      const tile = map.mapGrid[y]?.[x]
      if (tile == null) return false
      if (water) {
        if (tile !== WATER_TILE) return false
        continue
      }
      // 岸边的石头可以半浸在水里，但任何东西都不许压路
      if (tile === WATER_TILE && shore) continue
      if (ROAD_TILES.has(tile) || tile === WATER_TILE || !SCENERY_TILES.has(tile)) return false
    }
  }
  return true
}

// 与 scripts/audit-map-gameplay-flow.mjs 的 getDecorationFootprintCells 同口径：
// 目录占地 × max(0.45, scale)，最小 0.72 格，外扩 0.28，按格心是否落在旋转矩形内。
function footprintCells(map, object, padding = 0.28) {
  const asset = MAP_ASSET_CATALOG[object.type]
  const override = object.footprint || DECORATIVE_FOOTPRINT_OVERRIDES[object.type]
  const baseW = Number(override?.width ?? asset?.footprint?.width ?? 1)
  const baseH = Number(override?.height ?? asset?.footprint?.height ?? 1)
  const scale = Math.max(0.45, Number(object.scale ?? asset?.defaultScale ?? 1) || 1)
  const w = Math.max(0.72, baseW * scale + padding * 2)
  const h = Math.max(0.72, baseH * scale + padding * 2)
  const rotation = Number(object.rotation) || 0
  const cos = Math.cos(rotation), sin = Math.sin(rotation)
  const cx = Number(object.x), cy = Number(object.y)
  const radius = Math.ceil(Math.max(w, h) / 2 + 1)
  const cells = []
  for (let y = Math.floor(cy) - radius; y <= Math.ceil(cy) + radius; y += 1) {
    for (let x = Math.floor(cx) - radius; x <= Math.ceil(cx) + radius; x += 1) {
      if (y < 0 || x < 0 || y >= map.mapGrid.length || x >= map.mapGrid[0].length) continue
      const dx = x - cx, dy = y - cy
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos
      if (Math.abs(lx) <= w / 2 && Math.abs(ly) <= h / 2) cells.push(`${x},${y}`)
    }
  }
  return cells
}

// 离道路 >= 3 格、离事件 >= 4 格、不在事件连接路径旁的格子才算"纵深景物区"，新增占地只能落在这里
function createDeepSceneryTest(map) {
  const height = map.mapGrid.length, width = map.mapGrid[0].length
  const roadDistance = new Int16Array(width * height).fill(99)
  const queue = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (ROAD_TILES.has(map.mapGrid[y][x])) { roadDistance[y * width + x] = 0; queue.push(y * width + x) }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const index = queue[i], x = index % width, y = (index - x) / width
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const next = ny * width + nx
      if (roadDistance[next] <= roadDistance[index] + 1) continue
      roadDistance[next] = roadDistance[index] + 1
      queue.push(next)
    }
  }
  const eventNear = new Set()
  const roadTiles = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (ROAD_TILES.has(map.mapGrid[y][x])) roadTiles.push([x, y])
  }
  for (const event of map.runtimeEvents || []) {
    const ex = Number(event.position?.x), ey = Number(event.position?.y)
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) eventNear.add(`${ex + dx},${ey + dy}`)
    // 与玩法审计一致：事件到最近道路格的两条 L 形连接路径（外扩 1 格）都算通路
    let nearest = null, best = Infinity
    for (const [rx, ry] of roadTiles) {
      const d = Math.abs(rx - ex) + Math.abs(ry - ey)
      if (d < best) { best = d; nearest = [rx, ry] }
    }
    if (!nearest) continue
    const [rx, ry] = nearest
    const mark = (x, y) => { for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) eventNear.add(`${x + ox},${y + oy}`) }
    for (let x = Math.min(rx, ex); x <= Math.max(rx, ex); x += 1) { mark(x, ry); mark(x, ey) }
    for (let y = Math.min(ry, ey); y <= Math.max(ry, ey); y += 1) { mark(ex, y); mark(rx, y) }
  }
  return (cell) => {
    const [x, y] = cell.split(',').map(Number)
    return roadDistance[y * width + x] >= 3 && !eventNear.has(cell)
  }
}

function boundsOverlap(a, b) {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
}

function nearEvent(map, bounds, gap = 1.0) {
  return (map.runtimeEvents || []).some(({ position }) => position &&
    position.x > bounds.x1 - gap && position.x < bounds.x2 + gap &&
    position.y > bounds.y1 - gap && position.y < bounds.y2 + gap)
}

// 与玩法审计 collectPathClearanceCells 同口径：每个事件四邻（非水）到道路 / 桥面的
// 最短无水 L 形连接路径。地形改动（例如桥面收窄）后，压在这些路径上的普通装饰要让开。
function collectEventConnectorCells(map) {
  const height = map.mapGrid.length, width = map.mapGrid[0].length
  const roads = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (map.mapGrid[y][x] === 12 || map.mapGrid[y][x] === 15) roads.push([x, y])
  }
  const cells = new Set()
  if (!roads.length) return cells
  const dry = (x, y) => x >= 0 && y >= 0 && x < width && y < height && map.mapGrid[y][x] !== WATER_TILE
  const connector = ([sx, sy], [tx, ty], verticalFirst) => {
    const points = []
    let x = sx, y = sy
    const stepX = () => { while (x !== tx) { x += Math.sign(tx - x); points.push([x, y]) } }
    const stepY = () => { while (y !== ty) { y += Math.sign(ty - y); points.push([x, y]) } }
    points.push([x, y])
    if (verticalFirst) { stepY(); stepX() } else { stepX(); stepY() }
    return points
  }
  for (const event of map.runtimeEvents || []) {
    const ex = Number(event.position?.x), ey = Number(event.position?.y)
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue
    for (const [tx, ty] of [[ex + 1, ey], [ex - 1, ey], [ex, ey + 1], [ex, ey - 1]]) {
      if (!dry(tx, ty)) continue
      let best = null
      for (const road of roads) {
        for (const verticalFirst of [false, true]) {
          const points = connector(road, [tx, ty], verticalFirst)
          if (!points.every(([x, y]) => dry(x, y))) continue
          const score = points.length * 10 + (verticalFirst ? 1 : 0)
          if (!best || score < best.score) best = { points, score }
        }
      }
      best?.points.forEach(([x, y]) => cells.add(`${x},${y}`))
    }
  }
  return cells
}

export function normalizeMapModelScales(map) {
  if (!map?.decorativeObjects?.length || !map.mapGrid?.length) return map
  const blocked = new Set(map.environmentBlockedTiles || [])
  let connectivity = null
  const guard = (cells) => {
    if (!cells.length) return true
    connectivity = connectivity || createEnvironmentConnectivityGuard(map)
    const next = new Set([...blocked, ...cells])
    if (!connectivity(next)) return false
    cells.forEach((key) => blocked.add(key))
    return true
  }
  const modelCounts = new Map()
  map.decorativeObjects.forEach((object) => {
    const key = getModelKeyForObject(object)
    if (key) modelCounts.set(key, (modelCounts.get(key) || 0) + 1)
  })
  const isDeep = createDeepSceneryTest(map)
  // 新物件的占地格只能是原物件已占的格子，或纵深景物区
  const staysClear = (candidate, allowedCells) => footprintCells(map, candidate).every((cell) => allowedCells.has(cell) || isDeep(cell))
  // 不能和边界地形、地标、受保护物件（事件 / 隐藏区机关）重叠
  const anchors = map.decorativeObjects
    .filter((object) => object.environmentBoundary || object.landmark || isProtectedEnvironmentObject(object))
    .map((object) => ({ object, bounds: getEnvironmentObjectBounds(object) }))
  const overlapsAnchor = (candidate, self) => {
    const b = getEnvironmentObjectBounds(candidate)
    return anchors.some(({ object, bounds }) => object !== self &&
      b.x1 < bounds.x2 && b.x2 > bounds.x1 && b.y1 < bounds.y2 && b.y2 > bounds.y1)
  }
  // 一个候选尺寸 / 位置是否可放：不压通路、不贴事件、不压锚点
  const placeable = (candidate, original, allowedCells) => staysClear(candidate, allowedCells) &&
    !nearEvent(map, getEnvironmentObjectBounds(candidate), 1.5) && !overlapsAnchor(candidate, original)
  // 回复泉 / 挑战点周围 2.25 格内不放新物件中心（与玩法审计的固定场景净空一致）
  const fixedLandmarks = (map.runtimeEvents || [])
    .filter((event) => ['heal', 'challenge'].includes(event.type) && event.position)
    .map((event) => event.position)
  const clearOfFixedLandmarks = (piece) => fixedLandmarks.every((p) => Math.hypot(piece.x - p.x, piece.y - p.y) >= 2.3)
  // 拆簇更严：每一块只能占原物件已占的格子
  const pieceFits = (piece, original, allowedCells) =>
    clearOfFixedLandmarks(piece) &&
    footprintCells(map, piece).every((cell) => allowedCells.has(cell)) &&
    !nearEvent(map, getEnvironmentObjectBounds(piece), 1.5) && !overlapsAnchor(piece, original)
  const stats = { normalized: 0, clustered: 0, clusterPieces: 0, grown: 0, shrunk: 0, dropped: 0, keptProtected: 0, keptUnfit: 0 }
  const out = []

  map.decorativeObjects.forEach((object, index) => {
    if (!isScaleNormalizable(object)) {
      stats.keptProtected += 1
      out.push(normalizeProtectedTreeScale(object))
      return
    }
    const key = getModelKeyForObject(object)
    const canonical = getCanonicalModelScale(object)
    const current = getRenderedObjectScale(object)
    const jitter = modelScaleJitter(Number(object.x) || index, Number(object.y) || 0, 3)
    const minimumScale = getTreeModelMinimumScale(object.type)
    const target = Math.max(canonical * jitter, minimumScale)
    const ratio = current / canonical
    const lowVegetation = isLowVegetationType(object.type)
    const waterProp = object.surface === 'water'
    const originalCells = new Set(footprintCells(map, object))

    // 1) 已经在标准尺寸附近：只做收敛
    if (ratio <= SAME_SIZE_TOLERANCE && ratio >= 1 / SAME_SIZE_TOLERANCE) {
      if (lowVegetation) {
        out.push(withScale(object, target))
        stats.normalized += 1
        return
      }
      // 收敛到标准尺寸也要保证不压通路 / 不挡连通；放不下就在允许范围内退让
      // 缩小只会让出空间，直接收敛；放大才需要检查净空
      if (target <= current) {
        out.push(withScale(object, target))
        stats.normalized += 1
        return
      }
      for (const fit of [1, 0.97, 0.94]) {
        const candidate = withScale(object, Math.max(current, target * fit))
        const bounds = getEnvironmentObjectBounds(candidate)
        if (!boundsTilesOk(map, bounds, { water: waterProp }) || !placeable(candidate, object, originalCells)) continue
        if (!guard(getEnvironmentBlockedCells(map, bounds))) continue
        out.push(candidate)
        stats.normalized += 1
        return
      }
      out.push(withScale(object, current))
      stats.normalized += 1
      return
    }

    // 2) 偏大
    if (ratio > SAME_SIZE_TOLERANCE) {
      if (!isNaturalObject(object, key)) {
        out.push(withScale(object, target))
        stats.shrunk += 1
        return
      }
      // 自然景物：在原占地里换成一簇标准尺寸的同款
      const count = Math.max(2, Math.min(MAX_CLUSTER, Math.round(ratio * ratio * 0.55)))
      const origBounds = getEnvironmentObjectBounds(object)
      const origRadius = Math.min(origBounds.x2 - origBounds.x1, origBounds.y2 - origBounds.y1) / 2
      const pieceBounds = getEnvironmentObjectBounds(withScale(object, canonical))
      const pieceRadius = Math.max(pieceBounds.x2 - pieceBounds.x1, pieceBounds.y2 - pieceBounds.y1) / 2
      const spread = Math.max(0, origRadius - pieceRadius)
      const seed = hash01(object.x, object.y, 11) * Math.PI * 2
      const pieces = []
      for (let i = 0; i < count; i += 1) {
        const angle = seed + i * 2.39996
        const baseDist = spread * Math.sqrt((i + 0.5) / count)
        // 压到通路就往中心收，收到中心仍不行就不放这一块
        for (const pull of [1, 0.6, 0.3, 0]) {
          const px = object.x + Math.cos(angle) * baseDist * pull
          const py = object.y + Math.sin(angle) * baseDist * pull
          const piece = {
            ...withScale(object, canonical * modelScaleJitter(px, py, 5 + i)),
            x: Number(px.toFixed(2)),
            y: Number(py.toFixed(2)),
            // 收回中心的最后一档沿用原朝向，保证落在原占地内
            rotation: (object.rotation ?? 0) + (pull > 0 ? (hash01(px, py, 13 + i) - 0.5) * 1.6 : 0),
            sourceId: `${object.sourceId || object.type}_cluster${i}`,
            environmentScaleCluster: true
          }
          if (!pieceFits(piece, object, originalCells)) continue
          if (!lowVegetation && !boundsTilesOk(map, getEnvironmentObjectBounds(piece), { water: waterProp, shore: true })) continue
          pieces.push(piece)
          break
        }
      }
      if (!pieces.length) {
        // 一块都放不下（例如贴着固定场景）：原位缩到标准尺寸，只会让出空间
        out.push(withScale(object, canonical * modelScaleJitter(object.x, object.y, 5)))
        stats.shrunk += 1
        return
      }
      out.push(...pieces)
      stats.clustered += 1
      stats.clusterPieces += pieces.length
      return
    }

    // 3) 偏小：放大到标准尺寸；放不下就逐步退让（自然景物到 75%，其他到 90%），再不行去掉纯装饰
    const natural = isNaturalObject(object, key)
    const shore = natural && !/tree|pine|palm|willow|bush|flower|mushroom/.test(`${object.type} ${key}`)
    const fits = natural ? [1, 0.95, 0.9, 0.85, 0.8, MIN_NATURAL_FIT] : [1, 0.95, MIN_GROW_FIT]
    for (const fit of fits) {
      if (target * fit < current) break
      const grown = withScale(object, target * fit)
      if (lowVegetation) {
        out.push(grown)
        stats.grown += 1
        return
      }
      const bounds = getEnvironmentObjectBounds(grown)
      if (!boundsTilesOk(map, bounds, { water: waterProp, shore }) || !placeable(grown, object, originalCells)) continue
      if (!guard(getEnvironmentBlockedCells(map, bounds))) continue
      out.push(grown)
      stats.grown += 1
      return
    }
    // 放不到允许范围：已在退让下限以上的原样保留（差距不大，删掉反而空）；
    // 太小的纯装饰去掉，地标同图同款不足 4 个时保留
    if (current >= Math.max(target * MIN_NATURAL_FIT, minimumScale) ||
        (object.landmark && current >= minimumScale && (modelCounts.get(key) || 0) < 4)) {
      out.push(withScale(object, current))
      stats.keptUnfit += 1
      return
    }
    stats.dropped += 1
  })

  // 最后一遍：普通装饰（非地标、非受保护）的占地压到事件连接路径就去掉
  const connectorCells = collectEventConnectorCells(map)
  const onConnector = (object) => footprintCells(map, object).some((cell) => connectorCells.has(cell))
  const NUDGES = [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8], [1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]]
  const cleared = []
  for (const object of out) {
    if (!isScaleNormalizable(object) || isLowVegetationType(object.type) || !onConnector(object)) {
      cleared.push(object)
      continue
    }
    if (!object.landmark) {
      stats.clearedFromEventPaths = (stats.clearedFromEventPaths || 0) + 1
      continue
    }
    // 地标只挪不删：最多挪 1.2 格，挪到不压通路、不压路 / 水、不贴事件的位置
    const moved = NUDGES.map(([dx, dy]) => ({ ...object, x: Number((object.x + dx).toFixed(2)), y: Number((object.y + dy).toFixed(2)) }))
      .find((candidate) => !onConnector(candidate) &&
        boundsTilesOk(map, getEnvironmentObjectBounds(candidate)) &&
        !nearEvent(map, getEnvironmentObjectBounds(candidate), 1.0) &&
        !overlapsAnchor(candidate, object) &&
        !cleared.some((other) => other !== object && other.landmark && boundsOverlap(getEnvironmentObjectBounds(other), getEnvironmentObjectBounds(candidate))))
    if (moved) {
      cleared.push(moved)
      stats.nudgedOffEventPaths = (stats.nudgedOffEventPaths || 0) + 1
    } else if (BUILDING_PATTERN.test(object.type)) {
      cleared.push(object)
    } else {
      // 附近没有合法位置的小地标（木桶、箱子……）让出通路
      stats.clearedFromEventPaths = (stats.clearedFromEventPaths || 0) + 1
    }
  }

  return {
    ...map,
    decorativeObjects: cleared,
    environmentBlockedTiles: blocked,
    generationNotes: { ...map.generationNotes, modelScaleNormalization: stats }
  }
}
