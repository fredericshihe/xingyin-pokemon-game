import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CATALOG } = await loadModule('/src/game/data/mapCatalog.js')
  const { MAP_EXCLUSIVE_SETS } = await loadModule('/src/game/data/mapExclusiveAssets.generated.js')
  const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
  const { ENVIRONMENT_MODEL_FOOTPRINTS } = await loadModule('/src/game/data/environmentModelFootprints.generated.js')
  const { WATER_DECORATION_TYPES, isEnvironmentPointInWater } = await loadModule('/src/game/data/mapEnvironmentDesign.js')
  const { collectRoadSurfaceDecorationOverlapEntries } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  for (const [id, footprint] of Object.entries(ENVIRONMENT_MODEL_FOOTPRINTS)) {
    const asset = MAP_ASSET_CATALOG[id]
    const root = (await io.read(`public${asset.assetPath}`)).getRoot()
    const bounds = getBounds(root.listScenes()[0])
    assert.ok(footprint.width * 1.55 / 2 >= Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) - .001, `${id}: underestimated width`)
    assert.ok(footprint.height * 1.55 / 2 >= Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])) - .001, `${id}: underestimated depth`)
    if (id.startsWith('environment_') || id.startsWith('exclusive_')) {
      assert.equal(root.listTextures().length, 0)
      assert.equal(root.listMaterials().length, 1)
      assert.equal(root.listMeshes().length, 1)
      assert.ok(Math.abs(bounds.min[1]) < .005, `${id}: ungrounded origin`)
      assert.ok((await fs.stat(`public${asset.assetPath}`)).size < 30000)
    }
  }
  let anchors = 0, waterProps = 0, total = 0
  for (const [id, { mapInfo: map }] of Object.entries(MAP_CATALOG)) {
    const objects = map.decorativeObjects
    total += objects.length
    assert.ok(objects.some(o => MAP_EXCLUSIVE_SETS[id]?.includes(o.type)), `${id}: missing dedicated map set`)
    const overlaps = collectRoadSurfaceDecorationOverlapEntries(map).filter(o => o.sourceId?.startsWith('environment_'))
    assert.deepEqual(overlaps, [], `${id}: environment obstructs a road`)
    const occupied = new Map()
    for (const event of map.runtimeEvents) {
      if (event.type === 'objective') continue // Objectives can intentionally share a route checkpoint.
      const key = `${event.position.x},${event.position.y}`
      assert.ok(!occupied.has(key), `${id}: ${event.id} overlaps ${occupied.get(key)} at ${key}`)
      occupied.set(key, event.id)
    }
    for (const object of objects) {
      if (object.environmentAnchor) anchors++
      if (WATER_DECORATION_TYPES.has(object.type)) {
        waterProps++
        assert.ok(isEnvironmentPointInWater(map, object.x, object.y, -.15), `${id}: ${object.type} on dry land`)
      }
      if (object.sourceId?.startsWith('farm_wheat_') || object.sourceId?.startsWith('grave_stones_')) assert.equal(object.rotation, 0, `${id}: rows lost their alignment`)
      if (!object.eventId) assert.ok(!['survival_tool_axe', 'survival_tool_pickaxe', 'grave_coffin_old', 'town_windmill'].includes(object.type), `${id}: unsupported loose prop ${object.type}`)
    }
  }
  console.log(`Environment audit passed: ${Object.keys(MAP_CATALOG).length} maps, ${total} decorations, ${anchors} focal objects, ${waterProps} water props; measured bounds, roads, unique interactions, habitats and asset budgets valid.`)
})
