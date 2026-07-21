const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'
const PRELOAD_DONE_PREFIX = 'game:entry-preload-done:'
const ENTRY_PRELOAD_ASSET_VERSION = 'entry-assets-20260603-blocking'

let runtimeEntryPreloadComplete = false

function getCurrentEntryHash() {
  if (typeof document === 'undefined') return null
  const script = document.querySelector('script[src*="/assets/index-"]')
  const src = script?.getAttribute?.('src') || ''
  const match = src.match(/index-([A-Za-z0-9_-]+)\.js/)
  return match?.[1] || null
}

function getEntryPreloadSignature() {
  return [
    ENTRY_PRELOAD_ASSET_VERSION,
    APP_BUILD_ID,
    getCurrentEntryHash() || 'entry'
  ].join(':')
}

export function getEntryPreloadStorageKey() {
  return `${PRELOAD_DONE_PREFIX}${getEntryPreloadSignature()}`
}

export function isEntryPreloadComplete() {
  if (runtimeEntryPreloadComplete) return true
  if (typeof window === 'undefined' || import.meta.env.DEV) return false
  try {
    const raw = window.localStorage.getItem(getEntryPreloadStorageKey())
    if (!raw) return false
    const payload = JSON.parse(raw)
    const complete = payload?.signature === getEntryPreloadSignature()
    runtimeEntryPreloadComplete = complete
    return complete
  } catch {
    return false
  }
}

export function markEntryPreloadComplete() {
  runtimeEntryPreloadComplete = true
  try {
    if (typeof window !== 'undefined' && !import.meta.env.DEV) {
      const signature = getEntryPreloadSignature()
      window.localStorage.setItem(getEntryPreloadStorageKey(), JSON.stringify({
        signature,
        assetVersion: ENTRY_PRELOAD_ASSET_VERSION,
        buildId: APP_BUILD_ID,
        entryHash: getCurrentEntryHash(),
        completedAt: new Date().toISOString()
      }))
    }
  } catch {
    // ignore quota / private mode
  }
}

/** 版本更新或清缓存时调用 */
export function clearEntryPreloadMarks() {
  runtimeEntryPreloadComplete = false
  if (typeof window === 'undefined') return
  try {
    const keysToRemove = []
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(PRELOAD_DONE_PREFIX)) keysToRemove.push(key)
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key))
  } catch {
    // ignore
  }
}
