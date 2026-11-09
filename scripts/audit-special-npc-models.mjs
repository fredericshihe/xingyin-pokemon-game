#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

const EXPECTED = [
  {
    mapId: 'GodotMapV2_BossHighland',
    eventId: 'npc_peak_pokemon_breeder',
    model: 'trainer_breeder',
    title: '宝可梦饲养家',
  },
  {
    mapId: 'GodotMapV2_SurvivalRidge',
    eventId: 'npc_ridge_coin_sprint',
    model: 'trainer_challenge',
    title: '铁木计时员',
  },
]

const folder = 'public/assets/3d/xingyin-refined-v1'
const characterFolder = 'public/assets/3d/xingyin-characters-v2'
const playerFile = `${characterFolder}/player_child_adventurer.glb`
const refinedManifest = JSON.parse(await fs.readFile(`${folder}/manifest.json`, 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
})

const finiteBounds = (document, label) => {
  const scenes = document.getRoot().listScenes()
  assert.ok(scenes.length, `${label}: scene missing`)
  const bounds = getBounds(scenes[0])
  for (const value of [...bounds.min, ...bounds.max]) assert.ok(Number.isFinite(value), `${label}: non-finite bounds`)
  for (let axis = 0; axis < 3; axis += 1) assert.ok(bounds.max[axis] >= bounds.min[axis], `${label}: inverted bounds`)
  return bounds
}

const modelStats = async (file, label) => {
  const stat = await fs.stat(file)
  assert.ok(stat.size > 1024, `${label}: GLB is unexpectedly empty`)
  const document = await io.read(file)
  const bounds = finiteBounds(document, label)
  const root = document.getRoot()
  assert.ok(root.listMeshes().length, `${label}: mesh missing`)
  assert.ok(root.listMaterials().length, `${label}: material missing`)
  return {
    bounds,
    height: bounds.max[1] - bounds.min[1],
    width: bounds.max[0] - bounds.min[0],
    depth: bounds.max[2] - bounds.min[2],
    nodes: root.listNodes().map((node) => node.getName()).filter(Boolean),
    bytes: stat.size,
  }
}

await withViteAuditServer(async ({ loadModule }) => {
  const { getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
  const { REFINED_MODEL_ASSETS } = await loadModule('/src/game/data/refinedModelAssets.generated.js')
  const { PLAYER_REFERENCE_HEIGHT } = await loadModule('/src/game/modelScaleReference.js')

  const bySource = new Map(refinedManifest.assets.map((entry) => [entry.source, entry]))
  const models = new Map()
  const player = await modelStats(playerFile, 'player_child_adventurer')
  assert.ok(Math.abs(player.height - PLAYER_REFERENCE_HEIGHT) < 0.01,
    `player reference height changed: ${player.height}`)

  for (const expected of EXPECTED) {
    const map = getMapInfo(expected.mapId)
    assert.ok(map, `${expected.mapId}: map missing`)
    const event = (map.runtimeEvents || []).find((entry) => entry.id === expected.eventId)
    assert.ok(event, `${expected.eventId}: event missing`)
    assert.equal(event.properties?.characterModel, expected.model, `${expected.eventId}: wrong configured model`)
    assert.equal(event.properties?.name, expected.title, `${expected.eventId}: wrong NPC title`)

    const decorations = (map.decorativeObjects || []).filter((entry) => entry.eventId === expected.eventId)
    const npc = decorations.find((entry) => entry.sourceId === `${expected.eventId}_npc`)
    assert.ok(npc, `${expected.eventId}: generated NPC decoration missing`)
    assert.equal(npc.type, expected.model, `${expected.eventId}: generated decoration changed model`)
    assert.ok(npc.scale >= 0.58 && npc.scale <= 0.68, `${expected.eventId}: unexpected NPC scale ${npc.scale}`)
    assert.ok(npc.height > 0 && npc.height <= 0.2, `${expected.eventId}: invalid ground height ${npc.height}`)

    const catalog = MAP_ASSET_CATALOG[expected.model]
    assert.ok(catalog, `${expected.model}: catalog entry missing`)
    assert.equal(catalog.sourcePackage, 'xingyin-original-blender', `${expected.model}: wrong source package`)
    assert.equal(catalog.assetPath, `/assets/3d/xingyin-characters-v2/${expected.model}.glb`,
      `${expected.model}: wrong source path`)
    const source = catalog.assetPath
    const redirect = REFINED_MODEL_ASSETS[source]
    if (redirect) {
      const entry = bySource.get(source)
      assert.ok(entry, `${expected.model}: refined manifest entry missing`)
      assert.equal(entry.output, redirect, `${expected.model}: runtime redirect differs from manifest`)
    }

    const stats = await modelStats(`public${redirect || source}`, expected.model)
    assert.ok(Math.abs(stats.height * npc.scale - player.height) < 0.04,
      `${expected.model}: rendered height ${stats.height * npc.scale} does not match player ${player.height}`)
    models.set(expected.model, stats)
  }

  const breeder = models.get('trainer_breeder')
  const challenge = models.get('trainer_challenge')
  assert.notEqual(breeder.bytes, challenge.bytes, 'breeder and challenge GLBs are identical in size')
  assert.notDeepEqual(breeder.nodes, challenge.nodes, 'breeder and challenge node names are identical')
  assert.ok(Math.abs(breeder.width - challenge.width) > 0.02 || Math.abs(breeder.depth - challenge.depth) > 0.02,
    'breeder and challenge models do not have distinct silhouettes')
})

console.log('PASS: breeder and timber-league NPC events preserve distinct Blender models, refined redirects, finite GLB bounds, and player-matched rendered heights.')
