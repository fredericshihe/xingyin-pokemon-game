import { clearClientCaches } from './recoverStaleClient'

export const APP_BUILD_ID = typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

const BUILD_STORAGE_KEY = 'game:app-build-id'
const REMOTE_UPDATE_GUARD_KEY = 'game:remote-update-flush'
const UPDATE_OVERLAY_ID = 'app-update-overlay'

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000
const REMOTE_CHECK_DELAY_MS = 5 * 60 * 1000

let pwaUpdateInitialized = false

/** 移除残留更新遮罩 */
export function dismissUpdateOverlay() {
  if (typeof document === 'undefined') return
  document.getElementById(UPDATE_OVERLAY_ID)?.remove()
}

/**
 * 当前已加载的 JS 即为最新构建：同步本地记录，不刷新、不挡屏。
 * 真正需要换包时由 index.html 内联脚本在 React 启动前清缓存刷新。
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

  if (buildChanged) {
    try {
      await clearClientCaches()
    } catch (error) {
      console.warn('[update] cache clear on build change failed', error)
    }
  }

  try {
    window.localStorage.setItem(BUILD_STORAGE_KEY, APP_BUILD_ID)
  } catch {
    // ignore
  }
  window.sessionStorage.removeItem(REMOTE_UPDATE_GUARD_KEY)
  return buildChanged
}

export async function fetchRemoteBuildId() {
  const base = import.meta.env.BASE_URL || '/'
  const versionUrl = `${base}version.json`
  const response = await fetch(versionUrl, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  })
  if (!response.ok) return null
  const payload = await response.json()
  return typeof payload?.buildId === 'string' ? payload.buildId : null
}

async function applyRemoteBuildUpdate() {
  if (typeof window === 'undefined') return false
  if (window.sessionStorage.getItem(REMOTE_UPDATE_GUARD_KEY) === '1') return false

  window.sessionStorage.setItem(REMOTE_UPDATE_GUARD_KEY, '1')
  try {
    await clearClientCaches()
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
    const remoteBuildId = await fetchRemoteBuildId()
    if (!remoteBuildId || remoteBuildId === APP_BUILD_ID) return false
    return applyRemoteBuildUpdate()
  } catch (error) {
    console.warn('[update] remote version check failed', error)
    return false
  }
}

function scheduleRemoteVersionChecks() {
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
          registration.update().catch(() => {})
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
