// 出入口严格配对审计（基于最终地图目录）：
// 1. 每个出口在目标地图都有且只有一个"通回来"的出口，且落点就在那个出口向内一格；
// 2. 两边互为对方：A 出口 → B 的落点旁的返回口 → 落回 A 出口向内一格；
// 3. 落点可走、朝向可走且不朝回返回口；
// 4. 两张大地图之间的贴边出口必须是对边（东↔西、南↔北），不允许斜对角或同侧相连。
import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CATALOG, MAP_CHAIN } = await loadModule('/src/game/data/mapCatalog.js')
  const { isWalkable } = await loadModule('/src/game/world/LegacyGridAdapter.js')
  const { isEnvironmentTileBlocked } = await loadModule('/src/game/environmentNavigation.js')
  const { collectVisualSolidFootprints, distanceToFootprint, CHARACTER_BODY_RADIUS_TILES } = await loadModule('/src/game/mapVisualCollision.js')
  const { sampleRoadSurface } = await loadModule('/src/game/mapRoadSurface.js')
  const { sampleWaterSurface } = await loadModule('/src/game/mapWaterSurface.js')
  const { isForestWallExitClearance } = await loadModule('/src/game/forestWallScenery.js')
  const surfaces = new Map(MAP_CHAIN.map(id => {
    const map = MAP_CATALOG[id].mapInfo
    return [id, sampleRoadSurface(map, { waterSurface: sampleWaterSurface(map) })]
  }))
  const roadAt = (id, x, y) => {
    const s = surfaces.get(id)
    if (!s) return -Infinity
    const fi = (x - s.x0) / s.step, fj = (y - s.y0) / s.step
    const i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, ty = fj - j
    if (i < 0 || j < 0 || i >= s.nx - 1 || j >= s.ny - 1) return -Infinity
    const at = (a,b) => s.road[b * s.nx + a]
    return (at(i,j) * (1-tx) + at(i+1,j) * tx) * (1-ty) + (at(i,j+1) * (1-tx) + at(i+1,j+1) * tx) * ty
  }
  const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }
  const OPPOSITE = { W: 'E', E: 'W', N: 'S', S: 'N' }
  const failures = []
  const fail = (message) => failures.push(message)
  const warpsOf = (id) => MAP_CATALOG[id].mapInfo.runtimeEvents.filter((event) => event.type === 'warp')
  const side = (map, p) => {
    const W = map.mapGrid[0].length, H = map.mapGrid.length
    return p.x <= 1 ? 'W' : p.x >= W - 2 ? 'E' : p.y <= 1 ? 'N' : p.y >= H - 2 ? 'S' : 'in'
  }
  const obstacles = new WeakMap()
  const walk = (map, x, y) => {
    if (!isWalkable(map.mapGrid, x, y) || isEnvironmentTileBlocked(map, x, y)) return false
    if (!obstacles.has(map)) obstacles.set(map, collectVisualSolidFootprints(map).filter((f) =>
      f.source.startsWith('procedural:') || /tree|bush|rock|forest|building/i.test(f.source)))
    return !obstacles.get(map).some((f) => distanceToFootprint(f, x, y) <= CHARACTER_BODY_RADIUS_TILES)
  }
  let pairs = 0
  for (const id of MAP_CHAIN) {
    const map = MAP_CATALOG[id].mapInfo
    for (const warp of warpsOf(id)) {
      const label = `${id}:${warp.id}`
      const targetId = warp.target?.mapName
      const target = MAP_CATALOG[targetId]?.mapInfo
      if (!target) { fail(`${label}: target map ${targetId} missing`); continue }
      const landing = warp.target.position
      const backs = warpsOf(targetId).filter((event) => event.target?.mapName === id)
      const back = backs.find((event) => Math.abs(event.position.x - landing.x) + Math.abs(event.position.y - landing.y) === 1)
      if (!back) { fail(`${label}: landing ${landing.x},${landing.y} is not next to a return exit to ${id}`); continue }
      const backLanding = back.target.position
      if (Math.abs(backLanding.x - warp.position.x) + Math.abs(backLanding.y - warp.position.y) !== 1) {
        fail(`${label}: return exit ${back.id} lands at ${backLanding.x},${backLanding.y}, not beside ${warp.position.x},${warp.position.y}`)
      }
      if (!walk(target, landing.x, landing.y)) fail(`${label}: landing ${landing.x},${landing.y} not walkable`)
      if (roadAt(id, warp.position.x, warp.position.y) < CHARACTER_BODY_RADIUS_TILES) fail(`${label}: exit has no visible road underfoot`)
      if (roadAt(targetId, landing.x, landing.y) < CHARACTER_BODY_RADIUS_TILES) fail(`${label}: arrival has no visible road underfoot`)
      const [fx, fy] = STEP[landing.direction] || [0, 0]
      if (landing.x + fx === back.position.x && landing.y + fy === back.position.y) fail(`${label}: landing faces straight back into ${back.id}`)
      else if (!walk(target, landing.x + fx, landing.y + fy)) fail(`${label}: landing faces a blocked tile`)
      if (roadAt(targetId, landing.x + fx, landing.y + fy) < CHARACTER_BODY_RADIUS_TILES) fail(`${label}: arrival approach leaves the visible road`)
      const s1 = side(map, warp.position), s2 = side(target, back.position)
      const bothOverworld = map.mapGrid[0].length >= 36 && target.mapGrid[0].length >= 36
      if (bothOverworld && s1 !== 'in' && s2 !== 'in' && OPPOSITE[s1] !== s2) {
        fail(`${label}: ${id} ${s1} edge connects to ${targetId} ${s2} edge (must be opposite sides)`)
      }
      if (s1 !== 'in') {
        const [ox, oy] = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] }[s1]
        for (let offset = 1; offset <= 10; offset++) {
          for (const lateral of [-1, 0, 1]) {
            if (!isForestWallExitClearance(map, warp.position.x + ox * offset - oy * lateral, warp.position.y + oy * offset + ox * lateral)) {
              fail(`${label}: forest can obstruct the extended road ${offset} tiles outside the exit`)
            }
          }
        }
      }
      const portal = map.decorativeObjects.find(object => object.eventId === warp.id && object.type?.endsWith('_portal'))
      if (portal) {
        const ax = backLanding.x - warp.position.x, ay = backLanding.y - warp.position.y
        // The portal's opening lies in local XY; travel must follow its local
        // Z normal, otherwise the arrival crosses a post instead of the arch.
        const alignment = Math.abs(Math.sin(portal.rotation || 0) * ax + Math.cos(portal.rotation || 0) * ay)
        if (alignment < 0.999) fail(`${label}: portal opening is sideways to its paired arrival road`)
        const accents = map.decorativeObjects.filter(object => object.sourceId?.startsWith(`${warp.id}_elite_route_`) && object !== portal)
        for (const accent of accents) {
          const lateral = Math.abs((accent.x - warp.position.x) * -ay + (accent.y - warp.position.y) * ax)
          if (lateral < 0.9) fail(`${label}: portal accent ${accent.sourceId} stands in the approach lane`)
        }
      }
      pairs += 1
    }
  }
  if (failures.length) {
    console.error(`FAIL: ${failures.length} warp pairing problem(s)`)
    failures.forEach((line) => console.error(`  ${line}`))
    process.exitCode = 1
    return
  }
  console.log(`PASS: ${pairs} exits are strictly paired both ways; overworld edge links always join opposite sides.`)
})
