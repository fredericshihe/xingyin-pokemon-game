import { clearClientCaches } from './recoverStaleClient'

export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

const BUILD_STORAGE_KEY = 'game:app-build-id'
const ENTRY_HASH_STORAGE_KEY = 'game:app-entry-hash'
const REMOTE_UPDATE_GUARD_KEY = 'game:remote-update-flush'
const UPDATE_OVERLAY_ID = 'app-update-overlay'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const REMOTE_CHECK_DELAY_MS = 5 * 60 * 1000

let pwaUpdateInitialized = false

function getCurrentEntryHash() {
  if (typeof document === 'undefined') return null
  const script = document.querySelector('script[src*="/assets/index-"]')
  const src = script?.getAttribute?.('src') || ''
  const match = src.match(/index-([A-Za-z0-9_-]+)\.js/)
  return match?.[1] || null
}

/** 移除残留更新遮罩 */
export function dismissUpdateOverlay() {
  if (typeof document === 'undefined') return
  document.getElementById(UPDATE_OVERLAY_ID)?.remove()
}

/**
 * 当前已加载的 JS 即为最新构建：同步本地记录，不刷新、不挡屏。
 * 真正需要换包时由 index.html 内联脚本在 React 启动前清缓存刷新。
 * 不在这里清除大资源缓存；旧玩家升级时应复用已下载的立绘、音频和 3D 模型。
 */
export async function ensureClientMatchesBuild() {
  if (typeof window === 'undefined') return false

  let storedBuildId = null
  try {
    storedBuildId = window.localStorage.getItem(BUILD_STORAGE_KEY)
  } catch {
    // ignore
  }

  const buildChanged = Boolean(storedBuildId && storedBuildId !== APP_BUILD_ID)

  try {
    window.localStorage.setItem(BUILD_STORAGE_KEY, APP_BUILD_ID)
    const entryHash = getCurrentEntryHash()
    if (entryHash) window.localStorage.setItem(ENTRY_HASH_STORAGE_KEY, entryHash)
  } catch {
    // ignore
  }
  window.sessionStorage.removeItem(REMOTE_UPDATE_GUARD_KEY)
  return buildChanged
}

export async function fetchRemoteVersion() {
  if (import.meta.env.DEV) return null
  const base = import.meta.env.BASE_URL || '/'
  const versionUrl = `${base}version.json`
  const response = await fetch(versionUrl, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  })
  if (!response.ok) return null
  const contentType = response.headers?.get?.('content-type') || ''
  if (contentType && !contentType.includes('application/json')) return null
  const payload = await response.json()
  const buildId = typeof payload?.buildId === 'string' ? payload.buildId : null
  const entryHash = typeof payload?.entryHash === 'string' ? payload.entryHash : null
  if (!buildId && !entryHash) return null
  return { buildId, entryHash }
}

export async function fetchRemoteBuildId() {
  const version = await fetchRemoteVersion()
  return version?.buildId || null
}

async function applyRemoteBuildUpdate() {
  if (typeof window === 'undefined') return false
  if (window.sessionStorage.getItem(REMOTE_UPDATE_GUARD_KEY) === '1') return false

  window.sessionStorage.setItem(REMOTE_UPDATE_GUARD_KEY, '1')
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        return registration.update().catch(() => {})
      }))
    }
  } catch (error) {
    console.warn('[update] service worker update request failed', error)
  }
  try {
    await clearClientCaches({ preserveRuntimeAssetCaches: true })
  } catch (error) {
    console.warn('[update] cache clear failed', error)
  }
  window.location.reload()
  return true
}

export async function checkForRemoteBuildUpdate() {
  if (typeof window === 'undefined') return false
  if (document.visibilityState === 'hidden') return false

  try {
    const remoteVersion = await fetchRemoteVersion()
    if (!remoteVersion) return false
    const currentEntryHash = getCurrentEntryHash()
    const buildChanged = Boolean(remoteVersion.buildId && remoteVersion.buildId !== APP_BUILD_ID)
    const entryChanged = Boolean(remoteVersion.entryHash && currentEntryHash && remoteVersion.entryHash !== currentEntryHash)
    if (!buildChanged && !entryChanged) return false
    return applyRemoteBuildUpdate()
  } catch (error) {
    console.warn('[update] remote version check failed', error)
    return false
  }
}

function scheduleRemoteVersionChecks() {
  if (import.meta.env.DEV) return
  const runCheck = () => {
    void checkForRemoteBuildUpdate()
  }

  window.setTimeout(runCheck, REMOTE_CHECK_DELAY_MS)
  window.setInterval(runCheck, UPDATE_CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runCheck()
  })
}

/** PWA 静默更新；不在检测阶段盖黑屏 */
export function initPwaUpdates() {
  if (pwaUpdateInitialized || typeof window === 'undefined') return
  pwaUpdateInitialized = true

  dismissUpdateOverlay()

  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true,
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return

        const requestUpdate = () => {
          registration.update().then(() => {
            if (registration.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' })
            }
          }).catch(() => {})
        }

        requestUpdate()
        window.setInterval(requestUpdate, UPDATE_CHECK_INTERVAL_MS)
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') requestUpdate()
        })
      },
      onRegisterError(error) {
        console.warn('[pwa] service worker registration failed', error)
      }
    })
  }).catch((error) => {
    console.warn('[pwa] service worker registration skipped', error)
  })

  scheduleRemoteVersionChecks()
}

export function markAppReady() {
  dismissUpdateOverlay()
}
