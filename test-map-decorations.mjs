// Quick test script to check map decorations
import { getAdventureMapInfo } from './src/game/data/overworldMaps.js'

const maps = [
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland'
]

console.log('=== Map Decoration Analysis ===\n')

maps.forEach(mapName => {
  const info = getAdventureMapInfo(mapName)
  if (!info) {
    console.log(`${mapName}: NOT FOUND`)
    return
  }

  const total = info.decorativeObjects?.length || 0
  const rocks = (info.decorativeObjects || []).filter(d =>
    d.type?.includes('rock') || d.type?.includes('stone')
  )
  const bushes = (info.decorativeObjects || []).filter(d =>
    d.type?.includes('bush')
  )
  const logs = (info.decorativeObjects || []).filter(d =>
    d.type?.includes('log')
  )

  console.log(`${mapName}:`)
  console.log(`  Total decorations: ${total}`)
  console.log(`  Rock/Stone: ${rocks.length}`)
  console.log(`  Bushes: ${bushes.length}`)
  console.log(`  Logs: ${logs.length}`)

  if (rocks.length > 0) {
    const types = [...new Set(rocks.map(d => d.type))]
    console.log(`  Rock types: ${types.join(', ')}`)
  }
  console.log('')
})
