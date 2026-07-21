import { getPokemonOfficialDexNo } from './gameData'
import {
  ADVENTURE_CHAPTER_BY_MAP_ID,
  CHAMPION_TOWER_MAP_ID,
  CHAMPION_TOWER_UNLOCK_BOSS_ID,
  ELITE_UNLOCK_TASKS,
  ELITE_UNLOCK_TASK_BY_ID,
  ELITE_UNLOCK_STEP_BY_EVENT_ID,
  ELITE_UNLOCK_TASK_VERSION,
  MAP_COMPLETION_CATALOG_VERSION,
  PERMANENT_DEX_VERSION
} from '../game/data/longTermProgression'

const MAX_PERMANENT_ID_COUNT = 4096

export const uniqueProgressIds = (value, limit = MAX_PERMANENT_ID_COUNT) => (
  Array.isArray(value)
    ? Array.from(new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0))).slice(0, limit)
    : []
)

const mergeProgressIds = (...values) => uniqueProgressIds(values.flatMap((value) => uniqueProgressIds(value)))

const hasScopedProgressId = (world, key, mapId, eventId) => {
  if (!eventId) return false
  const ids = new Set(uniqueProgressIds(world?.[key]))
  return ids.has(eventId) || ids.has(`${mapId}:${eventId}`)
}

const clampInteger = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => (
  Math.max(min, Math.min(max, Math.trunc(Number(value)) || 0))
)

export function getPokemonSpeciesKey(pokemon) {
  if (!pokemon || typeof pokemon !== 'object') return null
  const dexNo = getPokemonOfficialDexNo(pokemon)
  if (Number.isFinite(dexNo) && dexNo > 0 && dexNo < Number.MAX_SAFE_INTEGER) {
    return `dex:${Math.trunc(dexNo)}`
  }
  const baseId = Number(pokemon.baseId ?? pokemon.speciesId ?? pokemon.pokemonId ?? pokemon.id)
  return Number.isFinite(baseId) && baseId > 0 ? `species:${Math.trunc(baseId)}` : null
}

export function normalizePermanentDexProgress(value) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    version: PERMANENT_DEX_VERSION,
    migrationVersion: clampInteger(source.migrationVersion, 0, PERMANENT_DEX_VERSION),
    registeredSpeciesKeys: uniqueProgressIds(source.registeredSpeciesKeys),
    wildCapturedSpeciesKeys: uniqueProgressIds(source.wildCapturedSpeciesKeys)
  }
}

export function registerPokemonSpecies(world, pokemon, { wildCaptured = false } = {}) {
  const speciesKey = getPokemonSpeciesKey(pokemon)
  if (!speciesKey) return world && typeof world === 'object' ? world : {}
  const dexProgress = normalizePermanentDexProgress(world?.dexProgress)
  return {
    ...(world && typeof world === 'object' ? world : {}),
    dexProgress: {
      ...dexProgress,
      registeredSpeciesKeys: mergeProgressIds(dexProgress.registeredSpeciesKeys, [speciesKey]),
      wildCapturedSpeciesKeys: wildCaptured
        ? mergeProgressIds(dexProgress.wildCapturedSpeciesKeys, [speciesKey])
        : dexProgress.wildCapturedSpeciesKeys
    }
  }
}

export function registerPokemonRoster(world, rosters = []) {
  const pokemon = (Array.isArray(rosters) ? rosters : [])
    .flatMap((roster) => Array.isArray(roster) ? roster : roster ? [roster] : [])
  return pokemon.reduce((nextWorld, monster) => registerPokemonSpecies(nextWorld, monster), world)
}

export function getPermanentDexStatus(dexProgress, pokemon, ownedCount = 0) {
  const normalized = normalizePermanentDexProgress(dexProgress)
  const speciesKey = getPokemonSpeciesKey(pokemon)
  return {
    speciesKey,
    registered: Boolean(speciesKey && normalized.registeredSpeciesKeys.includes(speciesKey)),
    wildCaptured: Boolean(speciesKey && normalized.wildCapturedSpeciesKeys.includes(speciesKey)),
    ownedCount: Math.max(0, clampInteger(ownedCount, 0, 999))
  }
}

export function normalizeChampionTowerProgress(value) {
  const source = value && typeof value === 'object' ? value : {}
  const weekly = source.weekly && typeof source.weekly === 'object' ? source.weekly : {}
  return {
    version: 1,
    highestStoryFloor: clampInteger(source.highestStoryFloor, 0, 10),
    firstClearedAt: typeof source.firstClearedAt === 'string' ? source.firstClearedAt : null,
    championTrophyEarned: Boolean(source.championTrophyEarned),
    totalWeeklyClears: clampInteger(source.totalWeeklyClears, 0, 9999),
    bestWinStreak: clampInteger(source.bestWinStreak, 0, 9999),
    weekly: {
      seasonKey: typeof weekly.seasonKey === 'string' ? weekly.seasonKey : null,
      highestFloor: clampInteger(weekly.highestFloor, 0, 10),
      rewardClaimed: Boolean(weekly.rewardClaimed)
    }
  }
}

export function normalizeLongTermWorldProgress(world) {
  const source = world && typeof world === 'object' ? world : {}
  return {
    ...source,
    longTermProgressVersion: 1,
    dexProgress: normalizePermanentDexProgress(source.dexProgress),
    completedUnlockTaskIds: uniqueProgressIds(source.completedUnlockTaskIds),
    completedUnlockTaskStepIds: uniqueProgressIds(source.completedUnlockTaskStepIds),
    completionRewardClaimIds: uniqueProgressIds(source.completionRewardClaimIds),
    unlockTaskMigrationVersion: clampInteger(source.unlockTaskMigrationVersion, 0, ELITE_UNLOCK_TASK_VERSION),
    championTower: normalizeChampionTowerProgress(source.championTower)
  }
}

function mergeChampionTowerProgress(targetValue, sourceValue) {
  const target = normalizeChampionTowerProgress(targetValue)
  const source = normalizeChampionTowerProgress(sourceValue)
  const sameSeason = target.weekly.seasonKey && target.weekly.seasonKey === source.weekly.seasonKey
  const targetSeasonWins = sameSeason ? target.weekly.highestFloor : 0
  const sourceSeasonWins = sameSeason ? source.weekly.highestFloor : 0
  const latestSeasonKey = [target.weekly.seasonKey, source.weekly.seasonKey]
    .filter((key) => typeof key === 'string' && key.length > 0)
    .sort()
    .at(-1) || null
  const weekly = sameSeason
    ? {
      seasonKey: target.weekly.seasonKey,
      highestFloor: Math.max(targetSeasonWins, sourceSeasonWins),
      rewardClaimed: target.weekly.rewardClaimed || source.weekly.rewardClaimed
    }
    : (source.weekly.seasonKey === latestSeasonKey ? source.weekly : target.weekly)

  return {
    version: 1,
    highestStoryFloor: Math.max(target.highestStoryFloor, source.highestStoryFloor),
    firstClearedAt: target.firstClearedAt || source.firstClearedAt,
    championTrophyEarned: target.championTrophyEarned || source.championTrophyEarned,
    totalWeeklyClears: Math.max(target.totalWeeklyClears, source.totalWeeklyClears),
    bestWinStreak: Math.max(target.bestWinStreak, source.bestWinStreak),
    weekly
  }
}

export function mergeLongTermWorldProgress(targetWorld, sourceWorld) {
  const target = normalizeLongTermWorldProgress(targetWorld)
  const source = normalizeLongTermWorldProgress(sourceWorld)
  return {
    dexProgress: {
      version: PERMANENT_DEX_VERSION,
      migrationVersion: Math.max(target.dexProgress.migrationVersion, source.dexProgress.migrationVersion),
      registeredSpeciesKeys: mergeProgressIds(
        target.dexProgress.registeredSpeciesKeys,
        source.dexProgress.registeredSpeciesKeys
      ),
      wildCapturedSpeciesKeys: mergeProgressIds(
        target.dexProgress.wildCapturedSpeciesKeys,
        source.dexProgress.wildCapturedSpeciesKeys
      )
    },
    completedUnlockTaskIds: mergeProgressIds(target.completedUnlockTaskIds, source.completedUnlockTaskIds),
    completedUnlockTaskStepIds: mergeProgressIds(target.completedUnlockTaskStepIds, source.completedUnlockTaskStepIds),
    completionRewardClaimIds: mergeProgressIds(target.completionRewardClaimIds, source.completionRewardClaimIds),
    unlockTaskMigrationVersion: Math.max(target.unlockTaskMigrationVersion, source.unlockTaskMigrationVersion),
    championTower: mergeChampionTowerProgress(target.championTower, source.championTower)
  }
}

const getTaskStepIds = (task) => task.steps.map((entry) => entry.id)

export function isEliteUnlockTaskCompleted(world, taskId) {
  return uniqueProgressIds(world?.completedUnlockTaskIds).includes(taskId)
}

export function getEliteUnlockTaskProgress(world, taskOrId) {
  const task = typeof taskOrId === 'string' ? ELITE_UNLOCK_TASK_BY_ID[taskOrId] : taskOrId
  if (!task) return null
  const completedTaskIds = new Set(uniqueProgressIds(world?.completedUnlockTaskIds))
  const completedStepIds = new Set(uniqueProgressIds(world?.completedUnlockTaskStepIds))
  const requiredTaskIds = task.prerequisiteTaskIds || []
  const requiredTrainerIds = task.prerequisiteTrainerIds || []
  const missingTaskIds = requiredTaskIds.filter((id) => !completedTaskIds.has(id))
  const missingTrainerIds = requiredTrainerIds.filter((id) => !hasScopedProgressId(world, 'defeatedTrainerIds', task.mapId, id))
  const completedSteps = task.steps.filter((entry) => completedStepIds.has(entry.id))
  const nextStep = task.steps.find((entry) => !completedStepIds.has(entry.id)) || null
  const completed = completedTaskIds.has(task.id) || completedSteps.length === task.steps.length
  return {
    task,
    completed,
    available: missingTaskIds.length === 0 && missingTrainerIds.length === 0,
    completedSteps,
    completedStepCount: completedSteps.length,
    totalStepCount: task.steps.length,
    nextStep,
    missingTaskIds,
    missingTrainerIds
  }
}

export function getEliteUnlockTargetGate(world, mapId, targetEventId) {
  const task = ELITE_UNLOCK_TASKS.find((entry) => entry.mapId === mapId && entry.targetEventId === targetEventId)
  if (!task) return null
  return getEliteUnlockTaskProgress(world, task)
}

export function completeEliteUnlockObjective(world, mapId, eventId) {
  const entry = ELITE_UNLOCK_STEP_BY_EVENT_ID[eventId]
  if (!entry || entry.task.mapId !== mapId) {
    return { success: false, status: 'unknown', world }
  }
  const normalized = normalizeLongTermWorldProgress(world)
  const progress = getEliteUnlockTaskProgress(normalized, entry.task)
  if (progress.completed) {
    return { success: true, status: 'already_complete', taskCompleted: true, world: normalized, progress }
  }
  if (!progress.available) {
    return { success: false, status: 'locked', world: normalized, progress }
  }
  if (progress.nextStep?.sequence && progress.nextStep.id !== entry.step.id) {
    return { success: false, status: 'out_of_order', world: normalized, progress }
  }
  if (uniqueProgressIds(normalized.completedUnlockTaskStepIds).includes(entry.step.id)) {
    return { success: true, status: 'already_complete', taskCompleted: false, world: normalized, progress }
  }

  const completedUnlockTaskStepIds = mergeProgressIds(normalized.completedUnlockTaskStepIds, [entry.step.id])
  const allStepsCompleted = getTaskStepIds(entry.task).every((id) => completedUnlockTaskStepIds.includes(id))
  const completedUnlockTaskIds = allStepsCompleted
    ? mergeProgressIds(normalized.completedUnlockTaskIds, [entry.task.id])
    : normalized.completedUnlockTaskIds
  const nextWorld = {
    ...normalized,
    completedUnlockTaskStepIds,
    completedUnlockTaskIds
  }
  return {
    success: true,
    status: allStepsCompleted ? 'task_complete' : 'step_complete',
    taskCompleted: allStepsCompleted,
    world: nextWorld,
    progress: getEliteUnlockTaskProgress(nextWorld, entry.task),
    task: entry.task,
    step: entry.step
  }
}

// Mini-game sessions deliberately live outside the save file. Once a session is
// solved, its complete task is recorded as one monotonic fact so a connection
// failure can never leave a player with a half-applied puzzle result.
export function completeEliteUnlockTask(world, mapId, taskId) {
  const task = ELITE_UNLOCK_TASK_BY_ID[taskId]
  if (!task || task.mapId !== mapId) {
    return { success: false, status: 'unknown', world }
  }
  const normalized = normalizeLongTermWorldProgress(world)
  const progress = getEliteUnlockTaskProgress(normalized, task)
  if (progress.completed) {
    return {
      success: true,
      status: 'already_complete',
      taskCompleted: true,
      world: normalized,
      progress,
      task
    }
  }
  if (!progress.available) {
    return { success: false, status: 'locked', world: normalized, progress, task }
  }

  const nextWorld = {
    ...normalized,
    completedUnlockTaskIds: mergeProgressIds(normalized.completedUnlockTaskIds, [task.id]),
    completedUnlockTaskStepIds: mergeProgressIds(normalized.completedUnlockTaskStepIds, getTaskStepIds(task))
  }
  return {
    success: true,
    status: 'task_complete',
    taskCompleted: true,
    world: nextWorld,
    progress: getEliteUnlockTaskProgress(nextWorld, task),
    task
  }
}

function completeTaskForMigration(world, task) {
  const normalized = normalizeLongTermWorldProgress(world)
  return {
    ...normalized,
    completedUnlockTaskIds: mergeProgressIds(normalized.completedUnlockTaskIds, [task.id]),
    completedUnlockTaskStepIds: mergeProgressIds(normalized.completedUnlockTaskStepIds, getTaskStepIds(task))
  }
}

export function migrateLegacyLongTermProgress(world, {
  playerTeam = [],
  storageBox = [],
  pendingMonsterAcquisition = null,
  currentMapName = null
} = {}) {
  let nextWorld = normalizeLongTermWorldProgress(world)
  nextWorld = registerPokemonRoster(nextWorld, [
    playerTeam,
    storageBox,
    pendingMonsterAcquisition?.monster ? [pendingMonsterAcquisition.monster] : []
  ])
  nextWorld = {
    ...nextWorld,
    dexProgress: {
      ...nextWorld.dexProgress,
      migrationVersion: PERMANENT_DEX_VERSION
    }
  }

  if (nextWorld.unlockTaskMigrationVersion < ELITE_UNLOCK_TASK_VERSION) {
    const currentChapter = ADVENTURE_CHAPTER_BY_MAP_ID[currentMapName]?.chapter || 0
    const taskMaps = Array.from(new Set(ELITE_UNLOCK_TASKS.map((entry) => entry.mapId)))
    taskMaps.forEach((mapId) => {
      const mapTasks = ELITE_UNLOCK_TASKS.filter((entry) => entry.mapId === mapId)
      const taskChapter = ADVENTURE_CHAPTER_BY_MAP_ID[mapId]?.chapter || 0
      const hasReachedLaterChapter = currentChapter > taskChapter
      const highestCompletedOrder = hasReachedLaterChapter
        ? Math.max(...mapTasks.map((entry) => entry.order))
        : mapTasks.reduce((highest, unlockTask) => {
          const targetKey = unlockTask.targetEventId.includes('_boss') ? 'defeatedBossIds' : 'defeatedTrainerIds'
          return hasScopedProgressId(nextWorld, targetKey, mapId, unlockTask.targetEventId)
            ? Math.max(highest, unlockTask.order)
            : highest
        }, 0)
      mapTasks
        .filter((entry) => entry.order <= highestCompletedOrder)
        .forEach((entry) => {
          nextWorld = completeTaskForMigration(nextWorld, entry)
        })
    })
    nextWorld.unlockTaskMigrationVersion = ELITE_UNLOCK_TASK_VERSION
  }

  ELITE_UNLOCK_TASKS.forEach((unlockTask) => {
    const stepIds = getTaskStepIds(unlockTask)
    if (stepIds.every((id) => nextWorld.completedUnlockTaskStepIds.includes(id))) {
      nextWorld.completedUnlockTaskIds = mergeProgressIds(nextWorld.completedUnlockTaskIds, [unlockTask.id])
    }
  })

  return nextWorld
}

export function isChampionTowerUnlocked(world) {
  return hasScopedProgressId(world, 'defeatedBossIds', 'GodotMapV2_DragonDojo', CHAMPION_TOWER_UNLOCK_BOSS_ID)
}

export function getCurrentIsoWeekKey(date = new Date()) {
  const source = date instanceof Date ? date : new Date(date)
  const safeDate = Number.isNaN(source.getTime()) ? new Date() : source
  const utc = new Date(Date.UTC(safeDate.getUTCFullYear(), safeDate.getUTCMonth(), safeDate.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function normalizeTowerSeason(towerValue, seasonKey = getCurrentIsoWeekKey()) {
  const tower = normalizeChampionTowerProgress(towerValue)
  if (tower.weekly.seasonKey === seasonKey) return tower
  return {
    ...tower,
    weekly: {
      seasonKey,
      highestFloor: 0,
      rewardClaimed: false
    }
  }
}

export function recordChampionTowerFloorVictory(world, floor, {
  seasonKey = getCurrentIsoWeekKey(),
  completedAt = new Date().toISOString()
} = {}) {
  const normalized = normalizeLongTermWorldProgress(world)
  const safeFloor = clampInteger(floor, 1, 10)
  const previousTower = normalizeTowerSeason(normalized.championTower, seasonKey)
  const storyMode = previousTower.highestStoryFloor < 10
  const nextTower = storyMode
    ? {
      ...previousTower,
      highestStoryFloor: Math.max(previousTower.highestStoryFloor, safeFloor),
      firstClearedAt: safeFloor === 10 ? (previousTower.firstClearedAt || completedAt) : previousTower.firstClearedAt,
      championTrophyEarned: previousTower.championTrophyEarned || safeFloor === 10,
      bestWinStreak: Math.max(previousTower.bestWinStreak, safeFloor)
    }
    : {
      ...previousTower,
      totalWeeklyClears: previousTower.totalWeeklyClears + (safeFloor === 10 && previousTower.weekly.highestFloor < 10 ? 1 : 0),
      bestWinStreak: Math.max(previousTower.bestWinStreak, safeFloor),
      weekly: {
        ...previousTower.weekly,
        highestFloor: Math.max(previousTower.weekly.highestFloor, safeFloor)
      }
    }
  return {
    ...normalized,
    championTower: nextTower
  }
}

export function getTowerNextFloor(world, seasonKey = getCurrentIsoWeekKey()) {
  const tower = normalizeTowerSeason(world?.championTower, seasonKey)
  if (tower.highestStoryFloor < 10) return Math.min(10, tower.highestStoryFloor + 1)
  return Math.min(10, tower.weekly.highestFloor + 1)
}

export function getTowerWeeklyRewardClaimId(seasonKey = getCurrentIsoWeekKey()) {
  const safeSeasonKey = typeof seasonKey === 'string' && /^\d{4}-W\d{2}$/.test(seasonKey)
    ? seasonKey
    : getCurrentIsoWeekKey()
  return `tower:weekly:${safeSeasonKey}:clear`
}

export function hasClaimedTowerWeeklyReward(world, seasonKey = getCurrentIsoWeekKey()) {
  const tower = normalizeTowerSeason(world?.championTower, seasonKey)
  return tower.weekly.rewardClaimed || uniqueProgressIds(world?.completionRewardClaimIds).includes(getTowerWeeklyRewardClaimId(seasonKey))
}

export function appendTowerWeeklyRewardClaim(world, seasonKey = getCurrentIsoWeekKey()) {
  const normalized = normalizeLongTermWorldProgress(world)
  const tower = normalizeTowerSeason(normalized.championTower, seasonKey)
  return {
    ...normalized,
    completionRewardClaimIds: mergeProgressIds(
      normalized.completionRewardClaimIds,
      [getTowerWeeklyRewardClaimId(seasonKey)]
    ),
    championTower: {
      ...tower,
      weekly: {
        ...tower.weekly,
        rewardClaimed: true
      }
    }
  }
}

export function getCompletionRewardClaimId(mapId, threshold) {
  const safeThreshold = clampInteger(threshold, 0, 100)
  return `map:${mapId}:completion:v${MAP_COMPLETION_CATALOG_VERSION}:${safeThreshold}`
}

export function hasClaimedCompletionReward(world, mapId, threshold) {
  return uniqueProgressIds(world?.completionRewardClaimIds).includes(getCompletionRewardClaimId(mapId, threshold))
}

export function appendCompletionRewardClaim(world, mapId, threshold, { championTrophy = false } = {}) {
  const normalized = normalizeLongTermWorldProgress(world)
  return {
    ...normalized,
    completionRewardClaimIds: mergeProgressIds(
      normalized.completionRewardClaimIds,
      [getCompletionRewardClaimId(mapId, threshold)]
    ),
    championTower: mapId === CHAMPION_TOWER_MAP_ID && championTrophy
      ? { ...normalized.championTower, championTrophyEarned: true }
      : normalized.championTower
  }
}

export function getEliteTaskObjectiveCountForMap(mapId) {
  return ELITE_UNLOCK_TASKS.filter((entry) => entry.mapId === mapId).length
}
