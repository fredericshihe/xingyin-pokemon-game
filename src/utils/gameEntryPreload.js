import {
  getP0ImageAssetUrls,
  getP1ImageAssetUrls,
  getP2ImageAssetUrls
} from './gameAssetBootstrap'
import { getGameAudioPreloadUrls } from './gameBgmCatalog'
import { preloadGameAudioAssets } from './gameAudioPreload'
import { preloadImageAssetsUntilComplete, clearDecodedImageCache } from './localAssetPreloader'
import {
  isEntryPreloadComplete,
  markEntryPreloadComplete
} from './gameEntryPreloadMarks'

export {
  clearEntryPreloadMarks,
  getEntryPreloadStorageKey,
  isEntryPreloadComplete,
  markEntryPreloadComplete
} from './gameEntryPreloadMarks'

const DEFAULT_MAP_NAME = 'GodotMap'
const DEFAULT_IMAGE_TIMEOUT_MS = 35000
const DEFAULT_IMAGE_CONCURRENCY = 3
const DEFAULT_IMAGE_RETRIES = 4
const ENGINE_STEP_COUNT = 2
const PRELOAD_STALL_MS = 50000

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

let earlyPreloadPromise = null
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
  earlyPreloadPromise = null
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
  onProgress
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
      if (buckets.p0 < totals.p0) phase = '正在加载战斗、商店与界面素材'
      else if (buckets.audio < totals.audio) phase = '正在加载地图氛围与战斗音乐'
      else if (buckets.p2 < totals.p2) phase = '正在加载完整图鉴'
      else if (buckets.p1 < totals.p1) phase = '正在加载队伍与遇敌图鉴'
      else if (buckets.models < totals.models) phase = '正在加载全部地图 3D 场景'
      else if (buckets.engine < totals.engine) phase = '正在初始化地图引擎'
      else phase = '加载完成'
    }
    const payload = {
      phase,
      detail,
      percent: totalSteps > 0 ? Math.min(100, Math.round((loaded / totalSteps) * 100)) : 100,
      loaded,
      total: totalSteps,
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

/** 进游戏前必须全部就绪：商店/战斗/UI + 完整图鉴 + 全部地图 3D 模型 */
export async function buildFullEntryPreloadPlan({ mapName, playerTeam = [] } = {}) {
  const p0Urls = toUniqueUrls(getP0ImageAssetUrls())
  const p2Urls = toUniqueUrls(getP2ImageAssetUrls())
  const p1Urls = toUniqueUrls(getP1ImageAssetUrls({ mapName, playerTeam }))
  const audioUrls = toUniqueUrls(getGameAudioPreloadUrls({
    mapName,
    includeAllMaps: true,
    includeBattleTracks: true
  }))

  let modelKeys = []
  let mapCount = 0
  try {
    const { collectAllAdventureMapModelKeys } = await import('../game/threeLowPolyModelCache')
    const { ADVENTURE_MAP_CHAIN } = await import('../game/data/overworldMaps')
    modelKeys = collectAllAdventureMapModelKeys()
    mapCount = ADVENTURE_MAP_CHAIN.length
  } catch (error) {
    console.warn('[preload] 地图模型清单读取失败', error)
  }

  return {
    p0Urls,
    p2Urls,
    p1Urls,
    audioUrls,
    modelKeys,
    mapName,
    mapCount,
    totalSteps: p0Urls.length + audioUrls.length + p2Urls.length + p1Urls.length + modelKeys.length + ENGINE_STEP_COUNT
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
    concurrency: isDexArtPhase
      ? Math.max(1, Math.min(2, networkOptions.concurrency))
      : networkOptions.concurrency,
    timeoutMs: isDexArtPhase
      ? Math.max(45000, networkOptions.timeoutMs)
      : networkOptions.timeoutMs,
    retries: isDexArtPhase
      ? networkOptions.retries + 2
      : networkOptions.retries,
    allowPlaceholderFallback: phaseOptions.allowPlaceholderFallback !== false && !isDexArtPhase,
    shouldContinue,
    onRetryRound: createRetryReporter(tracker, bucketKey, phaseLabel),
    onItemComplete: (_result, stats) => {
      tracker.buckets[bucketKey] = Math.min(urls.length, stats.loaded)
      tracker.report(phaseLabel, `${tracker.buckets[bucketKey]}/${urls.length}`)
    }
  })

  tracker.buckets[bucketKey] = Math.min(urls.length, result.loaded)
  tracker.report(phaseLabel, `${tracker.buckets[bucketKey]}/${urls.length}`)

  if (isDexArtPhase && result.failed?.length) {
    console.warn('[preload] 部分图鉴立绘未缓存，进入游戏后将后台补载', result.failed.length)
  }

  return result
}

const AUDIO_PHASE_BUDGET_MS = 90000

async function loadAudioPhaseUntilComplete(urls, tracker, shouldContinue, networkOptions) {
  if (!urls.length) {
    tracker.buckets.audio = 0
    tracker.totals.audio = 0
    return { ok: true, total: 0, loaded: 0, failed: [] }
  }

  tracker.totals.audio = urls.length
  tracker.report('正在加载地图氛围与战斗音乐', `0/${urls.length}`)

  const preloadTask = preloadGameAudioAssets({
    urls,
    retries: 2,
    perUrlTimeoutMs: Math.min(35000, Math.max(20000, networkOptions.timeoutMs)),
    shouldContinue,
    onRetryRound: createRetryReporter(tracker, 'audio', '正在加载地图氛围与战斗音乐'),
    onItemComplete: ({ loaded, total }) => {
      if (!shouldContinue()) return
      tracker.buckets.audio = Math.min(urls.length, loaded)
      tracker.report('正在加载地图氛围与战斗音乐', `${tracker.buckets.audio}/${total}`)
    }
  })

  const result = await Promise.race([
    preloadTask,
    new Promise((resolve) => {
      window.setTimeout(() => resolve({ ok: false, timedOut: true, failed: urls }), AUDIO_PHASE_BUDGET_MS)
    })
  ])

  if (result?.timedOut) {
    console.warn('[preload] BGM 预加载超时，先进入游戏，背景音乐将按需加载')
  } else if (!result.ok && result.failed?.length) {
    console.warn('[preload] 部分 BGM 未预加载，进入游戏后会按需加载', result.failed.length)
  }

  tracker.buckets.audio = urls.length
  tracker.report('正在加载地图氛围与战斗音乐', `${urls.length}/${urls.length}`)
  return result
}

async function runEarlyAssetPreload(onProgress, shouldContinue = () => true) {
  const plan = await buildFullEntryPreloadPlan({ mapName: DEFAULT_MAP_NAME, playerTeam: [] })
  const { p0Urls, p2Urls, audioUrls, modelKeys, mapCount } = plan
  const imageTotal = p0Urls.length + p2Urls.length
  const totalSteps = plan.totalSteps
  const networkOptions = resolvePreloadNetworkOptions()

  const tracker = createProgressReporter({
    totalSteps,
    mapCount,
    imageTotal,
    modelTotal: modelKeys.length,
    onProgress
  })

  tracker.totals.p0 = p0Urls.length
  tracker.totals.p2 = p2Urls.length
  tracker.totals.p1 = 0
  tracker.totals.audio = audioUrls.length
  tracker.totals.models = modelKeys.length

  const modelModule = await import('../game/threeLowPolyModelCache')
  const mapModulePromise = import('../game/threeLowPolyMap')

  const modelLoadOptions = {
    concurrency: Math.max(1, Math.floor(networkOptions.concurrency / 2) || 1),
    retries: networkOptions.retries + 1,
    timeoutMs: Math.max(45000, networkOptions.timeoutMs * 2),
    shouldContinue,
    onRetryRound: createRetryReporter(tracker, 'models', '正在加载全部地图 3D 场景')
  }

  await loadImagePhaseUntilComplete(
    p0Urls,
    '正在加载战斗、商店与界面素材',
    tracker,
    'p0',
    networkOptions,
    shouldContinue
  )
  await loadAudioPhaseUntilComplete(audioUrls, tracker, shouldContinue, networkOptions)
  await loadImagePhaseUntilComplete(
    p2Urls,
    '正在加载完整图鉴',
    tracker,
    'p2',
    networkOptions,
    shouldContinue
  )

  tracker.report('正在加载全部地图 3D 场景', `0/${modelKeys.length}`)
  await modelModule.preloadModelKeysUntilComplete(modelKeys, {
    ...modelLoadOptions,
    onItemComplete: (_key, stats) => {
      tracker.buckets.models = stats.loaded
      tracker.report('正在加载全部地图 3D 场景', `${stats.loaded}/${stats.total}`)
    }
  })

  await mapModulePromise
  tracker.buckets.engine = ENGINE_STEP_COUNT
  tracker.report('正在初始化地图引擎')
  tracker.report('正在加载队伍与遇敌图鉴', '等待云端存档…')

  return plan
}

function markEarlyPhasesComplete(tracker, plan) {
  tracker.totals.p0 = plan.p0Urls.length
  tracker.totals.p2 = plan.p2Urls.length
  tracker.totals.audio = plan.audioUrls.length
  tracker.totals.models = plan.modelKeys.length
  tracker.totals.p1 = plan.p1Urls.length
  tracker.buckets.p0 = plan.p0Urls.length
  tracker.buckets.p2 = plan.p2Urls.length
  tracker.buckets.audio = plan.audioUrls.length
  tracker.buckets.models = plan.modelKeys.length
  tracker.buckets.engine = ENGINE_STEP_COUNT
}

async function runWithStallGuard(task, { onStall, stallMs = PRELOAD_STALL_MS } = {}) {
  let lastLoaded = -1
  let lastProgressAt = Date.now()
  let stallTriggered = false

  const unsubscribe = subscribeEntryPreloadProgress((progress) => {
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

/** 登录页 / 云端读取期间并行启动（P0 + 完整图鉴 + 全部地图模型） */
export function startEarlyEntryPreload({ onProgress = null, force = false } = {}) {
  if (force) {
    resetEntryPreloadSession()
  }
  if (!force && isEntryPreloadComplete()) {
    return Promise.resolve({ ok: true, skipped: true, fromCache: true })
  }
  if (earlyPreloadPromise) {
    if (onProgress) {
      const unsubscribe = subscribeEntryPreloadProgress(onProgress)
      earlyPreloadPromise.finally(unsubscribe)
    }
    return earlyPreloadPromise
  }

  const shouldContinue = resolveShouldContinue()
  earlyPreloadPromise = runEarlyAssetPreload(onProgress, shouldContinue)
    .then((plan) => ({ ok: true, plan, earlyComplete: true }))
    .catch((error) => {
      earlyPreloadPromise = null
      throw error
    })

  return earlyPreloadPromise
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
  } else if (skipIfComplete && isEntryPreloadComplete()) {
    return { ok: true, skipped: true, fromCache: true }
  }

  const execute = async () => {
    const early = await startEarlyEntryPreload({ onProgress, force })
    const plan = await buildFullEntryPreloadPlan({ mapName, playerTeam })
    const networkOptions = resolvePreloadNetworkOptions()
    const { p1Urls, mapCount, totalSteps } = plan

    const tracker = createProgressReporter({
      totalSteps,
      mapCount,
      imageTotal: plan.p0Urls.length + plan.p2Urls.length + plan.p1Urls.length,
      modelTotal: plan.modelKeys.length,
      onProgress
    })

    const earlyComplete = Boolean(early?.earlyComplete && early?.plan)

    if (earlyComplete) {
      markEarlyPhasesComplete(tracker, plan)
      tracker.buckets.p1 = 0
    } else if (!early?.skipped) {
      await runEarlyAssetPreload(onProgress, resolveShouldContinue())
      markEarlyPhasesComplete(tracker, plan)
      tracker.buckets.p1 = 0
    } else {
      await runEarlyAssetPreload(onProgress, resolveShouldContinue())
      markEarlyPhasesComplete(tracker, plan)
      tracker.buckets.p1 = 0
    }

    if (p1Urls.length > 0) {
      await loadImagePhaseUntilComplete(
        p1Urls,
        '正在加载队伍与遇敌图鉴',
        tracker,
        'p1',
        networkOptions,
        resolveShouldContinue()
      )
    } else {
      tracker.buckets.p1 = 0
      tracker.totals.p1 = 0
    }

    tracker.report('加载完成')
    markEntryPreloadComplete()
    earlyPreloadPromise = null

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
