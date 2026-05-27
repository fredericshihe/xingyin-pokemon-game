import { ADVENTURE_MAP_CHAIN } from '../game/data/overworldMaps'
import { startGameAssetPreload, scheduleIdleAssetWarmup } from './gameAssetBootstrap'

const DEFAULT_MAP_NAME = 'GodotMap'

export function resolveBootstrapMapName(savedGameData) {
  const candidate =
    savedGameData?.world?.currentMapName ||
    savedGameData?.currentMapName ||
    DEFAULT_MAP_NAME
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : DEFAULT_MAP_NAME
}

export function getAdjacentMapNames(mapName) {
  const index = ADVENTURE_MAP_CHAIN.indexOf(mapName)
  if (index < 0) return []
  const neighbors = []
  if (index > 0) neighbors.push(ADVENTURE_MAP_CHAIN[index - 1])
  if (index + 1 < ADVENTURE_MAP_CHAIN.length) neighbors.push(ADVENTURE_MAP_CHAIN[index + 1])
  return neighbors
}

export async function preloadMapModels(mapName) {
  if (!mapName) return null
  try {
    const module = await import('../game/threeLowPolyModelCache')
    return module.preloadThreeLowPolyMapModels(mapName)
  } catch (error) {
    console.warn('[bootstrap] 地图模型预加载失败', mapName, error)
    return null
  }
}

export function bootstrapGameSession({
  mapName = DEFAULT_MAP_NAME,
  playerTeam = [],
  adjacentMaps = true
} = {}) {
  const safeMapName = mapName || DEFAULT_MAP_NAME
  startGameAssetPreload({ tier: 'p0' })
  void preloadMapModels(safeMapName)
  startGameAssetPreload({
    mapName: safeMapName,
    playerTeam,
    tier: 'p1'
  })
  scheduleIdleAssetWarmup({
    mapName: safeMapName,
    adjacentMapNames: adjacentMaps ? getAdjacentMapNames(safeMapName) : []
  })
}
