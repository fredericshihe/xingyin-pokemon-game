import fs from 'node:fs/promises'
import { withViteAuditServer } from './load-vite-module.mjs'
import { getEnvironmentObjectKey } from '../src/game/data/mapEnvironmentObjectKey.js'
await withViteAuditServer(async ({loadModule}) => {
  const { default: starter } = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { planMapEnvironment } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  const { narrowBridgeDecksToModels } = await loadModule('/src/game/bridgeDeckCollision.js')
  const { MAP_ENVIRONMENT_LAYOUTS: existing } = await loadModule('/src/game/data/mapEnvironmentLayouts.generated.js')
  // 只重排指定地图（地形改过的），其它地图保留原布局：node scripts/generate-map-environment-layouts.mjs MapA MapB
  const only = new Set(process.argv.slice(2))
  const layouts = {}
  for (const [id, raw] of Object.entries({GodotMap:starter,...GODOT_REGION_MAPS})) {
    if (only.size && !only.has(id)) {
      if (existing[id]) layouts[id] = existing[id]
      continue
    }
    // 与运行时一致：先按桥模型收窄桥面，再做场景布置
    const map = planMapEnvironment(narrowBridgeDecksToModels({...raw,id}))
    const originals = map.decorativeObjects.filter(o => !o.environmentComposition && !o.environmentBoundary)
    layouts[id] = {
      revision: map.generationNotes.environmentRevision,
      objectOverrides: Object.fromEntries(originals.filter(o => o.environmentRenderScale || o.environmentHiddenBoundary)
        .map(o => [getEnvironmentObjectKey(o), {
          ...(o.environmentRenderScale ? { environmentRenderScale: o.environmentRenderScale } : {}),
          ...(o.environmentHiddenBoundary ? { environmentHiddenBoundary: true } : {})
        }])),
      boundaries: map.decorativeObjects.filter(o=>o.environmentBoundary), boundaryTheme:map.environmentBoundaryTheme,
      additions: map.decorativeObjects.filter(o=>o.environmentComposition),
      groundPatches: map.environmentGroundPatches, blockedTiles:[...map.environmentBlockedTiles],
      notes: map.generationNotes.environmentComposition
    }
    console.log(id, JSON.stringify(map.generationNotes.environmentComposition))
  }
  await fs.writeFile('src/game/data/mapEnvironmentLayouts.generated.js', `// Generated offline by scripts/generate-map-environment-layouts.mjs.\nexport const MAP_ENVIRONMENT_LAYOUTS = ${JSON.stringify(layouts,null,2)}\n`)
})
