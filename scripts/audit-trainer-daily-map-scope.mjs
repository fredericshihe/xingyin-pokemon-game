import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { MAP_CHAIN, getMapConfigData, getMapRuntimeEvents } from '../src/game/data/mapCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const source = [
  'src/components/Game/OriginalGame.jsx',
  'src/game/GameCanvas.jsx',
  'src/game/ThreeLowPolyMap.jsx'
]
  .map((relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'))
  .join('\n')

const requiredMarkers = [
  ['map scoped event id helper', 'const getMapScopedEventId = (mapName, eventId) =>'],
  ['scoped world event lookup helper', 'const hasMapScopedWorldEventId = (world, key, mapName, eventId) =>'],
  ['daily trainer lookup uses scoped helper', 'const hasDailyTrainerBattleEvent = (world, mapName, eventId) =>'],
  ['daily trainer write uses scoped helper', 'const appendDailyTrainerBattleEvent = (world, mapName, eventId) =>'],
  ['daily variant battles check current map daily lock at battle start', 'if (isDailyVariantBattle && battleEventId && hasDailyTrainerBattleEvent(interactionWorld, currentMapName, battleEventId)) {'],
  ['victory settlement writes daily lock for all daily variants', 'nextWorld = appendDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId);'],
  ['daily variant completion lookup stays map scoped', 'const wasAlreadyDailyCompleted = hasDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId);'],
  ['challenge victory count keeps map scope', 'setTrainerVictoryCount(nextWorld, completedEventId, challengeRareUnlockStage, completedMapName);'],
  ['challenge unlock lookup keeps map scope', 'getChallengeRareUnlockStage(interactionWorld, battleMapEvent, currentMapName)'],
  ['challenge same-day visual state uses daily lock', "status: hasDailyTrainerBattleEvent(world, mapName, event.id) ? 'daily_complete' : 'available'"],
  ['muted battle events route to info on map', 'function shouldRouteBattleEventToInfo(mapEvent, mapEventVisualState, currentMapBossCompleted = false) {'],
  ['configured battle info messages resolved centrally', 'const getConfiguredBattleEventInfoMessage = ({'],
  ['accepted cloud snapshot is applied locally', 'applyLocalCommittedCloudSnapshot(normalizedSnapshot);']
]

const forbiddenMarkers = [
  ['global daily lock lookup at battle start', "hasWorldEventId(interactionWorld, 'dailyTrainerBattleIds', battleEventId)"],
  ['global daily lock lookup at victory', "hasWorldEventId(nextWorld, 'dailyTrainerBattleIds', completedEventId)"],
  ['global daily lock write', "appendWorldEventId(nextWorld, 'dailyTrainerBattleIds', completedEventId)"],
  ['repeatable challenge bypasses daily lock', 'const wasAlreadyDailyCompleted = isRepeatableChallenge'],
  ['challenge visual state stays permanently completed', "status: hasMapScopedWorldEventId(world, 'completedChallengeIds', mapName, event.id) ? 'completed' : 'available'"]
]

const failures = []
const warnings = []
const eventOwners = new Map()
const summary = { maps: 0, events: 0, trainers: 0, challenges: 0 }

for (const [label, marker] of requiredMarkers) {
  if (!source.includes(marker)) failures.push(`Missing ${label}: ${marker}`)
}

for (const [label, marker] of forbiddenMarkers) {
  if (source.includes(marker)) failures.push(`Forbidden ${label}: ${marker}`)
}

const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const hasTeam = (team) => Array.isArray(team) && team.length > 0
const eventLabel = (mapLabel, event) => `${mapLabel} / ${event.type} / ${event.id || '(missing-id)'}`

for (const mapName of MAP_CHAIN) {
  const mapLabel = getMapConfigData(mapName)?.displayName || mapName
  const events = getMapRuntimeEvents(mapName)
  summary.maps += 1
  summary.events += events.length

  const ids = new Set()
  for (const event of events) {
    if (!hasText(event.id)) {
      failures.push(`${mapLabel} has a ${event.type} event without a stable id.`)
      continue
    }
    if (ids.has(event.id)) failures.push(`${mapLabel} duplicates event id "${event.id}".`)
    ids.add(event.id)

    if (eventOwners.has(event.id)) {
      failures.push(`Global event id collision: ${event.id} on ${eventOwners.get(event.id)} and ${eventLabel(mapLabel, event)}.`)
    } else {
      eventOwners.set(event.id, eventLabel(mapLabel, event))
    }

    const props = event.properties || {}
    if (event.type === 'trainer') {
      summary.trainers += 1
      if (!hasTeam(props.team)) failures.push(`${eventLabel(mapLabel, event)} has no configured team.`)
      if (!hasText(props.beforeBattleText)) failures.push(`${eventLabel(mapLabel, event)} is missing beforeBattleText.`)
      if (!hasText(props.defeatedText)) failures.push(`${eventLabel(mapLabel, event)} is missing defeatedText.`)
      if (!hasText(props.dailyDefeatedText)) failures.push(`${eventLabel(mapLabel, event)} is missing dailyDefeatedText.`)
      if ((props.role || 'normal') === 'normal' && !String(props.dailyDefeatedText || '').includes('明天')) {
        warnings.push(`${eventLabel(mapLabel, event)} daily text should mention next-day access.`)
      }
    }

    if (event.type === 'challenge') {
      summary.challenges += 1
      if (props.role !== 'challenge') failures.push(`${eventLabel(mapLabel, event)} must use role "challenge".`)
      if (!hasTeam(props.team)) failures.push(`${eventLabel(mapLabel, event)} has no configured team.`)
      if (!Array.isArray(props.rewardItems)) failures.push(`${eventLabel(mapLabel, event)} is missing rewardItems.`)
      if (!Array.isArray(props.challengeRarePool)) failures.push(`${eventLabel(mapLabel, event)} is missing challengeRarePool.`)
      if (!String(props.dailyDefeatedText || '').includes('明天')) {
        warnings.push(`${eventLabel(mapLabel, event)} daily text should mention next-day refresh access.`)
      }
      if (!String(props.dailyDefeatedText || '').includes('首通奖励不会重复')) {
        warnings.push(`${eventLabel(mapLabel, event)} repeat text should explain first-clear reward behavior.`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Trainer / challenge daily scope audit failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  if (warnings.length > 0) {
    console.error('Warnings:')
    warnings.forEach((warning) => console.error(`- ${warning}`))
  }
  process.exit(1)
}

console.log('Trainer / challenge daily scope audit passed.')
console.log(JSON.stringify({ ok: true, summary, warnings }, null, 2))
