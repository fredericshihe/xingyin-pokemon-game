#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const errors = []
const warnings = []

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { evaluateTrainerSwitchDecision },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/battleAi.js'),
  ])

  const createInstance = (monster, level, overrides = {}) => {
    const stats = calculateStatsForLevel(monster, level)
    return {
      ...monster,
      ...stats,
      level,
      moves: getBalancedMovesForLevel(monster, level),
      currentHp: overrides.currentHp ?? stats.maxHp,
      currentMp: overrides.currentMp ?? stats.maxMp,
      statStages: {},
      volatileStatuses: {},
      ...overrides
    }
  }

  const battleReady = MONSTERS
    .filter((monster) => getBalancedMovesForLevel(monster, 24).length >= 2)
    .slice(0, 48)

  if (battleReady.length < 8) {
    addError('可用于 AI 换宠审计的宝可梦样本不足。')
  }

  const roles = ['normal', 'lieutenant', 'challenge', 'boss']
  const summaries = []

  for (const role of roles) {
    const counters = {
      stableSamples: 0,
      stableProbability: 0,
      lowSamples: 0,
      lowProbability: 0,
      cooldownSamples: 0,
      cooldownProbability: 0,
      koRiskSamples: 0,
      koRiskProbability: 0,
    }

    for (let index = 0; index < battleReady.length - 3; index += 3) {
      const activeBase = battleReady[index]
      const targetBase = battleReady[index + 1]
      const benchA = battleReady[index + 2]
      const benchB = battleReady[index + 3] || battleReady[0]
      const activeFull = createInstance(activeBase, 24)
      const target = createInstance(targetBase, 24)
      const bench = [activeFull, createInstance(benchA, 24), createInstance(benchB, 24)]

      const stable = evaluateTrainerSwitchDecision({
        enemyTeam: bench,
        activeEnemyMon: activeFull,
        targetMon: target,
        battleKind: 'trainer',
        trainerRole: role,
        random: () => 1
      })
      counters.stableSamples += 1
      counters.stableProbability += stable.probability || 0

      const activeLow = {
        ...activeFull,
        currentHp: Math.max(1, Math.ceil(activeFull.maxHp * 0.24))
      }
      const lowBench = [activeLow, bench[1], bench[2]]
      const low = evaluateTrainerSwitchDecision({
        enemyTeam: lowBench,
        activeEnemyMon: activeLow,
        targetMon: target,
        battleKind: 'trainer',
        trainerRole: role,
        random: () => 1
      })
      counters.lowSamples += 1
      counters.lowProbability += low.probability || 0

      const cooldown = evaluateTrainerSwitchDecision({
        enemyTeam: lowBench,
        activeEnemyMon: activeLow,
        targetMon: target,
        battleKind: 'trainer',
        trainerRole: role,
        battleLogs: ['对手收回了 测试宝可梦！', '对手派出了 测试宝可梦！', '玩家发动了攻击！'],
        random: () => 1
      })
      counters.cooldownSamples += 1
      counters.cooldownProbability += cooldown.probability || 0

      const activeCritical = {
        ...activeFull,
        currentHp: 1
      }
      const koRisk = evaluateTrainerSwitchDecision({
        enemyTeam: [activeCritical, bench[1], bench[2]],
        activeEnemyMon: activeCritical,
        targetMon: target,
        battleKind: 'trainer',
        trainerRole: role,
        random: () => 1
      })
      counters.koRiskSamples += 1
      counters.koRiskProbability += koRisk.probability || 0
    }

    const stableRate = counters.stableProbability / Math.max(1, counters.stableSamples)
    const lowRate = counters.lowProbability / Math.max(1, counters.lowSamples)
    const cooldownRate = counters.cooldownProbability / Math.max(1, counters.cooldownSamples)
    const koRiskRate = counters.koRiskProbability / Math.max(1, counters.koRiskSamples)

    if (stableRate > 0.12) addError(`${role} 满血稳定局换宠率过高: ${stableRate.toFixed(2)}`)
    if (cooldownRate > lowRate * 0.45 && cooldownRate > 0.12) {
      addError(`${role} 最近刚换过宠时仍然太容易继续换宠: ${cooldownRate.toFixed(2)}`)
    }
    if (lowRate > 0.58) addError(`${role} 低血量换宠率过高，容易显得机械: ${lowRate.toFixed(2)}`)
    if (koRiskRate < stableRate) {
      addWarning(`${role} 濒死风险局换宠率没有高于稳定局，请后续人工复核。`)
    }

    summaries.push({
      role,
      stableProbability: stableRate,
      lowProbability: lowRate,
      cooldownProbability: cooldownRate,
      koRiskProbability: koRiskRate,
      samples: counters.stableSamples
    })
  }

  const result = {
    generatedAt: new Date().toISOString(),
    summary: summaries,
    warningCount: warnings.length,
    errorCount: errors.length,
    warnings,
    errors
  }
  console.log(JSON.stringify(result, null, 2))
})

if (errors.length > 0) {
  console.error(`[audit-battle-ai-switching] FAILED: ${errors.length} error(s)`)
  process.exit(1)
}

if (warnings.length > 0) {
  console.warn(`[audit-battle-ai-switching] OK with ${warnings.length} warning(s)`)
} else {
  console.log('[audit-battle-ai-switching] OK')
}
