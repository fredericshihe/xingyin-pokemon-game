export const OFFICIAL_STAT_KEYS = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']

export const STAT_BOOST_FIELD_ALIASES = {
  hp: 'maxHp',
  maxHp: 'maxHp',
  attack: 'atk',
  atk: 'atk',
  defense: 'def',
  def: 'def',
  spAttack: 'spAtk',
  spAtk: 'spAtk',
  specialAttack: 'spAtk',
  spDefense: 'spDef',
  spDef: 'spDef',
  specialDefense: 'spDef',
  speed: 'spd',
  spd: 'spd',
}

const safeBaseStat = (value) => Number(value) || 0

export const resolveBaseStatBoostKey = (stat) => (
  STAT_BOOST_FIELD_ALIASES[stat] || null
)

export const normalizeBaseStatBoosts = (boosts = {}) => {
  if (!boosts || typeof boosts !== 'object') return {}
  return Object.entries(boosts).reduce((acc, [stat, value]) => {
    const key = resolveBaseStatBoostKey(stat)
    const amount = Math.max(0, Math.trunc(Number(value) || 0))
    if (!key || amount <= 0) return acc
    acc[key] = (acc[key] || 0) + amount
    return acc
  }, {})
}

export const STAT_GEM_TOTAL_LIMIT = 10
export const STAT_GEM_PER_STAT_LIMIT = 4
export const STAT_GEM_RULE_TEXT = '每只最多10颗，同一项最多4颗；战斗外使用'

// Old bonuses have mixed sources and amounts. Never infer usage from statBoosts.
export const normalizeStatGemUses = (uses = {}) => Object.fromEntries(
  OFFICIAL_STAT_KEYS.flatMap((key) => {
    const amount = Number(uses?.[key])
    return Number.isSafeInteger(amount) && amount > 0 ? [[key, amount]] : []
  })
)

export const getStatGemUsage = (monster, item) => {
  const statKey = item?.effect === 'stat_boost' ? resolveBaseStatBoostKey(item.stat) : null
  if (!statKey) return null
  const uses = normalizeStatGemUses(monster?.statGemUses)
  const total = Object.values(uses).reduce((sum, count) => sum + count, 0)
  const statCount = uses[statKey] || 0
  const remaining = Math.max(0, Math.min(STAT_GEM_TOTAL_LIMIT - total, STAT_GEM_PER_STAT_LIMIT - statCount))
  return {
    statKey, uses, total, statCount, remaining, canUse: remaining > 0,
    message: total >= STAT_GEM_TOTAL_LIMIT
      ? '这只宝可梦已用满10颗宝石。'
      : statCount >= STAT_GEM_PER_STAT_LIMIT ? '这一项已用满4颗宝石。' : '',
  }
}

export const prepareStatBoostItemUse = (monster, item) => {
  const amount = Math.trunc(Number(item?.boostAmount))
  const usage = getStatGemUsage(monster, item)
  if (!Number.isSafeInteger(amount) || amount <= 0 || (!usage && item?.effect !== 'stat_boost_all')) {
    return { success: false, message: '属性提升道具无效。' }
  }
  if (usage && !usage.canUse) return { success: false, message: usage.message }
  const statBoosts = { ...normalizeBaseStatBoosts(monster?.statBoosts) }
  const statGemUses = { ...normalizeStatGemUses(monster?.statGemUses) }
  const keys = usage ? [usage.statKey] : OFFICIAL_STAT_KEYS
  keys.forEach((key) => { statBoosts[key] = (statBoosts[key] || 0) + amount })
  if (usage) statGemUses[usage.statKey] = usage.statCount + 1
  return { success: true, statBoosts, statGemUses }
}

export const applyBaseStatBoosts = (baseStats = {}, boosts = {}) => {
  const normalizedBoosts = normalizeBaseStatBoosts(boosts)
  return {
    ...baseStats,
    ...OFFICIAL_STAT_KEYS.reduce((acc, statKey) => {
      const current = safeBaseStat(baseStats?.[statKey])
      const boost = Math.max(0, Number(normalizedBoosts[statKey]) || 0)
      acc[statKey] = current + boost
      return acc
    }, {}),
  }
}

export const calculateOfficialHpStat = (baseHp, level, { iv = 0, ev = 0 } = {}) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1))
  return Math.floor(((2 * safeBaseStat(baseHp) + iv + Math.floor(ev / 4)) * safeLevel) / 100) + safeLevel + 10
}

export const calculateOfficialBattleStat = (baseStat, level, { iv = 0, ev = 0, nature = 1 } = {}) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1))
  const raw = Math.floor(((2 * safeBaseStat(baseStat) + iv + Math.floor(ev / 4)) * safeLevel) / 100) + 5
  return Math.floor(raw * nature)
}

export const calculateProjectMpStat = (baseMp, level) => {
  const safeLevel = Math.max(1, Math.min(100, Number(level) || 1))
  const safeBaseMp = safeBaseStat(baseMp)
  const earlyGameFloor = 24
  const baseContribution = safeBaseMp * 0.24
  const levelGrowth = safeLevel * (0.45 + safeBaseMp / 280)
  return Math.max(earlyGameFloor, Math.floor(22 + baseContribution + levelGrowth))
}

export const calculateStatsForLevel = (baseStats, level) => ({
  maxHp: Math.max(1, calculateOfficialHpStat(baseStats?.maxHp, level)),
  maxMp: calculateProjectMpStat(baseStats?.maxMp, level),
  atk: calculateOfficialBattleStat(baseStats?.atk, level),
  def: calculateOfficialBattleStat(baseStats?.def, level),
  spAtk: calculateOfficialBattleStat(baseStats?.spAtk, level),
  spDef: calculateOfficialBattleStat(baseStats?.spDef, level),
  spd: calculateOfficialBattleStat(baseStats?.spd, level),
})
