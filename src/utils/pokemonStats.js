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
