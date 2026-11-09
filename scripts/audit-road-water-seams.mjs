#!/usr/bin/env node
// 道路 / 桥 / 湖泊接缝审计：检查 ThreeLowPolyMap 实际使用的平滑道路与网格水面几何。
// 1. 每个水格中心都在可见水面内；每个可走（非桥）格中心离水面至少 MIN_DRY_MARGIN。
// 2. 断头路端头不超出道路 tile（离中心 ≤ ROAD_END_LIMIT）。
// 3. 可见路面不进入可见水面（桥下除外）。
// 4. 每座桥两端都能接上路面或陆地，不悬在水里。
// 5. 路面与路肩的最终三角网格均在地图边界内（包括采样水域之外的远景海面）。
import { withViteAuditServer } from './load-vite-module.mjs'

const MIN_DRY_MARGIN = 0.28
const ROAD_END_LIMIT = 0.56
const ROAD_TILES = new Set([2, 6, 12, 15])

function sampleField(surface, values, x, y) {
  const fi = (x - surface.x0) / surface.step
  const fj = (y - surface.y0) / surface.step
  const i = Math.floor(fi)
  const j = Math.floor(fj)
  if (i < 0 || j < 0 || i >= surface.nx - 1 || j >= surface.ny - 1) return null
  const tx = fi - i
  const ty = fj - j
  const at = (ii, jj) => values[jj * surface.nx + ii]
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty
}

function isNearBridge(map, x, y, padding) {
  return (map.bridges || []).some((bridge) => {
    const rotation = Number(bridge.rotation) || 0
    const dx = x - bridge.x
    const dy = y - bridge.y
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    return Math.abs(dx * cos + dy * sin) <= (Number(bridge.length) || 3) / 2 + padding &&
      Math.abs(-dx * sin + dy * cos) <= (Number(bridge.width) || 1.12) / 2 + padding
  })
}

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CHAIN, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { BLOCKED_LEGACY_TILES } = await loadModule('/src/game/world/constants.js')
  const { sampleWaterSurface } = await loadModule('/src/game/mapWaterSurface.js')
  const { buildRoadSurfaceGeometries } = await loadModule('/src/game/mapRoadSurface.js')

  const failures = []
  const summary = []
  for (const id of MAP_CHAIN) {
    const map = getMapInfo(id)
    const grid = map.mapGrid
    const height = grid.length
    const width = grid[0].length
    const fail = (message) => failures.push(`${id}: ${message}`)
    const water = sampleWaterSurface(map)
    const geometry = buildRoadSurfaceGeometries(map, { waterSurface: water, toWorld: (x, y) => ({ x, z: y }) })
    const roads = geometry?.surface
    const waterAt = (x, y) => (water ? sampleField(water, water.sdf, x, y) ?? 9 : 9)
    const streams = (map.waterBodies || []).filter((body) => body?.type === 'stream')

    let waterTiles = 0
    let minDry = Infinity
    if (water && !streams.length) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const tile = grid[y][x]
          const d = waterAt(x, y)
          if (tile === 11) {
            waterTiles += 1
            if (d >= -0.05) fail(`water tile (${x},${y}) is not covered by visible water (sdf ${d.toFixed(2)})`)
          } else if (tile !== 15 && !BLOCKED_LEGACY_TILES.has(tile)) {
            minDry = Math.min(minDry, d)
            if (d < MIN_DRY_MARGIN) fail(`walkable tile (${x},${y}) sits ${d < 0 ? 'inside' : 'too close to'} visible water (sdf ${d.toFixed(2)})`)
          }
        }
      }
    }

    if (roads) {
      for (const name of ['road', 'edge']) {
        const positions = geometry[name]?.attributes.position
        let outside = 0
        for (let i = 0; i < (positions?.count || 0); i++) {
          const x = positions.getX(i)
          const y = positions.getZ(i)
          if (x < -0.5001 || y < -0.5001 || x > width - 0.4999 || y > height - 0.4999) outside++
        }
        if (outside) fail(`${outside} ${name} vertices extend outside the map towards the exterior sea`)
        geometry[name]?.dispose()
      }
      for (const event of map.runtimeEvents || []) {
        if (event.type !== 'warp') continue
        const { x, y } = event.position
        if ((sampleField(roads, roads.road, x, y) ?? -1) <= 0) fail(`exit ${event.id} no longer meets the road`)
      }
      roads.freeEnds.forEach((end) => {
        const tile = grid[Math.round(end.y)]?.[Math.round(end.x)]
        if (!ROAD_TILES.has(tile)) fail(`road end (${end.x},${end.y}) is not on a road tile (tile ${tile})`)
        const segment = roads.segments.find((candidate) => (
          Math.hypot(candidate.ax - end.x, candidate.ay - end.y) < 0.6 || Math.hypot(candidate.bx - end.x, candidate.by - end.y) < 0.6
        ))
        if (!segment) return
        const nearA = Math.hypot(segment.ax - end.x, segment.ay - end.y) < Math.hypot(segment.bx - end.x, segment.by - end.y)
        const tipX = nearA ? segment.ax : segment.bx
        const tipY = nearA ? segment.ay : segment.by
        // 端头圆弧从收缩后的端点再向外延伸 radius。
        const reach = segment.radius - Math.hypot(tipX - end.x, tipY - end.y)
        if (reach > ROAD_END_LIMIT + 1e-6) fail(`road end (${end.x},${end.y}) cap reaches ${reach.toFixed(2)} tile past the tile centre`)
      })

      let wetRoad = 0
      for (let j = 0; j < roads.ny; j += 1) {
        for (let i = 0; i < roads.nx; i += 1) {
          if (roads.road[j * roads.nx + i] <= 0) continue
          const x = roads.x0 + i * roads.step
          const y = roads.y0 + j * roads.step
          if (waterAt(x, y) < -0.02 && !isNearBridge(map, x, y, 0.25)) wetRoad += 1
        }
      }
      if (wetRoad) fail(`${wetRoad} road surface samples lie inside visible water outside bridges`)

      ;(map.bridges || []).forEach((bridge, index) => {
        const rotation = Number(bridge.rotation) || 0
        const half = (Number(bridge.length) || 3) / 2
        ;[-1, 1].forEach((side) => {
          const x = bridge.x + Math.cos(rotation) * half * side
          const y = bridge.y + Math.sin(rotation) * half * side
          const roadHere = sampleField(roads, roads.road, x, y) ?? -1
          const beyondX = x + Math.cos(rotation) * 0.45 * side
          const beyondY = y + Math.sin(rotation) * 0.45 * side
          const landBeyond = waterAt(beyondX, beyondY) > -0.05
          // T 字形栈桥：桥头（或刚过桥头处）落在另一座桥的桥面上也算接通
          const probes = [[beyondX, beyondY], [x, y], [x - Math.cos(rotation) * 0.45 * side, y - Math.sin(rotation) * 0.45 * side]]
          const joinsBridge = (map.bridges || []).some((other, otherIndex) => otherIndex !== index &&
            probes.some(([px, py]) => isNearBridgeSingle(other, px, py)))
          if (roadHere <= 0 && !landBeyond && !joinsBridge) fail(`bridge #${index} end (${x.toFixed(1)},${y.toFixed(1)}) meets neither road nor land`)
        })
      })
    }
    summary.push(`${id}: waterTiles=${waterTiles} minDryMargin=${Number.isFinite(minDry) ? minDry.toFixed(2) : '-'} roadSegments=${roads?.segments.length ?? 0} deadEnds=${roads?.freeEnds.length ?? 0} bridges=${(map.bridges || []).length}`)
  }

  function isNearBridgeSingle(bridge, x, y) {
    return isNearBridge({ bridges: [bridge] }, x, y, 0.05)
  }

  summary.forEach((line) => console.log(line))
  if (failures.length) {
    console.error(`\nRoad/water seam audit failed (${failures.length}):`)
    failures.slice(0, 80).forEach((line) => console.error(`- ${line}`))
    process.exitCode = 1
    return
  }
  console.log(`\nRoad/water seam audit passed for ${MAP_CHAIN.length} maps.`)
})
