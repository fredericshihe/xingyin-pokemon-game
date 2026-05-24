#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const MONSTER_STAT_KEYS = ['maxHp', 'maxMp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
const sample = (items, limit = 16) => items.slice(0, limit)
const formatRiskSample = (risk, missingKey) => ({
  id: risk.id,
  name: risk.name,
  startLevel: risk.startLevel,
  currentEventCount: risk.currentEvents.length,
  expectedEventCount: risk.expectedEvents.length,
  [missingKey]: risk[missingKey],
})

const createMonsterInstance = (baseMonster, level, getBalancedMovesForLevel, getExpToNextLevelOfficial, calculateStatsForLevel) => {
  const stats = calculateStatsForLevel(baseMonster, level)
  return {
    ...baseMonster,
    ...stats,
    level,
    baseId: baseMonster.id,
    moves: getBalancedMovesForLevel(baseMonster, level),
    currentExp: 0,
    expToNextLevel: level >= 100 ? Infinity : getExpToNextLevelOfficial(level, baseMonster),
  }
}

const normalizeEvent = (event) => {
  if (event.type === 'evolution') return `evo:${event.level}:${event.targetId}`
  if (event.type === 'evolutionChoice') return `evo-choice:${event.level}:${(event.targetOptions || []).join(',')}`
  return `learn:${event.level}:${event.moveKey}:${event.baseId || 'unknown'}`
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, getBalancedMovesForLevel },
    { getMovesLearnedAtLevel, getEvolutionAtLevel, getEvolutionTargetsAtLevel },
    { getExpToNextLevelOfficial },
    { calculateStatsForLevel },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonGrowth.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/pokemonStats.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [monster.id, monster]))
  const statRegressions = []
  const invalidExpCurve = []
  const growthCoverage = []
  const multiEvolutionRisks = []
  const postEvolutionLearnRisks = []

  const simulateCurrentQueue = (startMonster, startLevel, targetLevel) => {
    const original = createMonsterInstance(startMonster, startLevel, getBalancedMovesForLevel, getExpToNextLevelOfficial, calculateStatsForLevel)
    const originalMoves = [...original.moves]
    const queuedLearnMoves = new Set()
    const events = []
    let updatedMon = { ...original }
    let growthBase = startMonster

    while (updatedMon.level < targetLevel) {
      const newLevel = updatedMon.level + 1
      updatedMon = createMonsterInstance(startMonster, newLevel, getBalancedMovesForLevel, getExpToNextLevelOfficial, calculateStatsForLevel)
      updatedMon.moves = [...originalMoves]

      const evoTargetIds = getEvolutionTargetsAtLevel(growthBase, newLevel)
      const evoId = getEvolutionAtLevel(growthBase, newLevel)
      if (evoTargetIds.length > 1) {
        events.push({
          type: 'evolutionChoice',
          level: newLevel,
          targetOptions: evoTargetIds,
          baseId: growthBase.id,
        })
      } else if (evoId) {
        events.push({
          type: 'evolution',
          level: newLevel,
          targetId: evoId,
          baseId: growthBase.id,
        })
      }

      for (const moveKey of getMovesLearnedAtLevel(growthBase, newLevel)) {
        if (!originalMoves.includes(moveKey) && !queuedLearnMoves.has(moveKey)) {
          events.push({
            type: 'learnMove',
            level: newLevel,
            moveKey,
            baseId: growthBase.id,
          })
          queuedLearnMoves.add(moveKey)
        }
      }

      if (evoTargetIds.length === 1 && evoId) {
        growthBase = monsterById.get(evoId) || growthBase
      }
    }

    return events
  }

  const simulateExpectedQueue = (startMonster, startLevel, targetLevel) => {
    let currentBase = startMonster
    const currentMoves = new Set(getBalancedMovesForLevel(startMonster, startLevel))
    const queuedLearnMoves = new Set()
    const events = []

    for (let level = startLevel + 1; level <= targetLevel; level += 1) {
      const evoTargetIds = getEvolutionTargetsAtLevel(currentBase, level)
      const evoId = getEvolutionAtLevel(currentBase, level)
      if (evoTargetIds.length > 1) {
        events.push({
          type: 'evolutionChoice',
          level,
          targetOptions: evoTargetIds,
          baseId: currentBase.id,
        })
      } else if (evoId) {
        events.push({
          type: 'evolution',
          level,
          targetId: evoId,
          baseId: currentBase.id,
        })
      }

      for (const moveKey of getMovesLearnedAtLevel(currentBase, level)) {
        if (!currentMoves.has(moveKey) && !queuedLearnMoves.has(moveKey)) {
          events.push({
            type: 'learnMove',
            level,
            moveKey,
            baseId: currentBase.id,
          })
          queuedLearnMoves.add(moveKey)
        }
      }

      if (evoTargetIds.length === 1 && evoId) {
        currentBase = monsterById.get(evoId) || currentBase
      }
    }

    return events
  }

  for (const monster of MONSTERS) {
    let previousInstance = null
    let currentBase = monster
    const learnedLevels = []
    const evolutionLevels = []

    for (let level = 1; level <= 100; level += 1) {
      const instance = createMonsterInstance(currentBase, level, getBalancedMovesForLevel, getExpToNextLevelOfficial, calculateStatsForLevel)
      growthCoverage.push({
        id: monster.id,
        name: monster.name,
        level,
        baseId: currentBase.id,
        expToNextLevel: instance.expToNextLevel,
        moves: instance.moves,
      })

      if (level < 100 && !(instance.expToNextLevel > 0 && Number.isFinite(instance.expToNextLevel))) {
        invalidExpCurve.push({
          id: monster.id,
          name: monster.name,
          level,
          expToNextLevel: instance.expToNextLevel,
        })
      }

      if (previousInstance && previousInstance.baseId === instance.baseId) {
        for (const statKey of MONSTER_STAT_KEYS) {
          if (instance[statKey] < previousInstance[statKey]) {
            statRegressions.push({
              id: monster.id,
              name: monster.name,
              baseId: instance.baseId,
              level,
              statKey,
              previous: previousInstance[statKey],
              current: instance[statKey],
            })
          }
        }
      }

      const learnedMoves = getMovesLearnedAtLevel(currentBase, level)
      if (learnedMoves.length > 0) {
        learnedLevels.push({ level, baseId: currentBase.id, moves: learnedMoves })
      }

      const evoTargetIds = getEvolutionTargetsAtLevel(currentBase, level)
      const evoId = getEvolutionAtLevel(currentBase, level)
      if (evoId || evoTargetIds.length > 1) {
        evolutionLevels.push({ level, fromId: currentBase.id, targetId: evoId })
        if (evoTargetIds.length === 1 && evoId) {
          currentBase = monsterById.get(evoId) || currentBase
        }
      }

      previousInstance = instance
    }

    for (let startLevel = 1; startLevel < 100; startLevel += 1) {
      const currentEvents = simulateCurrentQueue(monster, startLevel, 100)
      const expectedEvents = simulateExpectedQueue(monster, startLevel, 100)
      const currentEventSet = new Set(currentEvents.map(normalizeEvent))
      const expectedEventSet = new Set(expectedEvents.map(normalizeEvent))

      const missingEvolutions = expectedEvents.filter((event) => event.type === 'evolution' && !currentEventSet.has(normalizeEvent(event)))
      const missingPostEvolutionLearn = expectedEvents.filter((event) => (
        event.type === 'learnMove' &&
        event.baseId !== monster.id &&
        !currentEventSet.has(normalizeEvent(event))
      ))

      if (missingEvolutions.length > 0) {
        multiEvolutionRisks.push({
          id: monster.id,
          name: monster.name,
          startLevel,
          currentEvents,
          expectedEvents,
          missingEvolutions,
        })
      }

      if (missingPostEvolutionLearn.length > 0) {
        postEvolutionLearnRisks.push({
          id: monster.id,
          name: monster.name,
          startLevel,
          currentEvents,
          expectedEvents,
          missingPostEvolutionLearn,
        })
      }
    }
  }

  const uniqueMultiEvolutionRisks = []
  const seenMultiEvolutionRisk = new Set()
  for (const risk of multiEvolutionRisks) {
    const key = `${risk.id}:${risk.missingEvolutions.map((event) => normalizeEvent(event)).join(',')}`
    if (seenMultiEvolutionRisk.has(key)) continue
    seenMultiEvolutionRisk.add(key)
    uniqueMultiEvolutionRisks.push(risk)
  }

  const uniquePostEvolutionLearnRisks = []
  const seenPostEvolutionLearnRisk = new Set()
  for (const risk of postEvolutionLearnRisks) {
    const key = `${risk.id}:${risk.missingPostEvolutionLearn.map((event) => normalizeEvent(event)).join(',')}`
    if (seenPostEvolutionLearnRisk.has(key)) continue
    seenPostEvolutionLearnRisk.add(key)
    uniquePostEvolutionLearnRisks.push(risk)
  }

  const multiEvolutionRiskSpeciesIds = [...new Set(uniqueMultiEvolutionRisks.map((risk) => risk.id))]
  const postEvolutionLearnRiskSpeciesIds = [...new Set(uniquePostEvolutionLearnRisks.map((risk) => risk.id))]

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      simulatedLevels: growthCoverage.length,
      invalidExpCurveCount: invalidExpCurve.length,
      statRegressionCount: statRegressions.length,
      multiEvolutionRiskScenarioCount: uniqueMultiEvolutionRisks.length,
      multiEvolutionRiskSpeciesCount: multiEvolutionRiskSpeciesIds.length,
      postEvolutionLearnRiskScenarioCount: uniquePostEvolutionLearnRisks.length,
      postEvolutionLearnRiskSpeciesCount: postEvolutionLearnRiskSpeciesIds.length,
      multiEvolutionRiskMonsterIds: multiEvolutionRiskSpeciesIds,
      postEvolutionLearnRiskMonsterIds: postEvolutionLearnRiskSpeciesIds,
    },
    samples: {
      invalidExpCurve: sample(invalidExpCurve),
      statRegressions: sample(statRegressions),
      multiEvolutionRisks: sample(uniqueMultiEvolutionRisks.map((risk) => formatRiskSample(risk, 'missingEvolutions'))),
      postEvolutionLearnRisks: sample(uniquePostEvolutionLearnRisks.map((risk) => formatRiskSample(risk, 'missingPostEvolutionLearn'))),
    },
  }

  console.log(JSON.stringify(report, null, 2))
})
