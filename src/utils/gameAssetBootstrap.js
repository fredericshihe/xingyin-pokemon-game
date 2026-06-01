import { MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS, EVOLUTION_ITEMS } from './gameData'
import { getMapConfig } from '../data/maps/mapConfig'
import { preloadImageAssets, warmImageAssets } from './localAssetPreloader'
import { assetUrl } from './assetUrl'
import {
  pokemonArtUrl,
  POKEMON_PLACEHOLDER_URL
} from './mediaAssetUrl'

export function getMapWildDexNumbers(mapName) {
  const config = getMapConfig(mapName)
  if (!config?.wildPokemon?.length) return []
  const dexNumbers = new Set()
  config.wildPokemon.forEach((entry) => {
    const monster = MONSTERS.find((candidate) => Number(candidate?.id) === Number(entry?.id))
    const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
    if (Number.isFinite(dexNo) && dexNo > 0) dexNumbers.add(dexNo)
  })
  return [...dexNumbers]
}

export function getTeamDexNumbers(playerTeam = []) {
  const dexNumbers = new Set()
  ;(Array.isArray(playerTeam) ? playerTeam : []).forEach((monster) => {
    const dexNo = Number(monster?.pokedexId ?? monster?.dexNo)
    if (Number.isFinite(dexNo) && dexNo > 0) {
      dexNumbers.add(dexNo)
      return
    }
    const baseId = Number(monster?.baseId ?? monster?.id)
    const baseMonster = MONSTERS.find((candidate) => Number(candidate?.id) === baseId)
    const baseDex = Number(baseMonster?.dexNo ?? baseMonster?.pokedexId)
    if (Number.isFinite(baseDex) && baseDex > 0) dexNumbers.add(baseDex)
  })
  return [...dexNumbers]
}

const BATTLE_SENDOUT_BALL_SPRITE = assetUrl('/assets/characters/battle-trainer/pokeapi-pokeball-dreamworld.png')
const TRAINER_PORTRAITS = {
  normal: assetUrl('/assets/characters/trainers/trainer-normal.png'),
  lieutenant: assetUrl('/assets/characters/trainers/trainer-lieutenant.png'),
  boss: assetUrl('/assets/characters/trainers/trainer-boss.png'),
  challenge: assetUrl('/assets/characters/trainers/trainer-challenge.png')
}

const STARTER_DEX_NUMBERS = [1, 4, 7, 25, 133]
const COMMON_BATTLE_DEX_NUMBERS = [59, 65, 94, 129, 130, 131, 135, 149]

let gameAssetPreloadPromise = null
let p1PreloadPromise = null
let idleWarmupScheduled = false
export let latestGameAssetPreloadSummary = null

const toUniqueAssetUrls = (urls = []) => (
  [...new Set((Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim()))]
)

/** 预加载只拉主格式（webp）；png 由 localAssetPreloader 在失败时自动回退，避免重复请求占满弱网带宽 */
const dexToPreloadArtUrls = (dexNumbers = []) => toUniqueAssetUrls(
  dexNumbers.map((dexNo) => pokemonArtUrl(dexNo))
)

const getInventoryPreloadAssetUrls = () => toUniqueAssetUrls([
  ...Object.values(POKEBALLS).flatMap((item) => (item?.sprite ? [item.sprite] : [])),
  ...Object.values(POTIONS).flatMap((item) => (item?.sprite ? [item.sprite] : [])),
  ...Object.values(EXP_POTIONS).flatMap((item) => (item?.sprite ? [item.sprite] : [])),
  ...Object.values(EVOLUTION_ITEMS).flatMap((item) => (item?.sprite ? [item.sprite] : []))
])

export const getP0ImageAssetUrls = () => toUniqueAssetUrls([
  POKEMON_PLACEHOLDER_URL,
  BATTLE_SENDOUT_BALL_SPRITE,
  ...Object.values(TRAINER_PORTRAITS),
  ...dexToPreloadArtUrls(STARTER_DEX_NUMBERS),
  ...getInventoryPreloadAssetUrls()
])

export const getP1ImageAssetUrls = ({ mapName, playerTeam = [] } = {}) => {
  const wildDex = getMapWildDexNumbers(mapName)
  const teamDex = getTeamDexNumbers(playerTeam)
  return toUniqueAssetUrls([
    ...dexToPreloadArtUrls(wildDex),
    ...dexToPreloadArtUrls(teamDex),
    ...dexToPreloadArtUrls(COMMON_BATTLE_DEX_NUMBERS)
  ])
}

export const getP2ImageAssetUrls = () => {
  const dexNumbers = new Set()
  MONSTERS.forEach((monster) => {
    const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
    if (Number.isFinite(dexNo) && dexNo > 0) dexNumbers.add(dexNo)
  })
  const urls = []
  dexNumbers.forEach((dexNo) => {
    urls.push(pokemonArtUrl(dexNo))
  })
  return toUniqueAssetUrls(urls)
}

export const getCriticalGameImageAssetUrls = getP0ImageAssetUrls

export const startGameAssetPreload = ({
  mapName,
  playerTeam = [],
  tier = 'p0'
} = {}) => {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    latestGameAssetPreloadSummary = { ok: true, skipped: true, total: 0, loaded: 0, failed: [] }
    return Promise.resolve(latestGameAssetPreloadSummary)
  }

  if (tier === 'p1') {
    if (p1PreloadPromise) return p1PreloadPromise
    const urls = getP1ImageAssetUrls({ mapName, playerTeam })
    p1PreloadPromise = preloadImageAssets(urls, {
      concurrency: 6,
      timeoutMs: 5000
    }).finally(() => {
      p1PreloadPromise = null
    })
    return p1PreloadPromise
  }

  if (gameAssetPreloadPromise) return gameAssetPreloadPromise

  gameAssetPreloadPromise = (async () => {
    const critical = await preloadImageAssets(getP0ImageAssetUrls(), {
      concurrency: 4,
      timeoutMs: 4500
    })
    latestGameAssetPreloadSummary = critical
    if (!critical.ok) {
      console.warn('[assets] P0 素材预加载存在失败项', critical.failed)
    }
    return critical
  })()

  return gameAssetPreloadPromise
}

const preloadAdjacentMapModels = async (mapNames = []) => {
  if (!mapNames.length) return
  try {
    const module = await import('../game/threeLowPolyModelCache')
    await Promise.all(mapNames.map((mapName) => module.preloadThreeLowPolyMapModels(mapName)))
  } catch (error) {
    console.warn('[assets] 相邻地图模型预热失败', error)
  }
}

const P2_WARMUP_BATCH_SIZE = 24

const runIdleWarmup = ({ mapName, adjacentMapNames = [] } = {}) => {
  const p2Urls = getP2ImageAssetUrls()
  let cursor = 0
  const loadNextBatch = () => {
    const batch = p2Urls.slice(cursor, cursor + P2_WARMUP_BATCH_SIZE)
    cursor += P2_WARMUP_BATCH_SIZE
    if (batch.length === 0) return
    warmImageAssets(batch, { concurrency: 3, timeoutMs: 5000 })
    if (cursor < p2Urls.length) {
      window.setTimeout(loadNextBatch, 1600)
    }
  }
  loadNextBatch()
  void preloadAdjacentMapModels(adjacentMapNames)
  if (mapName) {
    void import('../game/threeLowPolyMap')
  }
}

export const scheduleIdleAssetWarmup = ({ mapName, adjacentMapNames = [] } = {}) => {
  if (idleWarmupScheduled || typeof window === 'undefined') return
  idleWarmupScheduled = true

  const launch = () => runIdleWarmup({ mapName, adjacentMapNames })
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => launch(), { timeout: 4000 })
    return
  }
  window.setTimeout(launch, 1200)
}
