import { MONSTERS } from './gameData'
import { getTrainerRoleBalance, normalizeTrainerRole } from './gameBalance'
import { isLevelValidForSpecies } from './wildEncounterRules'
import {
  buildChallengeBattleTeamFromUnlockBatch,
  getChallengeBattleGroupSize
} from './challengeRareUnlock.js'
import { getEvolutionFamilyKey, resolveSpeciesForLevelWithVariety } from './pokemonFamilyVariety.js'

const ROLE_VARIANT_RULES = {
  normal: {
    mapCapBonus: 0,
    bossCapMargin: 3,
    victoryStepEvery: 1,
    levelJitter: 1,
    speciesSwapChance: 0.45,
    extraTeamChance: 0.22,
    extraTeamVictoryFloor: 2,
    bossCandidateCount: 0
  },
  lieutenant: {
    mapCapBonus: 2,
    bossCapMargin: 1,
    victoryStepEvery: 1,
    levelJitter: 1,
    speciesSwapChance: 0.52,
    extraTeamChance: 0.34,
    extraTeamVictoryFloor: 1,
    bossCandidateCount: 2
  },
  minigame: {
    mapCapBonus: 36,
    bossCapMargin: 2,
    maxLevelCap: 80,
    victoryStepEvery: 1,
    levelJitter: 0,
    speciesSwapChance: 1,
    extraTeamChance: 0,
    extraTeamVictoryFloor: Infinity,
    bossCandidateCount: 0
  },
  challenge: {
    mapCapBonus: 3,
    bossCapMargin: 0,
    victoryStepEvery: 1,
    levelJitter: 1,
    speciesSwapChance: 0.6,
    extraTeamChance: 0.42,
    extraTeamVictoryFloor: 1,
    bossCandidateCount: 4
  },
  boss: {
    mapCapBonus: 3,
    bossCapMargin: 0,
    victoryStepEvery: 999,
    levelJitter: 0,
    speciesSwapChance: 0,
    extraTeamChance: 0,
    extraTeamVictoryFloor: Infinity,
    bossCandidateCount: 0
  }
}

const ROLE_PLAYER_CATCH_UP_RULES = {
  normal: {
    overlevelFactor: 0.75,
    maxBonus: 4
  },
  lieutenant: {
    overlevelFactor: 0,
    maxBonus: 0
  },
  minigame: {
    overlevelFactor: 0.35,
    maxBonus: 2
  },
  challenge: {
    overlevelFactor: 0,
    maxBonus: 0
  },
  boss: {
    overlevelFactor: 0,
    maxBonus: 0
  }
}

export const TERMINAL_BOSS_EXCLUSIVE_POKEMON_IDS = new Set([
  68 // 超梦：只由星雾高地最终 Boss 带出，击败后再进入专属稀有生态。
])

const clampLevel = (level, fallback = 1) => {
  const normalized = Math.trunc(Number(level))
  return Math.max(1, Math.min(100, Number.isFinite(normalized) ? normalized : fallback))
}

const hashStringToUint32 = (value) => {
  const text = String(value ?? '')
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createSeededRandom = (seed) => {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let next = state
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

const randomInt = (random, min, max) => {
  const safeMin = Math.trunc(Number(min))
  const safeMax = Math.trunc(Number(max))
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || safeMax <= safeMin) return safeMin
  return safeMin + Math.floor(random() * (safeMax - safeMin + 1))
}

const normalizeMapBounds = (mapConfig = {}) => {
  const recommended = clampLevel(mapConfig?.recommendedLevel ?? 5, 5)
  const mapMinLevel = clampLevel(mapConfig?.minLevel ?? Math.max(1, recommended - 3), Math.max(1, recommended - 3))
  const maxLevel = Math.max(
    mapMinLevel,
    clampLevel(mapConfig?.maxLevel ?? recommended + 3, recommended + 3)
  )
  return { mapMinLevel, maxLevel, recommendedLevel: recommended }
}

const isProgressiveRepeatableTrainerBattle = (eventType, role) => (
  eventType === 'trainer' && normalizeTrainerRole(role) === 'minigame'
)

const normalizeTeamConfig = (teamConfig = []) => (
  Array.isArray(teamConfig)
    ? teamConfig
      .map((entry) => {
        const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id))
        const level = clampLevel(entry?.level, 1)
        if (!Number.isInteger(pokemonId) || !MONSTERS.some((monster) => monster.id === pokemonId)) return null
        const rewardLevel = Math.trunc(Number(entry?.rewardLevel))
        return {
          pokemonId,
          level,
          ...(Number.isInteger(rewardLevel) ? { rewardLevel: clampLevel(rewardLevel, level) } : {})
        }
      })
      .filter(Boolean)
    : []
)

const normalizeChallengeBattleGroups = (groups = []) => (
  Array.isArray(groups)
    ? groups
      .map((group) => normalizeTeamConfig(Array.isArray(group?.team) ? group.team : group))
      .filter((team) => team.length > 0)
    : []
)

const normalizePokemonPoolEntries = (entries = [], weightFallback = 10) => (
  Array.isArray(entries)
    ? entries
      .map((entry, index) => {
        const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
        if (!Number.isInteger(pokemonId) || !MONSTERS.some((monster) => monster.id === pokemonId)) return null
        const normalized = {
          pokemonId,
          weight: Math.max(1, Math.trunc(Number(entry?.weight ?? weightFallback + index)) || 1)
        }
        const minLevel = Math.trunc(Number(entry?.minLevel))
        const maxLevel = Math.trunc(Number(entry?.maxLevel))
        if (Number.isInteger(minLevel)) normalized.minLevel = minLevel
        if (Number.isInteger(maxLevel)) normalized.maxLevel = maxLevel
        return normalized
      })
      .filter(Boolean)
    : []
)

const pickWeightedPoolEntry = (pool, random) => {
  if (!Array.isArray(pool) || pool.length === 0) return null
  const totalWeight = pool.reduce((sum, entry) => sum + Math.max(1, Number(entry.weight) || 1), 0)
  let roll = random() * totalWeight
  for (const entry of pool) {
    roll -= Math.max(1, Number(entry.weight) || 1)
    if (roll <= 0) return entry
  }
  return pool[0]
}

const shufflePoolEntries = (entries = [], random = Math.random) => {
  const shuffled = Array.isArray(entries) ? entries.slice() : []
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = shuffled[index]
    shuffled[index] = shuffled[swapIndex]
    shuffled[swapIndex] = current
  }
  return shuffled
}

const isPoolEntryAvailableAtLevel = (entry, level) => {
  const safeLevel = clampLevel(level)
  if (Number.isInteger(entry?.minLevel) && safeLevel < entry.minLevel) return false
  if (Number.isInteger(entry?.maxLevel) && safeLevel > entry.maxLevel) return false
  return true
}

const filterPoolEntriesForLevel = (pool, level, localPoolIds, usedSpeciesIds = new Set(), usedFamilyKeys = new Set()) => (
  (Array.isArray(pool) ? pool : []).filter((entry) => {
    if (!isPoolEntryAvailableAtLevel(entry, level)) return false
    const resolvedId = resolveSpeciesForLevelWithVariety({
      preferredIds: [entry.pokemonId],
      level,
      localPoolIds,
      usedSpeciesIds,
      usedFamilyKeys
    })
    return Number.isInteger(resolvedId)
  })
)

const buildRotatingChallengeRepeatTeam = ({
  fixedChallengeGroups = [],
  challengeRarePool = [],
  bounds = { minLevel: 1, maxLevel: 100 },
  random = Math.random,
  victoryCount = 0
} = {}) => {
  const finalGroup = fixedChallengeGroups[fixedChallengeGroups.length - 1] || []
  const targetSize = getChallengeBattleGroupSize(victoryCount)
  const levelTemplate = Array.from({ length: targetSize }, (_, index) => (
    Math.max(
      bounds.minLevel,
      Math.min(
        bounds.maxLevel,
        clampLevel(finalGroup[index]?.level ?? bounds.minLevel + Math.floor(index / 2), bounds.minLevel)
      )
    )
  ))
  const rareEntries = normalizePokemonPoolEntries(challengeRarePool, 24)
  const fallbackEntries = normalizePokemonPoolEntries(finalGroup, 24)
  const speciesPool = rareEntries.length > 0 ? rareEntries : fallbackEntries
  if (speciesPool.length === 0 || levelTemplate.length === 0) return []

  const orderedPool = shufflePoolEntries(speciesPool, random)
  const localPoolIds = Array.from(new Set(speciesPool.map((entry) => entry.pokemonId)))
  const usedSpeciesIds = new Set()
  const usedFamilyKeys = new Set()

  return levelTemplate
    .map((targetLevel, index) => {
      const availablePool = filterPoolEntriesForLevel(
        orderedPool,
        targetLevel,
        localPoolIds,
        usedSpeciesIds,
        usedFamilyKeys
      )
      const fallbackPool = availablePool.length > 0
        ? availablePool
        : filterPoolEntriesForLevel(orderedPool, targetLevel, localPoolIds)
      const pickedEntry = pickWeightedPoolEntry(fallbackPool.length > 0 ? fallbackPool : orderedPool, random)
      const preferredIds = Array.from(new Set([
        pickedEntry?.pokemonId,
        ...orderedPool.slice(index).map((entry) => entry.pokemonId),
        ...orderedPool.slice(0, index).map((entry) => entry.pokemonId),
        finalGroup[index]?.pokemonId
      ].filter(Number.isInteger)))
      let pokemonId = resolveSpeciesForLevelWithVariety({
        preferredIds,
        level: targetLevel,
        localPoolIds,
        usedSpeciesIds,
        usedFamilyKeys
      })
      if (!pokemonId) {
        pokemonId = resolveSpeciesForLevelWithVariety({
          preferredIds,
          level: targetLevel,
          localPoolIds,
          usedSpeciesIds: new Set(),
          usedFamilyKeys: new Set()
        })
      }
      if (!pokemonId || !isLevelValidForSpecies(pokemonId, targetLevel)) return null
      usedSpeciesIds.add(pokemonId)
      const familyKey = getEvolutionFamilyKey(pokemonId)
      if (familyKey.length > 0) usedFamilyKeys.add(familyKey)
      return {
        pokemonId,
        level: targetLevel
      }
    })
    .filter(Boolean)
}

export const createTrainerBattleSeed = ({
  dailyRefreshKey = '',
  mapName = '',
  eventId = '',
  role = 'normal',
  victoryCount = 0
} = {}) => hashStringToUint32([
  dailyRefreshKey,
  mapName,
  eventId,
  normalizeTrainerRole(role),
  Math.max(0, Math.trunc(Number(victoryCount)) || 0)
].join('|'))

export const isDailyVariantBattleEvent = (eventType, role = 'normal') => {
  const normalizedRole = normalizeTrainerRole(role)
  return (
    (eventType === 'trainer' && normalizedRole === 'normal') ||
    eventType === 'challenge'
  )
}

export const getTrainerDifficultyBounds = ({
  role = 'normal',
  mapConfig = {},
  bossLevelCap = null
} = {}) => {
  const normalizedRole = normalizeTrainerRole(role)
  const rule = ROLE_VARIANT_RULES[normalizedRole] || ROLE_VARIANT_RULES.normal
  const { mapMinLevel, maxLevel, recommendedLevel } = normalizeMapBounds(mapConfig)
  const rawRoleMinLevel = normalizedRole === 'normal'
    ? mapConfig?.normalTrainerMinLevel ?? mapConfig?.trainerMinLevel
    : null
  const minLevel = Math.min(
    maxLevel,
    clampLevel(rawRoleMinLevel ?? mapMinLevel, mapMinLevel)
  )
  const bossCap = clampLevel(bossLevelCap ?? maxLevel + rule.mapCapBonus, maxLevel + rule.mapCapBonus)
  const roleCap = normalizedRole === 'boss'
    ? bossCap
    : normalizedRole === 'minigame'
      ? Math.max(minLevel, Math.min(100, rule.maxLevelCap ?? 80))
    : Math.min(maxLevel + rule.mapCapBonus, Math.max(minLevel, bossCap - rule.bossCapMargin))

  return {
    role: normalizedRole,
    minLevel,
    maxLevel: Math.max(minLevel, Math.min(100, roleCap)),
    mapMinLevel,
    mapMaxLevel: maxLevel,
    recommendedLevel,
    bossLevelCap: bossCap
  }
}

export const getTrainerBattlePressureLevel = ({
  playerAverageLevel = 5,
  leadLevel = playerAverageLevel
} = {}) => {
  const safeAverageLevel = clampLevel(Math.round(Number(playerAverageLevel) || 5), 5)
  const safeLeadLevel = clampLevel(Math.round(Number(leadLevel) || safeAverageLevel), safeAverageLevel)
  return clampLevel(
    Math.round(Math.max(safeAverageLevel, (safeAverageLevel + safeLeadLevel) / 2)),
    safeAverageLevel
  )
}

export const getTrainerCatchUpBonus = ({
  role = 'normal',
  mapConfig = {},
  bossLevelCap = null,
  playerLevel = 5
} = {}) => {
  const normalizedRole = normalizeTrainerRole(role)
  const rule = ROLE_PLAYER_CATCH_UP_RULES[normalizedRole] || ROLE_PLAYER_CATCH_UP_RULES.normal
  if (!rule || rule.maxBonus <= 0 || rule.overlevelFactor <= 0) return 0

  const bounds = getTrainerDifficultyBounds({
    role: normalizedRole,
    mapConfig,
    bossLevelCap
  })
  const safePlayerLevel = clampLevel(playerLevel, bounds.recommendedLevel)
  const overRecommendedLevels = Math.max(0, safePlayerLevel - bounds.recommendedLevel)
  return Math.max(
    0,
    Math.min(rule.maxBonus, Math.round(overRecommendedLevels * rule.overlevelFactor))
  )
}

export const rebalanceTrainerBattleTeamLevels = (teamConfig = [], {
  role = 'normal',
  mapConfig = {},
  bossLevelCap = null,
  playerLevel = 5
} = {}) => {
  const normalizedTeam = normalizeTeamConfig(teamConfig)
  if (normalizedTeam.length === 0) return []

  const bonus = getTrainerCatchUpBonus({
    role,
    mapConfig,
    bossLevelCap,
    playerLevel
  })
  if (bonus <= 0) {
    return normalizedTeam.map((entry) => ({
      ...entry,
      rewardLevel: entry.rewardLevel ?? entry.level
    }))
  }

  const bounds = getTrainerDifficultyBounds({
    role,
    mapConfig,
    bossLevelCap
  })
  const configuredMaxLevel = Math.max(...normalizedTeam.map((entry) => entry.level))
  const hardCap = Math.max(bounds.minLevel, Math.min(100, Math.max(bounds.maxLevel, configuredMaxLevel)))

  return normalizedTeam.map((entry) => ({
    ...entry,
    level: Math.max(bounds.minLevel, Math.min(hardCap, entry.level + bonus)),
    rewardLevel: entry.rewardLevel ?? entry.level
  }))
}

export const resolveTrainerBattleTeamConfig = (teamConfig = [], {
  role = 'normal',
  eventType = 'trainer',
  eventId = 'trainer',
  mapName = '',
  dailyRefreshKey = '',
  victoryCount = 0,
  mapConfig = {},
  mapWildPokemon = [],
  dailyVariantSpeciesIds = [],
  dailyVariantLevelJitter = null,
  bossTeamConfig = [],
  challengeRarePool = [],
  challengeBattleGroups = [],
  enableDailyVariant = true
} = {}) => {
  const normalizedRole = normalizeTrainerRole(role)
  const isChallengeBattle = eventType === 'challenge' || normalizedRole === 'challenge'
  const roleBalance = getTrainerRoleBalance(normalizedRole)
  const rule = ROLE_VARIANT_RULES[normalizedRole] || ROLE_VARIANT_RULES.normal
  const baseTeam = normalizeTeamConfig(teamConfig)
  const bossTeam = normalizeTeamConfig(bossTeamConfig)
  const bossLevelCap = bossTeam.length > 0
    ? Math.max(...bossTeam.map((member) => member.level))
    : null
  const bounds = getTrainerDifficultyBounds({ role: normalizedRole, mapConfig, bossLevelCap })
  const safeVictoryCount = Math.max(0, Math.trunc(Number(victoryCount)) || 0)
  const fixedChallengeGroups = isChallengeBattle ? normalizeChallengeBattleGroups(challengeBattleGroups) : []
  if (fixedChallengeGroups.length > 0) {
    const finalFixedGroupIndex = fixedChallengeGroups.length - 1
    if (safeVictoryCount > finalFixedGroupIndex) {
      const repeatRandom = createSeededRandom(createTrainerBattleSeed({
        dailyRefreshKey,
        mapName,
        eventId,
        role: normalizedRole,
        victoryCount: safeVictoryCount
      }))
      const repeatTeam = buildRotatingChallengeRepeatTeam({
        fixedChallengeGroups,
        challengeRarePool,
        bounds,
        random: repeatRandom,
        victoryCount: safeVictoryCount
      })
      if (repeatTeam.length === getChallengeBattleGroupSize(safeVictoryCount)) return repeatTeam
    }
    const groupIndex = Math.min(finalFixedGroupIndex, safeVictoryCount)
    return fixedChallengeGroups[groupIndex].map((entry) => ({
      ...entry,
      level: Math.max(bounds.minLevel, Math.min(bounds.maxLevel, entry.level))
    }))
  }
  const shouldVariant = enableDailyVariant && (
    isDailyVariantBattleEvent(eventType, normalizedRole) ||
    isProgressiveRepeatableTrainerBattle(eventType, normalizedRole)
  )
  if (!shouldVariant) {
    return baseTeam.map((entry) => ({
      ...entry,
      level: Math.max(bounds.minLevel, Math.min(bounds.maxLevel, entry.level))
    }))
  }

  const seed = createTrainerBattleSeed({
    dailyRefreshKey,
    mapName,
    eventId,
    role: normalizedRole,
    victoryCount: safeVictoryCount
  })
  const random = createSeededRandom(seed)
  const baseTargetSize = Math.max(
    roleBalance.minTeamSize,
    Math.min(roleBalance.maxTeamSize, baseTeam.length || roleBalance.fallbackTeamSize)
  )
  const levelJitter = Number.isInteger(Math.trunc(Number(dailyVariantLevelJitter)))
    ? Math.max(0, Math.min(3, Math.trunc(Number(dailyVariantLevelJitter))))
    : rule.levelJitter
  const progressionBaseTargetSize = isChallengeBattle ? roleBalance.minTeamSize : baseTargetSize
  const canAddMember = progressionBaseTargetSize < roleBalance.maxTeamSize && safeVictoryCount >= rule.extraTeamVictoryFloor
  const targetSize = isChallengeBattle
    ? getChallengeBattleGroupSize(safeVictoryCount)
    : canAddMember && random() < rule.extraTeamChance
      ? progressionBaseTargetSize + 1
      : progressionBaseTargetSize
  const teamPoolEntries = normalizePokemonPoolEntries(baseTeam, 18)
  const challengePoolEntries = normalizePokemonPoolEntries(challengeRarePool, 24)
  const fullDexPoolEntries = normalizedRole === 'minigame'
    ? normalizePokemonPoolEntries(
      MONSTERS.filter((monster) => !TERMINAL_BOSS_EXCLUSIVE_POKEMON_IDS.has(monster.id)),
      10
    )
    : []
  const variantPoolEntries = normalizePokemonPoolEntries(
    Array.isArray(dailyVariantSpeciesIds) && dailyVariantSpeciesIds.length > 0
      ? dailyVariantSpeciesIds
      : mapWildPokemon,
    10
  )
  const bossCandidateTeam = rule.bossCandidateCount > 0 ? bossTeam.slice(-rule.bossCandidateCount) : []
  const bossPoolEntries = normalizePokemonPoolEntries(bossCandidateTeam, 7)
  const victoryBonus = Math.floor(safeVictoryCount / Math.max(1, rule.victoryStepEvery))
  const mapRegionOrder = Math.trunc(Number(mapConfig?.regionOrder ?? 0)) || 0
  const isLateGameNormalTrainer = normalizedRole === 'normal' && (
    mapRegionOrder >= 8 ||
    bounds.recommendedLevel >= 45 ||
    bounds.mapMaxLevel >= 47
  )

  if (isChallengeBattle && challengePoolEntries.length > 0) {
    const batchTeam = buildChallengeBattleTeamFromUnlockBatch({
      challengeRarePool,
      baseTeam,
      unlockStage: safeVictoryCount,
      targetSize,
      bounds,
      victoryBonus: 0
    })
    if (batchTeam.length > 0) return batchTeam
  }

  const speciesPool = normalizedRole === 'minigame' && fullDexPoolEntries.length > 0
    ? fullDexPoolEntries
    : isChallengeBattle && challengePoolEntries.length > 0
      ? challengePoolEntries
      : [...teamPoolEntries, ...variantPoolEntries, ...bossPoolEntries]
  const localPoolIds = Array.from(new Set(speciesPool.map((entry) => entry.pokemonId)))
  const usedSpeciesIds = new Set()
  const usedFamilyKeys = new Set()

  return Array.from({ length: targetSize }, (_, index) => {
    const baseEntry = baseTeam[index % Math.max(1, baseTeam.length)] || null
    const fallbackLevel = bounds.minLevel + Math.floor(index / 2)
    const jitter = levelJitter > 0 ? randomInt(random, -levelJitter, levelJitter) : 0
    const addMemberLevelBonus = index >= baseTeam.length ? Math.floor(index / 2) : 0
    const lateGameFloor = isLateGameNormalTrainer
      ? Math.max(
        bounds.minLevel,
        Math.min(bounds.maxLevel, clampLevel(baseEntry?.level ?? fallbackLevel, fallbackLevel))
      )
      : bounds.minLevel
    const targetLevel = Math.max(
      lateGameFloor,
      Math.min(
        bounds.maxLevel,
        clampLevel((baseEntry?.level ?? fallbackLevel) + victoryBonus + jitter + addMemberLevelBonus, fallbackLevel)
      )
    )
    const levelSpeciesPool = filterPoolEntriesForLevel(speciesPool, targetLevel, localPoolIds, usedSpeciesIds, usedFamilyKeys)
    const shouldSwapSpecies = levelSpeciesPool.length > 0 && (
      normalizedRole === 'minigame' ||
      random() < rule.speciesSwapChance
    )
    const pickedEntry = shouldSwapSpecies ? pickWeightedPoolEntry(levelSpeciesPool, random) : null
    const baseEntryId = baseEntry?.pokemonId
    const preferredIds = [
      pickedEntry?.pokemonId,
      baseEntryId,
      pickWeightedPoolEntry(levelSpeciesPool, random)?.pokemonId,
      ...localPoolIds
    ].filter(Number.isInteger)
    let pokemonId = resolveSpeciesForLevelWithVariety({
      preferredIds,
      level: targetLevel,
      localPoolIds,
      usedSpeciesIds,
      usedFamilyKeys
    })
    if (!pokemonId) {
      pokemonId = resolveSpeciesForLevelWithVariety({
        preferredIds,
        level: targetLevel,
        localPoolIds,
        usedSpeciesIds: new Set(),
        usedFamilyKeys: new Set()
      })
    }
    if (pokemonId) {
      usedSpeciesIds.add(pokemonId)
      const familyKey = getEvolutionFamilyKey(pokemonId)
      if (familyKey.length > 0) usedFamilyKeys.add(familyKey)
    }
    return {
      pokemonId: pokemonId || baseEntry?.pokemonId || localPoolIds[0],
      level: targetLevel
    }
  }).filter((entry) => Number.isInteger(entry.pokemonId))
}
