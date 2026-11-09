// 跨图出入口严格配对：A 地图出口 → B 地图时，落点就在 B 地图"通回 A 的出口"
// 向内一格，面朝地图内侧。这样：
//  - 到达后回头一步必定踩进返回口；
//  - 返回口的落点同样是 A 出口向内一格，来回始终在同一对出入口之间。
// 需要目标地图的最终地形，所以在整个地图目录装配完之后统一处理。
import { BLOCKED_LEGACY_TILES } from './world/constants.js'
import { isEnvironmentTileBlocked } from './environmentNavigation.js'
import { CHARACTER_BODY_RADIUS_TILES, collectVisualSolidFootprints, distanceToFootprint } from './mapVisualCollision.js'

const STEPS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
const landingObstacles = new WeakMap()

function getLandingObstacles(map) {
  if (!landingObstacles.has(map)) {
    landingObstacles.set(map, collectVisualSolidFootprints(map).filter((footprint) =>
      footprint.source.startsWith('procedural:') || /tree|bush|rock|forest|building/i.test(footprint.source)))
  }
  return landingObstacles.get(map)
}

function walkable(map, x, y) {
  const tile = map.mapGrid[y]?.[x]
  return tile != null && !BLOCKED_LEGACY_TILES.has(tile) && !isEnvironmentTileBlocked(map, x, y) &&
    !getLandingObstacles(map).some((footprint) => distanceToFootprint(footprint, x, y) <= CHARACTER_BODY_RADIUS_TILES)
}

function isWarpAt(map, x, y) {
  return (map.runtimeEvents || []).some((event) => event.type === 'warp' && event.position?.x === x && event.position?.y === y)
}

// 出口向内一格的落点：贴边出口朝远离边缘的方向；地图内部的出口选前方最开阔的方向
export function resolveInwardLanding(map, warp) {
  const width = map.mapGrid[0].length, height = map.mapGrid.length
  const { x, y } = warp.position
  const preferred = x <= 1 ? 'right' : x >= width - 2 ? 'left' : y <= 1 ? 'down' : y >= height - 2 ? 'up' : null
  const openness = (direction) => {
    const [dx, dy] = STEPS[direction]
    let run = 0
    for (let i = 1; i <= 4 && walkable(map, x + dx * i, y + dy * i) && !isWarpAt(map, x + dx * i, y + dy * i); i += 1) run += 1
    return run
  }
  const order = preferred
    ? [preferred, ...Object.keys(STEPS).filter((d) => d !== preferred)]
    : Object.keys(STEPS).sort((a, b) => openness(b) - openness(a))
  for (const direction of order) {
    const [dx, dy] = STEPS[direction]
    const lx = x + dx, ly = y + dy
    if (!walkable(map, lx, ly) || isWarpAt(map, lx, ly)) continue
    // 面朝前方要能走；前方被挡就换一个能走的朝向（但不能朝回返回口）
    const facing = walkable(map, lx + dx, ly + dy)
      ? direction
      : Object.keys(STEPS).find((d) => {
        const [fx, fy] = STEPS[d]
        return !(lx + fx === x && ly + fy === y) && walkable(map, lx + fx, ly + fy)
      }) || direction
    return { x: lx, y: ly, direction: facing }
  }
  return null
}

export function fixCatalogWarpLandings(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const fixes = []
  const updates = new Map()
  for (const entry of entries) {
    for (const warp of entry.mapInfo.runtimeEvents || []) {
      if (warp.type !== 'warp' || !warp.target?.mapName) continue
      const target = byId.get(warp.target.mapName)?.mapInfo
      if (!target) continue
      // 目标地图里通回本地图的出口；多个时选离原落点最近的
      const landing = warp.target.position || {}
      const returnWarp = (target.runtimeEvents || [])
        .filter((event) => event.type === 'warp' && event.target?.mapName === entry.id && event.position)
        .sort((a, b) => Math.hypot(a.position.x - (landing.x ?? 0), a.position.y - (landing.y ?? 0)) -
          Math.hypot(b.position.x - (landing.x ?? 0), b.position.y - (landing.y ?? 0)))[0]
      if (!returnWarp) continue
      const next = resolveInwardLanding(target, returnWarp)
      if (!next) continue
      if (next.x === landing.x && next.y === landing.y && next.direction === landing.direction) continue
      fixes.push(`${entry.id}:${warp.id} ${landing.x},${landing.y},${landing.direction} -> ${next.x},${next.y},${next.direction}`)
      updates.set(warp, next)
    }
  }
  for (const entry of entries) {
    const events = entry.mapInfo.runtimeEvents || []
    if (!events.some((event) => updates.has(event))) continue
    entry.mapInfo = {
      ...entry.mapInfo,
      runtimeEvents: events.map((event) => updates.has(event)
        ? { ...event, target: { ...event.target, position: { ...event.target.position, ...updates.get(event) } } }
        : event)
    }
  }
  return fixes
}
