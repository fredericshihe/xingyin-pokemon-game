const decodedImageAssets = new Map()
const imagePreloadPromises = new Map()

const toUniqueUrls = (urls = []) => (
  [...new Set((Array.isArray(urls) ? urls : [])
    .filter((url) => typeof url === 'string' && url.trim().length > 0)
    .map((url) => url.trim()))]
)

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

export const preloadImageAssets = async (urls = [], { concurrency = 10, timeoutMs = 10000 } = {}) => {
  const pendingUrls = toUniqueUrls(urls)
  const results = []
  let cursor = 0
  const workerCount = Math.max(1, Math.min(Math.trunc(Number(concurrency)) || 1, pendingUrls.length || 1))

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (cursor < pendingUrls.length) {
      const url = pendingUrls[cursor]
      cursor += 1
      results.push(await preloadImageAsset(url, { timeoutMs }))
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

const hideBrokenImage = (image) => {
  if (!image || typeof image !== 'object') return
  image.dataset.fallbackApplied = 'hidden'
  image.style.visibility = 'hidden'
  image.setAttribute('aria-hidden', 'true')
  image.removeAttribute('src')
  image.removeAttribute('srcset')
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
