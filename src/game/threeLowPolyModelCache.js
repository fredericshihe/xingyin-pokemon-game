import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { getAdventureMapInfo } from './data/overworldMaps'
import { MAP_MODEL_MANIFEST } from './data/mapModelManifest.generated.js'
import { MAP_ASSET_CATALOG } from './data/mapAssetCatalog'
import { assetUrl } from '../utils/assetUrl'

const MODEL_BASE = assetUrl('/assets/3d/kenney-nature/')
const SURVIVAL_MODEL_BASE = assetUrl('/assets/3d/kenney-survival/')
const PIRATE_MODEL_BASE = assetUrl('/assets/3d/kenney-pirate/')
const FANTASY_TOWN_MODEL_BASE = assetUrl('/assets/3d/kenney-fantasy-town/')
const GRAVEYARD_MODEL_BASE = assetUrl('/assets/3d/kenney-graveyard/')
const PLATFORMER_MODEL_BASE = assetUrl('/assets/3d/kenney-platformer/')
const CATALOG_MODEL_URLS = Object.fromEntries(
  Object.values(MAP_ASSET_CATALOG)
    .filter((asset) => asset.assetPath)
    .map((asset) => [asset.id, assetUrl(asset.assetPath)])
)

const MODEL_URLS = {
  ...CATALOG_MODEL_URLS,
  grass: `${MODEL_BASE}grass.glb`,
  grassLarge: `${MODEL_BASE}grass_leafsLarge.glb`,
  bush: `${MODEL_BASE}plant_bushLarge.glb`,
  treeOak: `${MODEL_BASE}tree_oak.glb`,
  treeDefault: `${MODEL_BASE}tree_default.glb`,
  treePine: `${MODEL_BASE}tree_pineTallA_detailed.glb`,
  rock: `${MODEL_BASE}rock_largeA.glb`,
  stone: `${MODEL_BASE}stone_largeA.glb`,
  flowerYellow: `${MODEL_BASE}flower_yellowA.glb`,
  flowerRed: `${MODEL_BASE}flower_redA.glb`,
  mushroom: `${MODEL_BASE}mushroom_redGroup.glb`,
  campfire: `${MODEL_BASE}campfire_stones.glb`,
  tent: `${MODEL_BASE}tent_smallOpen.glb`,
  sign: `${MODEL_BASE}sign.glb`,
  wetlandReedClump: `${SURVIVAL_MODEL_BASE}grass-large.glb`,
  shoreDockSmall: `${PIRATE_MODEL_BASE}structure-platform-dock-small.glb`,
  shoreRowboat: `${PIRATE_MODEL_BASE}boat-row-small.glb`,
  townFenceLow: `${FANTASY_TOWN_MODEL_BASE}fence-broken.glb`,
  townStallGreen: `${FANTASY_TOWN_MODEL_BASE}stall-green.glb`,
  farmCartHigh: `${FANTASY_TOWN_MODEL_BASE}cart-high.glb`,
  graveLanternGlass: `${GRAVEYARD_MODEL_BASE}lantern-glass.glb`,
  graveIronFenceBroken: `${GRAVEYARD_MODEL_BASE}iron-fence-damaged.glb`,
  ridgeBlockGrassEdge: `${PLATFORMER_MODEL_BASE}block-grass-edge.glb`,
  mineCrateStrong: `${PLATFORMER_MODEL_BASE}crate-strong.glb`,
  mineControlLever: `${PLATFORMER_MODEL_BASE}lever.glb`
}

const SHARED_GLTF_LOADER = new GLTFLoader()
const DRACO_LOADER = new DRACOLoader()
DRACO_LOADER.setDecoderPath(`${import.meta.env.BASE_URL || '/'}draco/gltf/`)
DRACO_LOADER.preload()
SHARED_GLTF_LOADER.setDRACOLoader(DRACO_LOADER)
const MODEL_SCENE_CACHE = new Map()
const MODEL_LOAD_PROMISE_CACHE = new Map()

const CORE_MODEL_KEYS = new Set([
  'grass',
  'grassLarge',
  'bush',
  'treeOak',
  'treeDefault',
  'treePine',
  'rock',
  'stone',
  'flowerYellow',
  'flowerRed',
  'mushroom',
  'campfire',
  'tent',
  'sign'
])

export function getDecorativeModel(type) {
  switch (type) {
    case 'tent':
      return { key: 'tent', scale: 2.25 }
    case 'campfire':
      return { key: 'campfire', scale: 1.55 }
    case 'sign':
      return { key: 'sign', scale: 2.15 }
    case 'tree-oak':
      return { key: 'treeOak', scale: 1.42 }
    case 'tree-default':
      return { key: 'treeDefault', scale: 1.35 }
    case 'tree-pine':
      return { key: 'treePine', scale: 1.55 }
    case 'bush-large':
      return { key: 'bush', scale: 1.18 }
    case 'rock-large':
      return { key: 'rock', scale: 1.08 }
    case 'stone-large':
      return { key: 'stone', scale: 1.02 }
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
      if (MODEL_URLS[type]) return { key: type, scale: 1.0 }
      return null
  }
}

export function getRequiredModelKeys(mapInfo) {
  const keys = new Set(CORE_MODEL_KEYS)
  mapInfo?.decorativeObjects?.forEach((object) => {
    const spec = getDecorativeModel(object.type)
    if (spec?.key) keys.add(spec.key)
  })
  return keys
}

function loadModelScene(key) {
  if (MODEL_SCENE_CACHE.has(key)) {
    return Promise.resolve(MODEL_SCENE_CACHE.get(key))
  }
  if (MODEL_LOAD_PROMISE_CACHE.has(key)) {
    return MODEL_LOAD_PROMISE_CACHE.get(key)
  }

  const promise = SHARED_GLTF_LOADER.loadAsync(MODEL_URLS[key])
    .then((gltf) => {
      const scene = gltf.scene || null
      MODEL_SCENE_CACHE.set(key, scene)
      MODEL_LOAD_PROMISE_CACHE.delete(key)
      return scene
    })
    .catch((error) => {
      MODEL_LOAD_PROMISE_CACHE.delete(key)
      console.warn(`[ThreeLowPolyMap] Failed to load ${key}:`, error)
      return null
    })

  MODEL_LOAD_PROMISE_CACHE.set(key, promise)
  return promise
}

export function loadModels(requiredKeys = null) {
  const keys = requiredKeys
    ? [...requiredKeys].filter((key) => MODEL_URLS[key])
    : Object.keys(MODEL_URLS)
  return Promise.all(
    keys.map((key) =>
      loadModelScene(key).then((scene) => [key, scene])
    )
  ).then((entries) => Object.fromEntries(entries))
}

export function preloadThreeLowPolyMapModels(mapName) {
  const mapInfo = getAdventureMapInfo(mapName)
  if (!mapInfo || mapInfo.renderMode !== 'three-lowpoly') return Promise.resolve({})
  const manifestKeys = MAP_MODEL_MANIFEST?.[mapName]?.modelKeys
  const requiredKeys = Array.isArray(manifestKeys) && manifestKeys.length > 0
    ? manifestKeys
    : getRequiredModelKeys(mapInfo)
  return loadModels(requiredKeys)
}
