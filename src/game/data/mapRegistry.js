import {
  MAP_CHAIN,
  getMapRegistryData,
  resolveMapEncounterTableId
} from './mapCatalog'

/** 兼容旧调用方的地图注册表导出 */
export const MAP_REGISTRY = Object.fromEntries(
  MAP_CHAIN.map((mapId) => [mapId, getMapRegistryData(mapId)])
)

export function getMapRegistryEntry(mapId) {
  return getMapRegistryData(mapId)
}

export function resolveEncounterTableId(mapId, useRealMaps) {
  void useRealMaps
  return resolveMapEncounterTableId(mapId)
}
