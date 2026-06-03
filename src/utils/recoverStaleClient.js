import { clearEntryPreloadMarks } from './gameEntryPreloadMarks'
import { clearBgmPreloadCache } from './gameBgm'
import { clearDecodedImageCache } from './localAssetPreloader'

const RELOAD_GUARD_KEY = 'game:stale-client-reload'
const PRESERVED_RUNTIME_CACHE_PATTERNS = [
  /^game-glb(?:-|$)/,
  /^game-audio(?:-|$)/,
  /^game-pokemon-art(?:-|$)/
]

const shouldPreserveRuntimeCache = (cacheName) => (
  PRESERVED_RUNTIME_CACHE_PATTERNS.some((pattern) => pattern.test(cacheName))
)

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
    const { resetEntryPreloadSession } = await import('./gameEntryPreload')
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
