const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'
const PRELOAD_DONE_PREFIX = 'game:entry-preload-done:'

export function getEntryPreloadStorageKey() {
  return `${PRELOAD_DONE_PREFIX}${APP_BUILD_ID}`
}

export function isEntryPreloadComplete() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(getEntryPreloadStorageKey()) === '1'
  } catch {
    return false
  }
}

export function markEntryPreloadComplete() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getEntryPreloadStorageKey(), '1')
  } catch {
    // ignore quota / private mode
  }
}

/** 版本更新或清缓存时调用 */
export function clearEntryPreloadMarks() {
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
