import { MAP_CHAIN } from '../game/data/mapCatalog'
import { normalizeTrainerRole } from './gameBalance'
import { assetUrl } from './assetUrl'

export const MAP_AMBIENT_TRACKS = Object.freeze({
  GodotMap: 'maps/mist-lake.ogg',
  GodotMapV2: 'maps/godot-map-v2.ogg',
  GodotMapV2_MistLake: 'maps/mist-lake.ogg',
  GodotMapV2_FarmTown: 'maps/farm-town.ogg',
  GodotMapV2_PirateShore: 'maps/pirate-shore.ogg',
  GodotMapV2_Graveyard: 'maps/graveyard.ogg',
  GodotMapV2_HexRuins: 'maps/hex-ruins.ogg',
  GodotMapV2_SurvivalRidge: 'maps/survival-ridge.ogg',
  GodotMapV2_BossHighland: 'maps/boss-highland.ogg',
  GodotMapV2_FrostDojo: 'maps/mist-lake.ogg',
  GodotMapV2_TideDojo: 'maps/pirate-shore.ogg',
  GodotMapV2_IronDojo: 'maps/hex-ruins.ogg',
  GodotMapV2_DragonDojo: 'maps/boss-highland.ogg',
  GodotMapV2_ChampionTower: 'maps/boss-highland.ogg'
})

export const BATTLE_BGM_TRACKS = Object.freeze({
  wild: 'battle/wild.ogg',
  trainer: 'battle/trainer-chiptune.ogg',
  lieutenant: 'battle/lieutenant.ogg',
  boss: 'battle/boss.ogg',
  challenge: 'battle/challenge.ogg'
})

export const AUDIO_TRACK_FALLBACKS = Object.freeze({
  'maps/godot-map.ogg': 'maps/godot-map.wav',
  'maps/godot-map-v2.ogg': 'maps/godot-map-v2.wav',
  'maps/mist-lake.ogg': 'maps/mist-lake.wav',
  'maps/farm-town.ogg': 'maps/farm-town.wav',
  'maps/pirate-shore.ogg': 'maps/pirate-shore.wav',
  'maps/graveyard.ogg': 'maps/graveyard.wav',
  'maps/hex-ruins.ogg': 'maps/hex-ruins.wav',
  'maps/survival-ridge.ogg': 'maps/survival-ridge.wav',
  'maps/boss-highland.ogg': 'maps/boss-highland.wav',
  'battle/wild.ogg': 'battle/wild.wav',
  'battle/trainer-chiptune.ogg': 'battle/trainer.wav',
  'battle/trainer.ogg': 'battle/trainer.wav',
  'battle/lieutenant.ogg': 'battle/lieutenant.wav',
  'battle/boss.ogg': 'battle/boss.wav',
  'battle/challenge.ogg': 'battle/challenge.wav'
})

const DEFAULT_MAP_ID = 'GodotMap'

export function getAudioTrackFallbackPath(relativePath) {
  return AUDIO_TRACK_FALLBACKS[relativePath] || null
}

export function getAudioTrackLoadUrls(relativePath) {
  if (!relativePath) return []
  const urls = [assetUrl(`/assets/audio/${relativePath}`)]
  const fallbackPath = getAudioTrackFallbackPath(relativePath)
  if (fallbackPath) {
    urls.push(assetUrl(`/assets/audio/${fallbackPath}`))
  }
  return urls
}

export function getMapAmbientTrackRelativePath(mapName) {
  return MAP_AMBIENT_TRACKS[mapName] || MAP_AMBIENT_TRACKS[DEFAULT_MAP_ID]
}

export function getMapAmbientTrackPath(mapName) {
  return assetUrl(`/assets/audio/${getMapAmbientTrackRelativePath(mapName)}`)
}

export function getMapAmbientTrackLoadUrls(mapName) {
  return getAudioTrackLoadUrls(getMapAmbientTrackRelativePath(mapName))
}

export function getBattleBgmTrackRelativePath(options = {}) {
  const trackId = getBattleBgmTrackId(options)
  return BATTLE_BGM_TRACKS[trackId] || BATTLE_BGM_TRACKS.trainer
}

export function getBattleBgmTrackId({ battleKind, eventRole, eventType, championTowerFloor } = {}) {
  if (battleKind === 'wild') return 'wild'
  if (Math.trunc(Number(championTowerFloor)) === 10) return 'boss'
  const role = normalizeTrainerRole(eventRole || eventType || 'normal')
  if (role === 'boss') return 'boss'
  if (role === 'lieutenant') return 'lieutenant'
  if (role === 'challenge') return 'challenge'
  return 'trainer'
}

export function getBattleBgmTrackPath(options = {}) {
  return assetUrl(`/assets/audio/${getBattleBgmTrackRelativePath(options)}`)
}

export function getBattleBgmTrackLoadUrls(options = {}) {
  return getAudioTrackLoadUrls(getBattleBgmTrackRelativePath(options))
}

export function getAllMapAmbientTrackUrls() {
  return MAP_CHAIN.map((mapName) => getMapAmbientTrackPath(mapName))
}

export function getAllBattleBgmTrackUrls() {
  return Object.values(BATTLE_BGM_TRACKS).map((relativePath) => assetUrl(`/assets/audio/${relativePath}`))
}

export function getGameAudioPreloadEntries({ mapName, includeAllMaps = false, includeBattleTracks = true } = {}) {
  const entries = []
  const seen = new Set()

  const pushRelativePath = (relativePath) => {
    const [primary, ...alternateUrls] = getAudioTrackLoadUrls(relativePath)
    if (!primary || seen.has(primary)) return
    seen.add(primary)
    entries.push({ primary, alternateUrls })
  }

  if (mapName) {
    pushRelativePath(getMapAmbientTrackRelativePath(mapName))
  }

  if (includeBattleTracks) {
    const battleTrackOrder = [
      BATTLE_BGM_TRACKS.trainer,
      BATTLE_BGM_TRACKS.wild,
      BATTLE_BGM_TRACKS.lieutenant,
      BATTLE_BGM_TRACKS.boss,
      BATTLE_BGM_TRACKS.challenge
    ]
    battleTrackOrder.forEach((relativePath) => pushRelativePath(relativePath))
  }
  if (includeAllMaps) {
    MAP_CHAIN.forEach((entryMapName) => pushRelativePath(getMapAmbientTrackRelativePath(entryMapName)))
  }

  return entries
}

export function getGameAudioPreloadUrls(options = {}) {
  return getGameAudioPreloadEntries(options).map((entry) => entry.primary)
}
