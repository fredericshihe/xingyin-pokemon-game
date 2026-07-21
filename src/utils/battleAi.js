import { TYPES } from './constants'
import { MOVES, POTIONS } from './gameData'
import { getPotionRecoveryProfile } from './inventoryItems.js'
import { calculateBattleDamage, getStabMultiplier, getTypeEffectiveness } from './battleDamage'
import { getTrainerRoleBalance, normalizeTrainerRole } from './gameBalance'

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

const AI_ROLE_PROFILES = {
  wild: {
    damageWeight: 0.96,
    typeEdgeWeight: 0.9,
    finisherWeight: 0.85,
    utilityWeight: 0.6,
    statusWeight: 0.68,
    setupWeight: 0.58,
    healWeight: 0.48,
    repeatPenalty: 0.55,
    costWeight: 1.08,
    chargePenalty: 1.08,
    lowHpUtilityPenalty: 1.2,
    betterDamagePenalty: 0.72,
    randomMultiplier: 1.12,
    minRandomChance: 0.1,
    temperatureMultiplier: 1.12,
    minTemperature: 14,
    finishLockMultiplier: 0.5,
    typeLockMultiplier: 0.74
  },
  normal: {
    damageWeight: 1,
    typeEdgeWeight: 1,
    finisherWeight: 1,
    utilityWeight: 1,
    statusWeight: 1,
    setupWeight: 1,
    healWeight: 1,
    repeatPenalty: 1,
    costWeight: 1,
    chargePenalty: 1,
    lowHpUtilityPenalty: 1,
    betterDamagePenalty: 1,
    randomMultiplier: 1,
    minRandomChance: 0.04,
    temperatureMultiplier: 1,
    minTemperature: 7,
    finishLockMultiplier: 0.25,
    typeLockMultiplier: 0.55
  },
  lieutenant: {
    damageWeight: 1.06,
    typeEdgeWeight: 1.15,
    finisherWeight: 1.2,
    utilityWeight: 1.08,
    statusWeight: 1.08,
    setupWeight: 1.12,
    healWeight: 1.06,
    repeatPenalty: 1.08,
    costWeight: 0.92,
    chargePenalty: 1.02,
    lowHpUtilityPenalty: 1.2,
    betterDamagePenalty: 1.16,
    randomMultiplier: 0.78,
    minRandomChance: 0.03,
    temperatureMultiplier: 0.78,
    minTemperature: 6,
    finishLockMultiplier: 0.2,
    typeLockMultiplier: 0.48
  },
  challenge: {
    damageWeight: 1.08,
    typeEdgeWeight: 1.18,
    finisherWeight: 1.24,
    utilityWeight: 1.1,
    statusWeight: 1.1,
    setupWeight: 1.14,
    healWeight: 1.08,
    repeatPenalty: 1.1,
    costWeight: 0.9,
    chargePenalty: 1,
    lowHpUtilityPenalty: 1.24,
    betterDamagePenalty: 1.18,
    randomMultiplier: 0.72,
    minRandomChance: 0.05,
    temperatureMultiplier: 0.72,
    minTemperature: 5,
    finishLockMultiplier: 0.18,
    typeLockMultiplier: 0.45
  },
  boss: {
    damageWeight: 1.12,
    typeEdgeWeight: 1.26,
    finisherWeight: 1.36,
    utilityWeight: 1.12,
    statusWeight: 1.16,
    setupWeight: 1.16,
    healWeight: 1.18,
    repeatPenalty: 1.22,
    costWeight: 0.82,
    chargePenalty: 0.96,
    lowHpUtilityPenalty: 1.42,
    betterDamagePenalty: 1.28,
    randomMultiplier: 0.58,
    minRandomChance: 0.05,
    temperatureMultiplier: 0.62,
    minTemperature: 4,
    finishLockMultiplier: 0.14,
    typeLockMultiplier: 0.38
  }
}

const TRAINER_STYLE_PROFILES = {
  pressure: {
    damageWeight: 1.1,
    typeEdgeWeight: 1.08,
    finisherWeight: 1.14,
    utilityWeight: 0.88,
    statusWeight: 0.9,
    setupWeight: 0.92,
    healWeight: 0.88,
    repeatPenalty: 1.08,
    randomMultiplier: 0.86,
    minRandomChance: 0.02,
    temperatureMultiplier: 0.88,
    minTemperature: 5,
    finishLockMultiplier: 0.2,
    typeLockMultiplier: 0.46
  },
  control: {
    damageWeight: 0.94,
    typeEdgeWeight: 1.02,
    finisherWeight: 0.98,
    utilityWeight: 1.16,
    statusWeight: 1.2,
    setupWeight: 1.18,
    healWeight: 1.12,
    repeatPenalty: 0.96,
    costWeight: 0.96,
    randomMultiplier: 0.9,
    minRandomChance: 0.02,
    temperatureMultiplier: 0.9,
    minTemperature: 5,
    finishLockMultiplier: 0.24,
    typeLockMultiplier: 0.52
  },
  elite: {
    damageWeight: 1.05,
    typeEdgeWeight: 1.12,
    finisherWeight: 1.1,
    utilityWeight: 1.02,
    statusWeight: 1.04,
    setupWeight: 1.08,
    healWeight: 1.02,
    repeatPenalty: 1.02,
    costWeight: 0.94,
    randomMultiplier: 0.72,
    minRandomChance: 0.02,
    temperatureMultiplier: 0.8,
    minTemperature: 4,
    finishLockMultiplier: 0.18,
    typeLockMultiplier: 0.42
  }
}

const normalizeTrainerStyle = (trainerStyle = null) => {
  const normalized = typeof trainerStyle === 'string' ? trainerStyle.trim().toLowerCase() : ''
  return TRAINER_STYLE_PROFILES[normalized] ? normalized : ''
}

const getAiRoleProfile = ({ battleKind = 'wild', trainerRole = 'normal', trainerStyle = null } = {}) => {
  if (battleKind !== 'trainer') return AI_ROLE_PROFILES.wild
  const normalizedRole = normalizeTrainerRole(trainerRole)
  const profileRole = normalizedRole === 'minigame'
    ? 'boss'
    : normalizedRole === 'reward'
      ? 'normal'
      : normalizedRole
  const roleProfile = AI_ROLE_PROFILES[profileRole] || AI_ROLE_PROFILES.normal
  const normalizedStyle = normalizeTrainerStyle(trainerStyle)
  if (normalizedRole !== 'lieutenant' || !normalizedStyle) return roleProfile
  return {
    ...roleProfile,
    ...TRAINER_STYLE_PROFILES[normalizedStyle]
  }
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
const getMaxMp = (mon) => Math.max(1, Number(mon?.maxMp ?? mon?.mp ?? 1) || 1)

const getHpRatio = (mon) => {
  const maxHp = getMaxHp(mon)
  if (!maxHp || maxHp <= 0) {
    console.warn('[AI] Invalid maxHp detected, returning 0', { mon })
    return 0
  }
  return getCurrentHp(mon) / maxHp
}

const getMoveAccuracy = (move) => (
  typeof move?.accuracy === 'number' ? Math.max(1, Math.min(100, move.accuracy)) : 100
)

const isMoveAffordable = (mon, move) => getCurrentMp(mon) >= (Number(move?.cost) || 0)

const hasTargetStatusRequirement = (move, target) => (
  !move?.requiresTargetStatus || target?.status === move.requiresTargetStatus
)

const hasUserStatusRequirement = (move, user) => (
  !move?.requiresUserStatus || user?.status === move.requiresUserStatus
)

const getLastMoveKey = (mon) => {
  const moveKey = mon?.volatileStatuses?.lastMoveKey
  return MOVES[moveKey] ? moveKey : null
}

// 预判：对手正在蓄力（如百万吨冲击/破坏光线第一回合），本回合不会造成伤害，
// 这是一个明确、无作弊的安全信号——AI 应抓住机会强化/上状态，而非盲目对拼。
const isTargetInChargeWindow = (targetMon) => {
  const chargingMove = targetMon?.volatileStatuses?.chargingMove
  return Boolean(chargingMove && MOVES[chargingMove])
}

const canUseMove = (enemyMon, targetMon, moveKey) => {
  const move = MOVES[moveKey]
  if (!move || !isMoveAffordable(enemyMon, move)) return false
  return hasUserStatusRequirement(move, enemyMon) && hasTargetStatusRequirement(move, targetMon)
}

const scoreStatusMove = ({ move, enemyMon, targetMon, profile }) => {
  if (!move.status) return 0
  if (targetMon?.status) return -55
  if (hasStatusImmunity(targetMon, move.status)) return -75

  const targetHpRatio = getHpRatio(targetMon)
  const accuracyFactor = getMoveAccuracy(move) / 100
  const baseValue = (STATUS_VALUE[move.status] || 26) * profile.statusWeight
  const setupWindowBase = targetHpRatio >= 0.65 ? 16 : targetHpRatio >= 0.35 ? 8 : -14
  const setupWindow = setupWindowBase * profile.setupWeight
  const speedPressure = (Number(targetMon?.spd) || 0) > (Number(enemyMon?.spd) || 0) ? 4 : 0
  return (baseValue + setupWindow + speedPressure) * accuracyFactor
}

const scoreStatChangeMove = ({ move, enemyMon, targetMon, profile }) => {
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
  return (base + stageValue + longBattleValue - (targetLow ? 12 * profile.lowHpUtilityPenalty : 0)) * profile.setupWeight
}

const scoreUtilityMove = ({ moveKey, move, enemyMon, targetMon, candidates, profile, roleBalance = null }) => {
  let score = 0
  const enemyHpRatio = getHpRatio(enemyMon)
  const targetHpRatio = getHpRatio(targetMon)

  if (move.effect === 'heal') {
    if (enemyHpRatio >= 0.72) return -60
    score += (18 + (1 - enemyHpRatio) * 88) * profile.healWeight
    if (enemyHpRatio <= 0.35) score += 24 * profile.healWeight
    if (enemyHpRatio <= 0.5 && targetHpRatio >= 0.45) {
      score += Math.max(0, profile.healWeight - 0.9) * 24
    }
    if (roleBalance) {
      const healDiscipline = Math.max(0, roleBalance.aiSkill - 0.45)
      const lowHpUrgency = Math.max(0, 0.72 - enemyHpRatio)
      score += healDiscipline * lowHpUrgency * 54
      if (targetHpRatio >= 0.6) score += healDiscipline * 8
      if (enemyHpRatio <= 0.35) score += healDiscipline * 14
    }
  }

  if (move.effect === 'mimic') {
    const targetLastMove = getLastMoveKey(targetMon)
    score += (targetLastMove && targetLastMove !== 'mimic' ? 24 : -62) * profile.utilityWeight
  }

  if (move.status) {
    score += scoreStatusMove({ move, enemyMon, targetMon, profile })
  }

  if (move.volatileStatus === 'confusion' && !targetMon?.volatileStatuses?.confusion) {
    score += (targetHpRatio > 0.35 ? 22 : 8) * profile.utilityWeight
  }

  if (move.volatileStatus === 'flinch') {
    const likelyActsFirst = (Number(enemyMon?.spd) || 0) >= (Number(targetMon?.spd) || 0) || (move.priority || 0) > 0
    score += (likelyActsFirst ? 12 : 3) * profile.utilityWeight
  }

  if (move.statChange) {
    score += scoreStatChangeMove({ move, enemyMon, targetMon, profile })
  }

  const previousMove = getLastMoveKey(enemyMon)
  if (previousMove === moveKey && candidates.length > 1) score -= 6 * profile.repeatPenalty

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

export const scoreEnemyMove = ({
  moveKey,
  enemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal',
  trainerStyle = null,
  candidates = []
}) => {
  const move = MOVES[moveKey]
  if (!move || !enemyMon || !targetMon) return -Infinity
  if (!isMoveAffordable(enemyMon, move)) return -Infinity

  const profile = getAiRoleProfile({ battleKind, trainerRole, trainerStyle })
  const roleBalance = battleKind === 'trainer' ? getTrainerRoleBalance(trainerRole) : null
  let score = 10
  const enemyMp = Math.max(1, getCurrentMp(enemyMon))
  const targetHp = getCurrentHp(targetMon)
  const accuracy = getMoveAccuracy(move)
  const candidateDamageRows = getCandidateDamageRows({ enemyMon, targetMon, candidates })
  const bestDamageOutcome = candidateDamageRows[0] || { moveKey: null, damage: 0, effectiveness: 1 }
  const bestSuperEffectiveOutcome = candidateDamageRows.find((entry) => entry.effectiveness > 1) || null
  const roleTypeDiscipline = roleBalance ? Math.max(0, roleBalance.aiSkill - 0.45) * 18 : 0

  if (!hasTargetStatusRequirement(move, targetMon)) score -= 80

  if (move.power > 0 && move.category !== 'status') {
    const result = calculateBattleDamage(enemyMon, targetMon, move, {
      randomFactor: 0.925
    })
    const damage = Math.max(0, result.damage)
    const damageRatio = targetHp > 0 ? damage / targetHp : 0
    const accuracyFactor = accuracy / 100
    score += Math.min(1.45, damageRatio) * 68 * accuracyFactor * profile.damageWeight

    if (result.effectiveness === 0) score -= 95
    else if (result.effectiveness >= 4) score += 48 * profile.typeEdgeWeight
    else if (result.effectiveness > 1) score += 32 * profile.typeEdgeWeight
    else if (result.effectiveness > 0 && result.effectiveness <= 0.25) score -= 34 * profile.typeEdgeWeight
    else if (result.effectiveness > 0 && result.effectiveness < 1) score -= 20 * profile.typeEdgeWeight

    if (getStabMultiplier(enemyMon, move.type) > 1) score += 8 * (0.85 + profile.damageWeight * 0.15)
    if (targetHp > 0 && damage >= targetHp) score += (76 + (move.priority ? 10 : 0)) * profile.finisherWeight
    else if (targetHp > 0 && getHpRatio(targetMon) <= 0.4) {
      score -= Math.max(0, 1 - damage / targetHp) * 28 * profile.finisherWeight
    }
    if (bestDamageOutcome.damage > 0 && moveKey !== bestDamageOutcome.moveKey) {
      score -= Math.max(0, 1 - damage / bestDamageOutcome.damage) * 18 * profile.betterDamagePenalty
    }
    if (result.effectiveness > 1 && damageRatio >= 0.22) score += 12 * profile.typeEdgeWeight
    if (bestSuperEffectiveOutcome && bestSuperEffectiveOutcome.damage >= targetHp * 0.18) {
      if (result.effectiveness > 1) score += roleTypeDiscipline
      else score -= roleTypeDiscipline * 1.15
    }
    if (move.effect === 'drain' && getHpRatio(enemyMon) < 0.8) score += (1 - getHpRatio(enemyMon)) * 18 * profile.healWeight
    if (move.charge) score -= (targetHp > 0 && damage >= targetHp ? 10 : 18) * profile.chargePenalty
  } else {
    score += scoreUtilityMove({ moveKey, move, enemyMon, targetMon, candidates, profile, roleBalance })

    if (bestDamageOutcome.damage > 0 && targetHp > 0) {
      const bestDamageRatio = bestDamageOutcome.damage / targetHp
      const utilityPressurePenalty = move.effect === 'heal'
        ? Math.max(0.45, 0.75 - Math.max(0, profile.healWeight - 1) * 0.6)
        : profile.lowHpUtilityPenalty
      if (bestDamageRatio >= 0.22) {
        score -= (16 + bestDamageRatio * 18) * utilityPressurePenalty
      }
      if (bestSuperEffectiveOutcome && bestSuperEffectiveOutcome.damage >= targetHp * 0.2) {
        score -= 18 * profile.typeEdgeWeight
      }
      if (getHpRatio(targetMon) <= 0.5) {
        score -= 18 * utilityPressurePenalty
      }
    }
  }

  if (move.status && move.power > 0 && !targetMon.status && !hasStatusImmunity(targetMon, move.status)) {
    score += (STATUS_VALUE[move.status] || 20) * ((move.statusChance ?? 10) / 100) * 0.35 * profile.statusWeight
  }

  if (move.statChange && move.power > 0) {
    score += scoreStatChangeMove({ move, enemyMon, targetMon, profile }) * ((move.statChange.chance ?? 100) / 100) * 0.25
  }

  if (accuracy < 100) score -= (100 - accuracy) * 0.22
  score -= Math.max(0, (Number(move.cost) || 0) - 8) * 0.45 * profile.costWeight

  // 计算 MP 消耗比率（防止除零）
  const currentMp = getCurrentMp(enemyMon)
  const mpRatio = currentMp > 0 ? (Number(move.cost) || 0) / currentMp : 0
  score -= mpRatio * 4 * profile.costWeight

  // 预判：对手正在蓄力的回合不会造成伤害，AI 抓住这个安全窗口强化或上状态。
  // 仅训练师 AI 启用，且按技巧（setupWeight/statusWeight 已含角色梯度）放大收益。
  if (battleKind === 'trainer' && isTargetInChargeWindow(targetMon)) {
    const isSetupMove = move.category === 'status' && (
      (move.statChange && move.statChange.target === 'attacker' && Number(move.statChange.stages) > 0) ||
      (Array.isArray(move.statChanges) && move.statChanges.some((entry) => entry.target === 'attacker' && Number(entry.stages) > 0))
    )
    const isStatusMove = move.category === 'status' && Boolean(move.status)
    const isHealMove = move.effect === 'heal'
    if (isSetupMove) score += 26 * profile.setupWeight
    else if (isStatusMove) score += 20 * profile.statusWeight
    else if (isHealMove && getHpRatio(enemyMon) < 0.85) score += 18 * profile.healWeight
  }

  const previousMove = getLastMoveKey(enemyMon)
  if (previousMove === moveKey && candidates.length > 1) {
    score -= (battleKind === 'trainer' ? 4 : 7) * profile.repeatPenalty
  }

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

const getRecentEnemySwitchCount = (battleLogs = [], lookback = 8) => (
  (Array.isArray(battleLogs) ? battleLogs.slice(-lookback) : [])
    .filter((message) => typeof message === 'string' && message.startsWith('对手收回了 '))
    .length
)

export function chooseBattleEnemyMove({
  enemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal',
  trainerStyle = null
} = {}) {
  const chargingMove = enemyMon?.volatileStatuses?.chargingMove
  if (chargingMove && MOVES[chargingMove]) return chargingMove
  if (!enemyMon?.moves?.length || !targetMon) return null

  const affordableMoves = enemyMon.moves.filter((moveKey) => {
    const move = MOVES[moveKey]
    return move && isMoveAffordable(enemyMon, move)
  })
  if (affordableMoves.length === 0) return null

  const userLegalMoves = affordableMoves.filter((moveKey) => hasUserStatusRequirement(MOVES[moveKey], enemyMon))
  const legalMoves = userLegalMoves.filter((moveKey) => canUseMove(enemyMon, targetMon, moveKey))
  const candidates = legalMoves.length > 0 ? legalMoves : userLegalMoves
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  const profile = getAiRoleProfile({ battleKind, trainerRole, trainerStyle })
  const scoredMoves = candidates.map((moveKey) => ({
    moveKey,
    score: scoreEnemyMove({ moveKey, enemyMon, targetMon, battleKind, trainerRole, trainerStyle, candidates })
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
  randomChance *= profile.randomMultiplier
  if (bestCanFinish) randomChance *= profile.finishLockMultiplier
  else if (bestHasTypeEdge || lowHpPressure) randomChance *= profile.typeLockMultiplier
  if (clearBestMove) randomChance *= 0.68
  randomChance = Math.max(profile.minRandomChance, randomChance)
  if (Math.random() < randomChance) return pickRandom(randomPool)

  return pickWeighted(finalScoredMoves, {
    temperature: battleKind === 'trainer'
      ? Math.max(profile.minTemperature, (16 - roleBalance.aiSkill * 8) * profile.temperatureMultiplier)
      : Math.max(profile.minTemperature, 18 * profile.temperatureMultiplier)
  })
}

const getBestMoveScore = ({ enemyMon, targetMon, battleKind = 'trainer', trainerRole = 'normal', trainerStyle = null }) => {
  const moves = Array.isArray(enemyMon?.moves) ? enemyMon.moves : []
  const candidates = moves.filter((moveKey) => canUseMove(enemyMon, targetMon, moveKey))
  if (candidates.length === 0) return -Infinity
  return Math.max(...candidates.map((moveKey) => (
    scoreEnemyMove({ moveKey, enemyMon, targetMon, battleKind, trainerRole, trainerStyle, candidates })
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

const scoreTrainerSwitchCandidate = ({ candidate, activeEnemyMon, targetMon, battleKind, trainerRole, trainerStyle = null }) => {
  const candidateHpRatio = getHpRatio(candidate)
  if (candidateHpRatio <= 0) return -Infinity

  const attackScore = getBestMoveScore({
    enemyMon: candidate,
    targetMon,
    battleKind,
    trainerRole,
    trainerStyle
  })
  const activeAttackScore = getBestMoveScore({
    enemyMon: activeEnemyMon,
    targetMon,
    battleKind,
    trainerRole,
    trainerStyle
  })
  const incomingPressure = getIncomingTypePressure(targetMon, candidate)
  const activeIncomingPressure = getIncomingTypePressure(targetMon, activeEnemyMon)
  const candidateIncomingOutcome = getBestDamageOutcome({ enemyMon: targetMon, targetMon: candidate })
  const activeIncomingOutcome = getBestDamageOutcome({ enemyMon: targetMon, targetMon: activeEnemyMon })
  const candidateIncomingRatio = candidateIncomingOutcome.damage / Math.max(1, getCurrentHp(candidate))
  const activeIncomingRatio = activeIncomingOutcome.damage / Math.max(1, getCurrentHp(activeEnemyMon))
  const candidateAtKoRisk = candidateIncomingRatio >= 1
  const activeAtKoRisk = activeIncomingRatio >= 1
  const levelBonus = ((Number(candidate.level) || 1) - (Number(activeEnemyMon?.level) || 1)) * 2.2
  const healthBonus = candidateHpRatio * 18
  const defensiveSwing = (activeIncomingPressure - incomingPressure) * 18
  const survivalSwing = Math.max(-1.5, Math.min(1.5, activeIncomingRatio - candidateIncomingRatio)) * 30
  const sacrificePenalty = candidateAtKoRisk && !activeAtKoRisk ? 54 : 0
  const rescueBonus = activeAtKoRisk && !candidateAtKoRisk ? 18 : 0
  const offensiveSwing = Number.isFinite(activeAttackScore)
    ? attackScore - activeAttackScore
    : attackScore

  return offensiveSwing + defensiveSwing + survivalSwing + healthBonus + levelBonus + rescueBonus - sacrificePenalty
}

export function evaluateTrainerSwitchDecision({
  enemyTeam = [],
  activeEnemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal',
  trainerStyle = null,
  battleLogs = [],
  random = Math.random
} = {}) {
  const stay = (reason = 'no_switch') => ({
    shouldSwitch: false,
    target: null,
    reason,
    probability: 0
  })
  if (battleKind !== 'trainer' || !activeEnemyMon || !targetMon) return stay('not_trainer')
  if (activeEnemyMon?.volatileStatuses?.chargingMove) return stay('charging')

  const aliveBenched = (Array.isArray(enemyTeam) ? enemyTeam : [])
    .filter((mon) => mon && mon.id !== activeEnemyMon.id && getCurrentHp(mon) > 0)
  if (aliveBenched.length === 0) return stay('no_bench')

  const roleBalance = getTrainerRoleBalance(trainerRole)
  const normalizedStyle = normalizeTrainerStyle(trainerStyle)
  const styleSwitchProfile = {
    pressure: { chanceDelta: -0.04, gapMultiplier: 1.1 },
    control: { chanceDelta: 0.06, gapMultiplier: 0.92 },
    elite: { chanceDelta: 0.03, gapMultiplier: 0.96 }
  }[normalizedStyle] || { chanceDelta: 0, gapMultiplier: 1 }
  const activeHpRatio = getHpRatio(activeEnemyMon)
  const activeMoveScore = getBestMoveScore({
    enemyMon: activeEnemyMon,
    targetMon,
    battleKind,
    trainerRole,
    trainerStyle
  })
  const incomingPressure = getIncomingTypePressure(targetMon, activeEnemyMon)
  const activeIncomingOutcome = getBestDamageOutcome({ enemyMon: targetMon, targetMon: activeEnemyMon })
  const activeIncomingRatio = activeIncomingOutcome.damage / Math.max(1, getCurrentHp(activeEnemyMon))
  const activeAtKoRisk = activeIncomingRatio >= 1
  const activeSevereRisk = activeIncomingRatio >= 0.7 || incomingPressure >= 4
  const activeIsPinned = incomingPressure >= 2 || activeMoveScore < 18
  const activeIsLow = activeHpRatio <= roleBalance.switchHpRatio
  const activeIsCritical = activeHpRatio <= Math.max(0.16, roleBalance.switchHpRatio - 0.12)
  const activeDamageOutcome = getBestDamageOutcome({ enemyMon: activeEnemyMon, targetMon })
  const activeCanFinish = activeDamageOutcome.damage >= getCurrentHp(targetMon)
  const activeCanPressAdvantage = activeDamageOutcome.damage >= getCurrentHp(targetMon) * 0.55 || activeMoveScore >= 78
  if (activeHpRatio >= 0.86 && !activeAtKoRisk && activeMoveScore >= 18) {
    return stay('healthy_probe')
  }
  if (activeHpRatio >= 0.72 && !activeAtKoRisk && activeIncomingRatio < 0.55 && activeMoveScore >= 25) {
    return stay('healthy_scout')
  }
  if (activeCanFinish && !activeAtKoRisk && activeHpRatio > Math.max(0.16, roleBalance.switchHpRatio * 0.48)) {
    return stay('finish_available')
  }
  if (activeCanPressAdvantage && !activeAtKoRisk && !activeSevereRisk && !activeIsCritical) {
    return stay('pressure_available')
  }
  if (
    activeDamageOutcome.effectiveness > 1 &&
    activeMoveScore >= 65 &&
    !activeIsLow &&
    incomingPressure < 4
  ) {
    return stay('type_advantage')
  }
  if (!activeIsPinned && !activeIsLow && !activeAtKoRisk) return stay('stable_position')

  const recentSwitchCount = getRecentEnemySwitchCount(battleLogs)
  if (recentSwitchCount > 0 && !activeAtKoRisk && !(activeIsCritical && activeSevereRisk)) {
    return stay('switch_cooldown')
  }

  const scoredCandidates = aliveBenched
    .map((candidate) => ({
      candidate,
      score: scoreTrainerSwitchCandidate({
        candidate,
        activeEnemyMon,
        targetMon,
        battleKind,
        trainerRole,
        trainerStyle
      })
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score)
  const best = scoredCandidates[0]
  if (!best) return stay('no_valid_candidate')

  const scoreGap = best.score
  const requiredScoreGap = activeAtKoRisk
    ? roleBalance.switchScoreGap * 0.45 * styleSwitchProfile.gapMultiplier
    : activeIsCritical
      ? roleBalance.switchScoreGap * 0.7 * styleSwitchProfile.gapMultiplier
      : roleBalance.switchScoreGap * (activeHpRatio >= 0.72 ? 1.55 : 1) * styleSwitchProfile.gapMultiplier
  if (scoreGap < requiredScoreGap) return stay('no_meaningful_gain')
  if (recentSwitchCount > 0 && (!activeAtKoRisk || !activeIsCritical || scoreGap < roleBalance.switchScoreGap * 1.8)) {
    return stay('switch_cooldown')
  }

  const pressureBonus = activeIsPinned ? 0.06 : 0
  const koRiskBonus = activeAtKoRisk ? 0.16 : activeSevereRisk ? 0.07 : 0
  const lowHpBonus = activeIsCritical ? 0.05 : activeIsLow ? 0.02 : 0
  const repeatPenalty = recentSwitchCount > 0 ? recentSwitchCount * 0.22 : 0
  const healthyPatiencePenalty = activeHpRatio >= 0.72 ? 0.16 : activeHpRatio > roleBalance.switchHpRatio ? 0.08 : 0
  const probability = Math.max(
    0.04,
    Math.min(0.68, roleBalance.switchChance + styleSwitchProfile.chanceDelta + pressureBonus + koRiskBonus + lowHpBonus - repeatPenalty - healthyPatiencePenalty)
  )
  const shouldSwitch = random() < probability
  const reason = activeAtKoRisk
    ? 'avoid_ko'
    : activeSevereRisk || incomingPressure >= 2
      ? 'type_pivot'
      : activeIsCritical
        ? 'preserve_partner'
        : 'gain_matchup'
  return {
    shouldSwitch,
    target: shouldSwitch ? best.candidate : null,
    suggestedTarget: best.candidate,
    reason,
    probability,
    scoreGap,
    requiredScoreGap,
    activeAtKoRisk,
    activeIsLow,
    activeIsCritical
  }
}

export function chooseTrainerSwitchTarget(options = {}) {
  return evaluateTrainerSwitchDecision(options).target
}

// 伤药从弱到强排序，便于按 HP 缺口选择恰当强度（避免强药治轻伤的浪费）。
const POTION_TIERS = ['potion', 'super_potion', 'hyper_potion', 'max_potion']
  .filter((key) => POTIONS[key])
  .map((key) => {
    const recovery = getPotionRecoveryProfile(POTIONS[key])
    return {
      key,
      healAmount: recovery.hp,
      mpRestoreAmount: recovery.mp
    }
  })

const getRecentEnemyItemCount = (battleLogs = [], lookback = 10) => (
  (Array.isArray(battleLogs) ? battleLogs.slice(-lookback) : [])
    .filter((message) => typeof message === 'string' && message.startsWith('对手使用了 '))
    .length
)

// 选择最合适的伤药：优先能补满缺口的最弱一档，避免大材小用；都补不满时用最强一档。
const pickPotionForDeficit = (hpDeficit) => {
  const sufficient = POTION_TIERS.find((tier) => tier.healAmount >= hpDeficit)
  return (sufficient || POTION_TIERS[POTION_TIERS.length - 1])?.key || null
}

const pickPotionForRecoveryNeed = ({ hpDeficit = 0, mpDeficit = 0, preferMp = false } = {}) => {
  if (preferMp && mpDeficit > 0) {
    const sufficientMp = POTION_TIERS.find((tier) => tier.mpRestoreAmount >= mpDeficit)
    const anyMp = POTION_TIERS.find((tier) => tier.mpRestoreAmount > 0)
    return (sufficientMp || anyMp || POTION_TIERS[POTION_TIERS.length - 1])?.key || null
  }
  if (hpDeficit > 0) return pickPotionForDeficit(hpDeficit)
  return POTION_TIERS.find((tier) => tier.mpRestoreAmount > 0)?.key || POTION_TIERS[0]?.key || null
}

const hasPotionCurableBattleStatus = (mon = {}) => {
  const primaryStatus = typeof mon?.status === 'string' ? mon.status.trim() : ''
  const volatileStatuses = mon?.volatileStatuses && typeof mon.volatileStatuses === 'object'
    ? mon.volatileStatuses
    : null
  return Boolean(primaryStatus || volatileStatuses?.confusion || volatileStatuses?.flinch)
}

const hasAffordableBattleMove = (mon, targetMon) => (
  (Array.isArray(mon?.moves) ? mon.moves : []).some((moveKey) => {
    const move = MOVES[moveKey]
    return move && isMoveAffordable(mon, move) && hasUserStatusRequirement(move, mon) && hasTargetStatusRequirement(move, targetMon)
  })
)

/**
 * 训练师 AI 是否使用回复道具（伤药）。仅 boss/精英类角色拥有有限预算。
 * 设计目标：在当前宝可梦濒危、换人又不划算时，用一次伤药续命续压制，
 * 但不会被对手本回合直接打死（那种情况下用药是浪费，应改为换人/进攻）。
 */
export function evaluateTrainerItemDecision({
  activeEnemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal',
  potionsRemaining = 0,
  battleLogs = [],
  random = Math.random
} = {}) {
  const decline = (reason = 'no_item') => ({ shouldUseItem: false, itemKey: null, reason, probability: 0 })
  if (battleKind !== 'trainer' || !activeEnemyMon || !targetMon) return decline('not_trainer')
  if (potionsRemaining <= 0 || POTION_TIERS.length === 0) return decline('no_budget')
  if (activeEnemyMon?.volatileStatuses?.chargingMove) return decline('charging')

  const roleBalance = getTrainerRoleBalance(trainerRole)
  const threshold = Number(roleBalance.potionHpThreshold) || 0
  if (threshold <= 0) return decline('role_no_potion')

  const maxHp = getMaxHp(activeEnemyMon)
  const currentHp = getCurrentHp(activeEnemyMon)
  const hpRatio = currentHp / maxHp
  const maxMp = getMaxMp(activeEnemyMon)
  const currentMp = getCurrentMp(activeEnemyMon)
  const hpDeficit = Math.max(0, maxHp - currentHp)
  const mpDeficit = Math.max(0, maxMp - currentMp)
  const mpRatio = currentMp / maxMp
  const hasCurableStatus = hasPotionCurableBattleStatus(activeEnemyMon)
  const canActWithMove = hasAffordableBattleMove(activeEnemyMon, targetMon)
  const canRecoverMp = POTION_TIERS.some((tier) => tier.mpRestoreAmount > 0)
  const needsHpRecovery = hpRatio > 0 && hpRatio <= threshold && hpDeficit >= maxHp * 0.32
  const needsMpRecovery = canRecoverMp && mpDeficit > 0 && (!canActWithMove || mpRatio <= 0.18)
  const needsStatusCure = hasCurableStatus && hpRatio <= Math.max(0.62, threshold + 0.12)
  if (!needsHpRecovery && !needsMpRecovery && !needsStatusCure) return decline(hpRatio > threshold ? 'healthy' : 'deficit_too_small')

  const itemKey = pickPotionForRecoveryNeed({
    hpDeficit,
    mpDeficit,
    preferMp: !needsHpRecovery && needsMpRecovery
  })
  if (!itemKey) return decline('no_potion_item')

  const incomingOutcome = getBestDamageOutcome({ enemyMon: targetMon, targetMon: activeEnemyMon })
  const lethalThisTurn = incomingOutcome.damage >= currentHp
  const potion = POTIONS[itemKey] || {}
  const potionRecovery = getPotionRecoveryProfile(potion)
  const healedHp = Math.min(maxHp, currentHp + potionRecovery.hp)
  // 训练家道具在本项目中先于本回合招式结算；只有“补完仍会被同一击打倒”才放弃，避免之前按速度误判导致永远不用药。
  if (needsHpRecovery && incomingOutcome.damage >= healedHp && !needsMpRecovery && !needsStatusCure) {
    return decline('would_still_be_ko')
  }

  // 越濒危越倾向用药；最近刚用过则降低频率，避免连续刷药的机械感。
  const hpUrgency = Math.max(0, threshold - hpRatio) / Math.max(0.01, threshold)
  const mpUrgency = needsMpRecovery ? (canActWithMove ? Math.max(0, 0.18 - mpRatio) / 0.18 : 1) : 0
  const recentItemUse = getRecentEnemyItemCount(battleLogs)
  const aiSkill = Number(roleBalance.aiSkill) || 0.5
  let probability = 0.22 + hpUrgency * 0.5 + mpUrgency * 0.34 + Math.max(0, aiSkill - 0.7) * 0.6
  if (needsStatusCure) probability += 0.14
  if (lethalThisTurn && incomingOutcome.damage < healedHp) probability += 0.28
  if (!needsHpRecovery && needsMpRecovery) probability = Math.max(probability, canActWithMove ? 0.42 : 0.76)
  probability -= recentItemUse * 0.4
  probability = Math.max(0, Math.min(0.92, probability))

  const shouldUseItem = random() < probability
  const reason = needsMpRecovery && !needsHpRecovery
    ? 'recover_mp'
    : needsStatusCure && !needsHpRecovery
      ? 'cure_status'
      : lethalThisTurn
        ? 'emergency_heal'
        : 'sustain_heal'
  return {
    shouldUseItem,
    itemKey: shouldUseItem ? itemKey : null,
    suggestedItemKey: itemKey,
    reason: shouldUseItem ? reason : 'held_item',
    probability,
    hpRatio,
    mpRatio
  }
}

export function chooseTrainerBattleAction({
  enemyTeam = [],
  activeEnemyMon,
  targetMon,
  battleKind = 'wild',
  trainerRole = 'normal',
  trainerStyle = null,
  battleLogs = [],
  allowSwitch = true,
  potionsRemaining = 0,
  random = Math.random
} = {}) {
  const moveKey = chooseBattleEnemyMove({
    enemyMon: activeEnemyMon,
    targetMon,
    battleKind,
    trainerRole,
    trainerStyle
  })

  if (battleKind === 'trainer' && potionsRemaining > 0) {
    const itemDecision = evaluateTrainerItemDecision({
      activeEnemyMon,
      targetMon,
      battleKind,
      trainerRole,
      potionsRemaining,
      battleLogs,
      random
    })
    if (itemDecision.shouldUseItem && itemDecision.itemKey) {
      return {
        type: 'item',
        itemKey: itemDecision.itemKey,
        reason: itemDecision.reason,
        itemDecision
      }
    }
  }

  if (allowSwitch && battleKind === 'trainer') {
    const switchDecision = evaluateTrainerSwitchDecision({
      enemyTeam,
      activeEnemyMon,
      targetMon,
      battleKind,
      trainerRole,
      trainerStyle,
      battleLogs,
      random
    })
    if (switchDecision.shouldSwitch) {
      return {
        type: 'switch',
        target: switchDecision.target,
        reason: switchDecision.reason,
        switchDecision
      }
    }
  }

  return {
    type: 'move',
    moveKey,
    reason: moveKey ? 'use_move' : 'no_move'
  }
}
