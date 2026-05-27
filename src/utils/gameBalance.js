import { EXP_POTIONS, MONSTERS } from './gameData.js'
import {
  getOfficialBaseExperience,
  getOfficialExpToNextLevel,
  getOfficialTotalExpForLevel,
} from './officialExperience.js'

export const MAP_UNDERLEVEL_MARGIN = 3
export const ENCOUNTER_SAFE_STEPS = 5
export const WILD_CAPTURE_LEVEL_MARGIN = 5
export const DEFAULT_MAX_ENERGY = 10
export const DEFAULT_STARTING_ENERGY = 6
export const DEFAULT_STARTING_GOLD = 500

export const ENERGY_BALANCE = {
  wildBattleCost: 1,
  trainerBattleCost: 1,
  maxWarningAmount: 30,
  maxCapWarning: 50
}

export const BATTLE_REWARD_BALANCE = {
  baseExpYield: 54,
  trainerMultiplier: 1.12,
  participantTotalExpExponent: 0.7,
  underLevelBonusPerLevel: 0.08,
  overLevelPenaltyPerLevel: 0.04,
  maxLevelFactor: 1.45,
  minLevelFactor: 0.45,
  earlyWildExpBoostLevel5: 1.3,
  earlyWildExpBoostLevel7: 1.22,
  earlyWildExpBoostLevel9: 1.12,
  baseGold: 4,
  goldPerLevel: 1.15,
  trainerGoldMultiplier: 1.45,
  maxWildGold: 55,
  maxTrainerGold: 90
}

export const TRAINER_ROLE_BALANCE = {
  normal: {
    label: '普通训练家',
    fallbackTeamSize: 2,
    minTeamSize: 2,
    maxTeamSize: 3,
    levelOffset: 0,
    rewardMultiplier: 0.72,
    goldMultiplier: 1,
    goldCapMultiplier: 1,
    aiSkill: 0.5,
    switchChance: 0.08,
    switchScoreGap: 34,
    switchHpRatio: 0.26
  },
  lieutenant: {
    label: '部下训练家',
    fallbackTeamSize: 3,
    minTeamSize: 3,
    maxTeamSize: 4,
    levelOffset: 1,
    rewardMultiplier: 1.14,
    goldMultiplier: 1.25,
    goldCapMultiplier: 1.2,
    aiSkill: 0.72,
    switchChance: 0.18,
    switchScoreGap: 30,
    switchHpRatio: 0.34
  },
  boss: {
    label: 'Boss训练家',
    fallbackTeamSize: 5,
    minTeamSize: 5,
    maxTeamSize: 6,
    levelOffset: 2,
    rewardMultiplier: 1.5,
    goldMultiplier: 1.75,
    goldCapMultiplier: 1.8,
    aiSkill: 0.92,
    switchChance: 0.26,
    switchScoreGap: 24,
    switchHpRatio: 0.4
  },
  challenge: {
    label: '试炼守护者',
    fallbackTeamSize: 3,
    minTeamSize: 3,
    maxTeamSize: 6,
    levelOffset: 1,
    rewardMultiplier: 1.2,
    goldMultiplier: 1.35,
    goldCapMultiplier: 1.35,
    aiSkill: 0.78,
    switchChance: 0.2,
    switchScoreGap: 28,
    switchHpRatio: 0.36
  }
}

export const normalizeTrainerRole = (role) => {
  const normalized = typeof role === 'string' ? role.trim().toLowerCase() : ''
  if (normalized === 'boss') return 'boss'
  if (normalized === 'lieutenant' || normalized === 'subboss' || normalized === 'deputy') return 'lieutenant'
  if (normalized === 'challenge') return 'challenge'
  return 'normal'
}

export const getTrainerRoleBalance = (role = 'normal') => (
  TRAINER_ROLE_BALANCE[normalizeTrainerRole(role)] || TRAINER_ROLE_BALANCE.normal
)

export const CATCH_BALANCE = {
  baseRate: 5,
  hpMissingBonus: 62,
  hpMissingExponent: 1.18,
  mpMissingBonus: 6,
  maxRate: 92,
  minRate: 2,
  overLevelPenaltyPerLevel: 0.86,
  levelAdvantageBonusPerLevel: 0.02,
  maxLevelAdvantageBonus: 1.28,
  maxHighLevelPenalty: 0.34,
  weakSpeciesBonus: 1.1,
  strongSpeciesPenalty: 0.74,
  legendarySpeciesPenalty: 0.4,
  statusMultipliers: {
    sleep: 1.85,
    freeze: 1.85,
    paralysis: 1.35,
    burn: 1.2,
    poison: 1.2
  }
}

export const TEACHER_REWARD_GUARDRAILS = {
  goldWarningAmount: 1000,
  itemQuantityWarning: 50,
  largeExpPotionQuantityWarning: 6,
  expPotionTotalExpWarning: 900,
  pokemonLevelWarning: 30,
  energyWarningAmount: ENERGY_BALANCE.maxWarningAmount,
  maxEnergyWarning: ENERGY_BALANCE.maxCapWarning
}

export const GOLD_REWARD_PRESETS = [
  { label: '课堂鼓励', amount: 80, reason: '课堂表现奖励' },
  { label: '练习达标', amount: 150, reason: '练习达标奖励' },
  { label: '周任务', amount: 300, reason: '周任务奖励' }
]

export const ENERGY_REWARD_PRESETS = [
  { label: '短时游玩', amount: 3, reason: '课堂奖励能量' },
  { label: '一节课', amount: 6, reason: '本节课练习达标' },
  { label: '周奖励', amount: 10, reason: '周任务能量奖励' }
]

export const ITEM_REWARD_PRESETS = [
  {
    label: '捕捉包',
    itemType: 'pokeball',
    itemKey: 'pokeball_basic',
    quantity: 5,
    reason: '捕捉练习奖励'
  },
  {
    label: '回复包',
    itemType: 'potion',
    itemKey: 'super_potion',
    quantity: 3,
    reason: '探索补给奖励（好伤药）'
  },
  {
    label: '基础回复',
    itemType: 'potion',
    itemKey: 'potion',
    quantity: 5,
    reason: '基础探索补给（伤药）'
  },
  {
    label: '经验包',
    itemType: 'expPotion',
    itemKey: 'exp_potion_small',
    quantity: 3,
    reason: '学习成长奖励'
  }
]

export const getPlayerAverageLevel = (team, fallback = 5) => {
  if (!Array.isArray(team) || team.length === 0) return fallback
  const total = team.reduce((sum, mon) => sum + (Number(mon?.level) || fallback), 0)
  return total / team.length
}

export const isMapLockedForLevel = (mapConfig, playerLevel) => (
  Number(playerLevel) < Number(mapConfig?.recommendedLevel || 1) - MAP_UNDERLEVEL_MARGIN
)

export const getOfficialMediumFastTotalExp = (level) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1))
  return getOfficialTotalExpForLevel(safeLevel)
}

export const getExpToNextLevelOfficial = (level, pokemon = null) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1))
  if (safeLevel >= 100) return 0
  return getOfficialExpToNextLevel(safeLevel, pokemon)
}

export const getBattleEnergyCost = ({ battleKind = 'wild', mapLevel = 1 } = {}) => {
  return battleKind === 'trainer'
    ? ENERGY_BALANCE.trainerBattleCost
    : ENERGY_BALANCE.wildBattleCost
}

/** 战斗失败时扣除的金币（少量惩罚，随地图略增） */
export const DEFEAT_GOLD_PENALTY_BALANCE = {
  wildBase: 10,
  trainerBase: 18,
  maxWild: 28,
  maxTrainer: 45,
  mapLevelBonusEvery: 5,
  mapLevelBonusAmount: 2,
}

export const getDefeatGoldPenalty = ({ battleKind = 'wild', mapLevel = 1 } = {}) => {
  const level = Math.max(1, Number(mapLevel) || 1)
  const mapBonus = Math.floor((level - 1) / DEFEAT_GOLD_PENALTY_BALANCE.mapLevelBonusEvery)
    * DEFEAT_GOLD_PENALTY_BALANCE.mapLevelBonusAmount
  if (battleKind === 'trainer') {
    return Math.min(
      DEFEAT_GOLD_PENALTY_BALANCE.maxTrainer,
      DEFEAT_GOLD_PENALTY_BALANCE.trainerBase + mapBonus
    )
  }
  return Math.min(
    DEFEAT_GOLD_PENALTY_BALANCE.maxWild,
    DEFEAT_GOLD_PENALTY_BALANCE.wildBase + mapBonus
  )
}

export const calculateBattleRewards = ({
  defeatedMon,
  playerAverageLevel = 5,
  battleKind = 'wild',
  participants = 1,
  trainerRole = 'normal'
} = {}) => {
  if (!defeatedMon) return { exp: 0, gold: 0 }

  const enemyLevel = Math.max(1, Number(defeatedMon.level) || 1)
  const avgLevel = Math.max(1, Number(playerAverageLevel) || 1)
  const levelDelta = enemyLevel - avgLevel
  const levelFactor = Math.max(
    BATTLE_REWARD_BALANCE.minLevelFactor,
    Math.min(
      BATTLE_REWARD_BALANCE.maxLevelFactor,
      1 + levelDelta * (levelDelta >= 0
        ? BATTLE_REWARD_BALANCE.underLevelBonusPerLevel
        : BATTLE_REWARD_BALANCE.overLevelPenaltyPerLevel)
    )
  )
  const trainerRoleBalance = getTrainerRoleBalance(trainerRole)
  const trainerMultiplier = battleKind === 'trainer'
    ? BATTLE_REWARD_BALANCE.trainerMultiplier * trainerRoleBalance.rewardMultiplier
    : 1
  const earlyWildExpMultiplier = battleKind !== 'wild'
    ? 1
    : avgLevel <= 5
      ? BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel5
      : avgLevel <= 7
        ? BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel7
        : avgLevel <= 9
          ? BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel9
          : 1
  const participantFactor = Math.max(1, Math.min(3, Number(participants) || 1))
  const baseExpYield = getOfficialBaseExperience(defeatedMon) || BATTLE_REWARD_BALANCE.baseExpYield

  const exp = Math.max(
    4,
    Math.round(
      baseExpYield *
      enemyLevel /
      7 *
      levelFactor *
      trainerMultiplier *
      earlyWildExpMultiplier *
      Math.pow(participantFactor, BATTLE_REWARD_BALANCE.participantTotalExpExponent)
    )
  )

  const goldCap = battleKind === 'trainer'
    ? Math.round(BATTLE_REWARD_BALANCE.maxTrainerGold * trainerRoleBalance.goldCapMultiplier)
    : BATTLE_REWARD_BALANCE.maxWildGold
  const gold = Math.max(
    2,
    Math.min(
      goldCap,
      Math.round(
        (BATTLE_REWARD_BALANCE.baseGold + enemyLevel * BATTLE_REWARD_BALANCE.goldPerLevel) *
        (battleKind === 'trainer'
          ? BATTLE_REWARD_BALANCE.trainerGoldMultiplier * trainerRoleBalance.goldMultiplier
          : 1)
      )
    )
  )

  return { exp, gold }
}

export const calculateCatchRate = ({ target, ballMultiplier = 1, playerAverageLevel = 5 }) => {
  if (!target) return 0

  const maxHp = Math.max(1, Number(target.maxHp) || 1)
  const currentHp = Math.max(0, Math.min(maxHp, Number(target.currentHp ?? target.hp ?? maxHp) || 0))
  const maxMp = Math.max(0, Number(target.maxMp) || 0)
  const currentMp = Math.max(0, Math.min(maxMp, Number(target.currentMp ?? target.mp ?? maxMp) || 0))
  const targetLevel = Math.max(1, Math.min(100, Number(target.level) || 1))
  const avgLevel = Math.max(1, Number(playerAverageLevel) || 1)
  const safeBallMultiplier = Math.max(0.1, Number(ballMultiplier) || 1)
  const hpMissingRatio = maxHp > 0
    ? (maxHp - currentHp) / maxHp
    : 0
  const mpMissingRatio = maxMp > 0
    ? (maxMp - currentMp) / maxMp
    : 0

  let catchRate = (
    CATCH_BALANCE.baseRate +
    Math.pow(Math.max(0, hpMissingRatio), CATCH_BALANCE.hpMissingExponent) * CATCH_BALANCE.hpMissingBonus +
    Math.max(0, mpMissingRatio) * CATCH_BALANCE.mpMissingBonus
  ) * safeBallMultiplier

  const statusMultiplier = CATCH_BALANCE.statusMultipliers[target.status] || 1
  catchRate *= statusMultiplier

  const levelRatio = (targetLevel - 1) / 99
  const highLevelPenalty = 1 - Math.pow(levelRatio, 1.18) * CATCH_BALANCE.maxHighLevelPenalty
  catchRate *= Math.max(1 - CATCH_BALANCE.maxHighLevelPenalty, highLevelPenalty)

  const speciesPowerMultiplier = getCatchSpeciesPowerMultiplier(target)
  catchRate *= speciesPowerMultiplier

  const overLevel = targetLevel - avgLevel - WILD_CAPTURE_LEVEL_MARGIN
  if (overLevel > 0) {
    catchRate *= Math.pow(CATCH_BALANCE.overLevelPenaltyPerLevel, overLevel)
  } else if (overLevel < 0) {
    const levelAdvantage = Math.min(
      CATCH_BALANCE.maxLevelAdvantageBonus,
      1 + Math.abs(overLevel) * CATCH_BALANCE.levelAdvantageBonusPerLevel
    )
    catchRate *= levelAdvantage
  }

  return Math.max(CATCH_BALANCE.minRate, Math.min(CATCH_BALANCE.maxRate, catchRate))
}

const getBaseMonsterForCatch = (target) => {
  const baseId = Number(target?.baseId)
  const dexNo = Number(target?.dexNo ?? target?.pokedexId)
  return MONSTERS.find((monster) => (
    (Number.isInteger(baseId) && monster.id === baseId) ||
    (Number.isInteger(dexNo) && (monster.dexNo === dexNo || monster.pokedexId === dexNo)) ||
    (target?.name && monster.name === target.name)
  )) || null
}

const getCatchSpeciesPowerMultiplier = (target) => {
  const baseMonster = getBaseMonsterForCatch(target)
  const statsSource = baseMonster || target
  const statTotal = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
    .reduce((sum, stat) => sum + (Number(statsSource?.[stat]) || 0), 0)

  if (statTotal >= 580) return CATCH_BALANCE.legendarySpeciesPenalty
  if (statTotal >= 520) return CATCH_BALANCE.strongSpeciesPenalty
  if (statTotal <= 330) return CATCH_BALANCE.weakSpeciesBonus
  return 1 - ((statTotal - 330) / 190) * (1 - CATCH_BALANCE.strongSpeciesPenalty)
}

export const getCatchLevelWarning = (target, playerAverageLevel) => {
  if (!target) return ''
  const overLevel = Number(target.level || 1) - Number(playerAverageLevel || 1) - WILD_CAPTURE_LEVEL_MARGIN
  return overLevel > 0 ? '对方等级明显更高，捕捉成功率被降低。' : ''
}

export const getCatchAttemptWarning = (target, playerAverageLevel) => {
  if (!target) return ''
  const warnings = []
  const maxHp = Math.max(1, Number(target.maxHp) || 1)
  const currentHp = Math.max(0, Math.min(maxHp, Number(target.currentHp ?? target.hp ?? maxHp) || 0))
  const hpRatio = currentHp / maxHp

  if (hpRatio > 0.75) {
    warnings.push('对方体力还很充足，捕捉率很低；先削弱到黄血或红血更稳。')
  }

  if (!target.status && hpRatio > 0.35) {
    warnings.push('让对方睡眠、冰冻或麻痹会明显提高捕捉率。')
  }

  const levelWarning = getCatchLevelWarning(target, playerAverageLevel)
  if (levelWarning) warnings.push(levelWarning)

  return warnings.join(' ')
}

export const getGoldRewardWarning = (amount) => {
  const value = Number(amount)
  if (value >= TEACHER_REWARD_GUARDRAILS.goldWarningAmount) {
    return `本次金币数量较高（${value}），可能快速推高学生成长节奏。`
  }
  return ''
}

export const getItemRewardWarning = ({ itemKey, quantity }) => {
  const value = Number(quantity)
  const expPotion = EXP_POTIONS[itemKey]
  if (expPotion) {
    const totalExp = Math.max(0, (Number(expPotion.expAmount) || 0) * Math.max(0, value || 0))
    if (itemKey === 'exp_potion_large' && value >= TEACHER_REWARD_GUARDRAILS.largeExpPotionQuantityWarning) {
      return `大经验药水数量较高（${value}），可能让学生快速跨过多个等级段。`
    }
    if (totalExp >= TEACHER_REWARD_GUARDRAILS.expPotionTotalExpWarning) {
      return `经验药水总经验较高（${totalExp}），可能明显推快成长节奏。`
    }
  }
  if (value >= TEACHER_REWARD_GUARDRAILS.itemQuantityWarning) {
    return `道具数量较高（${value}），请确认这是本次课堂需要的奖励。`
  }
  return ''
}

export const getPokemonRewardWarning = (level) => {
  const value = Number(level)
  if (value >= TEACHER_REWARD_GUARDRAILS.pokemonLevelWarning) {
    return `宝可梦等级较高（Lv.${value}），可能直接跳过前中期挑战。`
  }
  return ''
}

export const getEnergyRewardWarning = (amount) => {
  const value = Number(amount)
  if (value >= TEACHER_REWARD_GUARDRAILS.energyWarningAmount) {
    return `本次能量较高（${value}），按当前规则约等于 ${value} 场战斗次数。`
  }
  return ''
}

export const getMaxEnergyWarning = (maxEnergy) => {
  const value = Number(maxEnergy)
  if (value >= TEACHER_REWARD_GUARDRAILS.maxEnergyWarning) {
    return `能量上限较高（${value}），按当前规则可连续进行约 ${value} 场战斗。`
  }
  return ''
}
