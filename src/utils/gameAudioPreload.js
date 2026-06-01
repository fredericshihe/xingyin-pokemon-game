import { getGameAudioPreloadEntries } from './gameBgmCatalog'
import { gameBgm } from './gameBgm'

const DEFAULT_PER_URL_TIMEOUT_MS = 45000

const delay = (ms) => new Promise((resolve) => {
  if (typeof window !== 'undefined') {
    window.setTimeout(resolve, ms)
    return
  }
  setTimeout(resolve, ms)
})

export async function preloadGameAudioAssets({
  urls = null,
  mapName,
  includeAllMaps = false,
  includeBattleTracks = true,
  retries = 3,
  perUrlTimeoutMs = DEFAULT_PER_URL_TIMEOUT_MS,
  onItemComplete,
  onRetryRound,
  shouldContinue = () => true
} = {}) {
  const resolvedEntries = urls
    ? urls.map((url) => ({ primary: url, alternateUrls: [] }))
    : getGameAudioPreloadEntries({ mapName, includeAllMaps, includeBattleTracks })

  if (!resolvedEntries.length) {
    onItemComplete?.({ loaded: 0, total: 0 })
    return { ok: true, total: 0, loaded: 0, failed: [] }
  }

  const failed = new Set(resolvedEntries.map((entry) => entry.primary))
  let retryRound = 0

  while (failed.size > 0 && retryRound <= retries) {
    if (!shouldContinue()) {
      break
    }

    if (retryRound > 0) {
      onRetryRound?.(retryRound, failed.size, resolvedEntries.length)
      await delay(Math.min(5000, 800 * retryRound))
    }

    const pending = resolvedEntries.filter((entry) => failed.has(entry.primary))
    for (const entry of pending) {
      if (!shouldContinue()) break

      const buffer = await gameBgm.preloadUrl(entry.primary, {
        alternateUrls: entry.alternateUrls,
        timeoutMs: perUrlTimeoutMs
      })

      if (buffer) {
        failed.delete(entry.primary)
        onItemComplete?.({
          loaded: resolvedEntries.length - failed.size,
          total: resolvedEntries.length,
          url: entry.primary,
          ok: true
        })
      }

      await delay(80)
    }

    retryRound += 1
  }

  const failedList = [...failed]
  if (failedList.length > 0) {
    console.warn('[preload] 部分 BGM 未预加载，进入游戏后会按需加载', failedList.length)
  }

  return {
    ok: failedList.length === 0,
    total: resolvedEntries.length,
    loaded: resolvedEntries.length - failedList.length,
    failed: failedList
  }
}
