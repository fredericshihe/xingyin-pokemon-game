#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const LIEUTENANT_CORE_COUNT = 1
const BOSS_CORE_COUNT = 3
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
  const coreMax = Math.trunc(Number(range?.[1]))
  if (!Number.isInteger(aceLevel) || !Number.isInteger(coreMax) || aceLevel <= coreMax) {
    return coreLevels
  }
  return [...coreLevels, aceLevel].sort((left, right) => left - right)
}

const resolveBossTargets = (mapId, coreRange) => {
  const targets = distributeTargetsAcrossRange(coreRange, BOSS_CORE_COUNT)
  if (mapId !== FINAL_BOSS_MAP_ID || targets.length !== BOSS_CORE_COUNT) return targets

  const coreMax = Math.trunc(Number(coreRange?.[1]))
  if (!Number.isInteger(coreMax)) return targets
  return [
    ...targets.slice(0, -1),
    Math.max(targets[targets.length - 1], coreMax + FINAL_BOSS_ACE_LEVEL_BONUS)
  ]
}

// Boss 和部下保留既有难度；秘境现在只比普通草丛上限高 1 级，
// 不再承担训练家核心等级的基准职责。
const CAMPAIGN_CORE_LEVEL_RANGES = {
  GodotMapV2: [17, 19],
  GodotMapV2_MistLake: [23, 25],
  GodotMapV2_FarmTown: [29, 31],
  GodotMapV2_PirateShore: [35, 40],
  GodotMapV2_Graveyard: [41, 52],
  GodotMapV2_HexRuins: [47, 61],
  GodotMapV2_SurvivalRidge: [62, 65],
  GodotMapV2_BossHighland: [65, 70]
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
  const regionalCampaignLastOrder = orderedMaps.find(({ mapId }) => mapId === FINAL_BOSS_MAP_ID)?.order ?? Infinity
  const regionalCampaignMaps = orderedMaps.filter(({ order }) => order <= regionalCampaignLastOrder)

  regionalCampaignMaps.forEach(({ mapId, map }) => {
    const events = Array.isArray(map?.runtimeEvents) ? map.runtimeEvents : []
    const lieutenants = events
      .filter((event) => event?.type === 'trainer' && getProps(event).role === 'lieutenant')
      .sort((left, right) => (
        (Math.trunc(Number(getProps(left).sequenceOrder)) || 0) -
        (Math.trunc(Number(getProps(right).sequenceOrder)) || 0)
      ))
    const boss = events.find((event) => event?.type === 'boss')
    if (lieutenants.length === 0 && !boss) return

    const coreRange = CAMPAIGN_CORE_LEVEL_RANGES[mapId]
    if (!coreRange) {
      errors.push(`${mapId}: missing campaign core level range`)
      return
    }

    const lieutenantTargets = distributeTargetsAcrossRange(coreRange, lieutenants.length)
    const bossTargets = resolveBossTargets(mapId, coreRange)
    const row = {
      mapId,
      displayName: map?.displayName || mapId,
      coreRange: formatRange(coreRange),
      lieutenantTargets,
      lieutenants: [],
      bossTargets,
      boss: null
    }

    lieutenants.forEach((event, lieutenantIndex) => {
      const props = getProps(event)
      const levels = getEventTeamLevels(event)
      const coreLevels = getCoreLevelsInRange(levels, coreRange)
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

      if (coreLevels.length !== LIEUTENANT_CORE_COUNT) {
        errors.push(
          `${mapId}/${event.id}: lieutenant should have exactly ${LIEUTENANT_CORE_COUNT} high-level core, got ${coreLevels.length} (${formatLevels(coreLevels)})`
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
      const coreLevels = getBossCoreLevels(mapId, teamEntries, coreRange)
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

      if (coreLevels.length !== BOSS_CORE_COUNT) {
        errors.push(
          `${mapId}/${boss.id}: boss should have exactly ${BOSS_CORE_COUNT} high-level cores, got ${coreLevels.length} (${formatLevels(coreLevels)})`
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
    rule: 'Regional-campaign lieutenants retain one high-level core and bosses retain three, independently of hidden wild encounter levels. Elite Four maps have dedicated audits. The final Boss ace must clearly lead the first five.',
    summary: {
      mapCount: rows.length,
      lieutenantCoreCount: LIEUTENANT_CORE_COUNT,
      bossCoreCount: BOSS_CORE_COUNT,
      errorCount: errors.length
    },
    rows,
    errors
  }, null, 2))

  if (errors.length > 0) process.exitCode = 1
})
