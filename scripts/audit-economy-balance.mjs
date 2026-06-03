#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const CHECK_LEVELS = [5, 10, 20, 30, 50]
const sample = (items, limit = 20) => items.slice(0, limit)

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const percentile = (values, p) => {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b)
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

const summarize = (values) => ({
  min: percentile(values, 0),
  p10: percentile(values, 0.1),
  median: median(values),
  p90: percentile(values, 0.9),
  max: percentile(values, 1),
})

const toPokemonId = (entry) => {
  const id = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
  return Number.isInteger(id) ? id : null
}

const pickRepresentativeLevels = (entry, fallbackMin, fallbackMax) => {
  const min = Math.trunc(Number(entry?.minLevel ?? entry?.level ?? fallbackMin))
  const max = Math.trunc(Number(entry?.maxLevel ?? entry?.level ?? fallbackMax ?? min))
  if (!Number.isInteger(min) && !Number.isInteger(max)) return []
  const low = Number.isInteger(min) ? min : max
  const high = Number.isInteger(max) ? max : low
  const sorted = [Math.min(low, high), Math.round((low + high) / 2), Math.max(low, high)]
    .filter((level) => Number.isInteger(level) && level > 0)
  return [...new Set(sorted)]
}

const PAID_HIDDEN_ZONE_IDS = new Set([
  'meadow_hidden_grove',
  'lake_hidden_path',
  'farm_windmill_top',
  'shore_wreck_inner',
  'grave_deep_forest',
  'hex_sealed_chamber',
  'peak_starwatch_path',
])

const isHiddenZone = (zone) => (
  PAID_HIDDEN_ZONE_IDS.has(String(zone?.id || ''))
)

const estimateRecommendedMoveCost = (move, officialMeta) => {
  if (!move || move.cost === 0) return 0

  const pp = Number(officialMeta?.pp) || 20
  const power = Number(officialMeta?.power ?? move.power) || 0
  const accuracy = Number(officialMeta?.accuracy ?? move.accuracy) || 100
  const ppPressure = Math.max(0, 30 - Math.min(pp, 30)) * 0.35
  const powerPressure = power / 14
  const effectPressure = move.status || move.volatileStatus || move.statChange || move.effect ? 2 : 0
  const statusOnlyPressure = move.category === 'status' ? 1.5 : 0
  const priorityPressure = (move.priority || 0) * 1.5
  const accuracyRelief = Math.max(0, 100 - accuracy) * 0.06
  const chargeRelief = move.charge ? 2 : 0
  const setupRelief = move.requiresTargetStatus ? 3 : 0
  const recommended = Math.round(
    2 + powerPressure + ppPressure + effectPressure + statusOnlyPressure +
    priorityPressure - accuracyRelief - chargeRelief - setupRelief
  )
  return Math.max(4, Math.min(24, recommended))
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    {
      calculateBattleRewards,
      getExpToNextLevelOfficial,
    },
    {
      getOfficialBaseExperience,
      getOfficialGrowthRate,
      getOfficialExpToNextLevel,
    },
    { OFFICIAL_MOVE_META_BY_KEY },
    { calculateStatsForLevel },
    { isLevelValidForSpecies },
    { ADVENTURE_MAP_CHAIN, getAdventureMapInfo },
    { getMapConfig },
    { ENCOUNTER_TABLES },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/officialExperience.js'),
    loadModule('/src/utils/officialMoveMeta.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
    loadModule('/src/game/data/overworldMaps.js'),
    loadModule('/src/data/maps/mapConfig.js'),
    loadModule('/src/game/data/encounterTables.js'),
  ])

  const missingExperienceData = []
  const expCurveMismatches = []
  const growthRateCounts = {}
  const battlePaceRows = []
  const actualEncounterPaceRows = []
  const moveCostRows = []
  const moveCostWarnings = []
  const moveAffordabilityWarnings = []
  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

  const createBattlePaceRow = (monster, level, extra = {}) => {
    const expToNext = getExpToNextLevelOfficial(level, monster)
    const defeatedMon = { ...monster, ...calculateStatsForLevel(monster, level), level }
    const reward = calculateBattleRewards({
      defeatedMon,
      playerAverageLevel: level,
      battleKind: 'wild',
      participants: 1,
    })
    const battlesToNext = reward.exp > 0 ? expToNext / reward.exp : Infinity
    return {
      ...extra,
      id: monster.id,
      dexNo: monster.dexNo,
      name: monster.name,
      level,
      validForLevel: isLevelValidForSpecies(monster.id, level),
      growthRate: getOfficialGrowthRate(monster),
      baseExperience: getOfficialBaseExperience(monster),
      expToNext,
      rewardExp: reward.exp,
      battlesToNext,
    }
  }

  for (const monster of MONSTERS) {
    const baseExperience = getOfficialBaseExperience(monster)
    const growthRate = getOfficialGrowthRate(monster)
    growthRateCounts[growthRate] = (growthRateCounts[growthRate] || 0) + 1

    if (!baseExperience || !growthRate) {
      missingExperienceData.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        baseExperience,
        growthRate,
      })
    }

    for (let level = 1; level < 100; level += 1) {
      const projectExpToNext = getExpToNextLevelOfficial(level, monster)
      const officialExpToNext = getOfficialExpToNextLevel(level, monster)
      if (projectExpToNext !== officialExpToNext) {
        expCurveMismatches.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
          projectExpToNext,
          officialExpToNext,
        })
      }
    }

    for (const level of CHECK_LEVELS) {
      battlePaceRows.push(createBattlePaceRow(monster, level))
    }
  }

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const config = getMapConfig(mapId)
    const mapName = config?.displayName || mapInfo?.displayName || mapId
    const fallbackMin = Math.max(1, Math.trunc(Number(config?.minLevel ?? 1)) || 1)
    const fallbackMax = Math.max(fallbackMin, Math.trunc(Number(config?.maxLevel ?? fallbackMin)) || fallbackMin)
    for (const zone of Array.isArray(mapInfo?.encounterZones) ? mapInfo.encounterZones : []) {
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
      for (const entry of entries) {
        const monster = monsterById.get(toPokemonId(entry))
        if (!monster) continue
        for (const level of pickRepresentativeLevels(entry, fallbackMin, fallbackMax)) {
          actualEncounterPaceRows.push(createBattlePaceRow(monster, level, {
            mapId,
            mapName,
            zoneId: zone.id,
            zoneName: zone.name || zone.id,
            tableId: zone.encounterTableId,
            hidden: isHiddenZone(zone),
          }))
        }
      }
    }
  }

  for (const [moveKey, move] of Object.entries(MOVES)) {
    const officialMeta = OFFICIAL_MOVE_META_BY_KEY[moveKey]
    const recommendedCost = estimateRecommendedMoveCost(move, officialMeta)
    const zeroCostAllowed = move.cost === 0 && officialMeta?.pp >= 30 && (move.power || 0) <= 40
    const costRatio = recommendedCost > 0 ? move.cost / recommendedCost : null
    const row = {
      moveKey,
      name: move.name,
      cost: move.cost,
      recommendedCost,
      officialPp: officialMeta?.pp ?? null,
      power: move.power,
      category: move.category,
      accuracy: move.accuracy,
      costRatio,
      zeroCostAllowed,
    }
    moveCostRows.push(row)

    if (!officialMeta) {
      moveCostWarnings.push({ ...row, issue: 'missing_official_pp' })
    } else if (move.cost === 0 && !zeroCostAllowed) {
      moveCostWarnings.push({ ...row, issue: 'zero_cost_non_basic_move' })
    } else if (move.cost > 0 && costRatio < 0.45) {
      moveCostWarnings.push({ ...row, issue: 'cost_much_lower_than_pp_power_model' })
    } else if (move.cost > 0 && costRatio > 1.8) {
      moveCostWarnings.push({ ...row, issue: 'cost_much_higher_than_pp_power_model' })
    }

    for (const level of [20, 30, 50]) {
      const users = MONSTERS
        .filter((monster) => getBalancedMovesForLevel(monster, level).includes(moveKey))
        .map((monster) => ({
          monster,
          stats: calculateStatsForLevel(monster, level),
        }))
      if (!users.length || move.cost === 0) continue
      const uses = users.map(({ stats }) => Math.floor(stats.maxMp / move.cost))
      const medianUses = median(uses)
      const minUses = percentile(uses, 0)
      if (minUses < 1) {
        moveAffordabilityWarnings.push({
          moveKey,
          name: move.name,
          level,
          issue: 'unusable_for_some_users',
          minUses,
          medianUses,
        })
      }
      if ((officialMeta?.pp <= 5 || move.power >= 110) && medianUses >= 4) {
        moveAffordabilityWarnings.push({
          moveKey,
          name: move.name,
          level,
          issue: 'high_impact_move_many_median_uses',
          officialPp: officialMeta?.pp ?? null,
          cost: move.cost,
          minUses,
          medianUses,
        })
      }
    }
  }

  const validBattlePaceRows = battlePaceRows.filter((row) => row.validForLevel)
  const battlesToNextByLevel = Object.fromEntries(
    CHECK_LEVELS.map((level) => [
      level,
      summarize(validBattlePaceRows
        .filter((row) => row.level === level)
        .map((row) => row.battlesToNext)),
    ])
  )
  const fastLevelingRows = validBattlePaceRows
    .filter((row) => row.battlesToNext < 1.5)
    .sort((a, b) => a.battlesToNext - b.battlesToNext)
  const slowLevelingRows = validBattlePaceRows
    .filter((row) => row.battlesToNext > 18)
    .sort((a, b) => b.battlesToNext - a.battlesToNext)
  const actualFastLevelingRows = actualEncounterPaceRows
    .filter((row) => row.validForLevel && row.battlesToNext < 1.5)
    .sort((a, b) => a.battlesToNext - b.battlesToNext)
  const actualSlowLevelingRows = actualEncounterPaceRows
    .filter((row) => row.validForLevel && row.battlesToNext > 18)
    .sort((a, b) => b.battlesToNext - a.battlesToNext)
  const actualStandardFastLevelingRows = actualFastLevelingRows.filter((row) => !row.hidden)
  const actualHiddenFastLevelingRows = actualFastLevelingRows.filter((row) => row.hidden)

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: Object.keys(MOVES).length,
      growthRateCounts,
      missingExperienceDataCount: missingExperienceData.length,
      expCurveMismatchCount: expCurveMismatches.length,
      battlePaceRows: battlePaceRows.length,
      validBattlePaceRows: validBattlePaceRows.length,
      fastLevelingScenarioCount: fastLevelingRows.length,
      slowLevelingScenarioCount: slowLevelingRows.length,
      actualEncounterPaceRows: actualEncounterPaceRows.length,
      actualFastLevelingScenarioCount: actualFastLevelingRows.length,
      actualStandardFastLevelingScenarioCount: actualStandardFastLevelingRows.length,
      actualHiddenFastLevelingScenarioCount: actualHiddenFastLevelingRows.length,
      actualSlowLevelingScenarioCount: actualSlowLevelingRows.length,
      moveCostWarningCount: moveCostWarnings.length,
      moveAffordabilityWarningCount: moveAffordabilityWarnings.length,
    },
    battlePace: {
      battlesToNextByLevel,
      fastLevelingSamples: sample(fastLevelingRows),
      slowLevelingSamples: sample(slowLevelingRows),
    },
    actualEncounterPace: {
      fastLevelingSamples: sample(actualFastLevelingRows),
      standardFastLevelingSamples: sample(actualStandardFastLevelingRows),
      hiddenFastLevelingSamples: sample(actualHiddenFastLevelingRows),
      slowLevelingSamples: sample(actualSlowLevelingRows),
    },
    moveCosts: {
      zeroCostMoves: moveCostRows.filter((row) => row.cost === 0),
      warnings: sample(moveCostWarnings),
      affordabilityWarnings: sample(moveAffordabilityWarnings),
      sample: sample(moveCostRows.sort((a, b) => b.recommendedCost - a.recommendedCost)),
    },
    samples: {
      missingExperienceData: sample(missingExperienceData),
      expCurveMismatches: sample(expCurveMismatches),
    },
  }

  console.log(JSON.stringify(report, null, 2))
})
