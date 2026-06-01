#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  GODOT_REGION_MAP_CONFIGS,
  GODOT_REGION_MAP_IDS,
  GODOT_REGION_MAPS
} from '../src/game/data/godotMaps/godot_region_maps.js'
import { EXP_POTIONS, MONSTERS, POKEBALLS, POTIONS } from '../src/utils/gameData.js'
import { isLevelValidForSpecies, pickLevelForSpecies } from '../src/utils/wildEncounterRules.js'
import { withViteAuditServer } from './load-vite-module.mjs'

const MAX_CHAIN_BATTLES = 6
const MIN_CHAIN_BATTLES = 3
const ITEM_CATALOGS = {
  pokeball: POKEBALLS,
  potion: POTIONS,
  expPotion: EXP_POTIONS
}
const RESERVED_LEGENDARY_DEX_NOS = new Set([144, 145, 146, 150, 151])
const VARIANT_VICTORY_SAMPLES = [0, 1, 2, 3, 4, 8, 16, 80]
const CHALLENGE_RARE_UNLOCK_STAGE_COUNT = 4

const errors = []
const rows = []
const originalGameSource = readFileSync(fileURLToPath(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url)), 'utf8')

const requiredRewardDedupeMarkers = [
  {
    label: 'shared map reward merge helper',
    marker: 'const mergeNormalizedMapRewardItems = (rewardItems = []) =>'
  },
  {
    label: 'challenge confirmation merges first-clear and run rewards',
    marker: 'const challengeDisplayRewardItems = mergeNormalizedMapRewardItems(['
  },
  {
    label: 'challenge modal renders merged reward pills',
    marker: 'const normalizedRewardItems = mergeNormalizedMapRewardItems(rewardItems);'
  },
  {
    label: 'battle victory summary uses merged reward items',
    marker: 'const finalEventRewardItems = mergeNormalizedMapRewardItems(eventRewardItems);'
  },
  {
    label: 'challenge completion log suppresses separate first-clear reward line',
    marker: 'includeRewardItems: !isRepeatableChallenge'
  },
  {
    label: 'repeatable challenge still respects scoped daily lock',
    marker: 'const wasAlreadyDailyCompleted = hasDailyTrainerBattleEvent(nextWorld, completedMapName, completedEventId);'
  }
]

for (const { label, marker } of requiredRewardDedupeMarkers) {
  if (!originalGameSource.includes(marker)) {
    errors.push(`OriginalGame missing ${label}: ${marker}`)
  }
}

const getMaxRarePoolSize = (chainLength) => {
  const length = Math.max(MIN_CHAIN_BATTLES, Math.min(MAX_CHAIN_BATTLES, Math.trunc(Number(chainLength)) || MIN_CHAIN_BATTLES))
  if (length >= 6) return 18
  if (length >= 5) return 12
  if (length >= 4) return 8
  return 8
}

const rewardValue = (rewardItems = []) => (
  rewardItems.reduce((sum, reward) => {
    const item = ITEM_CATALOGS[reward?.itemType]?.[reward?.itemKey]
    const quantity = Math.max(1, Math.trunc(Number(reward?.quantity ?? 1)) || 1)
    return sum + (Number(item?.price) || 0) * quantity
  }, 0)
)

const rewardKey = (reward) => `${reward?.itemType || 'unknown'}:${reward?.itemKey || 'unknown'}`

const duplicateRewardKeys = (rewardItems = []) => {
  const seen = new Set()
  const duplicates = new Set()
  ;(Array.isArray(rewardItems) ? rewardItems : []).forEach((reward) => {
    const key = rewardKey(reward)
    if (seen.has(key)) duplicates.add(key)
    seen.add(key)
  })
  return [...duplicates]
}

const speciesName = (pokemonId) => MONSTERS.find((monster) => monster.id === pokemonId)?.name || `#${pokemonId}`

const getEvolutionFamilyKey = (pokemonId) => (
  [...getEvolutionFamilyIds(pokemonId)]
    .sort((left, right) => left - right)
    .join(':')
)

const countDistinctEvolutionFamilies = (pokemonIds = []) => (
  new Set(
    (Array.isArray(pokemonIds) ? pokemonIds : [])
      .filter(Number.isInteger)
      .map((pokemonId) => getEvolutionFamilyKey(pokemonId))
      .filter((familyKey) => familyKey.length > 0)
  ).size
)

const findDuplicateEvolutionFamilyMembers = (pokemonIds = []) => {
  const seenFamilies = new Set()
  const duplicates = []
  ;(Array.isArray(pokemonIds) ? pokemonIds : [])
    .filter(Number.isInteger)
    .forEach((pokemonId) => {
      const familyKey = getEvolutionFamilyKey(pokemonId)
      if (!familyKey) return
      if (seenFamilies.has(familyKey)) {
        duplicates.push(speciesName(pokemonId))
        return
      }
      seenFamilies.add(familyKey)
    })
  return [...new Set(duplicates)]
}

const getChallengeRareUnlockedCountForStage = (totalCount, stage) => {
  const total = Math.max(0, Math.trunc(Number(totalCount)) || 0)
  if (total <= 0) return 0
  const stageCount = Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, total)
  const safeStage = Math.max(0, Math.min(stageCount, Math.trunc(Number(stage)) || 0))
  if (safeStage <= 0) return 0
  if (safeStage >= stageCount) return total
  return Math.max(1, Math.min(total, Math.round((total * safeStage) / stageCount)))
}

const getChallengeRareBatchSizes = (totalCount) => {
  const total = Math.max(0, Math.trunc(Number(totalCount)) || 0)
  const stageCount = Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, total)
  return Array.from({ length: stageCount }, (_, index) => (
    getChallengeRareUnlockedCountForStage(total, index + 1) -
    getChallengeRareUnlockedCountForStage(total, index)
  ))
}

const getChallengeFinalThreeRareIds = (rarePool = []) => {
  const ids = (Array.isArray(rarePool) ? rarePool : [])
    .map((entry) => getEntryPokemonId(entry))
    .filter(Number.isInteger)
  const stageCount = Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, ids.length)
  const startStage = Math.max(0, stageCount - 3)
  const startIndex = getChallengeRareUnlockedCountForStage(ids.length, startStage)
  return ids.slice(startIndex)
}

const getChallengeRunRewardItems = (regionOrder, teamSize) => {
  const order = Math.max(1, Math.trunc(Number(regionOrder)) || 1)
  const length = Math.max(MIN_CHAIN_BATTLES, Math.min(MAX_CHAIN_BATTLES, Math.trunc(Number(teamSize)) || MIN_CHAIN_BATTLES))
  const isLate = order >= 6
  const isMid = order >= 3
  return [
    {
      itemType: 'expPotion',
      itemKey: isLate ? 'exp_potion_large' : isMid ? 'exp_potion_medium' : 'exp_potion_small',
      quantity: length >= 6 ? 2 : 1
    },
    ...(length >= 4 ? [{
      itemType: 'pokeball',
      itemKey: isLate ? 'pokeball_ultra' : isMid ? 'pokeball_great' : 'pokeball_basic',
      quantity: length >= 6 ? 2 : 1
    }] : []),
    ...(length >= 5 ? [{
      itemType: 'potion',
      itemKey: isLate ? 'hyper_potion' : isMid ? 'super_potion' : 'potion',
      quantity: 1
    }] : [])
  ]
}

const officialArtworkPath = (monster) => {
  const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
  if (!Number.isFinite(dexNo) || dexNo <= 0) return null
  return fileURLToPath(new URL(`../public/assets/pokemon/official-artwork/${dexNo}.png`, import.meta.url))
}

const getEvolutionTargetIds = (monster) => [
  monster?.evolvesTo,
  ...(Array.isArray(monster?.alternateEvolutions) ? monster.alternateEvolutions : [])
]
  .map((evolution) => Math.trunc(Number(evolution?.targetId)))
  .filter(Number.isInteger)

const familyCache = new Map()

const getEvolutionFamilyIds = (pokemonId) => {
  const normalizedId = Math.trunc(Number(pokemonId))
  if (!Number.isInteger(normalizedId)) return new Set()
  if (familyCache.has(normalizedId)) return familyCache.get(normalizedId)

  const family = new Set([normalizedId])
  let changed = true

  while (changed) {
    changed = false
    MONSTERS.forEach((candidate) => {
      const candidateId = Math.trunc(Number(candidate?.id))
      if (!Number.isInteger(candidateId)) return
      const targets = getEvolutionTargetIds(candidate)
      const touchesFamily = family.has(candidateId) || targets.some((targetId) => family.has(targetId))
      if (!touchesFamily) return
      if (!family.has(candidateId)) {
        family.add(candidateId)
        changed = true
      }
      targets.forEach((targetId) => {
        if (!family.has(targetId)) {
          family.add(targetId)
          changed = true
        }
      })
    })
  }

  family.forEach((familyId) => familyCache.set(familyId, family))
  return family
}

const getEntryPokemonId = (entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))

const isTeamMemberFromRarePool = (member, rarePool) => {
  const memberId = getEntryPokemonId(member)
  if (!Number.isInteger(memberId)) return false
  return rarePool.some((entry) => getEvolutionFamilyIds(getEntryPokemonId(entry)).has(memberId))
}

let previousRewardValue = 0

await withViteAuditServer(async ({ loadModule }) => {
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { getTrainerRoleBalance } = await loadModule('/src/utils/gameBalance.js')
  const {
    getTrainerDifficultyBounds,
    isDailyVariantBattleEvent,
    resolveTrainerBattleTeamConfig
  } = await loadModule('/src/utils/trainerBattleScaling.js')

for (const mapId of GODOT_REGION_MAP_IDS) {
  const map = GODOT_REGION_MAPS[mapId]
  const config = GODOT_REGION_MAP_CONFIGS[mapId] || {}
  const challengeEvents = (map?.runtimeEvents || []).filter((event) => event.type === 'challenge')

  if (challengeEvents.length !== 1) {
    errors.push(`${mapId}: expected exactly one challenge event, got ${challengeEvents.length}`)
    continue
  }

  const challenge = challengeEvents[0]
  const props = challenge.properties || {}
  const team = Array.isArray(props.team) ? props.team : []
  const chainLength = Math.trunc(Number(props.chainLength)) || team.length
  const maxChainBattles = Math.trunc(Number(props.maxChainBattles)) || MAX_CHAIN_BATTLES
  const rewards = Array.isArray(props.rewardItems) ? props.rewardItems : []
  const currentRewardValue = rewardValue(rewards)
  const rarePool = Array.isArray(props.challengeRarePool) ? props.challengeRarePool : []
  const minLevel = Math.max(1, Math.trunc(Number(config.minLevel ?? map.levelRange?.[0] ?? 1)) || 1)
  const maxLevel = Math.max(minLevel, Math.trunc(Number(config.maxLevel ?? map.levelRange?.[1] ?? minLevel)) || minLevel)
  const bossEvent = (map?.runtimeEvents || []).find((event) => event.type === 'boss')
  const bossTeam = Array.isArray(bossEvent?.properties?.team) ? bossEvent.properties.team : []
  const bossProps = bossEvent?.properties || {}
  const bossLevels = bossTeam.map((member) => Number(member.level)).filter(Number.isFinite)
  const bossLevelCap = bossLevels.length > 0 ? Math.max(...bossLevels) : null
  const challengeLevels = team.map((member) => Number(member.level)).filter(Number.isFinite)
  const bossRareId = getEntryPokemonId(bossProps.bossRarePokemon)
  let initialVariantTeamSize = 0
  let maxVariantTeamSize = 0
  let maxVariantLevel = challengeLevels.length > 0 ? Math.max(...challengeLevels) : 0

  if (maxChainBattles !== MAX_CHAIN_BATTLES) {
    errors.push(`${mapId}: maxChainBattles should be ${MAX_CHAIN_BATTLES}, got ${maxChainBattles}`)
  }
  if (typeof props.completedText !== 'string' || !props.completedText.includes('明天凌晨刷新')) {
    errors.push(`${mapId}: completed challenge text must explain next-day refresh`)
  }
  if (typeof props.completedText !== 'string' || !props.completedText.includes('首通奖励不会重复')) {
    errors.push(`${mapId}: completed challenge text must explain first-clear rewards do not repeat`)
  }
  if (typeof props.completedText !== 'string' || !props.completedText.includes('按批次')) {
    errors.push(`${mapId}: completed challenge text must explain staged rare ecology unlocks`)
  }
  if (typeof props.dailyDefeatedText !== 'string' || !props.dailyDefeatedText.includes('明天凌晨刷新')) {
    errors.push(`${mapId}: challenge repeat text must explain next-day refresh`)
  }
  if (typeof props.dailyDefeatedText !== 'string' || !props.dailyDefeatedText.includes('首通奖励不会重复')) {
    errors.push(`${mapId}: challenge repeat text must explain first-clear rewards do not repeat`)
  }
  if (typeof props.dailyDefeatedText !== 'string' || !props.dailyDefeatedText.includes('按批次')) {
    errors.push(`${mapId}: challenge repeat text must explain staged rare ecology unlocks`)
  }
  if (team.length < MIN_CHAIN_BATTLES || team.length > MAX_CHAIN_BATTLES) {
    errors.push(`${mapId}: challenge team size ${team.length} is outside ${MIN_CHAIN_BATTLES}-${MAX_CHAIN_BATTLES}`)
  }
  if (chainLength !== team.length) {
    errors.push(`${mapId}: chainLength ${chainLength} does not match team size ${team.length}`)
  }
  if (!isDailyVariantBattleEvent(challenge.type, props.role || 'challenge')) {
    errors.push(`${mapId}: challenge event must remain a repeatable variant battle`)
  }
  if (bossLevelCap && challengeLevels.some((level) => level > bossLevelCap)) {
    errors.push(`${mapId}: base challenge exceeds boss cap Lv.${bossLevelCap}: ${challengeLevels.join('/')}`)
  }
  if (currentRewardValue < previousRewardValue) {
    errors.push(`${mapId}: reward value ${currentRewardValue} regressed below previous ${previousRewardValue}`)
  }
  const duplicateFirstClearRewardKeys = duplicateRewardKeys(rewards)
  if (duplicateFirstClearRewardKeys.length > 0) {
    errors.push(`${mapId}: first-clear challenge rewards contain duplicate items: ${duplicateFirstClearRewardKeys.join(', ')}`)
  }
  const maxRarePoolSize = getMaxRarePoolSize(chainLength)
  if (rarePool.length > maxRarePoolSize) {
    errors.push(`${mapId}: ${chainLength}-chain trial rare ecology has ${rarePool.length} species, expected at most ${maxRarePoolSize}`)
  }
  const rareBatchSizes = getChallengeRareBatchSizes(rarePool.length)
  const rareBatchCount = rareBatchSizes.length
  if (rareBatchCount < 2) {
    errors.push(`${mapId}: challenge rare ecology must have multiple unlock batches, got ${rareBatchCount}`)
  }
  const rareBatchSpread = rareBatchSizes.length > 0 ? Math.max(...rareBatchSizes) - Math.min(...rareBatchSizes) : 0
  if (rareBatchSpread > 1) {
    errors.push(`${mapId}: challenge rare batches are not balanced: ${rareBatchSizes.join('/')}`)
  }
  if (rareBatchSizes.reduce((sum, size) => sum + size, 0) !== rarePool.length) {
    errors.push(`${mapId}: challenge rare batch sizes do not add up to rare pool size: ${rareBatchSizes.join('/')} vs ${rarePool.length}`)
  }
  if (props.teamSource !== 'challengeRarePool') {
    errors.push(`${mapId}: challenge teamSource should be challengeRarePool, got ${props.teamSource || 'missing'}`)
  }
  const challengeTeamIds = team
    .map((member) => getEntryPokemonId(member))
    .filter(Number.isInteger)
  const challengeRareIds = rarePool
    .map((entry) => getEntryPokemonId(entry))
    .filter(Number.isInteger)
  const challengeDistinctFamilyCount = countDistinctEvolutionFamilies(challengeRareIds)
  if (new Set(challengeTeamIds).size !== challengeTeamIds.length) {
    const duplicateChallengeIds = challengeTeamIds.filter((pokemonId, index, all) => all.indexOf(pokemonId) !== index)
    errors.push(`${mapId}: challenge team contains duplicate Pokemon: ${[...new Set(duplicateChallengeIds)].map(speciesName).join(', ')}`)
  }
  if (challengeDistinctFamilyCount >= challengeTeamIds.length) {
    const duplicateChallengeFamilies = findDuplicateEvolutionFamilyMembers(challengeTeamIds)
    if (duplicateChallengeFamilies.length > 0) {
      errors.push(`${mapId}: challenge team reuses evolution families even though rare pool can avoid it: ${duplicateChallengeFamilies.join(', ')}`)
    }
  }
  const finalThreeRareIds = getChallengeFinalThreeRareIds(rarePool)
  const finalThreeFamilies = finalThreeRareIds.map((pokemonId) => getEvolutionFamilyIds(pokemonId))
  const bossCandidateFamilyCount = countDistinctEvolutionFamilies([
    ...finalThreeRareIds,
    bossRareId
  ].filter(Number.isInteger))
  if (bossProps.teamSource !== 'challengeFinalThreeBatches') {
    errors.push(`${mapId}: boss teamSource should be challengeFinalThreeBatches, got ${bossProps.teamSource || 'missing'}`)
  }
  if (!Array.isArray(bossProps.challengeFinalThreeBatchPokemonIds) || bossProps.challengeFinalThreeBatchPokemonIds.length !== finalThreeRareIds.length) {
    errors.push(`${mapId}: boss must record final three challenge batch ids`)
  }
  if (bossTeam.length < 6) {
    errors.push(`${mapId}: boss team must have 6 Pokemon, got ${bossTeam.length}`)
  }
  const bossIds = bossTeam
    .map((member) => getEntryPokemonId(member))
    .filter(Number.isInteger)
  if (new Set(bossIds).size !== bossIds.length) {
    const duplicateBossIds = bossIds.filter((pokemonId, index, all) => all.indexOf(pokemonId) !== index)
    errors.push(`${mapId}: boss team contains duplicate Pokemon: ${[...new Set(duplicateBossIds)].map(speciesName).join(', ')}`)
  }
  if (bossCandidateFamilyCount >= bossIds.length) {
    const duplicateBossFamilies = findDuplicateEvolutionFamilyMembers(bossIds)
    if (duplicateBossFamilies.length > 0) {
      errors.push(`${mapId}: boss team reuses evolution families even though final trial batches can avoid it: ${duplicateBossFamilies.join(', ')}`)
    }
  }
  if (!Number.isInteger(bossRareId) || !bossTeam.some((member) => getEntryPokemonId(member) === bossRareId)) {
    errors.push(`${mapId}: boss team must include its unique rare Pokemon ${bossRareId || 'missing'}`)
  }
  const bossNonRareMembers = bossTeam.filter((member) => getEntryPokemonId(member) !== bossRareId)
  const bossOutsiders = bossNonRareMembers.filter((member) => {
    const memberId = getEntryPokemonId(member)
    return !finalThreeFamilies.some((family) => family.has(memberId))
  })
  if (bossOutsiders.length > 0) {
    errors.push(`${mapId}: boss team contains Pokemon outside final three trial batches: ${bossOutsiders.map((member) => speciesName(getEntryPokemonId(member))).join(', ')}`)
  }
  if (bossLevels.length > 0 && Math.min(...bossLevels) < maxLevel + 1) {
    errors.push(`${mapId}: boss levels should start above map max Lv.${maxLevel}, got ${bossLevels.join('/')}`)
  }
  if (bossLevels.length > 0 && Math.max(...bossLevels) < maxLevel + 3) {
    errors.push(`${mapId}: boss max level must be at least map max + 3, got ${bossLevels.join('/')}`)
  }
  const runRewardValues = [3, 4, 5, 6].map((trialSize) => {
    const runRewards = getChallengeRunRewardItems(config.regionOrder, trialSize)
    const duplicateRunRewardKeys = duplicateRewardKeys(runRewards)
    if (duplicateRunRewardKeys.length > 0) {
      errors.push(`${mapId}: ${trialSize}-battle run rewards contain duplicate items: ${duplicateRunRewardKeys.join(', ')}`)
    }
    return rewardValue(runRewards)
  })
  for (let index = 1; index < runRewardValues.length; index += 1) {
    if (runRewardValues[index] <= runRewardValues[index - 1]) {
      errors.push(`${mapId}: challenge run rewards must increase with difficulty, got ${runRewardValues.join('/')}`)
      break
    }
  }
  const roleBalance = getTrainerRoleBalance('challenge')
  const mapConfig = getMapConfig(mapId)
  const bounds = getTrainerDifficultyBounds({
    role: 'challenge',
    mapConfig,
    bossLevelCap
  })
  if (bossLevelCap && bounds.maxLevel > bossLevelCap) {
    errors.push(`${mapId}: challenge difficulty bound Lv.${bounds.maxLevel} exceeds boss cap Lv.${bossLevelCap}`)
  }
  for (const victoryCount of VARIANT_VICTORY_SAMPLES) {
    const variantTeam = resolveTrainerBattleTeamConfig(team, {
      role: 'challenge',
      eventType: 'challenge',
      eventId: challenge.id,
      mapName: mapId,
      dailyRefreshKey: 'trial-repeat-audit',
      victoryCount,
      mapConfig,
      mapWildPokemon: mapConfig?.wildPokemon,
      bossTeamConfig: bossTeam,
      challengeRarePool: rarePool,
      enableDailyVariant: true
    })
    const variantLevels = variantTeam.map((member) => Number(member.level)).filter(Number.isFinite)
    const variantIds = variantTeam
      .map((member) => getEntryPokemonId(member))
      .filter(Number.isInteger)
    if (victoryCount === 0) initialVariantTeamSize = variantTeam.length
    maxVariantTeamSize = Math.max(maxVariantTeamSize, variantTeam.length)
    if (variantLevels.length > 0) maxVariantLevel = Math.max(maxVariantLevel, ...variantLevels)
    if (victoryCount <= 3) {
      const expectedTeamSize = Math.min(MAX_CHAIN_BATTLES, MIN_CHAIN_BATTLES + victoryCount)
      if (variantTeam.length !== expectedTeamSize) {
        errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} should be ${expectedTeamSize} battles, got ${variantTeam.length}`)
      }
    }
    if (variantTeam.length < roleBalance.minTeamSize || variantTeam.length > MAX_CHAIN_BATTLES || variantTeam.length > roleBalance.maxTeamSize) {
      errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} team size out of range: ${variantTeam.length}`)
    }
    if (bossLevelCap && variantLevels.some((level) => level > bossLevelCap)) {
      errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} exceeds boss cap Lv.${bossLevelCap}: ${variantLevels.join('/')}`)
    }
    const invalidVariantMembers = variantTeam.filter((member) => !isLevelValidForSpecies(member.pokemonId, member.level))
    if (invalidVariantMembers.length > 0) {
      errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} has illegal evolution levels: ${invalidVariantMembers.map((member) => `${speciesName(member.pokemonId)}@${member.level}`).join('/')}`)
    }
    if (new Set(variantIds).size !== variantIds.length) {
      const duplicateVariantIds = variantIds.filter((pokemonId, index, all) => all.indexOf(pokemonId) !== index)
      errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} contains duplicate Pokemon: ${[...new Set(duplicateVariantIds)].map(speciesName).join(', ')}`)
    }
    if (rarePool.length > 0) {
      const outsiderVariantMembers = variantTeam.filter((member) => !isTeamMemberFromRarePool(member, rarePool))
      if (outsiderVariantMembers.length > 0) {
        errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} contains species outside unlock pool families: ${outsiderVariantMembers.map((member) => speciesName(getEntryPokemonId(member))).join(', ')}`)
      }
      const unlockBatch = rarePool.slice(
        getChallengeRareUnlockedCountForStage(rarePool.length, victoryCount),
        getChallengeRareUnlockedCountForStage(rarePool.length, victoryCount + 1)
      )
      const outsiderBatchMembers = variantTeam.filter((member) => !isTeamMemberFromRarePool(member, unlockBatch))
      if (unlockBatch.length > 0 && outsiderBatchMembers.length > 0) {
        errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} guardians must match unlock batch: ${outsiderBatchMembers.map((member) => speciesName(getEntryPokemonId(member))).join(', ')}`)
      }
    }
    if (challengeDistinctFamilyCount >= variantIds.length) {
      const duplicateVariantFamilies = findDuplicateEvolutionFamilyMembers(variantIds)
      if (duplicateVariantFamilies.length > 0) {
        errors.push(`${mapId}: repeat trial victoryCount ${victoryCount} reuses evolution families even though rare pool can avoid it: ${duplicateVariantFamilies.join(', ')}`)
      }
    }
  }
  if (maxVariantTeamSize !== MAX_CHAIN_BATTLES) {
    errors.push(`${mapId}: repeat trial must be able to grow to ${MAX_CHAIN_BATTLES} battles, sampled max ${maxVariantTeamSize}`)
  }
  if (rarePool.length > 0) {
    const outsiderTeamMembers = team.filter((member) => !isTeamMemberFromRarePool(member, rarePool))
    if (outsiderTeamMembers.length > 0) {
      errors.push(`${mapId}: challenge team contains species outside unlock pool families: ${outsiderTeamMembers.map((member) => speciesName(getEntryPokemonId(member))).join(', ')}`)
    }
  }

  const duplicateRareIds = challengeRareIds
    .filter((pokemonId, index, all) => all.indexOf(pokemonId) !== index)
  if (duplicateRareIds.length > 0) {
    errors.push(`${mapId}: duplicate challenge rare ids ${[...new Set(duplicateRareIds)].join(', ')}`)
  }

  for (const entry of rarePool) {
    const pokemonId = getEntryPokemonId(entry)
    const explicitMinLevel = Math.trunc(Number(entry?.minLevel))
    const explicitMaxLevel = Math.trunc(Number(entry?.maxLevel))
    const entryMinLevel = Number.isInteger(explicitMinLevel)
      ? Math.max(1, explicitMinLevel)
      : minLevel
    const entryMaxLevel = Number.isInteger(explicitMaxLevel)
      ? Math.max(entryMinLevel, explicitMaxLevel)
      : maxLevel
    if (!Number.isInteger(pokemonId) || !MONSTERS.some((monster) => monster.id === pokemonId)) {
      errors.push(`${mapId}: invalid challenge rare species ${JSON.stringify(entry)}`)
      continue
    }
    const monster = MONSTERS.find((candidate) => candidate.id === pokemonId)
    const artworkPath = officialArtworkPath(monster)
    if (!artworkPath || !existsSync(artworkPath)) {
      errors.push(`${mapId}: ${speciesName(pokemonId)} is missing Pokédex artwork at ${artworkPath || 'unknown path'}`)
    }
    const isFinalLegendaryUnlock = Number(config.regionOrder) >= 8
    if (!isFinalLegendaryUnlock && RESERVED_LEGENDARY_DEX_NOS.has(monster?.dexNo ?? monster?.pokedexId)) {
      errors.push(`${mapId}: ${speciesName(pokemonId)} is reserved for future hidden/reward content, not trial grass unlocks`)
    }
    if (pickLevelForSpecies(pokemonId, entryMinLevel, entryMaxLevel) === null) {
      errors.push(`${mapId}: ${speciesName(pokemonId)} cannot legally appear in Lv.${entryMinLevel}-${entryMaxLevel}`)
    }
  }

  rows.push({
    mapId,
    title: props.title || '区域试炼',
    teamSize: team.length,
    initialRepeatSize: initialVariantTeamSize,
    rareBatchCount,
    rareBatchSizes: rareBatchSizes.join('/'),
    bossSpecies: bossTeam.map((member) => speciesName(getEntryPokemonId(member))).join(' / '),
    maxRepeatSize: maxVariantTeamSize,
    maxLevel: Math.max(...team.map((member) => Math.trunc(Number(member.level)) || 0)),
    maxRepeatLevel: maxVariantLevel,
    bossLevelCap: bossLevelCap || '',
    rewardValue: currentRewardValue,
    runRewardValues: runRewardValues.join('/'),
    rewardItems: rewards.map((reward) => `${reward.itemKey}x${reward.quantity || 1}`).join(', '),
    rareCount: rarePool.length,
    teamSpecies: team.map((member) => speciesName(getEntryPokemonId(member))).join(' / ')
  })

  previousRewardValue = currentRewardValue
}
})

console.table(rows)

if (errors.length > 0) {
  console.error('\nTrial balance audit failed:')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('\nTrial balance audit passed.')
