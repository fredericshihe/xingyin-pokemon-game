import { MONSTERS } from './gameData.js'
import { getEvolutionLevelForBranch } from './pokemonGrowth.js'

/**
 * 计算某物种在野外可出现的等级区间（等级必须与进化阶段一致）
 * - 有前置进化：等级 >= 进化所需等级
 * - 有等级进化：等级 < 进化等级
 */
export function getSpeciesLevelBounds(monsterId) {
  const monster = MONSTERS.find((m) => m.id === monsterId)
  if (!monster) return { min: 1, max: 100 }

  let minLevel = 1
  for (const candidate of MONSTERS) {
    const evolutions = [
      candidate.evolvesTo,
      ...(candidate.alternateEvolutions || []),
    ].filter(Boolean)
    for (const evolution of evolutions) {
      const evolutionLevel = getEvolutionLevelForBranch(candidate, evolution)
      if (evolutionLevel && evolution.targetId === monsterId) {
        minLevel = Math.max(minLevel, evolutionLevel)
      }
    }
  }

  let maxLevel = 100
  const ownEvolutionLevels = [
    monster.evolvesTo,
    ...(monster.alternateEvolutions || []),
  ]
    .map((evolution) => getEvolutionLevelForBranch(monster, evolution))
    .filter((level) => level != null && Number.isInteger(Number(level)))

  if (ownEvolutionLevels.length > 0) {
    maxLevel = Math.min(...ownEvolutionLevels) - 1
  }

  return { min: minLevel, max: maxLevel }
}

/** 该等级是否允许出现此形态 */
export function isLevelValidForSpecies(monsterId, level) {
  const { min, max } = getSpeciesLevelBounds(monsterId)
  return level >= min && level <= max
}

function pickLevelInRange(min, max, { bias = 'uniform' } = {}) {
  if (min >= max) return min
  const span = max - min
  if (bias === 'wild') {
    const roll = Math.random() < 0.18
      ? Math.max(Math.random(), Math.random())
      : Math.min(Math.random(), Math.random())
    return min + Math.min(span, Math.floor(roll * (span + 1)))
  }
  return min + Math.floor(Math.random() * (span + 1))
}

/** 在表格等级范围内，为物种抽取合法等级；不合法则返回 null */
export function pickLevelForSpecies(monsterId, tableMinLevel, tableMaxLevel, options = {}) {
  const bounds = getSpeciesLevelBounds(monsterId)
  const min = Math.max(bounds.min, tableMinLevel)
  const max = Math.min(bounds.max, tableMaxLevel)
  if (min > max) return null
  return pickLevelInRange(min, max, options)
}

/**
 * 从遇敌表抽取：物种 + 与形态匹配的等级
 * @returns {{ id: number, level: number } | null}
 */
export function pickWildEncounter(table) {
  if (!table?.pokemon?.length) return null

  const rows = table.pokemon.filter((row) => {
    const level = pickLevelForSpecies(row.id, row.minLevel, row.maxLevel)
    return level !== null
  })
  if (!rows.length) return null

  const total = rows.reduce((sum, row) => sum + row.weight, 0)
  let roll = Math.random() * total
  for (const row of rows) {
    roll -= row.weight
    if (roll <= 0) {
      const level = pickLevelForSpecies(row.id, row.minLevel, row.maxLevel, { bias: 'wild' })
      if (level !== null) return { id: row.id, level }
    }
  }

  const fallback = rows[0]
  const level = pickLevelForSpecies(fallback.id, fallback.minLevel, fallback.maxLevel, { bias: 'wild' })
  return level !== null ? { id: fallback.id, level } : null
}
