export const OFFICIAL_STAT_KEYS = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']

const safeBaseStat = (value) => Number(value) || 0

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
  const earlyGameFloor = 18
  const baseContribution = safeBaseMp * 0.18
  const levelGrowth = safeLevel * (0.35 + safeBaseMp / 320)
  return Math.max(earlyGameFloor, Math.floor(18 + baseContribution + levelGrowth))
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
