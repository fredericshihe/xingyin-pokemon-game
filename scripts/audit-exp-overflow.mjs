#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, getBalancedMovesForLevel },
    {
      findExpOverflowMonsters,
      normalizeRosterExpProgress,
      simulateMonsterExpGain,
    },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonProgress.js'),
  ])

  const eeveeBase = MONSTERS.find((monster) => monster.name === '伊布')
  const eeveeOverflowCase = {
    ...eeveeBase,
    id: 'audit-eevee',
    baseId: eeveeBase.id,
    level: 16,
    moves: getBalancedMovesForLevel(eeveeBase, 16),
    currentExp: 1386,
    expToNextLevel: 817,
  }
  const eeveeResult = simulateMonsterExpGain(eeveeOverflowCase, 0)
  const normalizedRoster = normalizeRosterExpProgress({
    playerTeam: [eeveeOverflowCase],
    storageBox: [],
    activePlayerId: eeveeOverflowCase.id,
    pendingGrowthEvents: [],
  })
  const eeveeChoiceDueCase = {
    ...eeveeBase,
    id: 'audit-eevee-choice',
    baseId: eeveeBase.id,
    level: 30,
    moves: getBalancedMovesForLevel(eeveeBase, 30),
    currentExp: 0,
    expToNextLevel: 2500,
  }
  const eeveeChoiceDueResult = simulateMonsterExpGain(eeveeChoiceDueCase, 0)
  const eeveeChoiceEvent = eeveeChoiceDueResult.events.find((event) => event.type === 'evolutionChoice')
  const normalizedDuplicateEeveeRoster = normalizeRosterExpProgress({
    playerTeam: [eeveeChoiceDueCase],
    storageBox: [],
    activePlayerId: eeveeChoiceDueCase.id,
    pendingGrowthEvents: eeveeChoiceEvent ? [eeveeChoiceEvent, eeveeChoiceEvent] : [],
  })
  const charmanderBase = MONSTERS.find((monster) => monster.name === '小火龙')
  const charmanderOverdueEvolutionCase = {
    ...charmanderBase,
    id: 'audit-charmander',
    baseId: charmanderBase.id,
    level: 18,
    moves: getBalancedMovesForLevel(charmanderBase, 18),
    currentExp: 0,
    expToNextLevel: 777,
  }
  const normalizedCharmanderRoster = normalizeRosterExpProgress({
    playerTeam: [charmanderOverdueEvolutionCase],
    storageBox: [],
    activePlayerId: charmanderOverdueEvolutionCase.id,
    pendingGrowthEvents: [],
  })

  const syntheticOverflowCases = MONSTERS.map((base) => {
    const level = 16
    return {
      ...base,
      id: `audit-${base.id}`,
      baseId: base.id,
      level,
      moves: getBalancedMovesForLevel(base, level),
      currentExp: 999999,
      expToNextLevel: 1,
    }
  })
  const normalizedSynthetic = normalizeRosterExpProgress({
    playerTeam: syntheticOverflowCases.slice(0, 6),
    storageBox: syntheticOverflowCases.slice(6),
    activePlayerId: syntheticOverflowCases[0]?.id,
    pendingGrowthEvents: [],
  })
  const remainingOverflow = findExpOverflowMonsters([
    ...normalizedSynthetic.playerTeam,
    ...normalizedSynthetic.storageBox,
  ])

  const checks = [
    {
      name: 'eevee_overflow_levels_up',
      passed: eeveeResult.updatedMon.level > eeveeOverflowCase.level,
      before: {
        level: eeveeOverflowCase.level,
        currentExp: eeveeOverflowCase.currentExp,
        expToNextLevel: eeveeOverflowCase.expToNextLevel,
      },
      after: {
        level: eeveeResult.updatedMon.level,
        currentExp: eeveeResult.updatedMon.currentExp,
        expToNextLevel: eeveeResult.updatedMon.expToNextLevel,
      },
    },
    {
      name: 'roster_normalization_clears_eevee_overflow',
      passed: findExpOverflowMonsters(normalizedRoster.playerTeam).length === 0,
      normalized: normalizedRoster.playerTeam[0],
    },
    {
      name: 'duplicate_eevee_choice_events_are_deduped',
      passed: Boolean(eeveeChoiceEvent) &&
        normalizedDuplicateEeveeRoster.pendingGrowthEvents.filter((event) => event.type === 'evolutionChoice').length === 1,
      sourceEvent: eeveeChoiceEvent,
      pendingGrowthEvents: normalizedDuplicateEeveeRoster.pendingGrowthEvents,
    },
    {
      name: 'bulk_roster_normalization_clears_overflow',
      passed: remainingOverflow.length === 0,
      remainingOverflow: remainingOverflow.slice(0, 10).map((mon) => ({
        id: mon.id,
        name: mon.name,
        level: mon.level,
        currentExp: mon.currentExp,
        expToNextLevel: mon.expToNextLevel,
      })),
    },
    {
      name: 'overdue_charmander_evolution_is_queued',
      passed: normalizedCharmanderRoster.pendingGrowthEvents.some((event) => (
        event.type === 'evolution' &&
        event.monId === charmanderOverdueEvolutionCase.id &&
        event.targetId === 73 &&
        event.level === 16
      )),
      pendingGrowthEvents: normalizedCharmanderRoster.pendingGrowthEvents,
    },
  ]
  const failed = checks.filter((check) => !check.passed)

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      checkCount: checks.length,
      failedCount: failed.length,
      monsterCount: MONSTERS.length,
    },
    checks,
  }, null, 2))

  if (failed.length > 0) process.exitCode = 1
})
