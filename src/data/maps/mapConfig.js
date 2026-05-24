import { MAP_CHAIN, getMapConfigData } from '../../game/data/mapCatalog.js'

// 兼容旧调用方的地图配置导出
export const MAP_CONFIG = Object.fromEntries(
  MAP_CHAIN.map((mapId) => [mapId, getMapConfigData(mapId)])
)

export function getMapConfig(mapName) {
  return getMapConfigData(mapName)
}

export function getRandomWildPokemon(mapName) {
  const config = getMapConfig(mapName)
  const totalWeight = config.wildPokemon.reduce((sum, pokemon) => sum + pokemon.weight, 0)
  let random = Math.random() * totalWeight

  for (const pokemon of config.wildPokemon) {
    random -= pokemon.weight
    if (random <= 0) return pokemon.id
  }
  return config.wildPokemon[0].id
}

export function getRandomWildLevel(mapName) {
  const config = getMapConfig(mapName)
  return (
    Math.floor(Math.random() * (config.maxLevel - config.minLevel + 1)) + config.minLevel
  )
}
