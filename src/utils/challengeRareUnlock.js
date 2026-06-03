import { getEvolutionFamilyKey, resolveSpeciesForLevelWithVariety } from './pokemonFamilyVariety.js'
import { isLevelValidForSpecies } from './wildEncounterRules.js'

export const CHALLENGE_RARE_UNLOCK_STAGE_COUNT = 4
export const CHALLENGE_BATTLE_GROUP_SIZES = [3, 4, 5, 6]
export const MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE = 2

export function getChallengeBattleGroupIndex(completedStage = 0) {
  const stage = Math.max(0, Math.trunc(Number(completedStage)) || 0)
  return Math.min(CHALLENGE_BATTLE_GROUP_SIZES.length - 1, stage)
}

export function getChallengeBattleGroupSize(completedStage = 0) {
  return CHALLENGE_BATTLE_GROUP_SIZES[getChallengeBattleGroupIndex(completedStage)]
}

export function normalizeChallengeRarePool(pool) {
  if (!Array.isArray(pool)) return []
  return pool
    .map((entry, index) => {
      const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
      if (!Number.isInteger(pokemonId)) return null
      const normalized = {
        pokemonId,
        weight: Math.max(1, Math.trunc(Number(entry?.weight ?? Math.max(5, 18 - index))) || 1)
      }
      const minLevel = Math.trunc(Number(entry?.minLevel))
      const maxLevel = Math.trunc(Number(entry?.maxLevel))
      if (Number.isInteger(minLevel)) normalized.minLevel = minLevel
      if (Number.isInteger(maxLevel)) normalized.maxLevel = maxLevel
      return normalized
    })
    .filter(Boolean)
}

export function getChallengeRareUnlockStageCount(poolSize) {
  const total = Math.max(0, Math.trunc(Number(poolSize)) || 0)
  if (total <= 0) return 0
  if (total < MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE) return 1
  return Math.min(
    CHALLENGE_RARE_UNLOCK_STAGE_COUNT,
    Math.max(1, Math.floor(total / MIN_CHALLENGE_RARE_UNLOCK_BATCH_SIZE))
  )
}

function getChallengeRareUnlockBatchSizes(poolSize) {
  const total = Math.max(0, Math.trunc(Number(poolSize)) || 0)
  const stageCount = getChallengeRareUnlockStageCount(total)
  if (stageCount <= 0) return []
  const baseSize = Math.floor(total / stageCount)
  const extraCount = total % stageCount
  return Array.from({ length: stageCount }, (_, index) => (
    baseSize + (index >= stageCount - extraCount ? 1 : 0)
  ))
}

export function getChallengeRareUnlockedCountForStage(poolSize, stage) {
  const total = Math.max(0, Math.trunc(Number(poolSize)) || 0)
  if (total <= 0) return 0
  const stageCount = getChallengeRareUnlockStageCount(total)
  const safeStage = Math.max(0, Math.min(stageCount, Math.trunc(Number(stage)) || 0))
  if (safeStage <= 0) return 0
  if (safeStage >= stageCount) return total
  return getChallengeRareUnlockBatchSizes(total)
    .slice(0, safeStage)
    .reduce((sum, batchSize) => sum + batchSize, 0)
}

export function getChallengeRareUnlockBatch(pool, completedStage = 0) {
  const entries = normalizeChallengeRarePool(pool)
  const stage = Math.max(0, Math.trunc(Number(completedStage)) || 0)
  const start = getChallengeRareUnlockedCountForStage(entries.length, stage)
  const end = getChallengeRareUnlockedCountForStage(entries.length, stage + 1)
  return entries.slice(start, end)
}

function rotateEntries(entries, start) {
  if (!Array.isArray(entries) || entries.length === 0) return []
  const offset = Math.max(0, Math.trunc(Number(start)) || 0) % entries.length
  return [...entries.slice(offset), ...entries.slice(0, offset)]
}

function uniqueEntriesByPokemonId(entries = []) {
  const seen = new Set()
  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const pokemonId = Math.trunc(Number(entry?.pokemonId))
    if (!Number.isInteger(pokemonId) || seen.has(pokemonId)) return false
    seen.add(pokemonId)
    return true
  })
}

function normalizeTeamEntries(teamConfig = []) {
  if (!Array.isArray(teamConfig)) return []
  return teamConfig
    .map((entry) => {
      const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
      const level = Math.trunc(Number(entry?.level))
      if (!Number.isInteger(pokemonId) || !Number.isInteger(level)) return null
      return { pokemonId, level }
    })
    .filter(Boolean)
}

function clampLevel(level, fallback = 5) {
  const safe = Math.trunc(Number(level))
  if (!Number.isInteger(safe)) return Math.max(1, Math.min(100, fallback))
  return Math.max(1, Math.min(100, safe))
}

function isBatchFamilyMember(pokemonId, batchEntries = []) {
  const safeId = Math.trunc(Number(pokemonId))
  if (!Number.isInteger(safeId)) return false
  const familyKey = getEvolutionFamilyKey(safeId)
  if (!familyKey) {
    return batchEntries.some((entry) => entry.pokemonId === safeId)
  }
  return batchEntries.some((entry) => getEvolutionFamilyKey(entry.pokemonId) === familyKey)
}

/**
 * Build the challenge guardian team for the unlock progress at `unlockStage`.
 * The exact reward batch stays separate; battle teams use the cumulative guardian
 * pool so repeat trials can grow without duplicating species too early.
 */
export function buildChallengeBattleTeamFromUnlockBatch({
  challengeRarePool = [],
  baseTeam = [],
  unlockStage = 0,
  targetSize = 3,
  bounds = { minLevel: 1, maxLevel: 100 },
  victoryBonus = 0
} = {}) {
  const baseEntries = normalizeTeamEntries(baseTeam)
  const fullPool = normalizeChallengeRarePool(challengeRarePool)
  const safeTargetSize = Math.max(0, Math.trunc(Number(targetSize)) || 0)
  const groupStage = getChallengeBattleGroupIndex(unlockStage)
  const batch = getChallengeRareUnlockBatch(fullPool, groupStage)
  const cumulativeEnd = Math.max(
    getChallengeRareUnlockedCountForStage(fullPool.length, groupStage + 1),
    safeTargetSize
  )
  const cumulativePool = fullPool.slice(0, Math.min(fullPool.length, cumulativeEnd))
  const speciesSource = uniqueEntriesByPokemonId([
    ...batch,
    ...cumulativePool,
    ...fullPool
  ])
  if (safeTargetSize <= 0 || speciesSource.length === 0) return baseEntries

  const usedSpeciesIds = new Set()
  const usedFamilyKeys = new Set()

  return Array.from({ length: safeTargetSize }, (_, index) => {
    const baseEntry = baseEntries[index % Math.max(1, baseEntries.length)] || null
    const fallbackLevel = bounds.minLevel + Math.floor(index / 2)
    const addMemberLevelBonus = index >= baseEntries.length ? Math.floor(index / 2) : 0
    const targetLevel = Math.max(
      bounds.minLevel,
      Math.min(
        bounds.maxLevel,
        clampLevel((baseEntry?.level ?? fallbackLevel) + victoryBonus + addMemberLevelBonus, fallbackLevel)
      )
    )
    const orderedBatch = rotateEntries(speciesSource, index)
    const localPoolIds = speciesSource.map((entry) => entry.pokemonId).filter(Number.isInteger)
    const preferredIds = orderedBatch.map((entry) => entry.pokemonId).filter(Number.isInteger)
    let pokemonId = resolveSpeciesForLevelWithVariety({
      preferredIds,
      level: targetLevel,
      localPoolIds,
      usedSpeciesIds,
      usedFamilyKeys
    })
    if (!pokemonId) {
      pokemonId = resolveSpeciesForLevelWithVariety({
        preferredIds: localPoolIds,
        level: targetLevel,
        localPoolIds,
        usedSpeciesIds: new Set(),
        usedFamilyKeys: new Set()
      })
    }
    if (!pokemonId) {
      pokemonId = speciesSource[0]?.pokemonId
    }
    if (!isBatchFamilyMember(pokemonId, speciesSource)) {
      pokemonId = speciesSource[0]?.pokemonId
    }
    if (Number.isInteger(pokemonId)) {
      usedSpeciesIds.add(pokemonId)
      const familyKey = getEvolutionFamilyKey(pokemonId)
      if (familyKey.length > 0) usedFamilyKeys.add(familyKey)
    }
    return {
      pokemonId: pokemonId || speciesSource[0]?.pokemonId,
      level: targetLevel
    }
  }).filter((entry) => (
    Number.isInteger(entry.pokemonId) &&
    isBatchFamilyMember(entry.pokemonId, speciesSource) &&
    isLevelValidForSpecies(entry.pokemonId, entry.level)
  ))
}
