import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import validator from 'gltf-validator'
import { withViteAuditServer } from './load-vite-module.mjs'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule()
})
const shapes = new Map(), files = new Set(), assets = [], maps = []
const overlaps = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1
await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_CATALOG } = await loadModule('/src/game/data/mapCatalog.js')
  const { MAP_BOUNDARY_ASSETS, MAP_BOUNDARY_SETS, MAP_BOUNDARY_MEASUREMENTS } = await loadModule('/src/game/data/mapBoundaryAssets.generated.js')
  const { isSafeEnvironmentBackground, getEnvironmentObjectBounds, isGenericEnvironmentBoundary } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  assert.equal(Object.keys(MAP_BOUNDARY_SETS).length, 13)
  assert.equal(MAP_BOUNDARY_ASSETS.length, 156)
  for (const asset of MAP_BOUNDARY_ASSETS) {
    assert.ok(!files.has(asset.assetPath), `${asset.id}: shared file`)
    files.add(asset.assetPath)
    const data = await fs.readFile(`public${asset.assetPath}`)
    const validation = await validator.validateBytes(new Uint8Array(data), { uri: asset.assetPath, maxIssues: 100 })
    assert.equal(validation.issues.numErrors, 0, `${asset.id}: invalid glTF`)
    assert.equal(validation.issues.numWarnings, 0, `${asset.id}: glTF warnings`)
    const root = (await io.read(`public${asset.assetPath}`)).getRoot()
    assert.equal(root.listMeshes().length, 1)
    assert.equal(root.listMaterials().length, 1)
    assert.equal(root.listTextures().length, 0)
    assert.equal(root.listAnimations().length, 0)
    const primitives = root.listMeshes()[0].listPrimitives()
    assert.equal(primitives.length, 1)
    const primitive = primitives[0], positions = primitive.getAttribute('POSITION')
    const bounds = getBounds(root.listScenes()[0]), measured = MAP_BOUNDARY_MEASUREMENTS[asset.id]
    assert.ok(Math.abs(bounds.min[1]) < .005, `${asset.id}: floating/buried pivot`)
    assert.ok(Math.abs(bounds.max[1] - bounds.min[1] - measured.height) < .001)
    assert.ok(measured.footprint.width * 1.55 / 2 >= Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])) - .001)
    assert.ok(measured.footprint.height * 1.55 / 2 >= Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])) - .001)
    const span = Math.max(...bounds.max.map((v, i) => v - bounds.min[i])), points = []
    for (let i = 0; i < positions.getCount(); i++) {
      points.push(positions.getElement(i, []).map((v, k) => Math.round((v - bounds.min[k]) / span * 10000)).join(','))
    }
    const signature = crypto.createHash('sha256').update([...new Set(points)].sort().join(';')).digest('hex')
    assert.ok(!shapes.has(signature), `${asset.id}: normalized clone of ${shapes.get(signature)}`)
    shapes.set(signature, asset.id)
    const triangles = primitive.getIndices().getCount() / 3
    assert.ok(triangles <= 2400 && data.length < 20000, `${asset.id}: exceeded asset budget`)
    assets.push({ id: asset.id, ownerMap: asset.ownerMap, bytes: data.length, triangles, signature })
  }
  for (const [id, { mapInfo: map }] of Object.entries(MAP_CATALOG)) {
    const boundary = map.decorativeObjects.filter(o => o.environmentBoundary)
    const hidden = map.decorativeObjects.filter(o => o.environmentHiddenBoundary)
    if (!MAP_BOUNDARY_SETS[id]) {
      assert.equal(boundary.length, 0)
      assert.equal(hidden.length, 0)
      continue
    }
    assert.equal(MAP_BOUNDARY_SETS[id].length, 12)
    assert.ok(boundary.length >= 6, `${id}: insufficient biome scenery`)
    assert.equal(new Set(boundary.map(o => o.type)).size, boundary.length)
    assert.ok(map.decorativeObjects.filter(isGenericEnvironmentBoundary).every(o => o.environmentHiddenBoundary), `${id}: visible generic white boundary stones`)
    assert.ok(hidden.every(isGenericEnvironmentBoundary), `${id}: hid non-boundary scenery`)
    for (const object of boundary) {
      assert.ok(MAP_BOUNDARY_SETS[id].includes(object.type), `${id}: foreign map model`)
      assert.ok(isSafeEnvironmentBackground(map, object), `${id}: boundary obstructs road/grass/water/event`)
      const bounds = getEnvironmentObjectBounds(object)
      for (const other of map.decorativeObjects) {
        if (other === object || other.environmentHiddenBoundary) continue
        assert.ok(!overlaps(bounds, getEnvironmentObjectBounds(other)), `${id}: ${object.type} overlaps ${other.type}`)
      }
    }
    maps.push({ id, hidden: hidden.length, placed: boundary.length, ...map.generationNotes.environmentComposition })
  }
})
const report = { ok: true, models: assets.length, bytes: assets.reduce((s, a) => s + a.bytes, 0), triangles: assets.reduce((s, a) => s + a.triangles, 0), placed: maps.reduce((s, m) => s + m.placed, 0), hidden: maps.reduce((s, m) => s + m.hidden, 0), maps, assets }
await fs.mkdir('output/map-interior-v5', { recursive: true })
await fs.writeFile('output/map-interior-v5/boundary-audit.json', JSON.stringify(report, null, 2) + '\n')
console.log(`PASS: ${assets.length} unique normalized biome geometries, clean glTF; ${report.placed} non-overlapping exclusive placements; ${report.hidden} generic white stones replaced; coast and interaction visuals preserved; ${report.bytes} bytes / ${report.triangles} triangles total.`)
