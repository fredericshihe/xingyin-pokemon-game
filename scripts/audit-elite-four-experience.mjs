#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ELITE_FOUR_CEREMONY_BY_MAP,
  ELITE_FOUR_CEREMONY_MAP_IDS,
  createEliteFourCeremony,
  isEliteFourBossEvent
} from '../src/game/data/eliteFourCeremony.js'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import {
  ECOLOGY_SURVEY_MAP_IDS,
  isEcologySurveyMap
} from '../src/utils/ecologySurveyBalance.js'

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const originalGame = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
const ceremonyComponent = fs.readFileSync(path.join(rootDir, 'src/components/Game/EliteFourCeremonyOverlay.jsx'), 'utf8')
const gameCss = fs.readFileSync(path.join(rootDir, 'src/game.css'), 'utf8')
const failures = []

const expectedSurveyMaps = [
  'GodotMap',
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland'
]

if (JSON.stringify(ECOLOGY_SURVEY_MAP_IDS) !== JSON.stringify(expectedSurveyMaps)) {
  failures.push(`Ecology survey map whitelist changed: ${ECOLOGY_SURVEY_MAP_IDS.join(', ')}`)
}

for (const mapId of expectedSurveyMaps) {
  if (!isEcologySurveyMap(mapId)) failures.push(`${mapId}: outdoor map lost ecology survey eligibility.`)
}

const seenThemes = new Set()
let previousEntryDuration = 0
let previousVictoryDuration = 0
let previousEffectCount = 0

ELITE_FOUR_CEREMONY_MAP_IDS.forEach((mapId, index) => {
  const config = ELITE_FOUR_CEREMONY_BY_MAP[mapId]
  const map = GODOT_REGION_MAPS[mapId]
  const expectedOrder = index + 1

  if (isEcologySurveyMap(mapId)) failures.push(`${mapId}: Elite Four map must not expose an ecology survey.`)
  if (!config) {
    failures.push(`${mapId}: ceremony config is missing.`)
    return
  }
  if (!map) {
    failures.push(`${mapId}: map definition is missing.`)
    return
  }
  if (config.order !== expectedOrder) failures.push(`${mapId}: ceremony order ${config.order} should be ${expectedOrder}.`)
  if (seenThemes.has(config.theme)) failures.push(`${mapId}: ceremony theme ${config.theme} is not unique.`)
  seenThemes.add(config.theme)

  if (config.entryDurationMs <= previousEntryDuration) failures.push(`${mapId}: entry ceremony duration must increase by order.`)
  if (config.victoryDurationMs <= previousVictoryDuration) failures.push(`${mapId}: victory ceremony duration must increase by order.`)
  if (config.effectCount <= previousEffectCount) failures.push(`${mapId}: visual effect count must increase by order.`)
  previousEntryDuration = config.entryDurationMs
  previousVictoryDuration = config.victoryDurationMs
  previousEffectCount = config.effectCount

  if (!Array.isArray(config.trials) || config.trials.length !== 4) {
    failures.push(`${mapId}: ceremony must show three lieutenants and one Elite Four boss seal.`)
  }
  if (!config.entry?.title || !config.entry?.statement || !config.victory?.title || !config.victory?.statement) {
    failures.push(`${mapId}: entry and victory ceremony copy must be complete.`)
  }

  const boss = (map.runtimeEvents || []).find((event) => event.type === 'boss')
  if (!boss || boss.id !== config.bossEventId || !isEliteFourBossEvent(mapId, boss.id)) {
    failures.push(`${mapId}: ceremony boss id does not match the real map boss.`)
  }
  if ((map.encounterZones || []).length > 0) failures.push(`${mapId}: Elite Four dojo should not have wild encounter zones.`)

  for (const phase of ['entry', 'victory']) {
    const ceremony = createEliteFourCeremony(mapId, phase)
    if (!ceremony || ceremony.phase !== phase || ceremony.order !== expectedOrder) {
      failures.push(`${mapId}: failed to create ${phase} ceremony payload.`)
    }
  }
})

const integrationChecks = [
  ['fast travel entry trigger', /recordGameLog\('fast_travel',[\s\S]*?startEliteFourCeremony\(targetMapName, 'entry'\)/],
  ['map warp entry trigger', /const handleMapWarp = useCallback\([\s\S]*?if \(ELITE_FOUR_CEREMONY_MAP_IDS\.includes\(targetMapName\)\) \{[\s\S]*?startEliteFourCeremony\(targetMapName, 'entry'\)[\s\S]*?recordGameLog\('map_enter'/],
  ['boss completion validation', /completionMeta\.eventType === 'boss' && isEliteFourBossEvent\(completionMeta\.mapName, completionMeta\.eventId\)/],
  ['victory ceremony trigger', /startEliteFourCeremony\(completedEliteBossMapName, 'victory'\)/],
  ['map movement lock', /mapWarpBusy \|\| Boolean\(eliteFourCeremony\)/],
  ['ecology reward whitelist', /defeatedBattleKind === 'wild' && isEcologySurveyMap\(ecologyMapName\)/],
  ['ecology HUD disable', /ecologySurveyRequiredDefeats: ecologySurveyEnabled \? ECOLOGY_SURVEY_REQUIRED_WILD_DEFEATS : 0/]
]

integrationChecks.forEach(([label, pattern]) => {
  if (!pattern.test(originalGame)) failures.push(`OriginalGame integration missing: ${label}.`)
})

if (!/window\.setTimeout\(complete, duration\)/.test(ceremonyComponent)) {
  failures.push('Ceremony overlay must always auto-complete.')
}
if (
  !/className=\{isVictory \? 'is-lit' : ''\}/.test(ceremonyComponent) &&
  !/className=\{isVictory \|\| index < litTrialCount \? 'is-lit' : ''\}/.test(ceremonyComponent)
) {
  failures.push('Local lieutenant seals must stay unlit on entry and light only after the Elite Four victory.')
}
if (!/prefers-reduced-motion: reduce/.test(gameCss)) {
  failures.push('Ceremony styles must support reduced motion.')
}
for (const theme of ['frost', 'tide', 'iron', 'dragon']) {
  if (!gameCss.includes(`.elite-four-ceremony--${theme}`)) {
    failures.push(`Ceremony CSS theme missing: ${theme}.`)
  }
}

if (failures.length > 0) {
  console.error('[audit-elite-four-experience] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('[audit-elite-four-experience] OK: four dojos skip ecology surveys and use escalating entry/victory ceremonies.')
