import { gameAudio } from './gameAudio'
import { getCoreSfxUrls, getAllSfxUrls } from './gameSfxCatalog'

let sfxPreloadPromise = null
let fullSfxPreloadPromise = null

export async function preloadCoreSfx() {
  if (sfxPreloadPromise) return sfxPreloadPromise

  sfxPreloadPromise = (async () => {
    const urls = getCoreSfxUrls()
    const result = await gameAudio.preloadSfx(urls)
    console.log('[gameSfx] 核心音效预加载完成:', result)
    return result
  })()

  return sfxPreloadPromise
}

export async function preloadAllSfx() {
  if (fullSfxPreloadPromise) return fullSfxPreloadPromise

  fullSfxPreloadPromise = (async () => {
    const urls = getAllSfxUrls()
    const result = await gameAudio.preloadSfx(urls)
    console.log('[gameSfx] 全部音效预加载完成:', result)
    return result
  })()

  return fullSfxPreloadPromise
}

export function resetSfxPreload() {
  sfxPreloadPromise = null
  fullSfxPreloadPromise = null
}
