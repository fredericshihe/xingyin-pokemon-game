import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

const folder = 'public/assets/3d/xingyin-refined-v1'
const manifest = JSON.parse(await fs.readFile(`${folder}/manifest.json`, 'utf8'))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule()
})
const summary = {
  assets: manifest.assets.length, registeredKeys: 0, manifestKeys: 0,
  categories: {}, meshes: 0, primitives: 0, triangles: 0, materials: 0,
  materialRoughness: {}, bytes: 0, characterAssets: 0, characterNodes: 0,
  preservedSkins: 0, animatedAssets: 0, preservedClips: 0, preservedChannels: 0
}
const finite = (values, label) => {
  for (const value of values) assert.ok(Number.isFinite(value), `${label}: non-finite value`)
}
const close = (actual, expected, tolerance, label) => {
  assert.equal(actual.length, expected.length, `${label}: dimension changed`)
  actual.forEach((value, i) => assert.ok(Math.abs(value - expected[i]) <= tolerance,
    `${label}: ${value} differs from ${expected[i]}`))
}
const logicalPath = (url) => {
  const pathname = new URL(url, 'http://localhost').pathname
  const index = pathname.indexOf('/assets/')
  assert.ok(index >= 0, `Invalid model URL: ${url}`)
  return pathname.slice(index)
}
const channelKey = (channel) => `${channel.getTargetNode()?.getName()}::${channel.getTargetPath()}`

function checkCharacterNodes(original, refined, label) {
  const targets = new Map(refined.listNodes().map(node => [node.getName(), node]))
  for (const node of original.listNodes()) {
    const target = targets.get(node.getName())
    assert.ok(target, `${label}: missing character node ${node.getName()}`)
    const parent = node.getParentNode()
    if (parent) assert.equal(target.getParentNode()?.getName(), parent.getName(), `${label}: changed parent of ${node.getName()}`)
    close(target.getTranslation(), node.getTranslation(), 1e-4, `${label}/${node.getName()} translation`)
    close(target.getScale(), node.getScale(), 1e-4, `${label}/${node.getName()} scale`)
    const a = target.getRotation(), b = node.getRotation()
    const sign = a.reduce((sum, value, i) => sum + value * b[i], 0) < 0 ? -1 : 1
    close(a.map(value => value * sign), b, 1e-4, `${label}/${node.getName()} rotation`)
  }
  summary.characterNodes += original.listNodes().length
  assert.equal(refined.listSkins().length, original.listSkins().length, `${label}: skin count changed`)
  for (let i = 0; i < original.listSkins().length; i++) {
    const sourceSkin = original.listSkins()[i], targetSkin = refined.listSkins()[i]
    assert.deepEqual(targetSkin.listJoints().map(node => node.getName()), sourceSkin.listJoints().map(node => node.getName()), `${label}: joint hierarchy changed`)
    if (sourceSkin.getInverseBindMatrices()) close(targetSkin.getInverseBindMatrices().getArray(), sourceSkin.getInverseBindMatrices().getArray(), 1e-4, `${label}: inverse bind matrices`)
    summary.preservedSkins++
  }
}

function checkAnimations(original, refined, label) {
  const animations = new Map(refined.listAnimations().map(animation => [animation.getName(), animation]))
  assert.equal(refined.listAnimations().length, original.listAnimations().length, `${label}: animation count changed`)
  if (original.listAnimations().length) summary.animatedAssets++
  for (const animation of original.listAnimations()) {
    const target = animations.get(animation.getName())
    assert.ok(target, `${label}: missing clip ${animation.getName()}`)
    const channels = new Map(target.listChannels().map(channel => [channelKey(channel), channel]))
    for (const channel of animation.listChannels()) {
      const targetChannel = channels.get(channelKey(channel))
      assert.ok(targetChannel, `${label}: missing track ${channelKey(channel)}`)
      const sourceSampler = channel.getSampler(), targetSampler = targetChannel.getSampler()
      assert.equal(targetSampler.getInterpolation(), sourceSampler.getInterpolation(), `${label}: interpolation changed`)
      close(targetSampler.getInput().getArray(), sourceSampler.getInput().getArray(), 1e-4, `${label}: animation timeline`)
      const sourceValues = sourceSampler.getOutput().getArray(), targetValues = targetSampler.getOutput().getArray()
      assert.equal(targetValues.length, sourceValues.length, `${label}: animation key count changed`)
      // A quaternion and its negation describe the same orientation.
      if (channel.getTargetPath() === 'rotation') {
        for (let i = 0; i < sourceValues.length; i += 4) {
          const a = targetValues.slice(i, i + 4), b = sourceValues.slice(i, i + 4)
          const sign = a.reduce((sum, value, j) => sum + value * b[j], 0) < 0 ? -1 : 1
          close(a.map(value => value * sign), b, 1e-4, `${label}: rotation animation`)
        }
      } else close(targetValues, sourceValues, 1e-4, `${label}: animation values`)
      summary.preservedChannels++
    }
    summary.preservedClips++
  }
}

await withViteAuditServer(async ({ loadModule }) => {
  const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
  const { LEGACY_MODEL_KEYS } = await loadModule('/src/game/decorativeModelSpec.js')
  const { getModelAssetUrl, getOriginalModelAssetUrl } = await loadModule('/src/game/threeLowPolyModelCache.js')
  const { REFINED_MODEL_ASSETS } = await loadModule('/src/game/data/refinedModelAssets.generated.js')
  const { MAP_MODEL_MANIFEST } = await loadModule('/src/game/data/mapModelManifest.generated.js')
  const bySource = new Map(manifest.assets.map(entry => [entry.source, entry]))
  assert.equal(bySource.size, manifest.assets.length, 'Duplicate original paths in refinement manifest')
  assert.deepEqual(Object.keys(REFINED_MODEL_ASSETS).sort(), [...bySource.keys()].sort(), 'Manifest and runtime redirects differ')
  const registered = new Set([
    ...Object.values(MAP_ASSET_CATALOG).filter(asset => asset.assetPath && !asset.procedural).map(asset => asset.id),
    ...LEGACY_MODEL_KEYS
  ])
  for (const key of registered) {
    const sourceUrl = getOriginalModelAssetUrl(key), runtimeUrl = getModelAssetUrl(key)
    assert.ok(sourceUrl && runtimeUrl, `${key}: missing registered model URL`)
    const source = logicalPath(sourceUrl), runtime = logicalPath(runtimeUrl)
    const entry = bySource.get(source)
    assert.ok(entry, `${key}: original asset omitted from refinement`)
    assert.equal(REFINED_MODEL_ASSETS[source], entry.output, `${key}: wrong redirect`)
    assert.equal(runtime, entry.output, `${key}: runtime still uses an unrefined GLB`)
    summary.registeredKeys++
  }
  for (const [mapId, entry] of Object.entries(MAP_MODEL_MANIFEST)) {
    for (const key of entry.modelKeys) {
      if (MAP_ASSET_CATALOG[key]?.procedural) continue
      assert.ok(registered.has(key), `${mapId}: preload has an unregistered GLB key ${key}`)
      assert.ok(getModelAssetUrl(key), `${mapId}: model URL is missing for ${key}`)
      summary.manifestKeys++
    }
  }
  const files = (await fs.readdir(folder)).filter(file => file.endsWith('.glb')).sort()
  assert.deepEqual(files, manifest.assets.map(entry => entry.output.split('/').at(-1)).sort(), 'Missing or stale refined GLB files')
})

for (const entry of manifest.assets) {
  const label = entry.keys[0], file = `public${entry.output}`
  const refined = (await io.read(file)).getRoot()
  const original = (await io.read(`public${entry.source}`)).getRoot()
  assert.ok(refined.listScenes().length, `${label}: scene missing`)
  assert.ok(refined.listMeshes().length, `${label}: mesh missing`)
  const bounds = getBounds(refined.listScenes()[0])
  const sourceBounds = getBounds(original.listScenes()[0])
  finite([...bounds.min, ...bounds.max], `${label}: bounds`)
  for (let axis = 0; axis < 3; axis++) {
    assert.ok(bounds.max[axis] >= bounds.min[axis], `${label}: inverted bounds`)
    const span = sourceBounds.max[axis] - sourceBounds.min[axis]
    const tolerance = Math.max(.01, span * .025)
    assert.ok(Math.abs(bounds.min[axis] - sourceBounds.min[axis]) <= tolerance && Math.abs(bounds.max[axis] - sourceBounds.max[axis]) <= tolerance, `${label}: dimensions or origin changed on axis ${axis}`)
  }
  close(bounds.min, entry.bounds.min, .001, `${label}: manifest minimum`)
  close(bounds.max, entry.bounds.max, .001, `${label}: manifest maximum`)
  let triangles = 0
  for (const mesh of refined.listMeshes()) {
    assert.ok(mesh.listPrimitives().length, `${label}: empty mesh`)
    summary.meshes++
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION'), normals = primitive.getAttribute('NORMAL')
      assert.ok(positions?.getCount() >= 3, `${label}: empty positions`)
      finite(positions.getArray(), `${label}: positions`)
      assert.ok(normals && normals.getCount() === positions.getCount(), `${label}: missing or mismatched normals`)
      finite(normals.getArray(), `${label}: normals`)
      for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic)
        assert.equal(attribute.getCount(), positions.getCount(), `${label}: ${semantic} count differs from positions`)
        finite(attribute.getArray(), `${label}: ${semantic}`)
      }
      const material = primitive.getMaterial()
      assert.ok(material, `${label}: primitive has no material`)
      const indices = primitive.getIndices()?.getArray()
      const count = indices?.length ?? positions.getCount()
      assert.equal(primitive.getMode(), 4, `${label}: expected triangle geometry`)
      assert.ok(count >= 3 && count % 3 === 0, `${label}: invalid triangle index count`)
      if (indices) for (const index of indices) assert.ok(index >= 0 && index < positions.getCount(), `${label}: index out of range`)
      let nondegenerate = false
      const values = positions.getArray()
      for (let i = 0; i < count; i += 3) {
        const a = (indices?.[i] ?? i) * 3, b = (indices?.[i + 1] ?? i + 1) * 3, c = (indices?.[i + 2] ?? i + 2) * 3
        const u = [0, 1, 2].map(j => values[b + j] - values[a + j])
        const v = [0, 1, 2].map(j => values[c + j] - values[a + j])
        if (Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) > 1e-12) { nondegenerate = true; break }
      }
      assert.ok(nondegenerate, `${label}: primitive contains no visible triangle surface`)
      triangles += count / 3
      summary.primitives++
    }
  }
  assert.equal(triangles, entry.triangles, `${label}: geometry disagrees with manifest`)
  assert.equal((await fs.stat(file)).size, entry.bytes, `${label}: file size disagrees with manifest`)
  assert.equal(refined.listTextures().length, original.listTextures().length, `${label}: texture dependencies changed`)
  for (const material of refined.listMaterials()) {
    finite([...material.getBaseColorFactor(), ...material.getEmissiveFactor(), material.getMetallicFactor(), material.getRoughnessFactor()], `${label}: material factors`)
    const roughness = material.getRoughnessFactor()
    assert.ok(Math.min(Math.abs(roughness - .82), Math.abs(roughness - .46)) < .001, `${label}: inconsistent satin material roughness ${roughness}`)
    const bucket = roughness.toFixed(2)
    summary.materialRoughness[bucket] = (summary.materialRoughness[bucket] || 0) + 1
    summary.materials++
  }
  if (entry.category === 'characters') {
    checkCharacterNodes(original, refined, label)
    summary.characterAssets++
  }
  checkAnimations(original, refined, label)
  summary.categories[entry.category] = (summary.categories[entry.category] || 0) + 1
  summary.triangles += triangles
  summary.bytes += entry.bytes
}

console.log(JSON.stringify(summary, null, 2))
console.log('PASS: complete runtime coverage, valid refined geometry, consistent materials, retained bounds, character nodes, skins and animation tracks.')
