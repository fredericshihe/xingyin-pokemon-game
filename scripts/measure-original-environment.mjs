import fs from 'node:fs/promises'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import draco3d from 'draco3dgltf'
import { withViteAuditServer } from './load-vite-module.mjs'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() })
await withViteAuditServer(async ({loadModule}) => {
  const { default: starter } = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { getDecorativeModel, getModelAssetUrl } = await loadModule('/src/game/threeLowPolyModelCache.js')
  const types = new Set([starter,...Object.values(GODOT_REGION_MAPS)].flatMap(m=>m.decorativeObjects.map(o=>o.type)))
  const measured = {}
  for (const type of [...types].sort()) {
    const spec = getDecorativeModel(type)
    const url = spec && getModelAssetUrl(spec.key)
    if (!url) continue
    const file = 'public' + new URL(url, 'http://localhost').pathname
    const root = (await io.read(file)).getRoot()
    const bounds = getBounds(root.listScenes()[0])
    measured[type] = { height: bounds.max[1]-bounds.min[1], footprint: {
      width: Math.ceil(2*Math.max(Math.abs(bounds.min[0]),Math.abs(bounds.max[0]))/1.55*1000)/1000,
      height: Math.ceil(2*Math.max(Math.abs(bounds.min[2]),Math.abs(bounds.max[2]))/1.55*1000)/1000
    } }
  }
  await fs.writeFile('src/game/data/environmentOriginalMeasurements.generated.js', `// Actual runtime GLB bounds; regenerate with node scripts/measure-original-environment.mjs.\nexport const ENVIRONMENT_ORIGINAL_MEASUREMENTS = ${JSON.stringify(measured,null,2)}\n`)
  console.log('Measured',Object.keys(measured).length,'original decoration model types')
})
