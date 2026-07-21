import { MONSTERS } from './gameData.js'
import { getExpToNextLevelOfficial } from './gameBalance.js'

export const ECOLOGY_SURVEY_REQUIRED_WILD_DEFEATS = 5

export const MAIN_ROUTE_TARGET_EXIT_LEVEL_BY_MAP = Object.freeze({
  GodotMap: 7,
  GodotMapV2: 16,
  GodotMapV2_MistLake: 22,
  GodotMapV2_FarmTown: 27,
  GodotMapV2_PirateShore: 33,
  GodotMapV2_Graveyard: 39,
  GodotMapV2_HexRuins: 44,
  GodotMapV2_SurvivalRidge: 51,
  GodotMapV2_BossHighland: 58
})

export const ECOLOGY_SURVEY_TARGET_LEVEL_BY_MAP = Object.freeze({
  GodotMap: 6,
  GodotMapV2: 13,
  GodotMapV2_MistLake: 19,
  GodotMapV2_FarmTown: 24,
  GodotMapV2_PirateShore: 30,
  GodotMapV2_Graveyard: 36,
  GodotMapV2_HexRuins: 42,
  GodotMapV2_SurvivalRidge: 49,
  GodotMapV2_BossHighland: 55
})

export const ECOLOGY_SURVEY_MAP_IDS = Object.freeze(Object.keys(ECOLOGY_SURVEY_TARGET_LEVEL_BY_MAP))
const ECOLOGY_SURVEY_MAP_ID_SET = new Set(ECOLOGY_SURVEY_MAP_IDS)

export const isEcologySurveyMap = (mapName) => (
  typeof mapName === 'string' && ECOLOGY_SURVEY_MAP_ID_SET.has(mapName)
)

const ECOLOGY_SURVEY_MAX_LEVEL_GAIN_BY_MAP = Object.freeze({
  GodotMap: 1,
  GodotMapV2: 2,
  GodotMapV2_MistLake: 2,
  GodotMapV2_FarmTown: 3,
  GodotMapV2_PirateShore: 3,
  GodotMapV2_Graveyard: 3,
  GodotMapV2_HexRuins: 3,
  GodotMapV2_SurvivalRidge: 4,
  GodotMapV2_BossHighland: 5
})

const ECOLOGY_SURVEY_MIN_TOTAL_EXP_BY_MAP = Object.freeze({
  GodotMap: 180,
  GodotMapV2: 900,
  GodotMapV2_MistLake: 1200,
  GodotMapV2_FarmTown: 1800,
  GodotMapV2_PirateShore: 2400,
  GodotMapV2_Graveyard: 3000,
  GodotMapV2_HexRuins: 3600,
  GodotMapV2_SurvivalRidge: 5400,
  GodotMapV2_BossHighland: 8400
})

const clampLevel = (level) => Math.max(1, Math.min(100, Math.trunc(Number(level)) || 1))

const getCurrentExp = (mon) => Math.max(0, Math.trunc(Number(mon?.currentExp)) || 0)

const resolveBaseMonsterDefinition = (mon, getBaseMonsterDefinition = null) => {
  if (!mon) return null
  const candidateIds = [
    mon.baseId,
    mon.speciesId,
    mon.templateId,
    mon.monsterId,
    mon.id
  ]
    .map((value) => Math.trunc(Number(value)))
    .filter(Number.isInteger)

  for (const id of candidateIds) {
    const fromProvider = getBaseMonsterDefinition?.(id)
    if (fromProvider) return fromProvider
    const local = MONSTERS.find((monster) => Number(monster.id) === id)
    if (local) return local
  }

  const dexNo = Math.trunc(Number(mon.dexNo ?? mon.pokedexId))
  if (Number.isInteger(dexNo)) {
    return MONSTERS.find((monster) => Number(monster.dexNo ?? monster.pokedexId) === dexNo) || null
  }

  return null
}

const getExpNeededToReachLevel = (mon, targetLevel, getBaseMonsterDefinition = null) => {
  if (!mon) return 0
  const currentLevel = clampLevel(mon.level)
  const safeTargetLevel = clampLevel(targetLevel)
  if (currentLevel >= safeTargetLevel) return 0

  const baseMonster = resolveBaseMonsterDefinition(mon, getBaseMonsterDefinition)
  let needed = 0
  for (let level = currentLevel; level < safeTargetLevel; level += 1) {
    const expToNext = Math.max(1, Math.trunc(Number(getExpToNextLevelOfficial(level, baseMonster)) || 1))
    needed += level === currentLevel
      ? Math.max(0, expToNext - getCurrentExp(mon))
      : expToNext
  }
  return needed
}

export const getEcologySurveyFlagKey = (mapName) => (
  `ecology_survey:${typeof mapName === 'string' && mapName.length > 0 ? mapName : 'unknown'}:${ECOLOGY_SURVEY_REQUIRED_WILD_DEFEATS}`
)

export const getEcologySurveyTargetLevel = (mapName, fallbackLevel = 5) => (
  clampLevel(ECOLOGY_SURVEY_TARGET_LEVEL_BY_MAP[mapName] ?? fallbackLevel)
)

export const getEcologySurveyMaxLevelGain = (mapName) => (
  Math.max(1, Math.min(8, Math.trunc(Number(ECOLOGY_SURVEY_MAX_LEVEL_GAIN_BY_MAP[mapName])) || 3))
)

export const getEcologySurveyMinimumTotalExp = (mapName) => (
  Math.max(0, Math.trunc(Number(ECOLOGY_SURVEY_MIN_TOTAL_EXP_BY_MAP[mapName])) || 0)
)

export const buildEcologySurveyRewardPlan = ({
  mapName,
  playerTeam = [],
  getBaseMonsterDefinition = null,
  fallbackTargetLevel = 5
} = {}) => {
  const participantMons = (Array.isArray(playerTeam) ? playerTeam : [])
    .filter((mon) => mon?.id)
    .slice(0, 3)
  const targetLevel = getEcologySurveyTargetLevel(mapName, fallbackTargetLevel)
  const maxLevelGain = getEcologySurveyMaxLevelGain(mapName)
  const entries = participantMons.map((mon) => {
    const currentLevel = clampLevel(mon.level)
    const cappedTargetLevel = Math.min(targetLevel, currentLevel + maxLevelGain)
    const catchUpExp = getExpNeededToReachLevel(mon, targetLevel, getBaseMonsterDefinition)
    const cappedExp = getExpNeededToReachLevel(mon, cappedTargetLevel, getBaseMonsterDefinition)
    return {
      monId: mon.id,
      exp: Math.max(0, Math.min(catchUpExp, cappedExp))
    }
  }).filter((entry) => entry.monId)

  const totalExp = entries.reduce((sum, entry) => sum + entry.exp, 0)
  const minimumTotalExp = getEcologySurveyMinimumTotalExp(mapName)
  if (entries.length > 0 && totalExp > 0 && totalExp < minimumTotalExp) {
    const bonusPerMon = Math.ceil((minimumTotalExp - totalExp) / entries.length)
    entries.forEach((entry) => {
      entry.exp += bonusPerMon
    })
  }

  return {
    requiredWildDefeats: ECOLOGY_SURVEY_REQUIRED_WILD_DEFEATS,
    targetLevel,
    participantIds: entries.map((entry) => entry.monId),
    expByPokemon: entries,
    totalExp: entries.reduce((sum, entry) => sum + entry.exp, 0)
  }
}
