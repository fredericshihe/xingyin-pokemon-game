import { clearEntryPreloadMarks } from './gameEntryPreloadMarks'
import { clearBgmPreloadCache } from './gameBgm'
import { resetEntryPreloadSession } from './gameEntryPreload'
import { clearDecodedImageCache } from './localAssetPreloader'

const RELOAD_GUARD_KEY = 'game:stale-client-reload'
const PRESERVED_RUNTIME_CACHE_PATTERNS = [
  /^game-glb(?:-|$)/,
  /^game-static-art(?:-|$)/,
  /^game-static(?:-|$)/,
  /^game-audio(?:-|$)/,
  /^game-pokemon-art(?:-|$)/
]

const shouldPreserveRuntimeCache = (cacheName) => (
  PRESERVED_RUNTIME_CACHE_PATTERNS.some((pattern) => pattern.test(cacheName))
)

// vite.config.js 的资源缓存名，之前带构建号（如 game-glb-<buildId>），每次发版都会新增一套
const STABLE_RUNTIME_CACHE_NAMES = new Set([
  'game-glb',
  'game-static-art',
  'game-static',
  'game-audio',
  'game-pokemon-art'
])

export async function pruneLegacyRuntimeCaches() {
  if (typeof window === 'undefined' || !('caches' in window)) return
  try {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => shouldPreserveRuntimeCache(key) && !STABLE_RUNTIME_CACHE_NAMES.has(key))
      .map((key) => caches.delete(key)))
  } catch (error) {
    console.warn('[recover] legacy runtime cache prune failed', error)
  }
}

export function getExpectedGameUrl() {
  const base = import.meta.env.BASE_URL || '/'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}${base}`
}

export function isLikelyChunkLoadError(error) {
  const message = String(error?.message || error || '')
  return (
    error?.name === 'ChunkLoadError'
    || message.includes('Failed to fetch dynamically imported module')
    || message.includes('Importing a module script failed')
    || message.includes('error loading dynamically imported module')
    || message.includes('Loading chunk')
    || message.includes('Loading CSS chunk')
  )
}

export async function clearClientCaches({
  preserveRuntimeAssetCaches = true,
  preserveEntryPreloadMarks = preserveRuntimeAssetCaches
} = {}) {
  if (typeof window === 'undefined') return

  clearDecodedImageCache()
  clearBgmPreloadCache()
  if (!preserveEntryPreloadMarks) {
    clearEntryPreloadMarks()
  }
  try {
    resetEntryPreloadSession({ clearImageCache: false })
  } catch (error) {
    console.warn('[recover] reset entry preload session failed', error)
  }

  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => !preserveRuntimeAssetCaches || !shouldPreserveRuntimeCache(key))
      .map((key) => caches.delete(key)))
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map((registration) => registration.unregister()))
  }
}

export async function recoverFromStaleClient({ force = false } = {}) {
  if (typeof window === 'undefined') return false
  if (!force && window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1') return false

  window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  await clearClientCaches()
  window.location.reload()
  return true
}
