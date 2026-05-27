import { lazy } from 'react'

const RETRY_DELAY_MS = 1200

export function lazyWithRetry(importer, { retries = 1, delayMs = RETRY_DELAY_MS } = {}) {
  return lazy(async () => {
    let lastError = null
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await importer()
      } catch (error) {
        lastError = error
        if (attempt >= retries) break
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
    throw lastError
  })
}
