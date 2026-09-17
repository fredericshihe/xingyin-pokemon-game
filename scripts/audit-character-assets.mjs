import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import { CHARACTER_MODEL_KEYS, PLAYER_CHARACTER_KEY, resolveCharacterModelKey } from '../src/game/data/characterAssets.js'
import { MAP_MODEL_MANIFEST } from '../src/game/data/mapModelManifest.generated.js'
import { MAP_CHAIN, getMapInfo } from '../src/game/data/mapCatalog.js'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const manifest = JSON.parse(await fs.readFile(new URL('../public/assets/3d/xingyin-characters-v1/manifest.json', import.meta.url), 'utf8'))
let totalBytes=0
for (const key of CHARACTER_MODEL_KEYS) {
  const asset = MAP_ASSET_CATALOG[key]
  assert.ok(asset && !asset.procedural && asset.assetPath.includes('xingyin-characters-v1'), `${key}: missing new model registration`)
  const file = new URL(`../public${asset.assetPath}`, import.meta.url)
  const doc = await io.read(fileURLToPath(file))
  const root = doc.getRoot()
  const { min, max } = getBounds(root.listScenes()[0])
  const record = manifest.characters.find(entry=>entry.id===key)
  assert.ok(record, `${key}: missing manifest`)
  assert.ok(Math.abs(min[1]) < .005, `${key}: feet below/above ground ${min[1]}`)
  assert.ok(Math.abs(max[1]-record.height)<.01, `${key}: inconsistent height`)
  assert.ok(max[0]-min[0]<1.45 && max[2]-min[2]<1.15, `${key}: footprint obstructs paths`)
  assert.equal(root.listTextures().length, 0, `${key}: unexpected external texture dependency`)
  assert.equal(root.listMaterials().length, 1, `${key}: material budget exceeded`)
  assert.equal(root.listMeshes().length, key===PLAYER_CHARACTER_KEY ? 6 : 1, `${key}: draw call budget exceeded`)
  let triangleCount = 0
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) {
    assert.ok(p.getAttribute('NORMAL') && p.getAttribute('COLOR_0'), `${key}: lost smooth normals or palette`)
    triangleCount += p.getIndices().getCount()/3
  }
  assert.equal(triangleCount, record.triangles, `${key}: shipped geometry differs from manifest`)
  assert.ok(record.triangles <= 16500, `${key}: triangle budget exceeded`)
  if (key===PLAYER_CHARACTER_KEY) {
    const names=root.listNodes().map(node=>node.getName())
    for (const name of ['body','head','leftArm','rightArm','leftLeg','rightLeg']) assert.ok(names.includes(name), `player missing animation pivot ${name}`)
  }
  const bytes=(await fs.stat(file)).size
  assert.equal(bytes, record.bytes, `${key}: file size differs from optimized manifest`)
  assert.ok(bytes < 220000, `${key}: download budget exceeded ${bytes}`)
  totalBytes+=bytes
}
for (const role of ['merchant','boss','lieutenant','challenge']) {
  assert.equal(resolveCharacterModelKey('blocky_character_b',{npcRole:role}),`trainer_${role}`)
}
assert.equal(resolveCharacterModelKey('elite_frost_master',{npcRole:'boss'}),'elite_frost_master')
for (const mapName of MAP_CHAIN) {
  const keys = MAP_MODEL_MANIFEST[mapName]?.modelKeys || []
  assert.ok(keys.includes(PLAYER_CHARACTER_KEY), `${mapName}: player missing from entry preload`)
  for (const object of getMapInfo(mapName).decorativeObjects || []) {
    const key = resolveCharacterModelKey(object.type, object)
    if (CHARACTER_MODEL_KEYS.includes(key)) assert.ok(keys.includes(key), `${mapName}: ${key} missing from entry preload`)
  }
}
console.log(`Character asset audit passed: ${CHARACTER_MODEL_KEYS.length} original Blender GLBs, ${(totalBytes/1024).toFixed(0)} KB total; scale, pivots, normals, palette, roles and budgets valid.`)
