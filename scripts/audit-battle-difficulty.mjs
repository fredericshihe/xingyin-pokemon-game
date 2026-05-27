#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const CHECK_LEVELS = [8, 14, 20, 30, 40, 50]
const errors = []
const warnings = []

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)

const percentile = (values, p) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

const summarize = (values) => ({
  min: percentile(values, 0),
  p10: percentile(values, 0.1),
  median: percentile(values, 0.5),
  p90: percentile(values, 0.9),
  max: percentile(values, 1),
})

const getEventProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleDamage },
    { scoreEnemyMove },
    { isLevelValidForSpecies, pickLevelForSpecies },
    { MAP_CHAIN, getMapConfigData, getMapInfo },
    { ENCOUNTER_TABLES, getEncounterTable },
    { normalizeTrainerRole },
    { getTrainerDifficultyBounds },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/battleDamage.js'),
    loadModule('/src/utils/battleAi.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/trainerBattleScaling.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
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

  const getHpRatio = (mon) => (
    Math.max(0, Number(mon?.currentHp ?? mon?.maxHp ?? 0) || 0) /
    Math.max(1, Number(mon?.maxHp ?? 1) || 1)
  )

  const getDamageOutcome = (attacker, defender, moveKey) => {
    const move = MOVES[moveKey]
    if (!move || !(Number(move.power) > 0) || move.category === 'status') {
      return { damage: 0, effectiveness: 1 }
    }
    return calculateBattleDamage(attacker, defender, move, { randomFactor: 0.925 })
  }

  const getCandidates = (attacker, defender) => (
    attacker.moves.filter((moveKey) => {
      const move = MOVES[moveKey]
      if (!move) return false
      if ((Number(move.cost) || 0) > (Number(attacker.currentMp) || 0)) return false
      if (move.requiresTargetStatus && defender.status !== move.requiresTargetStatus) return false
      return true
    })
  )

  const getBestDamage = (attacker, defender) => (
    getCandidates(attacker, defender)
      .map((moveKey) => ({ moveKey, ...getDamageOutcome(attacker, defender, moveKey) }))
      .filter((entry) => entry.damage > 0)
      .sort((left, right) => right.damage - left.damage || right.effectiveness - left.effectiveness)[0] || null
  )

  const getTopMoveForRole = ({ attacker, defender, battleKind = 'trainer', trainerRole = 'normal' }) => {
    const candidates = getCandidates(attacker, defender)
    if (candidates.length === 0) return null
    return candidates
      .map((moveKey) => ({
        moveKey,
        score: scoreEnemyMove({
          moveKey,
          enemyMon: attacker,
          targetMon: defender,
          battleKind,
          trainerRole,
          candidates
        }),
        ...getDamageOutcome(attacker, defender, moveKey)
      }))
      .sort((left, right) => right.score - left.score)[0] || null
  }

  const aiIssues = {
    immuneTopMove: [],
    missedFinish: [],
    ignoredClearTypeEdge: [],
    noDamagingMove: []
  }
  const sameLevelTurnRows = []
  const rolePreferenceMetrics = {
    typeEdge: {
      samples: 0,
      picks: { wild: 0, normal: 0, lieutenant: 0, boss: 0 }
    },
    healWhenLow: {
      samples: 0,
      picks: { wild: 0, normal: 0, lieutenant: 0, boss: 0 }
    }
  }

  for (const level of CHECK_LEVELS) {
    const pool = MONSTERS
      .filter((monster) => isLevelValidForSpecies(monster.id, level))
      .map((monster) => createInstance(monster, level))

    for (const attacker of pool) {
      if (!attacker.moves.some((moveKey) => Number(MOVES[moveKey]?.power) > 0)) {
        aiIssues.noDamagingMove.push({ level, name: attacker.name })
        continue
      }

      for (const defender of pool) {
        if (attacker.id === defender.id) continue
        const candidates = getCandidates(attacker, defender)
        if (candidates.length === 0) continue

        const scored = candidates
          .map((moveKey) => ({
            moveKey,
            score: scoreEnemyMove({
              moveKey,
              enemyMon: attacker,
              targetMon: defender,
              battleKind: 'trainer',
              trainerRole: 'normal',
              candidates
            }),
            ...getDamageOutcome(attacker, defender, moveKey)
          }))
          .sort((left, right) => right.score - left.score)
        const top = scored[0]
        const bestDamage = getBestDamage(attacker, defender)
        if (bestDamage) {
          sameLevelTurnRows.push(Math.ceil(defender.maxHp / Math.max(1, bestDamage.damage)))
        }

        if (top?.effectiveness === 0 && scored.some((entry) => entry.damage > 0)) {
          aiIssues.immuneTopMove.push({
            level,
            attacker: attacker.name,
            defender: defender.name,
            move: top.moveKey
          })
        }

        const lowHpDefender = { ...defender, currentHp: Math.max(1, Math.ceil(defender.maxHp * 0.35)) }
        const lowHpScored = candidates
          .map((moveKey) => ({
            moveKey,
            score: scoreEnemyMove({
              moveKey,
              enemyMon: attacker,
              targetMon: lowHpDefender,
              battleKind: 'trainer',
              trainerRole: 'normal',
              candidates
            }),
            ...getDamageOutcome(attacker, lowHpDefender, moveKey)
          }))
          .sort((left, right) => right.score - left.score)
        const finishingMoves = lowHpScored.filter((entry) => entry.damage >= lowHpDefender.currentHp)
        if (finishingMoves.length > 0 && !finishingMoves.some((entry) => entry.moveKey === lowHpScored[0]?.moveKey)) {
          aiIssues.missedFinish.push({
            level,
            attacker: attacker.name,
            defender: defender.name,
            topMove: lowHpScored[0]?.moveKey,
            finishers: finishingMoves.map((entry) => entry.moveKey).slice(0, 3)
          })
        }

        const superEffective = scored.filter((entry) => entry.effectiveness > 1 && entry.damage > 0)
        const bestSuper = superEffective.sort((left, right) => right.damage - left.damage)[0]
        if (
          bestSuper &&
          top.effectiveness <= 1 &&
          bestSuper.damage > top.damage * 1.1 &&
          bestSuper.damage >= defender.maxHp * 0.2
        ) {
          aiIssues.ignoredClearTypeEdge.push({
            level,
            attacker: attacker.name,
            defender: defender.name,
            topMove: top.moveKey,
            superMove: bestSuper.moveKey
          })
        }

        const superEffectiveOptions = scored.filter((entry) => entry.effectiveness > 1 && entry.damage > 0)
        if (
          superEffectiveOptions.length > 0 &&
          top.damage > 0 &&
          superEffectiveOptions[0].damage >= defender.maxHp * 0.18
        ) {
          rolePreferenceMetrics.typeEdge.samples += 1
          for (const roleName of ['wild', 'normal', 'lieutenant', 'boss']) {
            const roleTop = getTopMoveForRole({
              attacker,
              defender,
              battleKind: roleName === 'wild' ? 'wild' : 'trainer',
              trainerRole: roleName === 'wild' ? 'normal' : roleName
            })
            if (roleTop?.effectiveness > 1) {
              rolePreferenceMetrics.typeEdge.picks[roleName] += 1
            }
          }
        }

        const healMoves = candidates.filter((moveKey) => MOVES[moveKey]?.effect === 'heal')
        if (healMoves.length > 0) {
          const lowHpAttacker = {
            ...attacker,
            currentHp: Math.max(1, Math.ceil(attacker.maxHp * 0.28))
          }
          const lowHpCandidates = getCandidates(lowHpAttacker, defender)
          const bestLowHpDamage = getBestDamage(lowHpAttacker, defender)
          if (
            lowHpCandidates.length > 1 &&
            bestLowHpDamage &&
            bestLowHpDamage.damage < defender.maxHp * 0.7 &&
            getHpRatio(defender) >= 0.6
          ) {
            rolePreferenceMetrics.healWhenLow.samples += 1
            for (const roleName of ['wild', 'normal', 'lieutenant', 'boss']) {
              const roleTop = getTopMoveForRole({
                attacker: lowHpAttacker,
                defender,
                battleKind: roleName === 'wild' ? 'wild' : 'trainer',
                trainerRole: roleName === 'wild' ? 'normal' : roleName
              })
              if (MOVES[roleTop?.moveKey]?.effect === 'heal') {
                rolePreferenceMetrics.healWhenLow.picks[roleName] += 1
              }
            }
          }
        }
      }
    }
  }

  if (aiIssues.noDamagingMove.length > 0) {
    addError(`存在没有伤害招式的战斗配置: ${aiIssues.noDamagingMove.length}`)
  }
  if (aiIssues.immuneTopMove.length > 0) {
    addError(`AI 会优先选择无效招式: ${aiIssues.immuneTopMove.length}`)
  }
  if (aiIssues.missedFinish.length > 0) {
    addError(`AI 在可击倒目标时没有优先收尾: ${aiIssues.missedFinish.length}`)
  }
  if (aiIssues.ignoredClearTypeEdge.length > 0) {
    addWarning(`AI 存在可优化的克制招式选择样本: ${aiIssues.ignoredClearTypeEdge.length}`)
  }

  const getRate = (metric, roleName) => (
    metric.samples > 0 ? metric.picks[roleName] / metric.samples : null
  )
  const isNonDecreasing = (values, tolerance = 0) => (
    values.every((value, index) => index === 0 || values[index - 1] <= value + tolerance)
  )

  const typeEdgeRates = {
    wild: getRate(rolePreferenceMetrics.typeEdge, 'wild'),
    normal: getRate(rolePreferenceMetrics.typeEdge, 'normal'),
    lieutenant: getRate(rolePreferenceMetrics.typeEdge, 'lieutenant'),
    boss: getRate(rolePreferenceMetrics.typeEdge, 'boss')
  }
  const healRates = {
    wild: getRate(rolePreferenceMetrics.healWhenLow, 'wild'),
    normal: getRate(rolePreferenceMetrics.healWhenLow, 'normal'),
    lieutenant: getRate(rolePreferenceMetrics.healWhenLow, 'lieutenant'),
    boss: getRate(rolePreferenceMetrics.healWhenLow, 'boss')
  }

  if (
    rolePreferenceMetrics.typeEdge.samples >= 20 &&
    !isNonDecreasing([typeEdgeRates.wild, typeEdgeRates.normal, typeEdgeRates.lieutenant, typeEdgeRates.boss], 0.005)
  ) {
    addError(`角色 AI 的克制偏好未形成递进: ${JSON.stringify(typeEdgeRates)}`)
  }
  if (
    rolePreferenceMetrics.healWhenLow.samples >= 8 &&
    !isNonDecreasing([healRates.wild, healRates.normal, healRates.lieutenant, healRates.boss], 0.02)
  ) {
    addError(`角色 AI 的低血治疗偏好未形成递进: ${JSON.stringify(healRates)}`)
  }

  const wildTableIssues = []
  const mapDifficultyRows = []
  for (const mapId of MAP_CHAIN) {
    const config = getMapConfigData(mapId)
    const mapInfo = getMapInfo(mapId)
    const mapMin = Math.max(1, Math.trunc(Number(config.minLevel || 1)) || 1)
    const mapMax = Math.max(mapMin, Math.trunc(Number(config.maxLevel || mapMin)) || mapMin)
    const zones = Array.isArray(mapInfo.encounterZones) ? mapInfo.encounterZones : []
    const tableIds = [...new Set(zones.map((zone) => zone.encounterTableId).filter(Boolean))]

    for (const tableId of tableIds) {
      const table = getEncounterTable(tableId)
      for (const row of table.pokemon || []) {
        const pokemonId = Math.trunc(Number(row.id))
        const minLevel = Math.trunc(Number(row.minLevel))
        const maxLevel = Math.trunc(Number(row.maxLevel))
        const legalLevel = pickLevelForSpecies(pokemonId, minLevel, maxLevel)
        if (!monsterById.has(pokemonId) || legalLevel === null) {
          wildTableIssues.push(`${mapId}/${tableId} 存在非法野生宝可梦 ${pokemonId}@${minLevel}-${maxLevel}`)
        }
        if (minLevel < mapMin || maxLevel > mapMax) {
          wildTableIssues.push(`${mapId}/${tableId} 野生等级 ${minLevel}-${maxLevel} 超出地图 Lv.${mapMin}-${mapMax}`)
        }
      }
    }

    const localWildIds = [...new Set(
      tableIds.flatMap((tableId) => (ENCOUNTER_TABLES[tableId]?.pokemon || []).map((row) => row.id))
    )]
    const localInstances = localWildIds
      .map((id) => monsterById.get(Number(id)))
      .filter(Boolean)
      .map((monster) => createInstance(monster, Math.min(mapMax, Math.max(mapMin, Math.round((mapMin + mapMax) / 2)))))
    const localTurns = []
    for (const attacker of localInstances) {
      for (const defender of localInstances) {
        if (attacker.id === defender.id) continue
        const best = getBestDamage(attacker, defender)
        if (best) localTurns.push(Math.ceil(defender.maxHp / Math.max(1, best.damage)))
      }
    }
    const localSummary = summarize(localTurns)
    mapDifficultyRows.push({
      mapId,
      levelRange: `${mapMin}-${mapMax}`,
      localWildTurnPace: localSummary
    })
    if (localSummary.median !== null && localSummary.median < 2) {
      addWarning(`${mapId} 野生对战中位击倒回合偏短: ${localSummary.median}`)
    }
    if (localSummary.p90 !== null && localSummary.p90 > 9) {
      addWarning(`${mapId} 野生对战长尾偏拖沓: p90=${localSummary.p90}`)
    }

    const events = Array.isArray(mapInfo.runtimeEvents) ? mapInfo.runtimeEvents : []
    const boss = events.find((event) => event.type === 'boss')
    const bossTeam = Array.isArray(getEventProps(boss).team) ? getEventProps(boss).team : []
    const bossCap = bossTeam.length > 0
      ? Math.max(...bossTeam.map((entry) => Math.trunc(Number(entry.level))).filter(Number.isFinite))
      : mapMax
    for (const event of events.filter((candidate) => ['trainer', 'boss', 'challenge'].includes(candidate.type))) {
      const props = getEventProps(event)
      const role = normalizeTrainerRole(event.type === 'boss' ? 'boss' : (props.role || event.type))
      const bounds = getTrainerDifficultyBounds({ role, mapConfig: config, bossLevelCap: bossCap })
      const levels = (Array.isArray(props.team) ? props.team : [])
        .map((entry) => Math.trunc(Number(entry.level)))
        .filter(Number.isFinite)
      if (levels.some((level) => level < bounds.minLevel || level > Math.max(bounds.maxLevel, bossCap))) {
        addError(`${mapId}/${event.id} 训练家等级越界: ${levels.join('/')}`)
      }
    }
  }

  if (wildTableIssues.length > 0) {
    wildTableIssues.slice(0, 12).forEach(addError)
    if (wildTableIssues.length > 12) addError(`还有 ${wildTableIssues.length - 12} 个野生等级表问题未展示`)
  }

  const sameLevelPace = summarize(sameLevelTurnRows)
  if (sameLevelPace.median !== null && sameLevelPace.median < 2) {
    addError(`同级对战中位击倒回合过短: ${sameLevelPace.median}`)
  }
  if (sameLevelPace.p90 !== null && sameLevelPace.p90 > 10) {
    addWarning(`同级对战存在拖沓长尾: p90=${sameLevelPace.p90}`)
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      checkedLevels: CHECK_LEVELS,
      aiImmuneTopMoveCount: aiIssues.immuneTopMove.length,
      aiMissedFinishCount: aiIssues.missedFinish.length,
      aiIgnoredTypeEdgeCount: aiIssues.ignoredClearTypeEdge.length,
      noDamagingMoveCount: aiIssues.noDamagingMove.length,
      wildTableIssueCount: wildTableIssues.length,
      sameLevelPace,
      rolePreferenceMetrics: {
        typeEdge: {
          samples: rolePreferenceMetrics.typeEdge.samples,
          rates: typeEdgeRates
        },
        healWhenLow: {
          samples: rolePreferenceMetrics.healWhenLow.samples,
          rates: healRates
        }
      },
      warningCount: warnings.length,
      errorCount: errors.length
    },
    samples: {
      aiImmuneTopMove: aiIssues.immuneTopMove.slice(0, 8),
      aiMissedFinish: aiIssues.missedFinish.slice(0, 8),
      aiIgnoredTypeEdge: aiIssues.ignoredClearTypeEdge.slice(0, 8),
      mapDifficultyRows
    }
  }

  console.log(JSON.stringify(report, null, 2))
  if (warnings.length > 0) {
    console.warn('[audit-battle-difficulty] WARNINGS')
    warnings.forEach((warning) => console.warn(`- ${warning}`))
  }
  if (errors.length > 0) {
    console.error('[audit-battle-difficulty] FAILED')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }
  console.log('[audit-battle-difficulty] OK')
})
