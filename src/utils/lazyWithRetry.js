import { lazy } from 'react'
import { isLikelyChunkLoadError, recoverFromStaleClient } from './recoverStaleClient'

const RETRY_DELAY_MS = 1500

export function lazyWithRetry(importer, { retries = 3, delayMs = RETRY_DELAY_MS } = {}) {
  return lazy(async () => {
    let lastError = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await importer()
      } catch (error) {
        lastError = error
        if (isLikelyChunkLoadError(error)) {
          const recovered = await recoverFromStaleClient({ force: attempt > 0 })
          if (recovered) {
            await new Promise(() => {})
          }
        }
        if (attempt >= retries) break
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
    throw lastError
  })
}
