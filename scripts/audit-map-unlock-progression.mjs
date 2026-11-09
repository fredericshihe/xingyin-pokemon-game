import assert from 'node:assert/strict'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CHAIN, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { getForwardMapBossGate, getWarpEventLockState, getFastTravelMapLockState } =
    await loadModule('/src/game/mapProgression.js')
  const events = (id) => getMapInfo(id).runtimeEvents || []
  const bosses = MAP_CHAIN.flatMap((mapId) => events(mapId)
    .filter((event) => event.type === 'boss')
    .map((event) => ({ mapId, id: event.id })))
  const warps = MAP_CHAIN.flatMap((from) => events(from)
    .filter((event) => event.type === 'warp')
    .map((warpEvent) => ({ from, to: warpEvent.target.mapName, warpEvent })))
  const worldFor = (completed, scoped = true) => ({
    defeatedBossIds: completed.map((boss) => scoped ? `${boss.mapId}:${boss.id}` : boss.id)
  })
  const playerTeam = [{ level: 6 }]
  const canWarp = ({ from, to, warpEvent }, world) =>
    !getForwardMapBossGate({ currentMapName: from, targetMapName: to, world }) &&
    !getWarpEventLockState({ currentMapName: from, warpEvent, world, playerTeam }).locked

  // Explore the real graph from a fresh save after each boss. Shortcuts must
  // never let either walking or fast travel reach a later chapter early.
  for (let cleared = 0; cleared <= bosses.length; cleared += 1) {
    const world = worldFor(bosses.slice(0, cleared))
    const expected = MAP_CHAIN.slice(0, cleared + 2)
    const visited = new Set([MAP_CHAIN[0]])
    const queue = [MAP_CHAIN[0]]
    for (const from of queue) {
      for (const route of warps.filter((entry) => entry.from === from)) {
        if (!canWarp(route, world) || visited.has(route.to)) continue
        visited.add(route.to)
        queue.push(route.to)
      }
    }
    assert.deepEqual(MAP_CHAIN.filter((id) => visited.has(id)), expected,
      `Walking unlock order after ${cleared} bosses`)
    const fastTravel = MAP_CHAIN.filter((targetMapName) => !getFastTravelMapLockState({
      currentMapName: MAP_CHAIN[0], targetMapName, world, playerTeam
    }).locked)
    assert.deepEqual(fastTravel, expected, `Fast travel unlock order after ${cleared} bosses`)
  }

  // Reproduce incomplete old saves: a later boss is recorded, but one earlier
  // boss is missing. Every entrance to that chapter must agree about the lock.
  let missingProgressChecks = 0
  for (const targetMapName of MAP_CHAIN.slice(2)) {
    const targetIndex = MAP_CHAIN.indexOf(targetMapName)
    const prerequisites = bosses.filter((boss) => MAP_CHAIN.indexOf(boss.mapId) < targetIndex)
    const incoming = warps.filter((route) => route.to === targetMapName && MAP_CHAIN.indexOf(route.from) < targetIndex)
    for (const missing of prerequisites) {
      const world = worldFor(prerequisites.filter((boss) => boss !== missing))
      for (const route of incoming) {
        const gate = getForwardMapBossGate({ currentMapName: route.from, targetMapName, world })
        assert.equal(gate?.mapId, missing.mapId, `${route.from} → ${targetMapName}: missing ${missing.mapId}`)
        assert.equal(getFastTravelMapLockState({ currentMapName: route.from, targetMapName, world, playerTeam }).locked,
          true, `Fast travel bypasses ${missing.mapId}`)
        missingProgressChecks += 1
      }
    }
  }

  // Retreat must work even for an old save with no boss records. A repaired
  // prefix then permits the exact same exit to be crossed forward again.
  let returnChecks = 0
  for (const route of warps.filter((entry) => MAP_CHAIN.indexOf(entry.to) < MAP_CHAIN.indexOf(entry.from))) {
    assert.equal(canWarp(route, {}), true, `Blocked retreat ${route.from} → ${route.to}`)
    assert.equal(getFastTravelMapLockState({ currentMapName: route.from, targetMapName: route.to, world: {}, playerTeam }).locked,
      false, `Blocked fast-travel retreat ${route.from} → ${route.to}`)
    const reverse = warps.find((entry) => entry.from === route.to && entry.to === route.from)
    assert.ok(reverse, `Missing return pairing ${route.from} ↔ ${route.to}`)
    assert.equal(canWarp(reverse, worldFor(bosses)), true, `Blocked unlocked return ${route.to} → ${route.from}`)
    returnChecks += 1
  }

  const starterExit = warps.find((entry) => entry.from === MAP_CHAIN[0])
  for (const level of [5, 6]) {
    const args = { currentMapName: starterExit.from, targetMapName: starterExit.to, warpEvent: starterExit.warpEvent, world: {}, playerTeam: [{ level }] }
    assert.equal(getWarpEventLockState(args).locked, level < 6, `Starter walking Lv.${level}`)
    assert.equal(getFastTravelMapLockState(args).locked, level < 6, `Starter fast travel Lv.${level}`)
  }
  // Historical unscoped IDs remain accepted when the event ID is unique.
  for (const route of warps) assert.equal(canWarp(route, worldFor(bosses, false)), true,
    `Legacy completion IDs rejected for ${route.from} → ${route.to}`)

  const trainerId = events('GodotMapV2_FrostDojo').find((event) => event.type === 'trainer').id
  const gatedWarp = { target: { mapName: 'GodotMapV2_TideDojo' }, properties: { requiredTrainerIds: [trainerId] } }
  assert.equal(getWarpEventLockState({ currentMapName: 'GodotMapV2_FrostDojo', warpEvent: gatedWarp, world: {}, playerTeam }).locked, true)
  assert.equal(getWarpEventLockState({ currentMapName: 'GodotMapV2_FrostDojo', warpEvent: gatedWarp,
    world: { defeatedTrainerIds: [`GodotMapV2_FrostDojo:${trainerId}`] }, playerTeam }).locked, false)
  assert.equal(getFastTravelMapLockState({ currentMapName: MAP_CHAIN[0], targetMapName: 'missing-map', world: {}, playerTeam }).locked, true)

  console.log(`PASS: ${MAP_CHAIN.length} chapters unlock in order; ${missingProgressChecks} missing-boss cases stay locked; ${returnChecks} return pairs stay open; starter Lv.6 and trainer requirements preserved.`)
})
