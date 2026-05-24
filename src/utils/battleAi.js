import { TYPES } from './constants'
import { MOVES } from './gameData'
import { calculateBattleDamage, getStabMultiplier, getTypeEffectiveness } from './battleDamage'
import { getTrainerRoleBalance } from './gameBalance'

const STATUS_VALUE = {
  sleep: 40,
  freeze: 36,
  paralysis: 28,
  burn: 24,
  poison: 20
}

const STATUS_IMMUNITY_BY_TYPE = {
  burn: [TYPES.FIRE],
  poison: [TYPES.POISON, TYPES.STEEL],
  paralysis: [TYPES.ELECTRIC],
  freeze: [TYPES.ICE]
}

const getTypes = (mon) => [mon?.type, mon?.type2].filter(Boolean)

const hasStatusImmunity = (mon, status) => {
  const immuneTypes = STATUS_IMMUNITY_BY_TYPE[status]
  if (!immuneTypes) return false
  const targetTypes = getTypes(mon)
  return immuneTypes.some((type) => targetTypes.includes(type))
}

const getCurrentHp = (mon) => Math.max(0, Number(mon?.currentHp ?? mon?.hp ?? mon?.maxHp ?? 0) || 0)
const getMaxHp = (mon) => Math.max(1, Number(mon?.maxHp ?? mon?.hp ?? 1) || 1)
const getCurrentMp = (mon) => Math.max(0, Number(mon?.currentMp ?? mon?.mp ?? mon?.maxMp ?? 0) || 0)

const getHpRatio = (mon) => getCurrentHp(mon) / getMaxHp(mon)

const getMoveAccuracy = (move) => (
  typeof move?.accuracy === 'number' ? Math.max(1, Math.min(100, move.accuracy)) : 100
)

const isMoveAffordable = (mon, move) => getCurrentMp(mon) >= (Number(move?.cost) || 0)

const hasTargetStatusRequirement = (move, target) => (
  !move?.requiresTargetStatus || target?.status === move.requiresTargetStatus
)

const getLastMoveKey = (mon) => {
  const moveKey = mon?.volatileStatuses?.lastMoveKey
  return MOVES[moveKey] ? moveKey : null
}

const canUseMove = (enemyMon, targetMon, moveKey) => {
  const move = MOVES[moveKey]
  if (!move || !isMoveAffordable(enemyMon, move)) return false
  return hasTargetStatusRequirement(move, targetMon)
}

const scoreStatusMove = ({ move, enemyMon, targetMon }) => {
  if (!move.status) return 0
  if (targetMon?.status) return -55
  if (hasStatusImmunity(targetMon, move.status)) return -75

  const targetHpRatio = getHpRatio(targetMon)
  const accuracyFactor = getMoveAccuracy(move) / 100
  const baseValue = STATUS_VALUE[move.status] || 26
  const setupWindow = targetHpRatio >= 0.65 ? 16 : targetHpRatio >= 0.35 ? 8 : -14
  const speedPressure = (Number(targetMon?.spd) || 0) > (Number(enemyMon?.spd) || 0) ? 4 : 0
  return (baseValue + setupWindow + speedPressure) * accuracyFactor
}

const scoreStatChangeMove = ({ move, enemyMon, targetMon }) => {
  const statChange = move.statChange
  if (!statChange?.stat || !statChange.stages) return 0

  const target = statChange.target === 'attacker' ? enemyMon : targetMon
  const currentStage = Number(target?.statStages?.[statChange.stat] || 0)
  const direction = statChange.stages > 0 ? 1 : -1
  if ((direction > 0 && currentStage >= 4) || (direction < 0 && currentStage <= -4)) return -18

  const battleStillLong = Math.max(getHpRatio(enemyMon), getHpRatio(targetMon))
  const targetLow = getHpRatio(targetMon) <= 0.45
  const base = statChange.target === 'attacker' ? 10 : 12
  const stageValue = Math.abs(statChange.stages) * 4
  const longBattleValue = battleStillLong * 7
  return base + stageValue + longBattleValue - (targetLow ? 12 : 0)
}

const scoreUtilityMove = ({ moveKey, move, enemyMon, targetMon, candidates }) => {
  let score = 0
  const enemyHpRatio = getHpRatio(enemyMon)
  const targetHpRatio = getHpRatio(targetMon)

  if (move.effect === 'heal') {
    if (enemyHpRatio >= 0.72) return -60
    score += 18 + (1 - enemyHpRatio) * 88
    if (enemyHpRatio <= 0.35) score += 24
  }

  if (move.effect === 'mimic') {
    const targetLastMove = getLastMoveKey(targetMon)
    score += targetLastMove && targetLastMove !== 'mimic' ? 24 : -62
  }

  if (move.status) {
    score += scoreStatusMove({ move, enemyMon, targetMon })
  }

  if (move.volatileStatus === 'confusion' && !targetMon?.volatileStatuses?.confusion) {
    score += targetHpRatio > 0.35 ? 22 : 8
  }

  if (move.volatileStatus === 'flinch') {
    const likelyActsFirst = (Number(enemyMon?.spd) || 0) >= (Number(targetMon?.spd) || 0) || (move.priority || 0) > 0
    score += likelyActsFirst ? 12 : 3
  }

  if (move.statChange) {
    score += scoreStatChangeMove({ move, enemyMon, targetMon })
  }

  const previousMove = getLastMoveKey(enemyMon)
  if (previousMove === moveKey && candidates.length > 1) score -= 6

  return score
}

const getCandidateDamageRows = ({ enemyMon, targetMon, candidates = [] }) => (
  candidates
    .map((moveKey) => ({
      moveKey,
      ...getMoveDamageOutcome(enemyMon, targetMon, moveKey)
    }))
    .filter((entry) => entry.damage > 0)
    .sort((left, right) => right.damage - left.damage || right.effectiveness - left.effectiveness)
)

export const scoreEnemyMove = ({ moveKey, enemyMon, targetMon, battleKind = 'wild', candidates = [] }) => {
  const move = MOVES[moveKey]
  if (!move || !enemyMon || !targetMon) return -Infinity
  if (!isMoveAffordable(enemyMon, move)) return -Infinity

  let score = 10
  const enemyMp = Math.max(1, getCurrentMp(enemyMon))
  const targetHp = getCurrentHp(targetMon)
  const accuracy = getMoveAccuracy(move)
  const candidateDamageRows = getCandidateDamageRows({ enemyMon, targetMon, candidates })
  const bestDamageOutcome = candidateDamageRows[0] || { moveKey: null, damage: 0, effectiveness: 1 }
  const bestSuperEffectiveOutcome = candidateDamageRows.find((entry) => entry.effectiveness > 1) || null

  if (!hasTargetStatusRequirement(move, targetMon)) score -= 80

  if (move.power > 0 && move.category !== 'status') {
    const result = calculateBattleDamage(enemyMon, targetMon, move, {
      randomFactor: 0.925
    })
    const damage = Math.max(0, result.damage)
    const damageRatio = targetHp > 0 ? damage / targetHp : 0
    const accuracyFactor = accuracy / 100
    score += Math.min(1.45, damageRatio) * 68 * accuracyFactor

    if (result.effectiveness === 0) score -= 95
    else if (result.effectiveness >= 4) score += 48
    else if (result.effectiveness > 1) score += 32
    else if (result.effectiveness > 0 && result.effectiveness <= 0.25) score -= 34
    else if (result.effectiveness > 0 && result.effectiveness < 1) score -= 20

    if (getStabMultiplier(enemyMon, move.type) > 1) score += 8
    if (targetHp > 0 && damage >= targetHp) score += 76 + (move.priority ? 10 : 0)
    else if (targetHp > 0 && getHpRatio(targetMon) <= 0.4) {
      score -= Math.max(0, 1 - damage / targetHp) * 28
    }
    if (bestDamageOutcome.damage > 0 && moveKey !== bestDamageOutcome.moveKey) {
      score -= Math.max(0, 1 - damage / bestDamageOutcome.damage) * 18
    }
    if (result.effectiveness > 1 && damageRatio >= 0.22) score += 12
    if (move.effect === 'drain' && getHpRatio(enemyMon) < 0.8) score += (1 - getHpRatio(enemyMon)) * 18
    if (move.charge) score -= targetHp > 0 && damage >= targetHp ? 10 : 18
  } else {
    score += scoreUtilityMove({ moveKey, move, enemyMon, targetMon, candidates })

    if (bestDamageOutcome.damage > 0 && targetHp > 0) {
      const bestDamageRatio = bestDamageOutcome.damage / targetHp
      if (bestDamageRatio >= 0.22) {
        score -= 16 + bestDamageRatio * 18
      }
      if (bestSuperEffectiveOutcome && bestSuperEffectiveOutcome.damage >= targetHp * 0.2) {
        score -= 18
      }
      if (getHpRatio(targetMon) <= 0.5) {
        score -= 18
      }
    }
  }

  if (move.status && move.power > 0 && !targetMon.status && !hasStatusImmunity(targetMon, move.status)) {
    score += (STATUS_VALUE[move.status] || 20) * ((move.statusChance ?? 10) / 100) * 0.35
  }

  if (move.statChange && move.power > 0) {
    score += scoreStatChangeMove({ move, enemyMon, targetMon }) * ((move.statChange.chance ?? 100) / 100) * 0.25
  }

  if (accuracy < 100) score -= (100 - accuracy) * 0.22
  score -= Math.max(0, (Number(move.cost) || 0) - 8) * 0.45
  score -= ((Number(move.cost) || 0) / enemyMp) * 4

  const previousMove = getLastMoveKey(enemyMon)
  if (previousMove === moveKey && candidates.length > 1) score -= battleKind === 'trainer' ? 4 : 7

  return score
}

const pickRandom = (items) => items[Math.floor(Math.random() * items.length)]

const pickWeighted = (scoredMoves, { temperature = 18 } = {}) => {
  const bestScore = Math.max(...scoredMoves.map((entry) => entry.score))
  const weighted = scoredMoves.map((entry) => ({
    ...entry,
    weight: Math.max(0.015, Math.exp((entry.score - bestScore) / temperature))
  }))
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0)
  let roll = Math.random() * total
  for (const entry of weighted) {
    roll -= entry.weight
    if (roll <= 0) return entry.moveKey
  }
  return weighted[0]?.moveKey || null
}

const getWildRandomness = (enemyMon) => {
  const level = Math.max(1, Number(enemyMon?.level) || 1)
  if (level <= 8) return 0.38
  if (level <= 20) return 0.3
  if (level <= 40) return 0.24
  return 0.2
}

const getMoveDamageOutcome = (enemyMon, targetMon, moveKey) => {
  const move = MOVES[moveKey]
  if (!move || !(Number(move.power) > 0) || move.category === 'status') {
    return { damage: 0, effectiveness: 1 }
  }
  return calculateBattleDamage(enemyMon, targetMon, move, { randomFactor: 0.925 })
}

const getBestDamageOutcome = ({ enemyMon, targetMon }) => {
  const moves = Array.isArray(enemyMon?.moves) ? enemyMon.moves : []
  return moves
    .filter((moveKey) => canUseMove(enemyMon, targetMon, moveKey))
    .map((moveKey) => ({
      moveKey,
      ...getMoveDamageOutcome(enemyMon, targetMon, moveKey)
    }))
    .filter((entry) => entry.damage > 0)
    .sort((left, right) => right.damage - left.damage || right.effectiveness - left.effectiveness)[0] || {
      moveKey: null,
      damage: 0,
      effectiveness: 1
    }
}

export function chooseBattleEnemyMove({
  enemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal'
} = {}) {
  const chargingMove = enemyMon?.volatileStatuses?.chargingMove
  if (chargingMove && MOVES[chargingMove]) return chargingMove
  if (!enemyMon?.moves?.length || !targetMon) return null

  const affordableMoves = enemyMon.moves.filter((moveKey) => {
    const move = MOVES[moveKey]
    return move && isMoveAffordable(enemyMon, move)
  })
  if (affordableMoves.length === 0) return null

  const legalMoves = affordableMoves.filter((moveKey) => canUseMove(enemyMon, targetMon, moveKey))
  const candidates = legalMoves.length > 0 ? legalMoves : affordableMoves
  if (candidates.length === 1) return candidates[0]

  const scoredMoves = candidates.map((moveKey) => ({
    moveKey,
    score: scoreEnemyMove({ moveKey, enemyMon, targetMon, battleKind, candidates })
  }))
  const sortedScoredMoves = scoredMoves.slice().sort((left, right) => right.score - left.score)
  const bestEntry = sortedScoredMoves[0]
  const secondScore = sortedScoredMoves[1]?.score ?? -Infinity
  const bestScore = bestEntry?.score ?? -Infinity
  const reasonableMoves = scoredMoves
    .filter((entry) => entry.score >= Math.max(-10, bestScore - 55))
    .map((entry) => entry.moveKey)
  const randomPool = reasonableMoves.length > 0 ? reasonableMoves : candidates
  const weightedPool = scoredMoves.filter((entry) => entry.score >= Math.max(-20, bestScore - 80))
  const finalScoredMoves = weightedPool.length > 0 ? weightedPool : scoredMoves
  const roleBalance = getTrainerRoleBalance(trainerRole)
  const bestOutcome = getMoveDamageOutcome(enemyMon, targetMon, bestEntry?.moveKey)
  const bestCanFinish = bestOutcome.damage >= getCurrentHp(targetMon)
  const bestHasTypeEdge = bestOutcome.effectiveness > 1
  const lowHpPressure = getHpRatio(enemyMon) <= 0.35
  const clearBestMove = Number.isFinite(secondScore) && bestScore - secondScore >= 28
  let randomChance = battleKind === 'trainer'
    ? Math.max(0.04, 0.18 - roleBalance.aiSkill * 0.14)
    : getWildRandomness(enemyMon)
  if (bestCanFinish) randomChance *= battleKind === 'trainer' ? 0.25 : 0.42
  else if (bestHasTypeEdge || lowHpPressure) randomChance *= battleKind === 'trainer' ? 0.55 : 0.68
  if (clearBestMove) randomChance *= 0.68
  randomChance = Math.max(battleKind === 'trainer' ? 0.02 : 0.08, randomChance)
  if (Math.random() < randomChance) return pickRandom(randomPool)

  return pickWeighted(finalScoredMoves, {
    temperature: battleKind === 'trainer'
      ? Math.max(7, 16 - roleBalance.aiSkill * 8)
      : 18
  })
}

const getBestMoveScore = ({ enemyMon, targetMon, battleKind = 'trainer', trainerRole = 'normal' }) => {
  const moves = Array.isArray(enemyMon?.moves) ? enemyMon.moves : []
  const candidates = moves.filter((moveKey) => canUseMove(enemyMon, targetMon, moveKey))
  if (candidates.length === 0) return -Infinity
  return Math.max(...candidates.map((moveKey) => (
    scoreEnemyMove({ moveKey, enemyMon, targetMon, battleKind, candidates })
  )))
}

const getIncomingTypePressure = (attacker, defender) => {
  const moveKeys = Array.isArray(attacker?.moves) ? attacker.moves : []
  const damagingMoves = moveKeys
    .map((moveKey) => MOVES[moveKey])
    .filter((move) => move && Number(move.power) > 0 && move.category !== 'status')
  if (damagingMoves.length === 0) return 1
  return Math.max(...damagingMoves.map((move) => getTypeEffectiveness(move.type, defender)))
}

const scoreTrainerSwitchCandidate = ({ candidate, activeEnemyMon, targetMon, battleKind, trainerRole }) => {
  const candidateHpRatio = getHpRatio(candidate)
  if (candidateHpRatio <= 0) return -Infinity

  const attackScore = getBestMoveScore({
    enemyMon: candidate,
    targetMon,
    battleKind,
    trainerRole
  })
  const activeAttackScore = getBestMoveScore({
    enemyMon: activeEnemyMon,
    targetMon,
    battleKind,
    trainerRole
  })
  const incomingPressure = getIncomingTypePressure(targetMon, candidate)
  const activeIncomingPressure = getIncomingTypePressure(targetMon, activeEnemyMon)
  const levelBonus = ((Number(candidate.level) || 1) - (Number(activeEnemyMon?.level) || 1)) * 2.2
  const healthBonus = candidateHpRatio * 18
  const defensiveSwing = (activeIncomingPressure - incomingPressure) * 18
  const offensiveSwing = Number.isFinite(activeAttackScore)
    ? attackScore - activeAttackScore
    : attackScore

  return offensiveSwing + defensiveSwing + healthBonus + levelBonus
}

export function chooseTrainerSwitchTarget({
  enemyTeam = [],
  activeEnemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal'
} = {}) {
  if (battleKind !== 'trainer' || !activeEnemyMon || !targetMon) return null
  if (activeEnemyMon?.volatileStatuses?.chargingMove) return null

  const aliveBenched = (Array.isArray(enemyTeam) ? enemyTeam : [])
    .filter((mon) => mon && mon.id !== activeEnemyMon.id && getCurrentHp(mon) > 0)
  if (aliveBenched.length === 0) return null

  const roleBalance = getTrainerRoleBalance(trainerRole)
  const activeHpRatio = getHpRatio(activeEnemyMon)
  const activeMoveScore = getBestMoveScore({
    enemyMon: activeEnemyMon,
    targetMon,
    battleKind,
    trainerRole
  })
  const incomingPressure = getIncomingTypePressure(targetMon, activeEnemyMon)
  const activeIsPinned = incomingPressure >= 2 || activeMoveScore < 18
  const activeIsLow = activeHpRatio <= roleBalance.switchHpRatio
  const activeDamageOutcome = getBestDamageOutcome({ enemyMon: activeEnemyMon, targetMon })
  const activeCanFinish = activeDamageOutcome.damage >= getCurrentHp(targetMon)
  if (activeCanFinish && activeHpRatio > Math.max(0.18, roleBalance.switchHpRatio * 0.5)) return null
  if (
    activeDamageOutcome.effectiveness > 1 &&
    activeMoveScore >= 65 &&
    !activeIsLow &&
    incomingPressure < 4
  ) {
    return null
  }
  if (!activeIsPinned && !activeIsLow) return null

  const scoredCandidates = aliveBenched
    .map((candidate) => ({
      candidate,
      score: scoreTrainerSwitchCandidate({
        candidate,
        activeEnemyMon,
        targetMon,
        battleKind,
        trainerRole
      })
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score)
  const best = scoredCandidates[0]
  if (!best) return null

  const scoreGap = best.score
  if (scoreGap < roleBalance.switchScoreGap && !activeIsLow) return null

  const pressureBonus = activeIsPinned ? 0.16 : 0
  const lowHpBonus = activeIsLow ? 0.16 : 0
  const probability = Math.min(0.82, roleBalance.switchChance + pressureBonus + lowHpBonus)
  return Math.random() < probability ? best.candidate : null
}
