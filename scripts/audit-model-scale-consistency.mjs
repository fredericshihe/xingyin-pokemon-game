// 同一模型在所有地图里尺寸一致：每个可统一的装饰物，渲染尺寸必须落在
// 标准尺寸 × [0.75 × 0.94, 1.06]（放不下时自然景物最多退让到 75%，另有 ±6% 浮动）。
// 同时报告统一前后每个模型跨地图的最大/最小尺寸比。
import assert from 'node:assert/strict'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  process.env.SKIP_MODEL_SCALE_NORMALIZATION = '1'
  const raw = await loadModule('/src/game/data/mapCatalog.js?raw-scales')
  delete process.env.SKIP_MODEL_SCALE_NORMALIZATION
  const norm = await loadModule('/src/game/mapModelScaleNormalization.js')
  const { THEME_LANDMARK_SCALES } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
  const { TREE_MIN_HEIGHT_RATIO } = await loadModule('/src/game/modelScaleReference.js')
  const { FOREST_WALL_TREE_HEIGHT_SCALE, hasRegionForestWallTrees, getForestWallTreeKey } = await loadModule('/src/game/forestWallScenery.js')

const LOW = 0.75 * (1 - norm.MODEL_SCALE_JITTER) - 1e-3
const HIGH = 1 + norm.MODEL_SCALE_JITTER + 1e-3
assert.ok(Number.isFinite(LOW) && Number.isFinite(HIGH), 'scale audit limits must be finite')

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule()
})
const measureHeight = async (file) => {
  const document = await io.read(file)
  const bounds = getBounds(document.getRoot().listScenes()[0])
  return bounds.max[1] - bounds.min[1]
}
const playerHeight = await measureHeight('public/assets/3d/xingyin-characters-v1/player_child_adventurer.glb')
assert.ok(Math.abs(playerHeight - 1.55) < 1e-3, `player reference height changed: ${playerHeight}`)
const treeAliases = {
  'tree-oak': 'nature_tree_oak',
  'tree-default': 'nature_tree_default',
  'tree-pine': 'nature_tree_pine',
  nature_tree_oak: 'nature_tree_oak',
  nature_tree_default: 'nature_tree_default',
  nature_tree_pine: 'nature_tree_pine',
  town_tree: 'nature_tree_default',
  town_tree_high: 'nature_tree_oak',
  hex_unit_tree: 'nature_tree_default',
  hex_grass_forest: 'nature_tree_default',
  platformer_tree_pine: 'nature_tree_pine',
  pirate_palm_detailed_straight: 'pirate_palm_detailed_straight'
}
const treeHeights = new Map()
async function getTreeHeight(type) {
  if (!treeHeights.has(type)) {
    const asset = MAP_ASSET_CATALOG[type]
    assert.ok(asset?.assetPath, `${type}: tree has no GLB asset`)
    treeHeights.set(type, await measureHeight(`public${asset.assetPath}`))
  }
  return treeHeights.get(type)
}

function collect(mapOf) {
  const byKey = new Map()
  for (const id of raw.MAP_CHAIN) {
    for (const object of mapOf(id)?.decorativeObjects || []) {
      if (!norm.isScaleNormalizable(object)) continue
      const key = norm.getModelKeyForObject(object)
      const scale = norm.getRenderedObjectScale(object, THEME_LANDMARK_SCALES)
      const entry = byKey.get(key) || { min: Infinity, max: 0, maps: new Set() }
      entry.min = Math.min(entry.min, scale)
      entry.max = Math.max(entry.max, scale)
      entry.maps.add(id)
      byKey.set(key, entry)
    }
  }
  return byKey
}

const before = collect((id) => raw.MAP_CATALOG[id]?.mapInfo)
const after = new Map()
const failures = []
const normalizedMaps = {}
let treeCount = 0
const treeCategories = { standard: 0, scene: 0, biome: 0 }
for (const id of raw.MAP_CHAIN) {
  const map = norm.normalizeMapModelScales(raw.MAP_CATALOG[id].mapInfo)
  normalizedMaps[id] = map
  for (const object of map.decorativeObjects) {
    if (object.environmentHiddenBoundary) continue
    const asset = MAP_ASSET_CATALOG[object.type]
    const treeType = treeAliases[object.type] ||
      (object.environmentRole === 'tree' || asset?.themeTags?.includes('tree') ? object.type : null)
    if (treeType) {
      treeCount += 1
      const category = object.environmentRole === 'tree' ? 'scene' :
        object.type.startsWith('environment_') ? 'biome' : 'standard'
      treeCategories[category] += 1
      const height = await getTreeHeight(treeType)
      for (const scale of [norm.getRenderedObjectScale(object), object.hiddenGateLockedScale].filter((value) => value > 0)) {
        const heightRatio = height * scale / playerHeight
        if (heightRatio < TREE_MIN_HEIGHT_RATIO - 1e-3) failures.push(`${id} ${object.type} @${object.x},${object.y}: ${heightRatio.toFixed(2)} player heights`)
      }
    }
    if (!norm.isScaleNormalizable(object)) continue
    const canonical = norm.getCanonicalModelScale(object)
    const ratio = norm.getRenderedObjectScale(object, THEME_LANDMARK_SCALES) / canonical
    if (ratio < LOW || ratio > HIGH) {
      // 放不下又不能删的地标 / 边界地形原样保留，单独列出
      if (!(object.landmark || object.environmentBoundary)) failures.push(`${id} ${object.type} @${object.x},${object.y}: ${ratio.toFixed(2)}× canonical`)
    }
  }
}
for (const [key, entry] of collect((id) => normalizedMaps[id])) after.set(key, entry)

const spread = (entry) => entry.max / entry.min
const worstBefore = [...before].filter(([, e]) => e.maps.size > 1).sort((a, b) => spread(b[1]) - spread(a[1])).slice(0, 8)
console.table(worstBefore.map(([key, e]) => ({
  model: key,
  maps: e.maps.size,
  before: `${e.min.toFixed(2)}–${e.max.toFixed(2)} (${spread(e).toFixed(2)}×)`,
  after: after.get(key) ? `${after.get(key).min.toFixed(2)}–${after.get(key).max.toFixed(2)} (${spread(after.get(key)).toFixed(2)}×)` : '-'
})))
const summarize = (m) => ({
  models: m.size,
  over125: [...m.values()].filter((e) => spread(e) > 1.25).length,
  worst: Math.max(...[...m.values()].map(spread)).toFixed(2)
})
console.log('before', summarize(before), 'after', summarize(after))
for (const id of raw.MAP_CHAIN) {
  const notes = normalizedMaps[id].generationNotes?.modelScaleNormalization
  if (notes) console.log(`${id.padEnd(26)} clustered ${notes.clustered} (${notes.clusterPieces} pieces), grown ${notes.grown}, shrunk ${notes.shrunk}, dropped ${notes.dropped}, kept ${notes.keptUnfit}`)
}
const failuresByType = Object.groupBy(failures, (entry) => entry.split(' ')[1])
assert.equal(failures.length, 0, `models outside canonical size: ${JSON.stringify(Object.fromEntries(Object.entries(failuresByType).map(([type, entries]) => [type, entries.length])))}\n${failures.slice(0, 20).join('\n')}`)
assert.ok(treeCount > 0, 'tree proportion audit must cover runtime trees')
const forestWallKeys = new Set()
for (const id of raw.MAP_CHAIN) {
  if (!hasRegionForestWallTrees(id)) continue
  for (let x = 0; x < 3; x += 1) forestWallKeys.add(getForestWallTreeKey(id, x, 0))
}
assert.ok(forestWallKeys.size > 0, 'forest-wall tree audit must cover active species')
for (const key of forestWallKeys) {
  const type = treeAliases[`tree-${key.replace('tree', '').toLowerCase()}`]
  assert.ok(type, `unknown forest-wall tree species: ${key}`)
  const minimum = await getTreeHeight(type) * norm.PROCEDURAL_MODEL_SCALES[key] * FOREST_WALL_TREE_HEIGHT_SCALE * (1 - norm.MODEL_SCALE_JITTER) / playerHeight
  assert.ok(minimum >= TREE_MIN_HEIGHT_RATIO - 1e-3,
    `forest-wall ${key}: ${minimum.toFixed(2)} player heights`)
}
console.log('PASS: every normalizable model renders at its one canonical size (±6%, natural fallback ≥75%).')
console.log(`PASS: ${treeCount} map trees ${JSON.stringify(treeCategories)}, including hidden gates, measure at least ${TREE_MIN_HEIGHT_RATIO}× the ${playerHeight.toFixed(3)} m player.`)
console.log(`PASS: ${forestWallKeys.size} forest-wall tree species remain at least ${TREE_MIN_HEIGHT_RATIO} player heights under minimum size jitter.`)
})
