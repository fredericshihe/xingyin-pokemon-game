import fs from 'node:fs/promises'
import path from 'node:path'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, weld, prune, draco } from '@gltf-transform/functions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'

const root = process.cwd()
const sourceDir = path.join(root, 'art/environment/refinement-input')
const outputDir = path.join(root, 'public/assets/3d/xingyin-refined-v1')
const manifestPath = path.join(root, 'art/environment/refinement-plan.json')
const only = new Set((process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length) ?? '').split(',').filter(Boolean))
const selected = entry => !only.size || entry.keys.some(key => only.has(key))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule()
})

function animationSignature(animation) {
  return {
    name: animation.getName(),
    channels: animation.listChannels().map(channel => {
      const sampler = channel.getSampler()
      return {
        target: channel.getTargetNode()?.getName(),
        path: channel.getTargetPath(),
        interpolation: sampler.getInterpolation(),
        times: Array.from(sampler.getInput().getArray()),
        values: Array.from(sampler.getOutput().getArray())
      }
    })
  }
}

function restoreAnimations(doc, original) {
  const refinedNodes = new Map(doc.getRoot().listNodes().map(node => [node.getName(), node]))
  const sourceAnimations = original.getRoot().listAnimations()
  for (const animation of doc.getRoot().listAnimations()) animation.dispose()
  if (!sourceAnimations.length) return
  const buffer = doc.getRoot().listBuffers()[0] ?? doc.createBuffer('restored-animation')
  for (const sourceAnimation of sourceAnimations) {
    const animation = doc.createAnimation(sourceAnimation.getName())
    const samplers = new Map()
    for (const sourceSampler of sourceAnimation.listSamplers()) {
      const copyAccessor = accessor => doc.createAccessor(accessor.getName(), buffer)
        .setType(accessor.getType())
        .setArray(accessor.getArray().slice())
      const sampler = doc.createAnimationSampler(sourceSampler.getName())
        .setInput(copyAccessor(sourceSampler.getInput()))
        .setOutput(copyAccessor(sourceSampler.getOutput()))
        .setInterpolation(sourceSampler.getInterpolation())
      samplers.set(sourceSampler, sampler)
      animation.addSampler(sampler)
    }
    for (const sourceChannel of sourceAnimation.listChannels()) {
      const targetName = sourceChannel.getTargetNode()?.getName()
      const target = refinedNodes.get(targetName)
      if (!target) throw new Error(`Animation node missing: ${targetName}`)
      animation.addChannel(doc.createAnimationChannel(sourceChannel.getName())
        .setTargetNode(target)
        .setTargetPath(sourceChannel.getTargetPath())
        .setSampler(samplers.get(sourceChannel.getSampler())))
    }
  }
}

if (process.argv.includes('--finalize')) {
  const plan = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const existing = only.size ? JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8')) : null
  const report = existing?.assets ?? []
  const redirects = {}
  const entries = plan.assets.filter(selected)
  if (!entries.length) throw new Error(`No refinement assets match: ${[...only].join(', ')}`)
  for (const entry of entries) {
    const file = path.join(root, 'public', entry.output)
    const doc = await io.read(file)
    const original = await io.read(path.join(root, 'public', entry.source))
    const originalRoot = original.getRoot()
    if (originalRoot.listAnimations().length) {
      const nodes = new Map(doc.getRoot().listNodes().map(node => [node.getName(), node]))
      for (const node of originalRoot.listNodes()) {
        const refined = nodes.get(node.getName())
        if (!refined) throw new Error(`Animation node missing: ${entry.source} / ${node.getName()}`)
        refined.setTranslation(node.getTranslation()).setRotation(node.getRotation()).setScale(node.getScale())
      }
    }
    restoreAnimations(doc, original)
    if (entry.category === 'characters') {
      const names = new Set(doc.getRoot().listNodes().map(node => node.getName()))
      for (const node of originalRoot.listNodes()) {
        if (!names.has(node.getName())) throw new Error(`Character rig part missing: ${entry.source} / ${node.getName()}`)
      }
    }
    await doc.transform(dedup(), weld(), prune(), draco({ quantizePosition: 14, quantizeNormal: 12, quantizeColor: 8 }))
    await io.write(file, doc)
    const verified = await io.read(file)
    const expectedAnimations = originalRoot.listAnimations().map(animationSignature)
    const actualAnimations = verified.getRoot().listAnimations().map(animationSignature)
    if (JSON.stringify(actualAnimations) !== JSON.stringify(expectedAnimations)) throw new Error(`Animation changed: ${entry.source}`)
    const bounds = getBounds(verified.getRoot().listScenes()[0])
    const triangles = verified.getRoot().listMeshes().flatMap(m => m.listPrimitives())
      .reduce((sum, p) => sum + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0)
    if (!bounds.min.every(Number.isFinite) || !bounds.max.every(Number.isFinite) || !triangles) throw new Error(`Empty refined model: ${entry.source}`)
    const oldHeight = entry.bounds.max[1] - entry.bounds.min[1]
    const height = bounds.max[1] - bounds.min[1]
    if (Math.abs(height - oldHeight) > Math.max(.01, oldHeight * .015)) throw new Error(`Refinement changed proportions: ${entry.source}`)
    redirects[entry.source] = entry.output
    const result = { source: entry.source, output: entry.output, category: entry.category, keys: entry.keys, bounds, height, triangles, bytes: (await fs.stat(file)).size }
    if (existing) {
      const index = report.findIndex(item => item.source === entry.source)
      if (index < 0) throw new Error(`Refinement manifest is missing ${entry.source}`)
      report[index] = result
    } else report.push(result)
  }
  if (!existing) await fs.writeFile(path.join(root, 'src/game/data/refinedModelAssets.generated.js'), `// Blender-refined copies; originals remain available for authoring.\nexport const REFINED_MODEL_ASSETS = ${JSON.stringify(redirects, null, 2)}\n`)
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(existing ? { ...existing, assets: report } : { blender: '5.2', playerHeight: 1.55, assets: report }, null, 2) + '\n')
  console.log(`Validated and compressed ${entries.length} refined GLBs.`)
} else {
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.mkdir(outputDir, { recursive: true })
  if (only.size) {
    const plan = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    const entries = plan.assets.filter(selected)
    if (!entries.length) throw new Error(`No refinement assets match: ${[...only].join(', ')}`)
    for (const entry of entries) {
      const doc = await io.read(path.join(root, 'public', entry.source))
      entry.bounds = getBounds(doc.getRoot().listScenes()[0])
      const compression = doc.getRoot().listExtensionsUsed().find(e => e.extensionName === 'KHR_draco_mesh_compression')
      compression?.dispose()
      await io.write(entry.input, doc)
    }
    await fs.writeFile(manifestPath, JSON.stringify(plan, null, 2) + '\n')
    console.log(`Prepared ${entries.length} selected models for Blender refinement.`)
  } else {
  await withViteAuditServer(async ({ loadModule }) => {
    const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
    const { LEGACY_MODEL_KEYS } = await loadModule('/src/game/decorativeModelSpec.js')
    const { getOriginalModelAssetUrl } = await loadModule('/src/game/threeLowPolyModelCache.js')
    const byPath = new Map()
    for (const key of new Set([...Object.keys(MAP_ASSET_CATALOG), ...LEGACY_MODEL_KEYS, 'player_bicycle'])) {
      const url = getOriginalModelAssetUrl(key)
      if (!url) continue
      const source = url.split('?')[0].replace(/^.*?(\/assets\/)/, '$1')
      const entry = byPath.get(source) ?? { source, keys: [], tags: [] }
      entry.keys.push(key)
      entry.tags.push(...(MAP_ASSET_CATALOG[key]?.themeTags ?? []))
      byPath.set(source, entry)
    }
    const assets = []
    for (const [source, entry] of [...byPath].sort(([a], [b]) => a.localeCompare(b))) {
      const label = `${entry.keys.join(' ')} ${entry.tags.join(' ')} ${source}`
      const category = /character|player|npc/.test(label) ? 'characters'
        : /boundaries|boundary_/.test(label) ? 'boundaries'
        : /xingyin-environment-v[12]|map-exclusive/.test(label) ? 'biomes'
        : /tree|pine|palm|willow/.test(label) ? 'trees'
        : /nature|rock|stone|grass|bush|flower|crop|crystal|plant|reed|coral/.test(label) && !/gravestone|wall|building|house/.test(label) ? 'nature'
        : 'structures'
      const filename = source.slice('/assets/3d/'.length).replaceAll('/', '__')
      const input = path.join(sourceDir, filename)
      const output = `/assets/3d/xingyin-refined-v1/${filename}`
      const doc = await io.read(path.join(root, 'public', source))
      const bounds = getBounds(doc.getRoot().listScenes()[0])
      // Blender imports the uncompressed copy. Never alter the source asset.
      const compression = doc.getRoot().listExtensionsUsed().find(e => e.extensionName === 'KHR_draco_mesh_compression')
      compression?.dispose()
      await io.write(input, doc)
      assets.push({ ...entry, tags: [...new Set(entry.tags)], category, input, output, bounds })
    }
    await fs.writeFile(manifestPath, JSON.stringify({ playerHeight: 1.55, assets }, null, 2) + '\n')
    console.log(`Prepared ${assets.length} unique models for Blender refinement.`)
  })
  }
}
