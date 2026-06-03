#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { MAP_IDS, getMapInfo, getMapRuntimeEvents } from '../src/game/data/mapCatalog.js'

const sourcePath = new URL('../src/components/Game/OriginalGame.jsx', import.meta.url)
const cssPath = new URL('../src/index.css', import.meta.url)

const readCssWithImports = async (url, seen = new Set()) => {
  const key = url.href
  if (seen.has(key)) return ''
  seen.add(key)

  const content = await readFile(url, 'utf8')
  const imports = [...content.matchAll(/@import\s+['"](.+?)['"];/g)]
    .map((match) => new URL(path.posix.normalize(match[1]), url))
  const importedCss = await Promise.all(imports.map((importUrl) => readCssWithImports(importUrl, seen)))
  return [content, ...importedCss].join('\n')
}

const [source, css] = await Promise.all([
  readFile(sourcePath, 'utf8'),
  readCssWithImports(cssPath)
])

const requiredSceneClasses = [
  'battle-scene-valley-camp',
  'battle-scene-lake',
  'battle-scene-meadow',
  'battle-scene-dusk',
  'battle-scene-sunny-meadow',
  'battle-scene-flower-hill',
  'battle-scene-forest',
  'battle-scene-lake-reeds',
  'battle-scene-wetland',
  'battle-scene-southeast-meadow',
  'battle-scene-farm-field',
  'battle-scene-pirate-shore',
  'battle-scene-graveyard',
  'battle-scene-hex-ruins',
  'battle-scene-survival-ridge',
  'battle-scene-star-peak',
  'battle-scene-training-ground'
]

const requiredRoleClasses = [
  'battle-scene-role-wild',
  'battle-scene-role-normal',
  'battle-scene-role-lieutenant',
  'battle-scene-role-boss',
  'battle-scene-role-challenge'
]

const errors = []
const rows = []

for (const sceneClass of requiredSceneClasses) {
  if (!source.includes(`'${sceneClass}'`)) {
    errors.push(`OriginalGame.jsx is missing known battle scene class ${sceneClass}`)
  }
  if (!css.includes(`.${sceneClass}`)) {
    errors.push(`CSS imports from index.css are missing selector for ${sceneClass}`)
  }
}

for (const roleClass of requiredRoleClasses) {
  if (!css.includes(`.${roleClass}`)) {
    errors.push(`CSS imports from index.css are missing role overlay selector for ${roleClass}`)
  }
}

const battleSceneClassBlock = source.match(/const battleSceneClass = useMemo\(\(\) => \{[\s\S]*?\n\s*\}, \[[^\]]*\]\);/)
if (!battleSceneClassBlock) {
  errors.push('OriginalGame.jsx is missing BattleScene battleSceneClass useMemo block')
} else {
  const block = battleSceneClassBlock[0]
  if (block.includes('battleEnemyMon') || block.includes('enemyMon')) {
    errors.push('BattleScene background selection must not depend on the current enemy Pokemon')
  }
  if (!block.includes('normalizeBattleEnvironment')) {
    errors.push('BattleScene background selection should resolve from the stable battle environment snapshot')
  }
}

if (!source.includes('eventPosition') || !source.includes('triggerPosition')) {
  errors.push('Battle environment should persist eventPosition and triggerPosition for stable map-location scene selection')
}

for (const mapId of MAP_IDS) {
  const mapInfo = getMapInfo(mapId)
  const encounterZones = Array.isArray(mapInfo?.encounterZones) ? mapInfo.encounterZones : []
  const runtimeEvents = getMapRuntimeEvents(mapId)
  const battleEvents = runtimeEvents.filter((event) => ['trainer', 'boss', 'challenge'].includes(event?.type))

  if (!source.includes(`${mapId}: 'battle-scene-`)) {
    errors.push(`${mapId}: missing map-level battle scene mapping`)
  }

  for (const zone of encounterZones) {
    if (!zone?.id) continue
    if (!source.includes(`${zone.id}: 'battle-scene-`)) {
      errors.push(`${mapId}: encounter zone ${zone.id} is missing zone-level battle scene mapping`)
    }
  }

  for (const event of battleEvents) {
    const role = event?.properties?.role || event?.type || 'normal'
    if (!['normal', 'lieutenant', 'boss', 'challenge', 'reward', 'minigame'].includes(role)) {
      errors.push(`${mapId}: battle event ${event.id || event.type} has unmapped role ${role}`)
    }
    const sceneClass = event?.properties?.sceneClass
    if (sceneClass && !requiredSceneClasses.includes(sceneClass)) {
      errors.push(`${mapId}: battle event ${event.id || event.type} uses unknown sceneClass ${sceneClass}`)
    }
  }

  rows.push({
    mapId,
    displayName: mapInfo?.displayName || mapId,
    zones: encounterZones.length,
    battleEvents: battleEvents.length
  })
}

console.table(rows)

if (errors.length > 0) {
  console.error('\nBattle scene audit failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('\nBattle scene audit passed.')
