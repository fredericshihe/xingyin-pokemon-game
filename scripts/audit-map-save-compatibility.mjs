import assert from 'node:assert/strict'
import { createServer, loadEnv } from 'vite'
import { ROOT_DIR } from './load-vite-module.mjs'

// Export the actual load/save helpers only in this audit's module transform.
const server = await createServer({
  root: ROOT_DIR,
  configFile: false,
  publicDir: false,
  appType: 'custom',
  logLevel: 'error',
  define: {
    'import.meta.env': JSON.stringify({ ...loadEnv('production', ROOT_DIR, 'VITE_'), DEV: false, BASE_URL: '/' }),
    __APP_BUILD_ID__: JSON.stringify('save-compatibility-audit')
  },
  plugins: [{
    name: 'export-save-audit-helpers',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('/src/components/Game/OriginalGame.jsx')) return null
      return `${code}\nexport { normalizeCloudGameData, createCloudSnapshot, createDefaultCloudGameData, shouldPersistMapContentMigration, WORLD_MAP_CONTENT_VERSION };`
    }
  }],
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false }
})

try {
  const { normalizeCloudGameData, createCloudSnapshot, createDefaultCloudGameData,
    shouldPersistMapContentMigration, WORLD_MAP_CONTENT_VERSION } =
    await server.ssrLoadModule('/src/components/Game/OriginalGame.jsx')
  const { MAP_CHAIN, getMapInfo } = await server.ssrLoadModule('/src/game/data/mapCatalog.js')
  const { BLOCKED_LEGACY_TILES } = await server.ssrLoadModule('/src/game/world/constants.js')
  const defaults = createDefaultCloudGameData(500)
  const progress = {
    defeatedBossIds: ['GodotMapV2_FarmTown:village_boss'],
    defeatedTrainerIds: ['GodotMapV2_FarmTown:trainer_1'],
    collectedEventIds: ['GodotMapV2:item_1'],
    completedChallengeIds: ['GodotMapV2:challenge_1'],
    completedUnlockTaskIds: ['legacy-task'],
    completionRewardClaimIds: ['legacy-reward'],
    trainerVictoryCounts: { 'GodotMapV2_FarmTown:trainer_1': 4 },
    flags: { 'GodotMapV2:hidden_gate:rare': true },
    dexProgress: { registeredSpeciesKeys: ['pikachu'], wildCapturedSpeciesKeys: ['pikachu'] }
  }
  const makeSave = (mapId, position, version) => ({
    ...structuredClone(defaults),
    mapContentVersion: version,
    currentMapName: mapId,
    playerPos: position,
    mapGrid: [[1]],
    world: { ...structuredClone(defaults.world), ...structuredClone(progress),
      mapContentVersion: version, currentMapName: mapId, playerPos: position }
  })
  const checkProgress = (save) => {
    for (const key of ['defeatedBossIds', 'defeatedTrainerIds', 'collectedEventIds',
      'completedChallengeIds', 'completedUnlockTaskIds', 'completionRewardClaimIds']) {
      assert.ok(progress[key].every((id) => save.world[key].includes(id)), `Lost ${key}`)
    }
    assert.equal(save.world.trainerVictoryCounts['GodotMapV2_FarmTown:trainer_1'], 4)
    assert.equal(save.world.flags['GodotMapV2:hidden_gate:rare'], true)
    assert.ok(save.world.dexProgress.registeredSpeciesKeys.includes('pikachu'))
    assert.equal(save.playerGold, 500)
    assert.deepEqual(save.playerInventory, defaults.playerInventory)
    assert.equal(save.mapContentVersion, WORLD_MAP_CONTENT_VERSION)
    assert.equal(save.world.mapContentVersion, WORLD_MAP_CONTENT_VERSION)
    assert.equal(save.currentMapName, save.world.currentMapName)
    assert.deepEqual(save.playerPos, save.world.playerPos)
  }

  let cases = 0
  for (const mapId of MAP_CHAIN) {
    const map = getMapInfo(mapId)
    const positions = [{ x: -4, y: -4 }, { x: map.width + 4, y: map.height + 4 }]
    for (const tile of [1, 11, 20]) {
      const y = map.mapGrid.findIndex((row) => row.includes(tile))
      if (y >= 0) positions.push({ x: map.mapGrid[y].indexOf(tile), y })
    }
    const scenery = [...(map.environmentBlockedTiles || [])][0]
    if (scenery) {
      const [x, y] = scenery.split(',').map(Number)
      positions.push({ x, y })
    }
    for (const position of positions) for (const version of [undefined, 47, WORLD_MAP_CONTENT_VERSION]) {
      const raw = makeSave(mapId, { ...position, direction: 'left' }, version)
      const old = JSON.stringify(raw)
      const loaded = normalizeCloudGameData(raw, 500)
      assert.equal(JSON.stringify(raw), old, 'Loading mutated the original save')
      assert.ok(shouldPersistMapContentMigration(raw, loaded), `${mapId}: repaired save not queued for persistence`)
      assert.equal(loaded.currentMapName, mapId)
      assert.equal(loaded.playerPos.direction, 'left')
      const { x, y } = loaded.playerPos
      assert.ok(loaded.mapGrid[y]?.[x] != null && !BLOCKED_LEGACY_TILES.has(loaded.mapGrid[y][x]))
      assert.ok(!map.environmentBlockedTiles?.has(`${x},${y}`), `${mapId}: scenery still covers saved position`)
      assert.ok(!map.runtimeEvents.some((event) => event.position.x === x && event.position.y === y), `${mapId}: recovery triggers an event`)
      checkProgress(loaded)
      const saved = createCloudSnapshot(loaded)
      const reloaded = normalizeCloudGameData(saved, 500)
      checkProgress(saved)
      checkProgress(reloaded)
      assert.deepEqual(reloaded.playerPos, loaded.playerPos, `${mapId}: position drifts after save/reload`)
      assert.deepEqual(reloaded.mapGrid, loaded.mapGrid, `${mapId}: terrain drifts after save/reload`)
      cases += 1
    }
  }

  let arrivals = 0
  for (const mapId of MAP_CHAIN) for (const warp of getMapInfo(mapId).runtimeEvents || []) {
    if (warp.type !== 'warp') continue
    const loaded = normalizeCloudGameData(makeSave(warp.target.mapName, warp.target.position, 47), 500)
    assert.deepEqual(loaded.playerPos, warp.target.position, `${mapId}: migration displaces paired arrival`)
    checkProgress(loaded)
    arrivals += 1
  }
  const unknown = normalizeCloudGameData(makeSave('obsolete-map', { x: 0, y: 0, direction: 'right' }, 1), 500)
  assert.equal(unknown.currentMapName, defaults.currentMapName)
  checkProgress(unknown)
  console.log(`PASS: ${MAP_CHAIN.length} maps, ${cases} legacy/current invalid-position saves, ${arrivals} paired arrivals; migration persists safe positions and preserves permanent progress, inventory and gold.`)
} finally {
  await server.close()
}
