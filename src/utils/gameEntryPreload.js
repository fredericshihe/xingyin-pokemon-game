import {
  getP0ImageAssetUrls,
  getP1ImageAssetUrls
} from './gameAssetBootstrap'
import { preloadImageAssetsUntilComplete, clearDecodedImageCache } from './localAssetPreloader'
import { markEntryPreloadComplete, clearEntryPreloadMarks } from './gameEntryPreloadMarks'

export {
  clearEntryPreloadMarks,
  getEntryPreloadStorageKey,
  markEntryPreloadComplete
} from './gameEntryPreloadMarks'

const DEFAULT_MAP_NAME = 'GodotMap'
const DEFAULT_IMAGE_TIMEOUT_MS = 35000
const DEFAULT_IMAGE_CONCURRENCY = 3
const DEFAULT_IMAGE_RETRIES = 4
const ENGINE_STEP_COUNT = 2
const PRELOAD_STALL_MS = 50000

const PRELOAD_PHASES = {
  p0: '正在准备战斗、商店与界面素材',
  audio: '正在准备地图音乐与战斗音效',
  p2: '正在缓存完整图鉴立绘',
  p1: '正在准备当前队伍与遇敌素材',
  models: '正在搭建当前地图 3D 场景',
  engine: '正在启动地图引擎',
  complete: '加载完成'
}

const PRELOAD_PHASE_ORDER = ['p0', 'engine', 'audio', 'p2', 'p1', 'models']

function resolveProgressStage(phase, buckets, totals) {
  const activePhases = PRELOAD_PHASE_ORDER.filter((key) => totals[key] > 0)
  const phaseKey = activePhases.find((key) => PRELOAD_PHASES[key] === phase)
    || activePhases.find((key) => (buckets[key] || 0) < totals[key])
    || activePhases.at(-1)
  const stageIndex = Math.max(1, activePhases.indexOf(phaseKey) + 1)
  return {
    stageKey: phaseKey,
    stageIndex,
    stageCount: activePhases.length,
    stageLoaded: Math.max(0, buckets[phaseKey] || 0),
    stageTotal: Math.max(0, totals[phaseKey] || 0)
  }
}

export function resolvePreloadNetworkOptions() {
  if (typeof navigator === 'undefined') {
    return {
      timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS,
      concurrency: DEFAULT_IMAGE_CONCURRENCY,
      retries: DEFAULT_IMAGE_RETRIES
    }
  }

  const connection = navigator.connection
    || navigator.mozConnection
    || navigator.webkitConnection
  const effectiveType = connection?.effectiveType || ''
  const saveData = connection?.saveData === true

  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    return { timeoutMs: 60000, concurrency: 1, retries: 6 }
  }
  if (effectiveType === '3g') {
    return { timeoutMs: 45000, concurrency: 2, retries: 5 }
  }
  return { timeoutMs: DEFAULT_IMAGE_TIMEOUT_MS, concurrency: 6, retries: DEFAULT_IMAGE_RETRIES }
}

const toUniqueUrls = (urls = []) => (
  [...new Set((Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim()))]
)

let earlyPreloadSession = null
let activeShouldContinue = () => true
let progressSubscribers = new Set()

export function bindEntryPreloadShouldContinue(fn) {
  activeShouldContinue = typeof fn === 'function' ? fn : () => true
}

function resolveShouldContinue() {
  return () => activeShouldContinue()
}

function notifyProgress(progress) {
  progressSubscribers.forEach((listener) => {
    try {
      listener(progress)
    } catch (error) {
      console.warn('[preload] progress listener failed', error)
    }
  })
}

export function subscribeEntryPreloadProgress(listener) {
  if (typeof listener !== 'function') return () => {}
  progressSubscribers.add(listener)
  return () => {
    progressSubscribers.delete(listener)
  }
}

/** 失败重试或版本更新时调用，避免复用已失败/已完成的预加载 Promise */
export function resetEntryPreloadSession({ clearImageCache = false } = {}) {
  if (earlyPreloadSession) {
    earlyPreloadSession.cancelled = true
    earlyPreloadSession.listeners.clear()
  }
  earlyPreloadSession = null
  if (clearImageCache) {
    clearDecodedImageCache()
  }
}

async function clearModelLoadCacheIfNeeded(shouldClear = false) {
  if (!shouldClear) return
  const module = await import('../game/threeLowPolyModelCache')
  module.resetModelLoadCache()
}

function createProgressReporter({
  totalSteps,
  mapCount,
  imageTotal,
  modelTotal,
  onProgress,
  scope = 'entry'
}) {
  const buckets = {
    p0: 0,
    p2: 0,
    p1: 0,
    audio: 0,
    models: 0,
    engine: 0
  }

  const totals = {
    p0: 0,
    p2: 0,
    p1: 0,
    audio: 0,
    models: 0,
    engine: ENGINE_STEP_COUNT
  }

  const report = (phaseOverride = null, detail = '') => {
    const loaded = buckets.p0 + buckets.p2 + buckets.p1 + buckets.audio + buckets.models + buckets.engine
    let phase = phaseOverride
    if (!phase) {
      if (buckets.p0 < totals.p0) phase = PRELOAD_PHASES.p0
      else if (buckets.audio < totals.audio) phase = PRELOAD_PHASES.audio
      else if (buckets.p2 < totals.p2) phase = PRELOAD_PHASES.p2
      else if (buckets.p1 < totals.p1) phase = PRELOAD_PHASES.p1
      else if (buckets.models < totals.models) phase = PRELOAD_PHASES.models
      else if (buckets.engine < totals.engine) phase = PRELOAD_PHASES.engine
      else phase = PRELOAD_PHASES.complete
    }
    const stage = resolveProgressStage(phase, buckets, totals)
    const payload = {
      phase,
      detail,
      percent: totalSteps > 0 ? Math.min(100, Math.floor((loaded / totalSteps) * 100)) : 100,
      loaded,
      total: totalSteps,
      scope,
      completedByPhase: { ...buckets },
      ...stage,
      imageTotal,
      modelTotal,
      mapCount
    }
    onProgress?.(payload)
    notifyProgress(payload)
    return payload
  }

  return {
    buckets,
    totals,
    report
  }
}

function createRetryReporter(tracker, bucketKey, phaseLabel) {
  return (retryRound, remaining, total) => {
    const successCount = total - remaining
    tracker.report(
      phaseLabel,
      `网络波动，正在重新加载部分资源 (${successCount}/${total} 已完成)`
    )
  }
}

/** 进游戏前只准备当前地图可玩所需资源，图鉴和其他地图在后台预热。 */
export async function buildFullEntryPreloadPlan({ mapName, playerTeam = [] } = {}) {
  const p0Urls = toUniqueUrls(getP0ImageAssetUrls())
  const p0UrlSet = new Set(p0Urls)
  const p1Urls = toUniqueUrls(getP1ImageAssetUrls({ mapName, playerTeam }))
    .filter((url) => !p0UrlSet.has(url))

  let modelKeys = []
  let mapCount = 0
  try {
    const { collectMapModelKeys } = await import('../game/threeLowPolyModelCache')
    modelKeys = collectMapModelKeys(mapName)
    mapCount = 1
  } catch (error) {
    throw new Error(`地图模型清单读取失败：${error?.message || error}`)
  }

  if (!modelKeys.length) {
    throw new Error('地图模型清单为空，无法确认 3D 地图资源已完整加载')
  }

  return {
    p0Urls,
    p2Urls: [],
    p1Urls,
    audioUrls: [],
    audioEntries: [],
    modelKeys,
    mapName,
    mapCount,
    totalSteps: p0Urls.length + p1Urls.length + modelKeys.length + ENGINE_STEP_COUNT
  }
}

async function loadImagePhaseUntilComplete(
  urls,
  phaseLabel,
  tracker,
  bucketKey,
  networkOptions,
  shouldContinue,
  phaseOptions = {}
) {
  if (!urls.length) {
    tracker.buckets[bucketKey] = 0
    tracker.totals[bucketKey] = 0
    return { ok: true, total: 0, loaded: 0, failed: [] }
  }

  const isDexArtPhase = bucketKey === 'p2'
  tracker.totals[bucketKey] = urls.length
  tracker.report(phaseLabel, `0/${urls.length}`)

  const result = await preloadImageAssetsUntilComplete(urls, {
    concurrency: phaseOptions.concurrency ?? (isDexArtPhase
      ? Math.max(1, Math.min(2, networkOptions.concurrency))
      : networkOptions.concurrency),
    timeoutMs: phaseOptions.timeoutMs ?? (isDexArtPhase
      ? Math.max(45000, networkOptions.timeoutMs)
      : networkOptions.timeoutMs),
    retries: phaseOptions.retries ?? (isDexArtPhase
      ? networkOptions.retries + 2
      : networkOptions.retries),
    maxRounds: phaseOptions.maxRounds ?? Infinity,
    allowPlaceholderFallback: phaseOptions.allowPlaceholderFallback === true,
    shouldContinue,
    onRetryRound: createRetryReporter(tracker, bucketKey, phaseLabel),
    onItemComplete: (_result, stats) => {
      if (!shouldContinue()) return
      tracker.buckets[bucketKey] = Math.min(urls.length, stats.loaded)
      tracker.report(phaseLabel, `${tracker.buckets[bucketKey]}/${urls.length}`)
    }
  })

  if (!shouldContinue()) throw new Error('aborted')
  if (!result.ok || result.failed?.length) {
    const failedCount = result.failed?.length || 0
    throw new Error(`${phaseLabel}未完整加载，失败资源 ${failedCount} 个`)
  }

  tracker.buckets[bucketKey] = urls.length
  tracker.report(phaseLabel, `${urls.length}/${urls.length}`)
  return result
}

async function runEarlyAssetPreload(onProgress, shouldContinue = () => true) {
  const plan = await buildFullEntryPreloadPlan({ mapName: DEFAULT_MAP_NAME, playerTeam: [] })
  if (!shouldContinue()) throw new Error('aborted')
  const { p0Urls, mapCount } = plan
  const imageTotal = p0Urls.length
  const totalSteps = p0Urls.length + ENGINE_STEP_COUNT
  const networkOptions = resolvePreloadNetworkOptions()

  const tracker = createProgressReporter({
    totalSteps,
    mapCount,
    imageTotal,
    modelTotal: 0,
    onProgress,
    scope: 'early'
  })

  tracker.totals.p0 = p0Urls.length
  tracker.totals.p2 = 0
  tracker.totals.p1 = 0
  tracker.totals.audio = 0
  tracker.totals.models = 0

  const mapModulePromise = import('../game/threeLowPolyMap')

  await loadImagePhaseUntilComplete(
    p0Urls,
    PRELOAD_PHASES.p0,
    tracker,
    'p0',
    networkOptions,
    shouldContinue
  )

  tracker.report(PRELOAD_PHASES.engine)
  await mapModulePromise
  if (!shouldContinue()) throw new Error('aborted')
  tracker.buckets.engine = ENGINE_STEP_COUNT
  tracker.report(PRELOAD_PHASES.engine)
  tracker.report(PRELOAD_PHASES.complete, '核心素材已预热，等待云端进度确认…')

  return plan
}

function markEarlyPhasesComplete(tracker, plan) {
  tracker.totals.p0 = plan.p0Urls.length
  tracker.totals.p2 = 0
  tracker.totals.audio = 0
  tracker.totals.models = plan.modelKeys.length
  tracker.totals.p1 = plan.p1Urls.length
  tracker.buckets.p0 = plan.p0Urls.length
  tracker.buckets.p2 = 0
  tracker.buckets.audio = 0
  tracker.buckets.models = 0
  tracker.buckets.engine = ENGINE_STEP_COUNT
}

async function runWithStallGuard(task, { onStall, stallMs = PRELOAD_STALL_MS } = {}) {
  let lastLoaded = -1
  let lastProgressAt = Date.now()
  let stallTriggered = false

  const unsubscribe = subscribeEntryPreloadProgress((progress) => {
    if (progress?.scope !== 'entry') return
    if (!Number.isFinite(progress?.loaded)) return
    if (progress.loaded !== lastLoaded) {
      lastLoaded = progress.loaded
      lastProgressAt = Date.now()
    }
  })

  const timer = typeof window !== 'undefined'
    ? window.setInterval(() => {
      if (stallTriggered) return
      if (Date.now() - lastProgressAt < stallMs) return
      stallTriggered = true
      onStall?.()
    }, 4000)
    : null

  try {
    return await task()
  } finally {
    unsubscribe()
    if (timer) window.clearInterval(timer)
  }
}

/** 登录页 / 云端读取期间只预热基础图片与地图引擎代码。 */
export function startEarlyEntryPreload({ onProgress = null, force = false } = {}) {
  if (force) {
    resetEntryPreloadSession()
  }
  if (!earlyPreloadSession) {
    const session = { listeners: new Set(), progress: null, cancelled: false, promise: null }
    earlyPreloadSession = session
    const shouldContinue = resolveShouldContinue()
    session.promise = runEarlyAssetPreload((progress) => {
      if (session.cancelled) return
      session.progress = progress
      session.listeners.forEach((listener) => listener(progress))
    }, () => !session.cancelled && shouldContinue())
      .then((plan) => ({ ok: true, plan, earlyComplete: true }))
      .catch((error) => {
        if (earlyPreloadSession === session) earlyPreloadSession = null
        throw error
      })
  }
  const session = earlyPreloadSession
  if (!onProgress) return session.promise
  // A joining caller receives only this prewarm session, including cached progress.
  // Global full-entry reports must not feed back into its early-progress callback.
  session.listeners.add(onProgress)
  if (session.progress) onProgress(session.progress)
  return session.promise.then((result) => {
    session.listeners.delete(onProgress)
    return result
  }, (error) => {
    session.listeners.delete(onProgress)
    throw error
  })
}

export async function runGameEntryPreload({
  mapName,
  playerTeam = [],
  onProgress = null,
  skipIfComplete = true,
  force = false,
  onStall = null
} = {}) {
  if (force) {
    resetEntryPreloadSession({ clearImageCache: true })
    clearEntryPreloadMarks()
    await clearModelLoadCacheIfNeeded(true)
  }

  const execute = async () => {
    const shouldContinue = resolveShouldContinue()
    const plan = await buildFullEntryPreloadPlan({ mapName, playerTeam })
    if (!shouldContinue()) throw new Error('aborted')
    const networkOptions = resolvePreloadNetworkOptions()
    const { p1Urls, mapCount, totalSteps } = plan

    const tracker = createProgressReporter({
      totalSteps,
      mapCount,
      imageTotal: plan.p0Urls.length + plan.p2Urls.length + plan.p1Urls.length,
      modelTotal: plan.modelKeys.length,
      onProgress
    })

    Object.assign(tracker.totals, {
      p0: plan.p0Urls.length, p1: plan.p1Urls.length, models: plan.modelKeys.length
    })
    tracker.report()
    // The full resource plan owns one denominator from the first visible update.
    // Prewarming contributes completed work, never its separate percentage.
    await startEarlyEntryPreload({ onProgress: (progress) => {
      if (!shouldContinue()) return
      tracker.buckets.p0 = Math.min(plan.p0Urls.length, progress.completedByPhase.p0)
      tracker.buckets.engine = Math.min(ENGINE_STEP_COUNT, progress.completedByPhase.engine)
      tracker.report(progress.phase === PRELOAD_PHASES.complete ? null : progress.phase, progress.detail)
    } })
    if (!shouldContinue()) throw new Error('aborted')
    markEarlyPhasesComplete(tracker, plan)

    if (p1Urls.length > 0) {
      await loadImagePhaseUntilComplete(
        p1Urls,
        PRELOAD_PHASES.p1,
        tracker,
        'p1',
        networkOptions,
        shouldContinue
      )
    } else {
      tracker.buckets.p1 = 0
      tracker.totals.p1 = 0
    }

    const modelModule = await import('../game/threeLowPolyModelCache')
    const modelLoadOptions = {
      concurrency: Math.max(1, Math.min(3, Math.floor(networkOptions.concurrency / 2) || 1)),
      retries: networkOptions.retries + 1,
      timeoutMs: Math.max(45000, networkOptions.timeoutMs * 2),
      shouldContinue,
      onRetryRound: createRetryReporter(tracker, 'models', PRELOAD_PHASES.models)
    }
    tracker.report(PRELOAD_PHASES.models, `0/${plan.modelKeys.length}`)
    const modelResult = await modelModule.preloadModelKeysUntilComplete(plan.modelKeys, {
      ...modelLoadOptions,
      allowMissingPlaceholder: false,
      onItemComplete: (_key, stats) => {
        if (!shouldContinue()) return
        tracker.buckets.models = stats.loaded
        tracker.report(PRELOAD_PHASES.models, `${stats.loaded}/${stats.total}`)
      }
    })
    if (!modelResult.ok || modelResult.failed?.length) {
      throw new Error(`当前地图 3D 场景未完整加载，失败模型 ${modelResult.failed?.length || 0} 个`)
    }
    tracker.buckets.models = plan.modelKeys.length
    tracker.report(PRELOAD_PHASES.models, `${plan.modelKeys.length}/${plan.modelKeys.length}`)

    tracker.report(PRELOAD_PHASES.complete)
    markEntryPreloadComplete()

    return {
      ok: true,
      models: { total: plan.modelKeys.length, keys: plan.modelKeys },
      mapName,
      mapCount
    }
  }

  return runWithStallGuard(execute, {
    onStall: () => {
      console.warn('[preload] 进度长时间未更新，触发缓存清理重试')
      onStall?.()
    }
  })
}

/** @deprecated 使用 buildFullEntryPreloadPlan */
export const buildBlockingPreloadPlan = buildFullEntryPreloadPlan
