import { MOVES } from './gameData.js'
import { getOfficialLearnLevelByMove } from './officialLearnsets.js'
import { getLevelOnlyEvolutionTargetLevel } from './pokemonEvolutionRules.js'

const isEnabledEvolutionBranch = (branch) => Boolean(branch) && branch.disabled !== true

const getEvolutionBranches = (baseMonster) => [
  baseMonster?.evolvesTo,
  ...(Array.isArray(baseMonster?.alternateEvolutions) ? baseMonster.alternateEvolutions : []),
].filter(isEnabledEvolutionBranch)

const getConfiguredEvolutionLevel = (baseMonster, evolution) => {
  if (!baseMonster || !evolution) return null

  if (Number.isInteger(Number(evolution.level))) {
    return Number(evolution.level)
  }

  return getLevelOnlyEvolutionTargetLevel(baseMonster.id, evolution.targetId)
}

/**
 * 宝可梦成长工具
 * - getMovesLearnedAtLevel: 查询某等级应习得的技能
 * - getEvolutionAtLevel:    查询某等级是否触发进化
 */

/**
 * 返回 baseMonster 在 level 时应习得的技能 key 数组。
 * learnset 格式：{ [level: number]: moveKey }
 */
const getLocalLearnLevelByMove = (baseMonster) => {
  const levels = {}
  for (const [levelKey, moveEntry] of Object.entries(baseMonster?.learnset || {})) {
    const learnLevel = Number(levelKey)
    const moveKeys = Array.isArray(moveEntry) ? moveEntry : [moveEntry]
    for (const moveKey of moveKeys) {
      if (!MOVES[moveKey] || !Number.isInteger(learnLevel)) continue
      levels[moveKey] = Math.min(levels[moveKey] ?? learnLevel, learnLevel)
    }
  }
  return levels
}

const getSupplementalLearnLevelByMove = (baseMonster) => {
  const levels = {}
  for (const [levelKey, moveEntry] of Object.entries(baseMonster?.supplementalLearnset || {})) {
    const learnLevel = Number(levelKey)
    const moveKeys = Array.isArray(moveEntry) ? moveEntry : [moveEntry]
    for (const moveKey of moveKeys) {
      if (!MOVES[moveKey] || !Number.isInteger(learnLevel)) continue
      levels[moveKey] = Math.min(levels[moveKey] ?? learnLevel, learnLevel)
    }
  }
  return levels
}

const getLearnLevelByMove = (baseMonster) => {
  const officialLearnLevelByMove = getOfficialLearnLevelByMove(baseMonster)
  if (Object.keys(officialLearnLevelByMove).length > 0) {
    return officialLearnLevelByMove
  }
  return {
    ...getLocalLearnLevelByMove(baseMonster),
    ...getSupplementalLearnLevelByMove(baseMonster),
  }
}

export function getMovesLearnedAtLevel(baseMonster, level) {
  const safeLevel = Number(level)
  const learnLevelByMove = getLearnLevelByMove(baseMonster)
  const explicitMoves = Object.entries(learnLevelByMove)
    .filter(([, lvl]) => Number(lvl) === safeLevel)
    .map(([moveKey]) => moveKey)
  const explicitMoveKeys = new Set(Object.keys(learnLevelByMove))
  const shouldUseLegacyUnlockLevels = explicitMoveKeys.size === 0
  const levelUnlockedMoves = shouldUseLegacyUnlockLevels ? (baseMonster?.moves || [])
    .filter((moveKey) => (
      !explicitMoveKeys.has(moveKey) &&
      MOVES[moveKey] &&
      MOVES[moveKey].cost !== 0 &&
      MOVES[moveKey].unlockLevel === safeLevel
    )) : []
  return [...new Set([...explicitMoves, ...levelUnlockedMoves])]
}

export function getEvolutionLevelForBranch(baseMonster, evolution) {
  return getConfiguredEvolutionLevel(baseMonster, evolution)
}

export function getEvolutionTargetsAtLevel(baseMonster, level) {
  const safeLevel = Number(level)
  if (!Number.isInteger(safeLevel)) return []

  return getEvolutionBranches(baseMonster)
    .filter((evolution) => getConfiguredEvolutionLevel(baseMonster, evolution) === safeLevel)
    .map((evolution) => Number(evolution.targetId))
    .filter((targetId, index, allTargetIds) => Number.isInteger(targetId) && allTargetIds.indexOf(targetId) === index)
}

export function getEvolutionDueByLevel(baseMonster, level) {
  const safeLevel = Number(level)
  if (!Number.isInteger(safeLevel)) return null

  const dueBranches = getEvolutionBranches(baseMonster)
    .map((evolution) => ({
      evolution,
      level: getConfiguredEvolutionLevel(baseMonster, evolution),
    }))
    .filter(({ level: evolutionLevel }) => (
      Number.isInteger(evolutionLevel) &&
      evolutionLevel <= safeLevel
    ))

  if (dueBranches.length === 0) return null

  const dueLevel = Math.min(...dueBranches.map(({ level: evolutionLevel }) => evolutionLevel))
  const targetIds = dueBranches
    .filter(({ level: evolutionLevel }) => evolutionLevel === dueLevel)
    .map(({ evolution }) => Number(evolution.targetId))
    .filter((targetId, index, allTargetIds) => Number.isInteger(targetId) && allTargetIds.indexOf(targetId) === index)

  return targetIds.length > 0 ? { level: dueLevel, targetIds } : null
}

/**
 * 若 baseMonster 在 level 时进化，返回目标的游戏 id（MONSTERS 中的 id）；否则返回 null。
 * evolvesTo 格式：{ level: number, targetId: number }
 */
export function getEvolutionAtLevel(baseMonster, level) {
  return getEvolutionTargetsAtLevel(baseMonster, level)[0] ?? null
}
