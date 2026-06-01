import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { Group } from 'three'
import { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } from './data/overworldMaps'
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
  logStack: `${MODEL_BASE}log_stack.glb`,
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

const DEFAULT_MODEL_TIMEOUT_MS = 45000
const DEFAULT_MODEL_CONCURRENCY = 2
const DEFAULT_MODEL_RETRIES = 4

const delay = (ms) => new Promise((resolve) => {
  if (typeof window !== 'undefined') {
    window.setTimeout(resolve, ms)
    return
  }
  setTimeout(resolve, ms)
})

function resolveModelPreloadOptions(overrides = {}) {
  const base = {
    timeoutMs: DEFAULT_MODEL_TIMEOUT_MS,
    concurrency: DEFAULT_MODEL_CONCURRENCY,
    retries: DEFAULT_MODEL_RETRIES
  }

  if (typeof navigator === 'undefined') {
    return { ...base, ...overrides }
  }

  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection
  const effectiveType = connection?.effectiveType || ''
  const saveData = connection?.saveData === true

  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    base.timeoutMs = 90000
    base.concurrency = 1
    base.retries = 6
  } else if (effectiveType === '3g') {
    base.timeoutMs = 70000
    base.concurrency = 2
    base.retries = 5
  }

  return { ...base, ...overrides }
}

export function resetModelLoadCache() {
  MODEL_SCENE_CACHE.clear()
  MODEL_LOAD_PROMISE_CACHE.clear()
}

function createEmptyModelScene(key) {
  const scene = new Group()
  scene.name = `missing-model:${key}`
  return scene
}

function cacheEmptyModelScene(key) {
  const scene = createEmptyModelScene(key)
  MODEL_SCENE_CACHE.set(key, scene)
  MODEL_LOAD_PROMISE_CACHE.delete(key)
  return scene
}

async function verifyModelAssetExists(key) {
  const url = MODEL_URLS[key]
  if (!url) return false
  if (typeof fetch !== 'function') return true
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' })
    return response.ok
  } catch {
    return true
  }
}

const CORE_MODEL_KEYS = new Set([
  'grass',
  'grassLarge',
  'bush',
  'treeOak',
  'treeDefault',
  'treePine',
  'rock',
  'stone',
  'logStack',
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

function loadModelSceneOnce(key, { timeoutMs = DEFAULT_MODEL_TIMEOUT_MS } = {}) {
  const url = MODEL_URLS[key]
  if (!url) {
    return Promise.resolve(null)
  }

  let timer = null
  const timeoutPromise = new Promise((_, reject) => {
    const schedule = typeof window !== 'undefined' ? window.setTimeout.bind(window) : setTimeout
    timer = schedule(() => {
      reject(new Error(`timeout:${key}`))
    }, Math.max(5000, timeoutMs))
  })

  return Promise.race([
    SHARED_GLTF_LOADER.loadAsync(url),
    timeoutPromise
  ])
    .then((gltf) => {
      if (timer && typeof window !== 'undefined') window.clearTimeout(timer)
      else if (timer) clearTimeout(timer)
      return gltf?.scene || null
    })
    .catch((error) => {
      if (timer && typeof window !== 'undefined') window.clearTimeout(timer)
      else if (timer) clearTimeout(timer)
      throw error
    })
}

async function loadModelSceneWithRetry(key, options = {}) {
  const { retries = DEFAULT_MODEL_RETRIES, timeoutMs = DEFAULT_MODEL_TIMEOUT_MS } = options
  const maxAttempts = Math.max(1, Math.trunc(Number(retries)) + 1)
  let lastError = null

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    MODEL_LOAD_PROMISE_CACHE.delete(key)
    try {
      const scene = await loadModelSceneOnce(key, {
        timeoutMs: timeoutMs + attempt * 10000
      })
      if (scene) {
        MODEL_SCENE_CACHE.set(key, scene)
        return scene
      }
      lastError = new Error(`empty-scene:${key}`)
    } catch (error) {
      lastError = error
      console.warn(`[ThreeLowPolyMap] Failed to load ${key} (attempt ${attempt + 1}/${maxAttempts}):`, error)
    }

    if (attempt < maxAttempts - 1) {
      await delay(600 * (attempt + 1))
    }
  }

  return null
}

function loadModelScene(key) {
  if (MODEL_SCENE_CACHE.has(key)) {
    return Promise.resolve(MODEL_SCENE_CACHE.get(key))
  }
  if (MODEL_LOAD_PROMISE_CACHE.has(key)) {
    return MODEL_LOAD_PROMISE_CACHE.get(key)
  }

  const promise = loadModelSceneWithRetry(key)
    .then((scene) => {
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

export function collectMapModelKeys(mapName) {
  const mapInfo = getAdventureMapInfo(mapName)
  if (!mapInfo || mapInfo.renderMode !== 'three-lowpoly') {
    return [...CORE_MODEL_KEYS].filter((key) => MODEL_URLS[key])
  }
  const manifestKeys = MAP_MODEL_MANIFEST?.[mapName]?.modelKeys
  const requiredKeys = Array.isArray(manifestKeys) && manifestKeys.length > 0
    ? manifestKeys
    : getRequiredModelKeys(mapInfo)
  return [...new Set([...CORE_MODEL_KEYS, ...requiredKeys])].filter((key) => MODEL_URLS[key])
}

export function collectAllAdventureMapModelKeys() {
  const keys = new Set(CORE_MODEL_KEYS)
  ADVENTURE_MAP_CHAIN.forEach((mapName) => {
    const mapInfo = getAdventureMapInfo(mapName)
    if (!mapInfo || mapInfo.renderMode !== 'three-lowpoly') return
    const manifestKeys = MAP_MODEL_MANIFEST?.[mapName]?.modelKeys
    const requiredKeys = Array.isArray(manifestKeys) && manifestKeys.length > 0
      ? manifestKeys
      : getRequiredModelKeys(mapInfo)
    requiredKeys.forEach((key) => keys.add(key))
  })
  return [...keys].filter((key) => MODEL_URLS[key])
}

export async function preloadModelKeysUntilComplete(keys = [], {
  onItemComplete = null,
  onRetryRound = null,
  shouldContinue = () => true,
  concurrency = null,
  retries = null,
  timeoutMs = null
} = {}) {
  const options = resolveModelPreloadOptions({
    concurrency: concurrency ?? undefined,
    retries: retries ?? undefined,
    timeoutMs: timeoutMs ?? undefined
  })
  const pendingKeys = [...new Set((Array.isArray(keys) ? keys : []).filter((key) => MODEL_URLS[key]))]
  if (!pendingKeys.length) {
    return { ok: true, total: 0, loaded: 0, keys: [] }
  }

  let remaining = [...pendingKeys]
  let loaded = 0
  let round = 0

  while (remaining.length > 0) {
    if (!shouldContinue()) {
      throw new Error('aborted')
    }

    round += 1
    if (round > 1) {
      onRetryRound?.(round - 1, remaining.length, pendingKeys.length)
      await delay(Math.min(10000, 1000 + round * 800))
    }

    const roundOptions = {
      ...options,
      concurrency: Math.max(1, Math.min(options.concurrency, round > 2 ? 1 : options.concurrency)),
      timeoutMs: options.timeoutMs + (round - 1) * 12000,
      retries: options.retries + round - 1
    }

    const failed = []
    let cursor = 0
    const workerCount = Math.max(
      1,
      Math.min(
        Math.trunc(Number(roundOptions.concurrency)) || 1,
        remaining.length
      )
    )

    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (cursor < remaining.length) {
        if (!shouldContinue()) return
        const index = cursor
        cursor += 1
        const key = remaining[index]
        MODEL_LOAD_PROMISE_CACHE.delete(key)
        const scene = await loadModelSceneWithRetry(key, roundOptions)
        if (!scene) {
          failed.push(key)
          continue
        }
        loaded += 1
        onItemComplete?.(key, { loaded, total: pendingKeys.length, retryRound: round })
      }
    }))

    if (failed.length === 0) break

    const stillMissing = []
    for (const key of failed) {
      const exists = await verifyModelAssetExists(key)
      if (!exists) {
        cacheEmptyModelScene(key)
        loaded += 1
        onItemComplete?.(key, { loaded, total: pendingKeys.length, retryRound: round, placeholder: true })
        continue
      }
      stillMissing.push(key)
    }
    remaining = stillMissing
  }

  return { ok: true, total: pendingKeys.length, loaded: pendingKeys.length, keys: pendingKeys }
}

/** @deprecated 内部改用 preloadModelKeysUntilComplete，保留别名避免旧调用抛错 */
export async function preloadModelKeysStrict(keys = [], options = {}) {
  return preloadModelKeysUntilComplete(keys, options)
}
