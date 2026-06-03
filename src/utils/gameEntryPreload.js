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
const NON_BLOCKING_DEX_PHASE_BUDGET_MS = 65000
const NON_BLOCKING_MODEL_PHASE_BUDGET_MS = 70000

const PRELOAD_PHASES = {
  p0: '正在准备战斗、商店与界面素材',
  audio: '正在准备地图音乐与战斗音效',
  p2: '正在缓存完整图鉴立绘',
  p1: '正在准备当前队伍与遇敌素材',
  models: '正在搭建全部地图 3D 场景',
  engine: '正在启动地图引擎',
  complete: '加载完成'
}

const PRELOAD_PHASE_ORDER = ['p0', 'audio', 'p2', 'p1', 'models', 'engine']

function resolveProgressStage(phase, buckets, totals) {
  const phaseKey = PRELOAD_PHASE_ORDER.find((key) => PRELOAD_PHASES[key] === phase)
    || PRELOAD_PHASE_ORDER.find((key) => (buckets[key] || 0) < (totals[key] || 0))
    || 'engine'
  const stageIndex = Math.max(1, PRELOAD_PHASE_ORDER.indexOf(phaseKey) + 1)
  return {
    stageKey: phaseKey,
    stageIndex,
    stageCount: PRELOAD_PHASE_ORDER.length,
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
      percent: totalSteps > 0 ? Math.min(100, Math.round((loaded / totalSteps) * 100)) : 100,
      loaded,
      total: totalSteps,
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

function runWithTimeBudget(task, {
  budgetMs,
  fallback,
  onTimeout
} = {}) {
  if (typeof window === 'undefined' || !Number.isFinite(budgetMs) || budgetMs <= 0) {
    return task()
  }

  let timedOut = false
  let timer = null
  return Promise.race([
    task().then((result) => {
      if (timer) window.clearTimeout(timer)
      return result
    }),
    new Promise((resolve) => {
      timer = window.setTimeout(() => {
        timedOut = true
        onTimeout?.()
        resolve(typeof fallback === 'function' ? fallback() : fallback)
      }, budgetMs)
    })
  ]).finally(() => {
    if (!timedOut && timer) window.clearTimeout(timer)
  })
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

  let acceptingProgress = true
  const phaseShouldContinue = () => acceptingProgress && shouldContinue()
  const result = await runWithTimeBudget(() => preloadImageAssetsUntilComplete(urls, {
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
    allowPlaceholderFallback: phaseOptions.allowPlaceholderFallback !== false && !isDexArtPhase,
    shouldContinue: phaseShouldContinue,
    onRetryRound: createRetryReporter(tracker, bucketKey, phaseLabel),
    onItemComplete: (_result, stats) => {
      if (!acceptingProgress) return
      tracker.buckets[bucketKey] = Math.min(urls.length, stats.loaded)
      tracker.report(phaseLabel, `${tracker.buckets[bucketKey]}/${urls.length}`)
    }
  }), {
    budgetMs: phaseOptions.budgetMs,
    onTimeout: () => {
      acceptingProgress = false
      console.warn(`[preload] ${phaseLabel}达到启动预算，剩余资源转为后台加载`)
    },
    fallback: () => ({
      ok: false,
      timedOut: true,
      total: urls.length,
      loaded: tracker.buckets[bucketKey],
      failed: urls
    })
  })

  const loadedForProgress = phaseOptions.countFailuresAsLoaded && (result.timedOut || result.failed?.length)
    ? urls.length
    : Math.min(urls.length, result.loaded)
  tracker.buckets[bucketKey] = loadedForProgress
  const detailSuffix = result.timedOut || result.failed?.length
    ? ' · 剩余后台加载'
    : ''
  tracker.report(phaseLabel, `${tracker.buckets[bucketKey]}/${urls.length}${detailSuffix}`)

  if (isDexArtPhase && result.failed?.length) {
    console.warn('[preload] 部分图鉴立绘未缓存，进入游戏后将后台补载', result.failed.length)
  }

  return result
}

function warmImagePhaseInBackground(urls, phaseLabel, networkOptions, shouldContinue) {
  if (!urls?.length) return
  preloadImageAssetsUntilComplete(urls, {
    concurrency: 2,
    timeoutMs: Math.max(30000, networkOptions.timeoutMs),
    retries: Math.max(1, networkOptions.retries),
    maxRounds: 2,
    allowPlaceholderFallback: false,
    shouldContinue
  }).then((result) => {
    if (!result?.ok && result?.failed?.length) {
      console.warn(`[preload] ${phaseLabel}后台补载仍有失败项，将在打开对应界面时按需加载`, result.failed.length)
    }
  }).catch((error) => {
    if (error?.message === 'aborted') return
    console.warn(`[preload] ${phaseLabel}后台补载失败`, error)
  })
}

function warmModelPhaseInBackground(modelModule, keys, modelLoadOptions, shouldContinue) {
  if (!keys?.length) return
  modelModule.preloadModelKeysUntilComplete(keys, {
    ...modelLoadOptions,
    concurrency: 1,
    retries: Math.max(1, modelLoadOptions.retries),
    maxRounds: 2,
    onRetryRound: null,
    shouldContinue
  }).then((result) => {
    if (!result?.ok && result?.failed?.length) {
      console.warn('[preload] 地图 3D 场景后台补载仍有失败项，将在进入地图时按需加载', result.failed.length)
    }
  }).catch((error) => {
    if (error?.message === 'aborted') return
    console.warn('[preload] 地图 3D 场景后台补载失败', error)
  })
}

const AUDIO_PHASE_BUDGET_MS = 90000

async function loadAudioPhaseUntilComplete(urls, tracker, shouldContinue, networkOptions) {
  if (!urls.length) {
    tracker.buckets.audio = 0
    tracker.totals.audio = 0
    return { ok: true, total: 0, loaded: 0, failed: [] }
  }

  tracker.totals.audio = urls.length
  tracker.report(PRELOAD_PHASES.audio, `0/${urls.length}`)

  const preloadTask = preloadGameAudioAssets({
    urls,
    retries: 2,
    perUrlTimeoutMs: Math.min(35000, Math.max(20000, networkOptions.timeoutMs)),
    shouldContinue,
    onRetryRound: createRetryReporter(tracker, 'audio', PRELOAD_PHASES.audio),
    onItemComplete: ({ loaded, total }) => {
      if (!shouldContinue()) return
      tracker.buckets.audio = Math.min(urls.length, loaded)
      tracker.report(PRELOAD_PHASES.audio, `${tracker.buckets.audio}/${total}`)
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
  tracker.report(PRELOAD_PHASES.audio, `${urls.length}/${urls.length}`)
  return result
}

async function runEarlyAssetPreload(onProgress, shouldContinue = () => true) {
  const plan = await buildFullEntryPreloadPlan({ mapName: DEFAULT_MAP_NAME, playerTeam: [] })
  const { p0Urls, p2Urls, audioUrls, modelKeys, mapCount } = plan
  const imageTotal = p0Urls.length + p2Urls.length
  const totalSteps = p0Urls.length + audioUrls.length + p2Urls.length + modelKeys.length + ENGINE_STEP_COUNT
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
    onRetryRound: createRetryReporter(tracker, 'models', PRELOAD_PHASES.models)
  }

  await loadImagePhaseUntilComplete(
    p0Urls,
    PRELOAD_PHASES.p0,
    tracker,
    'p0',
    networkOptions,
    shouldContinue
  )
  await loadAudioPhaseUntilComplete(audioUrls, tracker, shouldContinue, networkOptions)
  const dexResult = await loadImagePhaseUntilComplete(
    p2Urls,
    PRELOAD_PHASES.p2,
    tracker,
    'p2',
    networkOptions,
    shouldContinue,
    {
      allowPlaceholderFallback: false,
      budgetMs: NON_BLOCKING_DEX_PHASE_BUDGET_MS,
      countFailuresAsLoaded: true,
      maxRounds: 1
    }
  )
  if (!dexResult?.ok && dexResult?.failed?.length) {
    warmImagePhaseInBackground(dexResult.failed, '完整图鉴', networkOptions, shouldContinue)
  }

  tracker.report(PRELOAD_PHASES.models, `0/${modelKeys.length}`)
  let acceptingModelProgress = true
  const modelResult = await runWithTimeBudget(() => modelModule.preloadModelKeysUntilComplete(modelKeys, {
    ...modelLoadOptions,
    maxRounds: 1,
    shouldContinue: () => acceptingModelProgress && shouldContinue(),
    onItemComplete: (_key, stats) => {
      if (!acceptingModelProgress) return
      tracker.buckets.models = stats.loaded
      tracker.report(PRELOAD_PHASES.models, `${stats.loaded}/${stats.total}`)
    }
  }), {
    budgetMs: NON_BLOCKING_MODEL_PHASE_BUDGET_MS,
    onTimeout: () => {
      acceptingModelProgress = false
      console.warn('[preload] 地图 3D 场景达到启动预算，剩余模型转为后台加载')
    },
    fallback: () => ({
      ok: false,
      timedOut: true,
      total: modelKeys.length,
      loaded: tracker.buckets.models,
      failed: modelKeys
    })
  })
  if (!modelResult?.ok && modelResult?.failed?.length) {
    warmModelPhaseInBackground(modelModule, modelResult.failed, modelLoadOptions, shouldContinue)
  }
  tracker.buckets.models = modelKeys.length
  tracker.report(PRELOAD_PHASES.models, `${modelKeys.length}/${modelKeys.length}${modelResult?.ok ? '' : ' · 剩余后台加载'}`)

  await mapModulePromise
  tracker.buckets.engine = ENGINE_STEP_COUNT
  tracker.report(PRELOAD_PHASES.engine)
  tracker.report(PRELOAD_PHASES.complete, '核心素材已预热，等待云端进度确认…')

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
      markEarlyPhasesComplete(tracker, plan)
      tracker.buckets.p1 = 0
    }

    if (p1Urls.length > 0) {
      await loadImagePhaseUntilComplete(
        p1Urls,
        PRELOAD_PHASES.p1,
        tracker,
        'p1',
        networkOptions,
        resolveShouldContinue()
      )
    } else {
      tracker.buckets.p1 = 0
      tracker.totals.p1 = 0
    }

    tracker.report(PRELOAD_PHASES.complete)
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
