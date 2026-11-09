import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

const folder = 'public/assets/3d/xingyin-characters-v2'
const manifest = JSON.parse(await fs.readFile(`${folder}/manifest.json`, 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
const signatures = new Map(), byId = new Map(), report = []
for (const record of [...manifest.characters, ...manifest.vehicles]) {
  const file = `${folder}/${record.file}`, document = await io.read(file), root = document.getRoot()
  const bounds = getBounds(root.listScenes()[0])
  assert.ok([...bounds.min, ...bounds.max].every(Number.isFinite), `${record.id}: invalid bounds`)
  assert.ok(bounds.max[1] > bounds.min[1], `${record.id}: empty model`)
  assert.equal(root.listMaterials().length, 1, `${record.id}: batching material budget`)
  const hash = createHash('sha256')
  let triangles = 0
  const physicalRegions = new Set()
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const positions = primitive.getAttribute('POSITION'), normal = primitive.getAttribute('NORMAL'), surface = primitive.getAttribute('_CHAR_SURFACE')
    assert.ok(positions && normal && surface, `${record.id}: required geometry/physical surface absent`)
    assert.equal(surface.getCount(), positions.getCount(), `${record.id}: surface count mismatch`)
    // Ignore vertex ordering, duplicate color seams and palette changes when
    // comparing physical shapes, so a recolor cannot satisfy uniqueness.
    const array = positions.getArray(), points = new Set()
    for (let i = 0; i < array.length; i += 3) points.add(`${array[i].toFixed(4)},${array[i + 1].toFixed(4)},${array[i + 2].toFixed(4)}`)
    hash.update([...points].sort().join('|'))
    triangles += (primitive.getIndices()?.getCount() || positions.getCount()) / 3
    const physical = surface.getArray()
    for (let i = 0; i < physical.length; i += 3) physicalRegions.add(`${physical[i].toFixed(2)}:${physical[i + 1].toFixed(2)}`)
  }
  assert.ok(physicalRegions.size >= 3, `${record.id}: cloth/skin/metal regions lost`)
  assert.equal(triangles, record.triangles, `${record.id}: declared triangle count`)
  assert.equal((await fs.stat(file)).size, record.bytes, `${record.id}: declared bytes`)
  assert.ok(triangles <= (record.id.startsWith('player_') ? 18000 : 16500), `${record.id}: triangle budget exceeded`)
  if (record.height) assert.ok(Math.abs(bounds.max[1] - bounds.min[1] - record.height) < .02, `${record.id}: authored height drift`)
  if (record.id === 'player_child_adventurer') {
    const names = root.listNodes().map(node => node.getName())
    for (const name of ['body','head','leftArm','rightArm','leftForearm','rightForearm','leftLeg','rightLeg','leftShin','rightShin','leftFoot','rightFoot','leftGrip','rightGrip']) assert.ok(names.includes(name), `player missing ${name}`)
    for (const [childName, parentName] of [['leftForearm','leftArm'],['rightForearm','rightArm'],['leftShin','leftLeg'],['rightShin','rightLeg'],['leftFoot','leftShin'],['rightFoot','rightShin']]) {
      const child = root.listNodes().find(node => node.getName() === childName)
      assert.equal(child.getParentNode()?.getName(), parentName, `${childName}: lost articulation parent`)
    }
  }
  const value = { id: record.id, name: record.name, bounds, triangles, bytes: record.bytes, shapeSignature: hash.digest('hex') }
  byId.set(record.id, value)
}
await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_IDS, getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const { getDecorativeModel } = await loadModule('/src/game/decorativeModelSpec.js')
  const { isCharacterModelKey, CHARACTER_MODEL_KEYS, CHARACTER_IDENTITY_PROFILES } = await loadModule('/src/game/data/characterAssets.js')
  assert.equal(CHARACTER_IDENTITY_PROFILES.length, 78)
  assert.equal(CHARACTER_MODEL_KEYS.length, manifest.characters.length)
  const used = new Set()
  for (const mapId of MAP_IDS) {
    const map = getMapInfo(mapId)
    for (const object of map.decorativeObjects || []) {
      const key = getDecorativeModel(object.type, object)?.key
      if (!isCharacterModelKey(key)) continue
      const record = byId.get(key)
      assert.ok(record, `${mapId}: ${key} not exported`)
      assert.ok(!used.has(key), `${key}: shared across different map people`)
      used.add(key)
      const other = signatures.get(record.shapeSignature)
      assert.ok(!other, `${key}: same physical shape as ${other}; palette swap alone is insufficient`)
      signatures.set(record.shapeSignature, key)
      const scale = object.scale || 1, height = (record.bounds.max[1] - record.bounds.min[1]) * scale
      assert.ok(height >= 1.42 && height <= 2.05, `${key}: inconsistent world height ${height}`)
      const event = map.runtimeEvents.find(event => event.id === object.eventId)
      assert.ok(event, `${key}: lost gameplay event`)
      if (key.startsWith('npc_')) assert.equal(event.properties.characterModel, key, `${key}: event visual mapping mismatch`)
      report.push({ map: map.displayName, eventId: object.eventId, name: event.properties.name, key, height: +height.toFixed(3), triangles: record.triangles, bytes: record.bytes })
    }
  }
  assert.equal(used.size, 96, 'Every map person should have its own model')
  assert.equal(signatures.size, 96, 'Every map person should have its own physical silhouette')
}, { define: { 'import.meta.env': JSON.stringify({ DEV: true, SSR: true, BASE_URL: '/' }) } })
await fs.mkdir('output/character-upgrade-v2', { recursive: true })
await fs.writeFile('output/character-upgrade-v2/asset-audit.json', JSON.stringify({ passed: true, characters: manifest.characters.length, mapPeople: report.length, uniquePhysicalShapes: signatures.size, maps: report }, null, 2))
console.log(`Character v2 audit passed: ${manifest.characters.length} exported characters, 96 people with distinct physical shapes, articulation, physical material regions and exact asset budgets.`)
