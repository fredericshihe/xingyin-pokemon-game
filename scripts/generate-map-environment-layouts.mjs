import fs from 'node:fs/promises'
import { withViteAuditServer } from './load-vite-module.mjs'
await withViteAuditServer(async ({loadModule}) => {
  const { default: starter } = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const { planMapEnvironment } = await loadModule('/src/game/data/mapEnvironmentComposition.js')
  const layouts = {}
  for (const [id, raw] of Object.entries({GodotMap:starter,...GODOT_REGION_MAPS})) {
    const map = planMapEnvironment({...raw,id})
    const originals = map.decorativeObjects.filter(o => !o.environmentComposition && !o.environmentBoundary)
    layouts[id] = {
      revision: map.generationNotes.environmentRevision,
      renderScales: Object.fromEntries(originals.flatMap((o,i) => o.environmentRenderScale ? [[i,o.environmentRenderScale]] : [])),
      hiddenOriginals: originals.flatMap((o,i)=>o.environmentHiddenBoundary?[i]:[]),
      boundaries: map.decorativeObjects.filter(o=>o.environmentBoundary), boundaryTheme:map.environmentBoundaryTheme,
      additions: map.decorativeObjects.filter(o=>o.environmentComposition),
      groundPatches: map.environmentGroundPatches, blockedTiles:[...map.environmentBlockedTiles],
      notes: map.generationNotes.environmentComposition
    }
    console.log(id, JSON.stringify(map.generationNotes.environmentComposition))
  }
  await fs.writeFile('src/game/data/mapEnvironmentLayouts.generated.js', `// Generated offline by scripts/generate-map-environment-layouts.mjs.\nexport const MAP_ENVIRONMENT_LAYOUTS = ${JSON.stringify(layouts,null,2)}\n`)
})
