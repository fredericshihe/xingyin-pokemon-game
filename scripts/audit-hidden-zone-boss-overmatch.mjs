#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const LIEUTENANT_HIDDEN_CORE_COUNT = 1
const BOSS_HIDDEN_CORE_COUNT = 3
const FINAL_BOSS_MAP_ID = 'GodotMapV2_BossHighland'
const FINAL_BOSS_ACE_POKEMON_ID = 68
const FINAL_BOSS_ACE_LEVEL_BONUS = 5
const FINAL_BOSS_ACE_MIN_LEVEL_LEAD = 5

const errors = []
const rows = []

const getProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const getLevel = (entry) => Math.max(1, Math.min(100, Math.trunc(Number(entry?.level)) || 1))
const getPokemonId = (entry) => {
  const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.speciesId ?? entry?.id))
  return Number.isInteger(pokemonId) ? pokemonId : null
}

const formatRange = (range) => (
  Array.isArray(range) && range.length >= 2 ? `Lv.${range[0]}-${range[1]}` : ''
)

const formatLevels = (levels = []) => {
  const safe = levels.filter(Number.isFinite)
  if (safe.length === 0) return ''
  return safe.join('/')
}

const distributeTargetsAcrossRange = (range, count) => {
  const min = Math.trunc(Number(range?.[0]))
  const max = Math.trunc(Number(range?.[1]))
  const safeCount = Math.max(1, Math.trunc(Number(count)) || 1)
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return []
  if (safeCount === 1) return [max]
  return Array.from({ length: safeCount }, (_, index) => (
    Math.max(min, Math.min(max, Math.round(min + ((max - min) * index) / (safeCount - 1))))
  ))
}

const getEventTeamEntries = (event) => (
  (Array.isArray(getProps(event).team) ? getProps(event).team : [])
    .map((entry) => ({
      pokemonId: getPokemonId(entry),
      level: getLevel(entry)
    }))
)

const getEventTeamLevels = (event) => getEventTeamEntries(event).map((entry) => entry.level)

const getCoreLevelsInRange = (levels, range) => {
  const min = Math.trunc(Number(range?.[0]))
  const max = Math.trunc(Number(range?.[1]))
  return levels
    .filter((level) => level >= min && level <= max)
    .sort((left, right) => left - right)
}

const isFinalBossTerminalAce = (mapId, teamEntries) => {
  const finalEntry = teamEntries[teamEntries.length - 1]
  return mapId === FINAL_BOSS_MAP_ID && finalEntry?.pokemonId === FINAL_BOSS_ACE_POKEMON_ID
}

const getBossCoreLevels = (mapId, teamEntries, range) => {
  const levels = teamEntries.map((entry) => entry.level)
  const coreLevels = getCoreLevelsInRange(levels, range)
  if (!isFinalBossTerminalAce(mapId, teamEntries)) return coreLevels

  const aceLevel = teamEntries[teamEntries.length - 1]?.level
  const hiddenMax = Math.trunc(Number(range?.[1]))
  if (!Number.isInteger(aceLevel) || !Number.isInteger(hiddenMax) || aceLevel <= hiddenMax) {
    return coreLevels
  }
  return [...coreLevels, aceLevel].sort((left, right) => left - right)
}

const resolveBossTargets = (mapId, equivalentRange) => {
  const targets = distributeTargetsAcrossRange(equivalentRange, BOSS_HIDDEN_CORE_COUNT)
  if (mapId !== FINAL_BOSS_MAP_ID || targets.length !== BOSS_HIDDEN_CORE_COUNT) return targets

  const hiddenMax = Math.trunc(Number(equivalentRange?.[1]))
  if (!Number.isInteger(hiddenMax)) return targets
  return [
    ...targets.slice(0, -1),
    Math.max(targets[targets.length - 1], hiddenMax + FINAL_BOSS_ACE_LEVEL_BONUS)
  ]
}

const collectDeepZoneRange = (map) => {
  const deepZones = (Array.isArray(map?.encounterZones) ? map.encounterZones : [])
    .filter((zone) => zone?.depth === 'deep')
    .filter((zone) => Array.isArray(zone.levelRange) && zone.levelRange.length >= 2)

  if (deepZones.length === 0) return null

  const mins = deepZones.map((zone) => Math.trunc(Number(zone.levelRange[0]))).filter(Number.isFinite)
  const maxes = deepZones.map((zone) => Math.trunc(Number(zone.levelRange[1]))).filter(Number.isFinite)
  if (mins.length === 0 || maxes.length === 0) return null

  return {
    source: 'hidden',
    zones: deepZones.map((zone) => zone.name || zone.id).filter(Boolean),
    range: [Math.min(...mins), Math.max(...maxes)]
  }
}

const resolveEquivalentRange = (orderedMaps, index) => {
  const own = collectDeepZoneRange(orderedMaps[index].map)
  if (own) return own

  const previous = orderedMaps
    .slice(0, index)
    .reverse()
    .map(({ map }) => collectDeepZoneRange(map))
    .find(Boolean)
  const next = orderedMaps
    .slice(index + 1)
    .map(({ map }) => collectDeepZoneRange(map))
    .find(Boolean)

  if (previous && next) {
    const min = previous.range[1] + 1
    const max = Math.max(min, next.range[0])
    return {
      source: 'progression',
      zones: [],
      range: [min, max]
    }
  }

  if (previous) {
    const min = previous.range[1] + 1
    return {
      source: 'progression',
      zones: [],
      range: [min, min + 3]
    }
  }

  if (next) {
    const max = Math.max(1, next.range[0] - 1)
    return {
      source: 'progression',
      zones: [],
      range: [Math.max(1, max - 3), max]
    }
  }

  return null
}

const compareLevels = (actual, expected) => (
  actual.length === expected.length &&
  actual.every((level, index) => level === expected[index])
)

await withViteAuditServer(async ({ loadModule }) => {
  const maps = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
    .then((module) => module.default)

  const orderedMaps = Object.entries(maps)
    .map(([mapId, map], index) => ({
      mapId,
      map,
      order: Number.isFinite(Number(map?.regionOrder)) ? Number(map.regionOrder) : index
    }))
    .sort((left, right) => left.order - right.order)

  orderedMaps.forEach(({ mapId, map }, index) => {
    const events = Array.isArray(map?.runtimeEvents) ? map.runtimeEvents : []
    const lieutenants = events
      .filter((event) => event?.type === 'trainer' && getProps(event).role === 'lieutenant')
      .sort((left, right) => (
        (Math.trunc(Number(getProps(left).sequenceOrder)) || 0) -
        (Math.trunc(Number(getProps(right).sequenceOrder)) || 0)
      ))
    const boss = events.find((event) => event?.type === 'boss')
    if (lieutenants.length === 0 && !boss) return

    const equivalent = resolveEquivalentRange(orderedMaps, index)
    if (!equivalent) {
      errors.push(`${mapId}: cannot resolve hidden-equivalent level range`)
      return
    }

    const lieutenantTargets = distributeTargetsAcrossRange(equivalent.range, lieutenants.length)
    const bossTargets = resolveBossTargets(mapId, equivalent.range)
    const row = {
      mapId,
      displayName: map?.displayName || mapId,
      source: equivalent.source,
      hiddenZones: equivalent.zones,
      equivalentRange: formatRange(equivalent.range),
      lieutenantTargets,
      lieutenants: [],
      bossTargets,
      boss: null
    }

    lieutenants.forEach((event, lieutenantIndex) => {
      const props = getProps(event)
      const levels = getEventTeamLevels(event)
      const coreLevels = getCoreLevelsInRange(levels, equivalent.range)
      const expectedCore = [lieutenantTargets[lieutenantIndex]]
      const recommendedLevel = Math.trunc(Number(props.recommendedLevel))

      row.lieutenants.push({
        id: event.id,
        name: props.name || event.id,
        levels,
        coreLevels,
        expectedCore,
        recommendedLevel
      })

      if (coreLevels.length !== LIEUTENANT_HIDDEN_CORE_COUNT) {
        errors.push(
          `${mapId}/${event.id}: lieutenant should have exactly ${LIEUTENANT_HIDDEN_CORE_COUNT} hidden-equivalent core, got ${coreLevels.length} (${formatLevels(coreLevels)})`
        )
      }
      if (!compareLevels(coreLevels, expectedCore)) {
        errors.push(
          `${mapId}/${event.id}: lieutenant core should be ${formatLevels(expectedCore)}, got ${formatLevels(coreLevels)}`
        )
      }
      if (recommendedLevel !== expectedCore[0]) {
        errors.push(
          `${mapId}/${event.id}: recommendedLevel should be ${expectedCore[0]}, got ${Number.isInteger(recommendedLevel) ? recommendedLevel : 'missing'}`
        )
      }
    })

    if (!boss) {
      errors.push(`${mapId}: missing boss event`)
    } else {
      const props = getProps(boss)
      const teamEntries = getEventTeamEntries(boss)
      const levels = teamEntries.map((entry) => entry.level)
      const coreLevels = getBossCoreLevels(mapId, teamEntries, equivalent.range)
      const recommendedLevel = Math.trunc(Number(props.recommendedLevel))
      const isTerminalAceBoss = isFinalBossTerminalAce(mapId, teamEntries)
      const terminalAce = teamEntries[teamEntries.length - 1]
      const previousMaxLevel = Math.max(...teamEntries.slice(0, -1).map((entry) => entry.level).filter(Number.isFinite))
      row.boss = {
        id: boss.id,
        name: props.name || boss.id,
        levels,
        coreLevels,
        expectedCore: bossTargets,
        recommendedLevel,
        terminalAce: isTerminalAceBoss
          ? {
              pokemonId: terminalAce?.pokemonId,
              level: terminalAce?.level,
              previousMaxLevel,
              minLead: FINAL_BOSS_ACE_MIN_LEVEL_LEAD
            }
          : null
      }

      if (coreLevels.length !== BOSS_HIDDEN_CORE_COUNT) {
        errors.push(
          `${mapId}/${boss.id}: boss should have exactly ${BOSS_HIDDEN_CORE_COUNT} hidden-equivalent cores, got ${coreLevels.length} (${formatLevels(coreLevels)})`
        )
      }
      if (!compareLevels(coreLevels, bossTargets)) {
        errors.push(
          `${mapId}/${boss.id}: boss cores should be ${formatLevels(bossTargets)}, got ${formatLevels(coreLevels)}`
        )
      }
      if (recommendedLevel !== bossTargets[bossTargets.length - 1]) {
        errors.push(
          `${mapId}/${boss.id}: recommendedLevel should be ${bossTargets[bossTargets.length - 1]}, got ${Number.isInteger(recommendedLevel) ? recommendedLevel : 'missing'}`
        )
      }
      if (mapId === FINAL_BOSS_MAP_ID) {
        if (!isTerminalAceBoss) {
          errors.push(
            `${mapId}/${boss.id}: final boss last team member should be Pokemon #${FINAL_BOSS_ACE_POKEMON_ID}`
          )
        } else if (terminalAce.level < previousMaxLevel + FINAL_BOSS_ACE_MIN_LEVEL_LEAD) {
          errors.push(
            `${mapId}/${boss.id}: final boss ace should be at least ${FINAL_BOSS_ACE_MIN_LEVEL_LEAD} levels above the first five, got ${terminalAce.level} vs ${previousMaxLevel}`
          )
        }
      }
    }

    rows.push(row)
  })

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    rule: 'Lieutenants must carry one hidden-equivalent core; bosses must carry three hidden-equivalent cores. Maps without a hidden zone use the natural progression range between neighboring hidden zones. The final Boss ace may exceed the hidden range and must clearly lead the first five.',
    summary: {
      mapCount: rows.length,
      lieutenantHiddenCoreCount: LIEUTENANT_HIDDEN_CORE_COUNT,
      bossHiddenCoreCount: BOSS_HIDDEN_CORE_COUNT,
      errorCount: errors.length
    },
    rows,
    errors
  }, null, 2))

  if (errors.length > 0) process.exitCode = 1
})
