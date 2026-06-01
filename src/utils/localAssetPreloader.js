import { toPngFallbackUrl, POKEMON_PLACEHOLDER_URL, extractPokedexIdFromArtUrl } from './mediaAssetUrl'
import { assetUrl } from './assetUrl'

const ITEM_FALLBACK_URL = assetUrl('/assets/items/official-artwork/poke-ball.webp')

const decodedImageAssets = new Map()
const imagePreloadPromises = new Map()

const delay = (ms) => new Promise((resolve) => {
  if (typeof window !== 'undefined') {
    window.setTimeout(resolve, ms)
    return
  }
  setTimeout(resolve, ms)
})

const toUniqueUrls = (urls = []) => (
  [...new Set((Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim()))]
)

export function aliasDecodedImageAsset(targetUrl, sourceUrl) {
  if (!targetUrl || !sourceUrl) return false
  const sourceImage = decodedImageAssets.get(sourceUrl)
  if (!sourceImage) return false
  decodedImageAssets.set(targetUrl, sourceImage)
  imagePreloadPromises.delete(targetUrl)
  return true
}

async function tryAcceptImageFallback(url) {
  if (decodedImageAssets.has(url)) return true

  if (extractPokedexIdFromArtUrl(url)) {
    const placeholder = await preloadImageAsset(POKEMON_PLACEHOLDER_URL, { timeoutMs: 25000 })
    if (placeholder.ok) {
      return aliasDecodedImageAsset(url, POKEMON_PLACEHOLDER_URL)
    }
  }

  if (url.includes('/items/official-artwork/')) {
    const itemFallback = await preloadImageAsset(ITEM_FALLBACK_URL, { timeoutMs: 25000 })
    if (itemFallback.ok) {
      return aliasDecodedImageAsset(url, ITEM_FALLBACK_URL)
    }
  }

  return false
}

export const preloadImageAsset = (url, { timeoutMs = 10000 } = {}) => {
  if (typeof url !== 'string' || url.length === 0) {
    return Promise.resolve({ ok: false, url, reason: 'empty-url' })
  }
  if (decodedImageAssets.has(url)) {
    return Promise.resolve({ ok: true, url, cached: true })
  }
  if (imagePreloadPromises.has(url)) {
    return imagePreloadPromises.get(url)
  }
  if (typeof Image === 'undefined') {
    return Promise.resolve({ ok: true, url, skipped: true })
  }

  const image = new Image()
  image.decoding = 'async'
  image.loading = 'eager'

  const promise = new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) window.clearTimeout(timer)
      if (result.ok) {
        decodedImageAssets.set(url, image)
      } else {
        imagePreloadPromises.delete(url)
      }
      resolve(result)
    }

    timer = window.setTimeout(() => {
      finish({ ok: false, url, reason: 'timeout' })
    }, Math.max(1500, timeoutMs))

    image.onload = () => {
      if (typeof image.decode === 'function') {
        image.decode()
          .then(() => finish({ ok: true, url }))
          .catch(() => finish({ ok: true, url, decodeWarning: true }))
        return
      }
      finish({ ok: true, url })
    }

    image.onerror = () => {
      finish({ ok: false, url, reason: 'load-error' })
    }

    image.src = url

    if (image.complete && image.naturalWidth > 0) {
      window.queueMicrotask(() => finish({ ok: true, url, cached: true }))
    }
  })

  imagePreloadPromises.set(url, promise)
  return promise
}

export const preloadImageAssetWithFallback = async (url, { timeoutMs = 10000, retries = 0 } = {}) => {
  let lastResult = { ok: false, url, reason: 'load-error' }
  const maxAttempts = Math.max(1, Math.trunc(Number(retries)) + 1)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptTimeoutMs = timeoutMs + attempt * 5000
    const primary = await preloadImageAsset(url, { timeoutMs: attemptTimeoutMs })
    if (primary.ok) return primary
    lastResult = primary

    if (typeof url === 'string' && url.includes('.webp')) {
      const fallbackUrl = toPngFallbackUrl(url)
      if (fallbackUrl && fallbackUrl !== url) {
        const fallback = await preloadImageAsset(fallbackUrl, { timeoutMs: attemptTimeoutMs })
        if (fallback.ok) {
          return { ...fallback, requestedUrl: url, usedFallback: true }
        }
        lastResult = { ...primary, fallbackUrl, fallbackReason: fallback.reason }
      }
    }

    if (attempt < maxAttempts - 1) {
      await delay(400 * (attempt + 1))
    }
  }

  return lastResult
}

export const preloadImageAssetsStrict = async (urls = [], {
  concurrency = 8,
  timeoutMs = 15000,
  retries = 2,
  onItemComplete = null
} = {}) => {
  const pendingUrls = toUniqueUrls(urls)
  const results = []
  let cursor = 0
  const workerCount = Math.max(1, Math.min(Math.trunc(Number(concurrency)) || 1, pendingUrls.length || 1))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < pendingUrls.length) {
      const url = pendingUrls[cursor]
      cursor += 1
      const result = await preloadImageAssetWithFallback(url, { timeoutMs, retries })
      results.push(result)
      onItemComplete?.(result, {
        loaded: results.filter((entry) => entry.ok).length,
        attempted: results.length,
        total: pendingUrls.length
      })
    }
  }))

  const failed = results.filter((result) => !result.ok)
  return {
    ok: failed.length === 0,
    total: pendingUrls.length,
    loaded: results.length - failed.length,
    failed
  }
}

/** 弱网自动重试；allowPlaceholderFallback=false 时图鉴立绘必须真实进缓存（不拿占位图凑数） */
export async function preloadImageAssetsUntilComplete(urls = [], {
  concurrency = 3,
  timeoutMs = 30000,
  retries = 3,
  allowPlaceholderFallback = true,
  onItemComplete = null,
  onRetryRound = null,
  shouldContinue = () => true
} = {}) {
  const allUrls = toUniqueUrls(urls)
  if (!allUrls.length) {
    return { ok: true, total: 0, loaded: 0, failed: [] }
  }

  let remaining = [...allUrls]
  let round = 0
  let loadedCount = 0

  while (remaining.length > 0) {
    if (!shouldContinue()) {
      throw new Error('aborted')
    }

    round += 1
    if (round > 1) {
      onRetryRound?.(round - 1, remaining.length, allUrls.length)
      await delay(Math.min(8000, 900 + round * 700))
    }

    const roundOptions = {
      concurrency: Math.max(1, Math.min(concurrency, round > 2 ? 2 : concurrency)),
      timeoutMs: timeoutMs + (round - 1) * 8000,
      retries: retries + round - 1,
      onItemComplete: (_result, stats) => {
        onItemComplete?.(_result, {
          loaded: loadedCount + stats.loaded,
          attempted: stats.attempted,
          total: allUrls.length,
          retryRound: round
        })
      }
    }

    const batch = await preloadImageAssetsStrict(remaining, roundOptions)
    const failedSet = new Set(batch.failed.map((entry) => entry.url))
    loadedCount += remaining.length - failedSet.size
    remaining = batch.failed.map((entry) => entry.url)

    if (remaining.length === 0) break

    if (allowPlaceholderFallback) {
      const stillMissing = []
      for (const url of remaining) {
        const recovered = await tryAcceptImageFallback(url)
        if (recovered) {
          loadedCount += 1
          onItemComplete?.({ ok: true, url, fallback: true }, {
            loaded: loadedCount,
            attempted: loadedCount,
            total: allUrls.length,
            retryRound: round
          })
        } else {
          stillMissing.push(url)
        }
      }
      remaining = stillMissing
    }
  }

  return {
    ok: remaining.length === 0,
    total: allUrls.length,
    loaded: loadedCount,
    failed: remaining
  }
}

export const preloadImageAssets = async (urls = [], {
  concurrency = 10,
  timeoutMs = 10000,
  onItemComplete = null
} = {}) => {
  const pendingUrls = toUniqueUrls(urls)
  const results = []
  let cursor = 0
  const workerCount = Math.max(1, Math.min(Math.trunc(Number(concurrency)) || 1, pendingUrls.length || 1))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < pendingUrls.length) {
      const url = pendingUrls[cursor]
      cursor += 1
      const result = await preloadImageAsset(url, { timeoutMs })
      results.push(result)
      onItemComplete?.(result, {
        loaded: results.length,
        total: pendingUrls.length
      })
    }
  }))

  const failed = results.filter((result) => !result.ok)
  return {
    ok: failed.length === 0,
    total: pendingUrls.length,
    loaded: results.length - failed.length,
    failed
  }
}

export const warmImageAssets = (urls = [], options = {}) => {
  preloadImageAssets(urls, options).catch((error) => {
    console.warn('[assets] 图片预热失败', error)
  })
}

export const hasDecodedImageAsset = (url) => decodedImageAssets.has(url)

export function clearDecodedImageCache() {
  decodedImageAssets.clear()
  imagePreloadPromises.clear()
}

const hideBrokenImage = (image) => {
  if (!image || typeof image !== 'object') return
  image.dataset.fallbackApplied = 'hidden'
  image.style.visibility = 'hidden'
  image.setAttribute('aria-hidden', 'true')
  image.removeAttribute('src')
  image.removeAttribute('srcset')
}

/** 图鉴/队伍立绘：先重试一次原图，再换占位图（避免空白方块） */
export const handlePokemonImageError = (event) => {
  const image = event?.currentTarget || event?.target
  if (!image || typeof image !== 'object') return

  const currentSrc = image.getAttribute?.('src') || image.src || ''
  if (
    image.dataset.artRetry !== '1'
    && typeof currentSrc === 'string'
    && currentSrc.includes('/official-artwork/')
  ) {
    image.dataset.artRetry = '1'
    image.dataset.fallbackApplied = 'false'
    image.style.visibility = ''
    const retrySrc = currentSrc.includes('?')
      ? `${currentSrc}&_retry=1`
      : `${currentSrc}?_retry=1`
    image.removeAttribute('srcset')
    image.src = retrySrc
    return
  }

  applyImageFallback(event, POKEMON_PLACEHOLDER_URL)
}

export const applyImageFallback = (eventOrImage, fallbackUrl) => {
  const image = eventOrImage?.currentTarget || eventOrImage?.target || eventOrImage
  if (!image || typeof image !== 'object') return

  const safeFallbackUrl = typeof fallbackUrl === 'string' && fallbackUrl.trim()
    ? fallbackUrl.trim()
    : ''
  const currentSrc = image.getAttribute?.('src') || ''
  const absoluteSrc = image.src || ''
  const alreadyTriedFallback =
    image.dataset.fallbackApplied === 'true' ||
    (safeFallbackUrl && (currentSrc === safeFallbackUrl || absoluteSrc.endsWith(safeFallbackUrl)))

  if (!safeFallbackUrl || alreadyTriedFallback) {
    hideBrokenImage(image)
    return
  }

  image.dataset.fallbackApplied = 'true'
  image.style.visibility = ''
  image.removeAttribute('srcset')
  image.src = safeFallbackUrl
}
