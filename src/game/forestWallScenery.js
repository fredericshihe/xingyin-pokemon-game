import { getBorderExitDirection } from './mapExitRunways.js'

const REGION_FOREST_MAP_IDS = new Set([
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_SurvivalRidge'
])

export const FOREST_WALL_TREE_HEIGHT_SCALE = 0.92

export function hasRegionForestWallTrees(mapId) {
  return REGION_FOREST_MAP_IDS.has(mapId)
}

export function isForestWallExitClearance(mapInfo, x, y) {
  return (mapInfo?.runtimeEvents || []).some((event) => {
    if (event.type !== 'warp' || !event.position) return false
    const dx = x - event.position.x, dy = y - event.position.y
    if (Math.hypot(dx, dy) < 3.2) return true
    // Keep the extended road clear too; a circular gap leaves trees across
    // the road just beyond the playable border, visible when looking back.
    const direction = getBorderExitDirection(mapInfo, event.position)
    if (!direction) return false
    const { dirX, dirZ } = direction
    return dx * dirX + dy * dirZ >= 0 && Math.abs(dx * -dirZ + dy * dirX) < 3.2
  })
}

export function getForestWallTreeChance(mapId, edge, insidePlayableArea = true) {
  if (!hasRegionForestWallTrees(mapId)) return insidePlayableArea ? (edge ? 0.9 : 0.96) : 0.9
  return insidePlayableArea ? (edge ? 0.24 : 0.32) : 0.38
}

export function getForestWallTreeKey(mapId, x, y) {
  if (mapId === 'GodotMapV2_SurvivalRidge') return 'treePine'
  const variant = (x * 17 + y * 31) % 3
  if (mapId === 'GodotMapV2_MistLake' || mapId === 'GodotMapV2_FarmTown' || mapId === 'GodotMapV2_HexRuins') {
    return variant === 0 ? 'treeOak' : 'treeDefault'
  }
  if (variant === 0) return 'treeOak'
  if (variant === 1) return 'treeDefault'
  return 'treePine'
}
