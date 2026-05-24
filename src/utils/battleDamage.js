import { TYPE_NAMES_CN, getEffectiveness } from './constants'

/** 同级对战（等级差 ≤3）时，单次伤害不超过目标最大 HP 的比例，避免离谱秒杀 */
export const SAME_LEVEL_DAMAGE_CAP_RATIO = 0.65
export const SAME_LEVEL_DAMAGE_CAP_MAX_DIFF = 3
/** 非免疫命中时，至少造成目标最大 HP 的一定比例，避免极低攻击永久刮痧 */
export const MIN_DAMAGE_HP_RATIO = 0.05

const clampStage = (stage) => Math.max(-6, Math.min(6, stage || 0))

export const getStageMultiplier = (stage) => {
  const safeStage = clampStage(stage)
  return safeStage >= 0 ? (2 + safeStage) / 2 : 2 / (2 - safeStage)
}

export const resolveBattleStat = (mon, stat, { burnHalvesPhysicalAtk = true } = {}) => {
  const baseValue = Number(mon?.[stat]) || 1
  let statusModifier = 1
  if (stat === 'spd' && mon?.status === 'paralysis') statusModifier = 0.5
  if (burnHalvesPhysicalAtk && stat === 'atk' && mon?.status === 'burn') statusModifier = 0.5
  const stage = mon?.statStages?.[stat] || 0
  return Math.max(1, Math.floor(baseValue * getStageMultiplier(stage) * statusModifier))
}

export const getBattlePokemonTypes = (mon) => (
  [...new Set([mon?.type, mon?.type2].filter(Boolean))]
)

export const getTypeEffectivenessBreakdown = (moveType, defender) => {
  const defenderTypes = getBattlePokemonTypes(defender)
  const matchups = defenderTypes.map((targetType) => ({
    targetType,
    targetTypeName: TYPE_NAMES_CN[targetType] || targetType,
    effectiveness: getEffectiveness(moveType, targetType)
  }))
  const effectiveness = matchups.reduce((total, matchup) => total * matchup.effectiveness, 1)

  return {
    moveType,
    moveTypeName: TYPE_NAMES_CN[moveType] || moveType || '未知',
    defenderTypes,
    defenderTypeNames: matchups.map((matchup) => matchup.targetTypeName),
    matchups,
    effectiveness
  }
}

export const getTypeEffectiveness = (moveType, defender) => (
  getTypeEffectivenessBreakdown(moveType, defender).effectiveness
)

export const getTypeEffectivenessRank = (effectiveness = 1) => {
  if (effectiveness === 0) return 'immune'
  if (effectiveness >= 4) return 'verySuper'
  if (effectiveness > 1) return 'super'
  if (effectiveness > 0 && effectiveness <= 0.25) return 'veryResisted'
  if (effectiveness > 0 && effectiveness < 1) return 'resisted'
  return 'neutral'
}

export const getMoveEffectivenessMeta = (move, defender) => {
  if (!move || move.category === 'status' || !(Number(move.power) > 0)) {
    return {
      rank: 'status',
      label: '辅助',
      className: 'battle-move-effectiveness--status',
      description: '变化招式不直接比较属性伤害。',
      effectiveness: 1
    }
  }

  const breakdown = getTypeEffectivenessBreakdown(move.type, defender)
  if (!move.type || breakdown.defenderTypes.length === 0) {
    return {
      ...breakdown,
      rank: 'unknown',
      label: '待定',
      className: 'battle-move-effectiveness--unknown',
      description: '当前对手属性待确认，暂时无法判断克制关系。',
      effectiveness: 1
    }
  }

  const rank = getTypeEffectivenessRank(breakdown.effectiveness)
  const metaByRank = {
    immune: {
      label: '无效',
      className: 'battle-move-effectiveness--immune',
      description: `${breakdown.moveTypeName}属性对当前对手没有效果。`
    },
    verySuper: {
      label: '极佳',
      className: 'battle-move-effectiveness--very-super',
      description: `${breakdown.moveTypeName}属性非常克制当前对手。`
    },
    super: {
      label: '克制',
      className: 'battle-move-effectiveness--super',
      description: `${breakdown.moveTypeName}属性克制当前对手。`
    },
    veryResisted: {
      label: '很弱',
      className: 'battle-move-effectiveness--very-resisted',
      description: `当前对手很抵抗${breakdown.moveTypeName}属性。`
    },
    resisted: {
      label: '不利',
      className: 'battle-move-effectiveness--resisted',
      description: `${breakdown.moveTypeName}属性不太适合攻击当前对手。`
    },
    neutral: {
      label: '一般',
      className: 'battle-move-effectiveness--neutral',
      description: `${breakdown.moveTypeName}属性对当前对手表现正常。`
    }
  }

  return {
    ...breakdown,
    rank,
    ...(metaByRank[rank] || metaByRank.neutral)
  }
}

export const getTypeEffectivenessMessage = ({
  moveType,
  defender,
  defenderName = '目标',
  effectiveness = null
} = {}) => {
  const breakdown = getTypeEffectivenessBreakdown(moveType, defender)
  const finalEffectiveness = Number.isFinite(effectiveness)
    ? effectiveness
    : breakdown.effectiveness
  const rank = getTypeEffectivenessRank(finalEffectiveness)
  const immuneMatchup = breakdown.matchups.find((matchup) => matchup.effectiveness === 0)
  const moveTypeName = breakdown.moveTypeName

  if (rank === 'immune') {
    return immuneMatchup
      ? `${immuneMatchup.targetTypeName}属性让${moveTypeName}属性攻击无效！`
      : `${moveTypeName}属性对${defenderName}没有效果！`
  }
  if (rank === 'verySuper') return `${moveTypeName}属性正中弱点，效果非常好！`
  if (rank === 'super') return `${moveTypeName}属性击中了弱点！`
  if (rank === 'veryResisted') return `${defenderName}很抵抗${moveTypeName}属性。`
  if (rank === 'resisted') return `${moveTypeName}属性不太占优。`
  return ''
}

export const getStabMultiplier = (attacker, moveType) => (
  moveType === attacker?.type || moveType === attacker?.type2 ? 1.5 : 1
)

/**
 * Gen 6+ 伤害公式（简化版，无天气/道具/特性）
 * @returns {{ damage: number, effectiveness: number, rawDamage: number, capped: boolean }}
 */
export function calculateBattleDamage(attacker, defender, move, options = {}) {
  const {
    randomFactor = null,
    applySameLevelCap = true,
    burnHalvesPhysicalAtk = true
  } = options

  if (!move || move.category === 'status' || !move.power) {
    return { damage: 0, effectiveness: 1, rawDamage: 0, capped: false }
  }

  const level = attacker?.level || 50
  const attackStat = move.category === 'physical'
    ? resolveBattleStat(attacker, 'atk', { burnHalvesPhysicalAtk })
    : resolveBattleStat(attacker, 'spAtk', { burnHalvesPhysicalAtk })
  const defenseStat = move.category === 'physical'
    ? resolveBattleStat(defender, 'def')
    : resolveBattleStat(defender, 'spDef')

  const effectiveness = getTypeEffectiveness(move.type, defender)
  if (effectiveness === 0) {
    return { damage: 0, effectiveness: 0, rawDamage: 0, capped: false }
  }

  let damage = ((2 * level / 5 + 2) * move.power * (attackStat / defenseStat) / 50 + 2)
  damage *= effectiveness
  damage *= getStabMultiplier(attacker, move.type)

  const rng = randomFactor ?? ((Math.floor(Math.random() * 16) + 85) / 100)
  damage *= rng

  let rawDamage = Math.floor(damage)
  if (rawDamage < 1) rawDamage = 1

  const minPracticalDamage = Math.max(1, Math.floor((defender?.maxHp || 1) * MIN_DAMAGE_HP_RATIO))
  if (rawDamage < minPracticalDamage) rawDamage = minPracticalDamage

  let capped = false
  let finalDamage = rawDamage
  if (applySameLevelCap) {
    const levelDiff = Math.abs((attacker?.level || level) - (defender?.level || level))
    if (levelDiff <= SAME_LEVEL_DAMAGE_CAP_MAX_DIFF) {
      const cap = Math.max(1, Math.floor((defender?.maxHp || 1) * SAME_LEVEL_DAMAGE_CAP_RATIO))
      if (finalDamage > cap) {
        finalDamage = cap
        capped = true
      }
    }
  }

  return { damage: finalDamage, effectiveness, rawDamage, capped }
}

export const rollDamageRandomFactor = () => (Math.floor(Math.random() * 16) + 85) / 100
