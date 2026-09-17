#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer, ROOT_DIR } from './load-vite-module.mjs'

// Run with node, or vite-node --script. An existing pre-edit snapshot is also
// checked by default; --baseline PATH makes that snapshot explicitly required.
const args = process.argv.slice(2)
const baselineIndex = args.indexOf('--baseline')
const baselinePath = path.resolve(ROOT_DIR, baselineIndex >= 0
  ? args[baselineIndex + 1] || 'output/map-refresh-v2/layout-before.json'
  : 'output/map-refresh-v2/layout-before.json')
const reportIndex = args.indexOf('--report')
const reportPath = reportIndex >= 0 ? path.resolve(ROOT_DIR, args[reportIndex + 1] || 'output/map-refresh-v2/composition-audit.json') : null
const CELL = 1.55
const EPSILON = .001
const failures = []
const maps = []
const assets = []
const check = (condition, message) => { if (!condition) failures.push(message) }
const canonical = value => JSON.stringify(normalize(value))
function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, normalize(value[key])]))
  return value
}
const same = (actual, expected, label) => check(canonical(actual) === canonical(expected), `${label}: changed`)
const withoutRenderScale = object => { const { environmentRenderScale, environmentHiddenBoundary, ...original } = object; return original }
const clone = value => JSON.parse(JSON.stringify(value))
const originalSignatures = JSON.parse(await fs.readFile(new URL('./fixtures/map-original-decorations.json', import.meta.url), 'utf8'))
const overlap = (a, b) => a.x1 < b.x2 - EPSILON && a.x2 > b.x1 + EPSILON && a.y1 < b.y2 - EPSILON && a.y2 > b.y1 + EPSILON
const eventPositions = map => (map.runtimeEvents || []).map(({ id, type, position }) => ({ id, type, position }))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
let baseline = null
try { baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8')) } catch (error) {
  if (error.code !== 'ENOENT' || baselineIndex >= 0) throw error
}

await withViteAuditServer(async ({ loadModule }) => {
  const modules = await Promise.allSettled([
    loadModule('/src/game/data/godotMaps/my_first_map.js'),
    loadModule('/src/game/data/godotMaps/godot_region_maps.js'),
    loadModule('/src/game/data/mapEnvironmentComposition.js'),
    loadModule('/src/game/data/mapAssetCatalog.js'),
    loadModule('/src/game/data/environmentModelFootprints.generated.js'),
    loadModule('/src/game/data/environmentSceneryMeasurements.generated.js')
  ])
  const rejected = modules.filter(result => result.status === 'rejected')
  if (rejected.length) throw new AggregateError(rejected.map(result => result.reason), 'Environment audit modules could not load')
  const [{ default: starter }, { GODOT_REGION_MAPS }, composition, { MAP_ASSET_CATALOG }, { ENVIRONMENT_MODEL_FOOTPRINTS }, { ENVIRONMENT_SCENERY_MEASUREMENTS }] = modules.map(result => result.value)
  const { isProtectedEnvironmentObject, isSafeEnvironmentBackground, getEnvironmentObjectBounds } = composition
  const { MAP_ENVIRONMENT_VIGNETTES } = await loadModule('/src/game/data/mapEnvironmentVignettes.js')
  const { MAP_EXCLUSIVE_MEASUREMENTS } = await loadModule('/src/game/data/mapExclusiveAssets.generated.js')
  // Capture the raw sources before the catalog applies composition, detecting
  // accidental in-place mutations as well as incorrect returned maps.
  const rawMaps = clone({ GodotMap: starter, ...GODOT_REGION_MAPS })
  const { MAP_CATALOG } = await loadModule('/src/game/data/mapCatalog.js')
  const geometryCache = new Map()
  const readGeometry = async type => {
    if (geometryCache.has(type)) return geometryCache.get(type)
    const asset = MAP_ASSET_CATALOG[type]
    if (!asset?.assetPath || asset.procedural) throw new Error(`${type}: missing ordinary GLB asset`)
    const file = path.join(ROOT_DIR, 'public', asset.assetPath)
    const root = (await io.read(file)).getRoot()
    const scene = root.listScenes()[0]
    if (!scene) throw new Error(`${type}: GLB has no scene`)
    const bounds = getBounds(scene)
    let triangles = 0
    for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
      const count = primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0
      check(primitive.getMode() === 4, `${type}: primitive is not TRIANGLES`)
      triangles += count / 3
    }
    const data = { type, asset, bounds, root, triangles, bytes: (await fs.stat(file)).size }
    geometryCache.set(type, data)
    return data
  }
  const checkFootprint = (type, footprint, bounds, label) => {
    check(Number.isFinite(footprint?.width) && footprint.width > 0 && Number.isFinite(footprint?.height) && footprint.height > 0, `${type}: ${label} missing/invalid footprint`)
    if (!footprint) return
    check(footprint.width * CELL / 2 + EPSILON >= Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])), `${type}: ${label} underestimates X extent`)
    check(footprint.height * CELL / 2 + EPSILON >= Math.max(Math.abs(bounds.min[2]), Math.abs(bounds.max[2])), `${type}: ${label} underestimates Z extent`)
  }
  const checkOriginals = (id, reference, current, label) => {
    const signatures = new Map()
    for (const object of current) { const key = canonical(withoutRenderScale(object)); signatures.set(key, (signatures.get(key) || 0) + 1) }
    for (const object of reference) {
      const key = canonical(object), remaining = signatures.get(key) || 0
      check(remaining > 0, `${id}: ${label} original object changed/removed: ${object.sourceId || object.eventId || `${object.type}@${object.x},${object.y}`}`)
      if (remaining > 0) signatures.set(key, remaining - 1)
    }
  }

  const v2Dir = path.join(ROOT_DIR, 'public/assets/3d/map-exclusive-v3')
  const files = (await fs.readdir(v2Dir)).filter(file => file.endsWith('.glb')).sort()
  check(files.length > 0, 'Environment v2 directory contains no GLBs')
  for (const file of files) {
    const entry = Object.values(MAP_ASSET_CATALOG).find(asset => asset.assetPath === `/assets/3d/map-exclusive-v3/${file}`)
    check(Boolean(entry), `${file}: v2 GLB is not registered in asset catalog`)
    if (!entry) continue
    try {
      const data = await readGeometry(entry.id), root = data.root
      check(root.listMeshes().length === 1, `${entry.id}: expected 1 mesh, got ${root.listMeshes().length}`)
      check(root.listMeshes().flatMap(mesh => mesh.listPrimitives()).length === 1, `${entry.id}: expected 1 primitive for one instanced draw call`)
      check(root.listMaterials().length === 1, `${entry.id}: expected 1 material, got ${root.listMaterials().length}`)
      check(root.listTextures().length === 0, `${entry.id}: expected 0 textures, got ${root.listTextures().length}`)
      check(root.listAnimations().length === 0 && root.listSkins().length === 0, `${entry.id}: scenery must be static`)
      check(data.triangles > 0 && data.triangles <= 2400, `${entry.id}: ${data.triangles} triangles exceeds 2400 or is empty`)
      check(data.bytes < 20000, `${entry.id}: ${data.bytes} bytes must be < 20000`)
      check(Math.abs(data.bounds.min[1]) < .005, `${entry.id}: origin is not grounded`)
      checkFootprint(entry.id, entry.footprint, data.bounds, 'catalog')
      if (ENVIRONMENT_MODEL_FOOTPRINTS[entry.id]) checkFootprint(entry.id, ENVIRONMENT_MODEL_FOOTPRINTS[entry.id], data.bounds, 'generated')
      assets.push({ type: entry.id, triangles: data.triangles, bytes: data.bytes })
    } catch (error) { failures.push(`${entry.id}: ${error.message}`) }
  }

  for (const [id, { mapInfo: map }] of Object.entries(MAP_CATALOG)) {
    const raw = rawMaps[id], objects = map.decorativeObjects || []
    const added = objects.filter(object => object.environmentComposition === true)
    const retained = objects.filter(object => !object.environmentComposition && !object.environmentBoundary)
    same(retained.length, originalSignatures[id]?.count, `${id}: immutable original count`)
    same(crypto.createHash('sha256').update(canonical(retained.map(withoutRenderScale))).digest('hex'), originalSignatures[id]?.sha256, `${id}: immutable original appearance and placements`)
    const sceneIds = new Set(), typeCounts = new Map(), sourceIds = new Set()
    check(Boolean(raw), `${id}: no raw source to compare`)
    for (const object of objects) {
      if (object.environmentComposition) {
        check(MAP_ASSET_CATALOG[object.type]?.ownerMap === id, `${id}: decorative asset belongs to another map: ${object.type}`)
      }
      if (object.sourceId?.startsWith('environment_scene_')) check(object.environmentComposition === true, `${id}: ${object.sourceId} missing environmentComposition:true`)
    }
    if (raw) {
      for (const key of ['width', 'height', 'mapGrid', 'visualPaths', 'roadPathEndpoints', 'forestTrails', 'roadJunctions', 'waterBodies', 'bridges', 'encounterZones', 'startPosition']) same(map[key], raw[key], `${id}: raw ${key}`)
      same(eventPositions(map), eventPositions(raw), `${id}: raw event positions`)
      checkOriginals(id, raw.decorativeObjects || [], objects, 'raw')
      same(objects.filter(object => !object.environmentComposition && !object.environmentBoundary).map(withoutRenderScale), raw.decorativeObjects || [], `${id}: all original decorations and order`)
      same(map.renderAmbientGroundDecorations, raw.renderAmbientGroundDecorations, `${id}: original ambient scenery setting`)
      same(map.renderForestWallUndergrowth, raw.renderForestWallUndergrowth, `${id}: original forest scenery setting`)
      same(rawMaps[id], clone(id === 'GodotMap' ? starter : GODOT_REGION_MAPS[id]), `${id}: raw source mutated`)
      check(retained.filter(o=>o.environmentHiddenBoundary).every(composition.isGenericEnvironmentBoundary), `${id}: only the requested generic boundary rocks may be hidden`)
    }
    if (baseline) {
      const previous = baseline[id]
      check(Boolean(previous), `${id}: missing pre-edit snapshot entry`)
      if (previous) {
        for (const [key, originalKey] of [['mapGrid', 'grid'], ['visualPaths', 'paths'], ['encounterZones', 'zones'], ['waterBodies', 'water'], ['bridges', 'bridges']]) same(map[key], previous[originalKey], `${id}: pre-edit ${key}`)
        same(eventPositions(map), previous.events, `${id}: pre-edit event positions`)
        checkOriginals(id, previous.decorations || [], objects, 'pre-edit')
      }
    }
    for (const object of added) {
      const label = `${id}: ${object.sourceId || object.type}`
      const sceneId = object.environmentScene
      const authoredScene = MAP_ENVIRONMENT_VIGNETTES[id].find(scene => scene.id === sceneId)
      const recipe = authoredScene?.props.find(prop => prop.type === object.type)
      check(Boolean(recipe), `${label}: object does not belong to its thematic scene`)
      const primary = added.find(prop => prop.environmentScene === sceneId && prop.type === authoredScene?.props[0].type)
      check(Boolean(primary), `${label}: missing main facility; secondary props are orphaned`)
      if (primary) check(Math.hypot(primary.x - object.x, primary.y - object.y) <= 6.5, `${label}: supporting prop too far from its scene`)
      if (recipe) {
        const measured = MAP_EXCLUSIVE_MEASUREMENTS[object.type]
        const expectedScale = Math.min(recipe.scale, recipe.span / Math.max(measured.footprint.width, measured.footprint.height), recipe.maxHeight / measured.height)
        check(Math.abs(object.scale - expectedScale) <= .00051, `${label}: scale ignores real-world role dimensions`)
        if (recipe.facing === 'road') {
          check(Math.abs(object.rotation - composition.getEnvironmentRoadFacing(map, object.x, object.y)) < .001, `${label}: working front faces away from its road`)
        }
        same(object.surface, recipe.habitat === 'water' ? 'water' : 'ground', `${label}: habitat surface`)
      }
      check(typeof sceneId === 'string' && sceneId.trim().length > 0, `${label}: missing named environmentScene`)
      if (typeof sceneId === 'string' && sceneId.trim()) sceneIds.add(sceneId)
      const prefix = `environment_scene_${sceneId}_`
      check(typeof object.sourceId === 'string' && object.sourceId.startsWith(prefix) && /^\d+$/.test(object.sourceId.slice(prefix.length)), `${label}: sourceId must be environment_scene_<scene>_<index>`)
      check(!sourceIds.has(object.sourceId), `${label}: duplicate sourceId`)
      sourceIds.add(object.sourceId)
      typeCounts.set(object.type, (typeCounts.get(object.type) || 0) + 1)
      check(object.environmentBackdrop === false, `${label}: scenery must stay within the map`)

      check(!isProtectedEnvironmentObject(object), `${label}: new scenery must not become a gameplay interaction or protected original`)
      check(isSafeEnvironmentBackground(map, object), `${label}: unsafe background/rim placement`)
      const declared = getEnvironmentObjectBounds(object)
      for (const other of added) if (other !== object) check(!overlap(declared, getEnvironmentObjectBounds(other)), `${label}: overlaps added ${other.sourceId}`)
      check(Object.values(declared).every(Number.isFinite), `${label}: non-finite bounds`)
      if (raw) for (const protectedObject of (raw.decorativeObjects || [])) {
        if (retained[raw.decorativeObjects.indexOf(protectedObject)].environmentHiddenBoundary) continue
        check(!overlap(declared, getEnvironmentObjectBounds(retained[raw.decorativeObjects.indexOf(protectedObject)])), `${label}: overlaps original ${protectedObject.sourceId || protectedObject.eventId || protectedObject.type}`)
      }
      try {
        const data = await readGeometry(object.type)
        const measurement = ENVIRONMENT_SCENERY_MEASUREMENTS[object.type]
        check(Boolean(measurement), `${label}: no measured scenery metadata`)
        if (measurement) {
          checkFootprint(object.type, measurement.footprint, data.bounds, 'scenery measurement')
          check(Number.isFinite(measurement.height) && measurement.height + EPSILON >= data.bounds.max[1] - data.bounds.min[1], `${label}: measured height is underestimated`)
        }
        if (ENVIRONMENT_MODEL_FOOTPRINTS[object.type]) checkFootprint(object.type, ENVIRONMENT_MODEL_FOOTPRINTS[object.type], data.bounds, 'generated')
        const scale = object.scale ?? data.asset.defaultScale ?? 1
        check(Number.isFinite(scale) && scale > 0, `${label}: invalid scale`)
        const angle = object.rotation ?? 0, cos = Math.cos(angle), sin = Math.sin(angle)
        for (const x of [data.bounds.min[0], data.bounds.max[0]]) for (const z of [data.bounds.min[2], data.bounds.max[2]]) {
          const tx = object.x + (x * cos + z * sin) * scale / CELL + (object.offsetX || 0) / CELL
          const ty = object.y + (-x * sin + z * cos) * scale / CELL + (object.offsetZ || 0) / CELL
          check(tx + EPSILON >= declared.x1 && tx - EPSILON <= declared.x2 && ty + EPSILON >= declared.y1 && ty - EPSILON <= declared.y2, `${label}: declared bounds do not contain rotated/scaled GLB`)
        }
      } catch (error) { failures.push(`${label}: ${error.message}`) }
    }
    check(sceneIds.size >= 4, `${id}: only ${sceneIds.size} named scenes; requires >= 4`)
    check(typeCounts.size >= 6, `${id}: only ${typeCounts.size} additional asset types; requires >= 6`)
    for (const [type, count] of typeCounts) {
      const cap = 1
      check(count <= cap, `${id}: ${type} repeated ${count} times; cap ${cap}`)
    }
    maps.push({ id, resized: retained.filter(o => o.environmentRenderScale).length, interior: added.filter(o => composition.isEnvironmentInterior(map, o)).length, added: added.length, scenes: [...sceneIds], assetTypes: Object.fromEntries(typeCounts) })
  }
})

const uniqueFailures = [...new Set(failures)]
const report = { ok: uniqueFailures.length === 0, baseline: baseline ? path.relative(ROOT_DIR, baselinePath) : null, maps, assets, failures: uniqueFailures }
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true })
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
}
console.table(maps.map(map => ({ map: map.id, added: map.added, interior: map.interior, resized: map.resized, scenes: map.scenes.length, types: Object.keys(map.assetTypes).length, maxRepeats: Math.max(0, ...Object.values(map.assetTypes)) })))
console.log(`Composition audit: ${maps.length} maps, ${maps.reduce((sum, map) => sum + map.added, 0)} additions; ${assets.length} exclusive GLBs / ${assets.reduce((sum, asset) => sum + asset.bytes, 0)} bytes. Snapshot: ${report.baseline || 'not present (raw sources still checked)'}.`)
if (uniqueFailures.length) {
  for (const failure of uniqueFailures) console.error(`FAIL ${failure}`)
  console.error(`${uniqueFailures.length} checks failed.`)
  process.exitCode = 1
} else console.log('PASS: gameplay layout and original objects retained with approved natural-size and boundary visual overrides; distinct scenes, safe placement and measured GLB budgets valid.')
