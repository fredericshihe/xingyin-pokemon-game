#!/usr/bin/env node
import assert from 'node:assert/strict'
import './audit-fishing-catalog.mjs'
import { FISHING_TIERS, FISHING_SPOTS, FISHING_MERCHANTS } from '../src/game/fishingCatalog.js'
import { evaluateFishingReel, getFishingDeadlineMs, isFishingBaitUnlocked, isFishingSpotUnlocked } from '../src/game/fishingRules.js'
import { withViteAuditServer } from './load-vite-module.mjs'

for (const tier of Object.values(FISHING_TIERS)) {
  const targetCenter = .5
  const step = tier.seconds * 1000
  for (const phase of [.5, 1.5, 2.5]) {
    const result = evaluateFishingReel({ ...tier, targetCenter, elapsedMs: step * phase })
    assert.equal(result.success, true)
    assert.equal(result.perfect, true)
  }
  assert.equal(evaluateFishingReel({ ...tier, targetCenter, elapsedMs: 0 }).success, false)
  assert.equal(evaluateFishingReel({ ...tier, targetCenter, elapsedMs: -1 }).timedOut, true)
  assert.equal(evaluateFishingReel({ ...tier, targetCenter,
    elapsedMs: getFishingDeadlineMs(tier.width, tier.seconds, targetCenter) + 1 }).timedOut, true)
}
assert.equal(isFishingBaitUnlocked('common', {}), true)
assert.equal(isFishingBaitUnlocked('secret', { currentMapName: 'GodotMapV2_PirateShore' }), false)
assert.equal(isFishingSpotUnlocked('lake_deep', { currentMapName: 'GodotMapV2_MistLake' }), false)
assert.equal(isFishingSpotUnlocked('lake_deep', { currentMapName: 'GodotMapV2_MistLake',
  defeatedBossIds: ['GodotMapV2_MistLake:mistlake_boss'] }), true)

await withViteAuditServer(async ({ loadModule }) => {
  const { getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { getMapStartPosition } = await loadModule('/src/game/data/mapEvents.js')
  const blocked = new Set([1, 2, 5, 6, 7, 10, 11, 14, 18, 20])
  let audited = 0
  for (const mapId of new Set(Object.values(FISHING_SPOTS).map(spot => spot.mapId))) {
    const map = getMapInfo(mapId), grid = map.mapGrid
    const start = getMapStartPosition(mapId)
    const queue = [start], reachable = new Set([`${start.x},${start.y}`])
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const { x, y } = queue[cursor]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, key = `${nx},${ny}`
        if (!Number.isInteger(grid[ny]?.[nx]) || blocked.has(grid[ny][nx]) || reachable.has(key)) continue
        reachable.add(key); queue.push({ x: nx, y: ny })
      }
    }
    for (const event of map.runtimeEvents.filter(event => event.id.startsWith('fishing_'))) {
      const { x, y } = event.position
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reachable.has(`${x + dx},${y + dy}`)), `${event.id} unreachable`)
      if (event.properties.spotId) {
        assert.equal(FISHING_SPOTS[event.properties.spotId].mapId, mapId)
        assert.equal(grid[event.properties.waterY]?.[event.properties.waterX], 11, `${event.id} float is not in water`)
      } else assert.equal(FISHING_MERCHANTS[event.properties.merchantId].mapId, mapId)
      audited++
    }
  }
  assert.equal(audited, 9)
  console.log(`fishing integration audit passed (5 timing tiers, unlock gates, ${audited} reachable map events)`)
})
