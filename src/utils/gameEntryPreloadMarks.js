const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'
const PRELOAD_DONE_PREFIX = 'game:entry-preload-done:'
const ENTRY_PRELOAD_ASSET_VERSION = 'entry-assets-20260602'

export function getEntryPreloadStorageKey() {
  return `${PRELOAD_DONE_PREFIX}${ENTRY_PRELOAD_ASSET_VERSION}`
}

export function isEntryPreloadComplete() {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage.getItem(getEntryPreloadStorageKey()) === '1') return true

    // 旧版本把完成标记绑定到 build id。玩家升级后不应因为构建号变化被迫重下全量资源。
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(PRELOAD_DONE_PREFIX) && window.localStorage.getItem(key) === '1') {
        return true
      }
    }
    return false
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
