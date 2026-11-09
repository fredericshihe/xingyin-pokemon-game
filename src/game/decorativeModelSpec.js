// 装饰物类型 -> 模型 key / 默认尺寸。纯数据映射，不依赖加载器，
// 这样地图装配阶段（mapCatalog -> 尺寸统一）也能用，而不会和模型缓存循环引用。
import { MAP_ASSET_CATALOG } from './data/mapAssetCatalog.js'
import { resolveCharacterModelKey } from './data/characterAssets.js'
import { getTreeModelScale } from './modelScaleReference.js'

// 有 GLB 的模型 key：目录里的非程序化资源 + 模型缓存里手写的旧 key。
// 与 threeLowPolyModelCache.js 的 MODEL_URLS_RAW 保持一致（缓存模块加载时会校验）。
export const LEGACY_MODEL_KEYS = [
  'player_bicycle', 'player_sports_car', 'grass', 'grassLarge', 'bush', 'treeOak', 'treeDefault', 'treePine', 'rock', 'stone',
  'logStack', 'flowerYellow', 'flowerRed', 'mushroom', 'campfire', 'tent', 'sign', 'wetlandReedClump',
  'shoreDockSmall', 'shoreRowboat', 'townFenceLow', 'townStallGreen', 'farmCartHigh', 'graveLanternGlass',
  'graveIronFenceBroken', 'ridgeBlockGrassEdge', 'mineCrateStrong', 'mineControlLever'
]
const KNOWN_MODEL_KEYS = new Set([
  ...Object.values(MAP_ASSET_CATALOG).filter((asset) => asset.assetPath && !asset.procedural).map((asset) => asset.id),
  ...LEGACY_MODEL_KEYS
])

export function getDecorativeModel(type, decoration = {}) {
  const characterKey = resolveCharacterModelKey(type, decoration)
  if (characterKey !== type) return { key: characterKey, scale: 1 }
  switch (type) {
    case 'tent':
      return { key: 'tent', scale: 2.25 }
    case 'campfire':
      return { key: 'campfire', scale: 1.55 }
    case 'sign':
      return { key: 'sign', scale: 2.15 }
    case 'tree-oak':
      return { key: 'treeOak', scale: getTreeModelScale('treeOak') ?? 0.9 }
    case 'tree-default':
      return { key: 'treeDefault', scale: getTreeModelScale('treeDefault') ?? 0.9 }
    case 'tree-pine':
      return { key: 'treePine', scale: getTreeModelScale('treePine') ?? 0.9 }
    case 'bush-large':
    case 'nature_bush_large':
      return { key: 'bush', scale: 1.18 }
    case 'rock-large':
    case 'nature_rock_large':
      return { key: 'rock', scale: 1.08 }
    case 'stone-large':
    case 'nature_stone_large':
      return { key: 'stone', scale: 1.02 }
    case 'nature_log_stack':
      return { key: 'logStack', scale: 1.0 }
    case 'grass-small':
      return { key: 'grass', scale: 1.05 }
    case 'grass-large':
      return { key: 'grassLarge', scale: 1.12 }
    case 'flower-yellow':
      return { key: 'flowerYellow', scale: 1.1 }
    case 'flower-red':
      return { key: 'flowerRed', scale: 1.08 }
    case 'mushroom-red':
      return { key: 'mushroom', scale: 1.05 }
    case 'wetland_reed_clump':
      return { key: 'wetlandReedClump', scale: 1.05 }
    case 'shore_dock_small':
      return { key: 'shoreDockSmall', scale: 1.05 }
    case 'shore_rowboat':
      return { key: 'shoreRowboat', scale: 1.05 }
    case 'town_fence_low':
      return { key: 'townFenceLow', scale: 1.05 }
    case 'town_stall_green':
      return { key: 'townStallGreen', scale: 1.0 }
    case 'farm_cart_high':
      return { key: 'farmCartHigh', scale: 1.0 }
    case 'grave_lantern_glass':
      return { key: 'graveLanternGlass', scale: 1.0 }
    case 'grave_iron_fence_broken':
      return { key: 'graveIronFenceBroken', scale: 1.0 }
    case 'ridge_block_grass_edge':
      return { key: 'ridgeBlockGrassEdge', scale: 1.0 }
    case 'mine_crate_strong':
      return { key: 'mineCrateStrong', scale: 1.0 }
    case 'mine_control_lever':
      return { key: 'mineControlLever', scale: 1.0 }
    default:
      if (MAP_ASSET_CATALOG[type]?.procedural) {
        return { key: type, scale: MAP_ASSET_CATALOG[type].defaultScale ?? 1 }
      }
      if (KNOWN_MODEL_KEYS.has(type)) return { key: type, scale: 1.0 }
      return null
  }
}
