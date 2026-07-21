import { gameAudio, getBgmSettings } from './gameAudio'
import {
  getBattleBgmTrackId,
  getBattleBgmTrackLoadUrls,
  getBattleBgmTrackPath,
  getMapAmbientTrackLoadUrls,
  getMapAmbientTrackPath
} from './gameBgmCatalog'

// Global loudness trim: map/background music should be noticeably quieter.
const BGM_BUS_GAIN = 0.32
const BATTLE_BGM_GAIN_MULTIPLIER = 0.65  // 战斗BGM降低到65%
const FADE_MS = 900
const MIN_GAIN = 0.0001

const resolveAbsoluteAssetUrl = (url) => {
  if (!url || typeof url !== 'string') return url
  if (/^https?:\/\//i.test(url)) return url
  if (typeof window !== 'undefined' && window.location?.origin) {
    try {
      return new URL(url, window.location.origin).href
    } catch {
      return url
    }
  }
  return url
}

/** Safari 并发 fetch 易误报 CORS；同源音频用 XHR 更稳 */
const loadAudioArrayBuffer = (url, timeoutMs = 30000) => new Promise((resolve, reject) => {
  const absoluteUrl = resolveAbsoluteAssetUrl(url)
  if (!absoluteUrl || typeof XMLHttpRequest === 'undefined') {
    reject(new Error('xhr-unavailable'))
    return
  }

  const xhr = new XMLHttpRequest()
  xhr.open('GET', absoluteUrl, true)
  xhr.responseType = 'arraybuffer'
  xhr.timeout = Math.max(5000, timeoutMs)

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
      resolve(xhr.response)
      return
    }
    reject(new Error(`xhr-status-${xhr.status}`))
  }
  xhr.onerror = () => reject(new Error('xhr-network'))
  xhr.ontimeout = () => reject(new Error('xhr-timeout'))
  xhr.onabort = () => reject(new Error('xhr-abort'))
  xhr.send()
})

const isLikelyAudioPayload = (arrayBuffer) => {
  if (!arrayBuffer || arrayBuffer.byteLength < 12) return false
  const header = new Uint8Array(arrayBuffer, 0, 4)
  const signature = String.fromCharCode(header[0], header[1], header[2], header[3])
  return signature === 'OggS' || signature === 'RIFF'
}

class GameBgmController {
  constructor() {
    this.bufferCache = new Map()
    this.preloadPromises = new Map()
    this.currentMode = null
    this.currentTrackKey = null
    this.activeLayer = null
    this.retiringLayers = []
    this.pendingStopTimers = new Set()
    this.transitionChain = Promise.resolve()
    this.playToken = 0
    this.enabled = true
    this.volume = 0.72
    this.pendingScene = null
    this.pendingTrackKey = null
    this.pendingTrackMode = null

    gameAudio.addUnlockListener(() => {
      void this.resumeAfterUnlock()
    })
  }

  rememberScene(scene) {
    if (!scene || typeof scene !== 'object') return
    this.pendingScene = scene
  }

  markPendingTrack(trackKey, mode = null) {
    if (!trackKey) return
    this.pendingTrackKey = trackKey
    this.pendingTrackMode = mode || null
  }

  clearPendingTrack(trackKey = null) {
    if (trackKey && this.pendingTrackKey !== trackKey) return
    this.pendingTrackKey = null
    this.pendingTrackMode = null
  }

  isTrackActive(trackKey) {
    return Boolean(trackKey && this.currentTrackKey === trackKey && this.activeLayer)
  }

  isTrackPending(trackKey) {
    return Boolean(trackKey && this.pendingTrackKey === trackKey)
  }

  syncExistingTrack() {
    this.syncBgmBusGain(0.05)
    this.syncActiveLayerGain(0.05)
  }

  async resumeAfterUnlock() {
    if (!this.canPlay() || !this.pendingScene) return false
    if (this.activeLayer && this.currentTrackKey) {
      this.syncBgmBusGain(0.03)
      this.syncActiveLayerGain(0.03)
      return true
    }
    if (!gameAudio.isContextRunning?.()) {
      return false
    }

    const scene = this.pendingScene
    if (scene.kind === 'map' && scene.mapName) {
      return this.playMapAmbient(scene.mapName)
    }
    if (scene.kind === 'battle' && scene.params) {
      return this.playBattleBgm(scene.params)
    }
    return false
  }

  applySettings(settings = null) {
    const next = getBgmSettings(settings)
    this.enabled = next.enabled
    this.volume = next.volume
    this.syncBgmBusGain(0.02)
    this.syncActiveLayerGain(0.02)
    if (!this.canPlay()) {
      void this.stop({ immediate: false })
    }
  }

  canPlay() {
    return this.enabled && this.volume > 0.001
  }

  getBus() {
    return gameAudio.ensureBgmBus?.() || null
  }

  syncBgmBusGain(rampSeconds = 0.05) {
    const bus = this.getBus()
    if (!bus?.gain || !bus.context) return
    const busParam = bus.gain.gain
    const target = this.canPlay() ? 1 : 0
    const now = bus.context.currentTime
    busParam.cancelScheduledValues(now)
    if (target <= 0) {
      busParam.setValueAtTime(0, now)
      return
    }
    if (rampSeconds <= 0.015) {
      busParam.setValueAtTime(target, now)
      return
    }
    busParam.setTargetAtTime(target, now, Math.max(0.01, rampSeconds))
  }

  syncActiveLayerGain(rampSeconds = 0.05) {
    if (!this.activeLayer?.gain) return
    const bus = this.getBus()
    const now = bus?.context?.currentTime || 0

    // 战斗BGM音量降低
    const gainMultiplier = this.currentMode === 'battle' ? BATTLE_BGM_GAIN_MULTIPLIER : 1
    const target = this.canPlay() ? this.volume * BGM_BUS_GAIN * gainMultiplier : MIN_GAIN

    this.activeLayer.gain.gain.cancelScheduledValues(now)
    this.activeLayer.gain.gain.setTargetAtTime(target, now, Math.max(0.01, rampSeconds))
  }

  clearPendingStopTimer(timerId) {
    if (timerId) {
      clearTimeout(timerId)
      this.pendingStopTimers.delete(timerId)
    }
  }

  scheduleLayerTeardown(layer, { fadeMs = FADE_MS, immediate = false } = {}) {
    if (!layer?.source || !layer?.gain) return Promise.resolve()

    const bus = this.getBus()
    const context = bus?.context
    const resolvedFadeMs = immediate ? 0 : fadeMs

    if (!context) {
      try {
        layer.source.stop(0)
        layer.source.disconnect()
      } catch { /* ignore */ }
      try { layer.gain.disconnect() } catch { /* ignore */ }
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const now = context.currentTime

      if (immediate) {
        // 立即停止，不淡出
        try {
          layer.source.stop(now)
          layer.source.disconnect()
        } catch { /* ignore */ }
        try { layer.gain.disconnect() } catch { /* ignore */ }
        resolve()
      } else {
        // 淡出后停止
        layer.gain.gain.cancelScheduledValues(now)
        layer.gain.gain.setTargetAtTime(MIN_GAIN, now, Math.max(0.01, resolvedFadeMs / 1000 / 4))
        const stopAt = now + resolvedFadeMs / 1000 + 0.05
        try { layer.source.stop(stopAt) } catch { /* ignore */ }

        const timerId = setTimeout(() => {
          this.clearPendingStopTimer(timerId)
          try { layer.source.disconnect() } catch { /* ignore */ }
          try { layer.gain.disconnect() } catch { /* ignore */ }
          resolve()
        }, resolvedFadeMs + 80)
        this.pendingStopTimers.add(timerId)
      }
    })
  }

  async fadeOutAllLayers({ fadeMs = FADE_MS, immediate = false } = {}) {
    const layers = [this.activeLayer, ...this.retiringLayers].filter(Boolean)
    this.activeLayer = null
    this.retiringLayers = []

    // 清除所有待处理的停止定时器
    this.pendingStopTimers.forEach(timerId => clearTimeout(timerId))
    this.pendingStopTimers.clear()

    if (!layers.length) return
    await Promise.all(layers.map((layer) => this.scheduleLayerTeardown(layer, { fadeMs, immediate })))
  }

  async ensureUnlocked() {
    if (!this.canPlay()) return false
    if (gameAudio.isContextRunning?.()) {
      this.syncBgmBusGain(0.01)
      return true
    }
    return gameAudio.unlock()
  }

  enqueueTransition(task) {
    const run = this.transitionChain.then(task, task)
    this.transitionChain = run.catch(() => {})
    return run
  }

  async preloadUrl(url, { alternateUrls = [], timeoutMs = 30000 } = {}) {
    if (!url) return null
    if (this.bufferCache.has(url)) return this.bufferCache.get(url)
    if (this.preloadPromises.has(url)) return this.preloadPromises.get(url)

    const candidateUrls = [url, ...alternateUrls.filter((candidate) => candidate && candidate !== url)]

    const promise = (async () => {
      const bus = this.getBus()
      const context = bus?.context || gameAudio.ensureContext?.()
      if (!context) return null

      let lastError = null
      const candidateErrors = []
      for (const candidateUrl of candidateUrls) {
        try {
          const arrayBuffer = await loadAudioArrayBuffer(candidateUrl, timeoutMs)
          if (!isLikelyAudioPayload(arrayBuffer)) {
            throw new Error(`BGM payload is not audio (${candidateUrl})`)
          }
          const audioBuffer = await context.decodeAudioData(arrayBuffer.slice(0))
          this.bufferCache.set(url, audioBuffer)
          if (candidateUrl !== url) {
            this.bufferCache.set(candidateUrl, audioBuffer)
          }
          return audioBuffer
        } catch (error) {
          lastError = error
          candidateErrors.push({ url: candidateUrl, error })
        }
      }

      const timeoutError = candidateErrors.find((entry) => String(entry.error?.message || entry.error).includes('timeout'))
      if (timeoutError) {
        console.warn('[gameBgm] preload timeout', timeoutError.url)
      }
      throw lastError || new Error(`BGM preload failed ${url}`)
    })()
      .catch((error) => {
        console.warn('[gameBgm] preload failed', url, error)
        return null
      })
      .finally(() => {
        this.preloadPromises.delete(url)
      })

    this.preloadPromises.set(url, promise)
    return promise
  }

  async preloadTracks(urls = []) {
    const unique = [...new Set((Array.isArray(urls) ? urls : []).filter(Boolean))]
    await Promise.all(unique.map((url) => this.preloadUrl(url)))
    return {
      total: unique.length,
      loaded: unique.filter((url) => this.bufferCache.has(url)).length
    }
  }

  async stop({
    immediate = false,
    preserveScene = false,
    preservePendingTrack = false,
    advanceToken = true
  } = {}) {
    if (advanceToken) {
      this.playToken += 1
    }
    this.currentMode = null
    this.currentTrackKey = null
    if (!preserveScene) {
      this.pendingScene = null
    }
    if (!preservePendingTrack) {
      this.clearPendingTrack()
    }

    const fadeMs = immediate ? 0 : FADE_MS
    return this.enqueueTransition(async () => {
      await this.fadeOutAllLayers({ fadeMs, immediate })
    })
  }

  attachLayerEndedHandler(layer) {
    if (!layer?.source) return
    layer.source.onended = () => {
      if (this.activeLayer === layer) {
        this.activeLayer = null
        this.currentTrackKey = null
        this.currentMode = null
      }
      this.retiringLayers = this.retiringLayers.filter((entry) => entry !== layer)
    }
  }

  startLayer(buffer, { fadeMs = FADE_MS, loop = true, mode = null } = {}) {
    const bus = this.getBus()
    if (!bus?.context || !bus.gain || !buffer) return null

    this.syncBgmBusGain(0.01)

    const context = bus.context
    const source = context.createBufferSource()
    source.buffer = buffer
    source.loop = loop

    const gainNode = context.createGain()
    gainNode.gain.value = MIN_GAIN
    source.connect(gainNode)
    gainNode.connect(bus.gain)

    const startAt = context.currentTime + 0.02
    source.start(startAt, 0)

    // 战斗BGM音量降低
    const gainMultiplier = mode === 'battle' ? BATTLE_BGM_GAIN_MULTIPLIER : 1
    const targetGain = this.canPlay() ? this.volume * BGM_BUS_GAIN * gainMultiplier : MIN_GAIN
    gainNode.gain.setTargetAtTime(targetGain, startAt, Math.max(0.01, fadeMs / 1000 / 3))

    const layer = { source, gain: gainNode }
    this.attachLayerEndedHandler(layer)
    return layer
  }

  async transitionTo(trackKey, buffer, { mode, loop = true, fadeMs = FADE_MS, playToken = null } = {}) {
    if (!buffer || !this.canPlay()) {
      await this.stop({ immediate: false })
      return false
    }

    return this.enqueueTransition(async () => {
      if (playToken != null && playToken !== this.playToken) return false

      const unlocked = await this.ensureUnlocked()
      if (!unlocked) return false

      if (playToken != null && playToken !== this.playToken) return false

      if (!this.canPlay()) {
        await this.stop({ immediate: false })
        return false
      }

      // 如果已经在播放相同的曲目，只需同步音量
      if (this.isTrackActive(trackKey)) {
        this.syncExistingTrack()
        return true
      }

      // 停止所有现有的BGM层，防止叠加
      await this.fadeOutAllLayers({ fadeMs, immediate: false })

      if (playToken != null && playToken !== this.playToken) return false

      if (!this.canPlay()) {
        this.currentMode = null
        this.currentTrackKey = null
        return false
      }

      // 启动新的BGM层
      const layer = this.startLayer(buffer, { fadeMs, loop, mode })
      if (!layer) return false

      this.activeLayer = layer
      this.currentMode = mode || null
      this.currentTrackKey = trackKey
      return true
    })
  }

  async playMapAmbient(mapName) {
    this.rememberScene({ kind: 'map', mapName })

    if (!this.canPlay()) {
      await this.stop({ immediate: false })
      return false
    }

    const trackKey = `map:${mapName}`

    // 如果已经在播放相同的地图BGM，只需同步音量
    if (this.isTrackActive(trackKey)) {
      this.syncExistingTrack()
      return true
    }

    if (this.isTrackPending(trackKey)) {
      this.syncExistingTrack()
      return true
    }

    const playToken = ++this.playToken
    this.markPendingTrack(trackKey, 'map')

    // 立即停止所有现有BGM，防止叠加
    await this.stop({
      immediate: true,
      preserveScene: true,
      preservePendingTrack: true,
      advanceToken: false
    })

    if (playToken !== this.playToken || this.pendingTrackKey !== trackKey) {
      this.clearPendingTrack(trackKey)
      return false
    }

    const url = getMapAmbientTrackPath(mapName)
    const [primaryUrl, ...alternateUrls] = getMapAmbientTrackLoadUrls(mapName)
    const buffer = await this.preloadUrl(primaryUrl || url, { alternateUrls })

    // 检查是否被取消（用户可能已经切换场景）
    if (playToken !== this.playToken || this.pendingTrackKey !== trackKey) {
      this.clearPendingTrack(trackKey)
      return false
    }

    const played = await this.transitionTo(trackKey, buffer, { mode: 'map', loop: true, playToken })
    this.clearPendingTrack(trackKey)
    return played
  }

  async playBattleBgm({ battleKind, eventRole, eventType, championTowerFloor } = {}) {
    const params = { battleKind, eventRole, eventType, championTowerFloor }
    this.rememberScene({ kind: 'battle', params })

    if (!this.canPlay()) {
      await this.stop({ immediate: false })
      return false
    }

    const trackId = getBattleBgmTrackId({ battleKind, eventRole, eventType, championTowerFloor })
    const trackKey = `battle:${trackId}`

    // 如果已经在播放相同的战斗BGM，只需同步音量
    if (this.isTrackActive(trackKey)) {
      this.syncExistingTrack()
      return true
    }

    if (this.isTrackPending(trackKey)) {
      this.syncExistingTrack()
      return true
    }

    const playToken = ++this.playToken
    this.markPendingTrack(trackKey, 'battle')

    // 立即停止所有现有BGM，防止叠加
    await this.stop({
      immediate: true,
      preserveScene: true,
      preservePendingTrack: true,
      advanceToken: false
    })

    if (playToken !== this.playToken || this.pendingTrackKey !== trackKey) {
      this.clearPendingTrack(trackKey)
      return false
    }

    const url = getBattleBgmTrackPath({ battleKind, eventRole, eventType, championTowerFloor })
    const [primaryUrl, ...alternateUrls] = getBattleBgmTrackLoadUrls({ battleKind, eventRole, eventType, championTowerFloor })
    const buffer = await this.preloadUrl(primaryUrl || url, { alternateUrls })

    // 检查是否被取消（用户可能已经切换场景）
    if (playToken !== this.playToken || this.pendingTrackKey !== trackKey) {
      this.clearPendingTrack(trackKey)
      return false
    }

    const played = await this.transitionTo(trackKey, buffer, { mode: 'battle', loop: true, playToken })
    this.clearPendingTrack(trackKey)
    return played
  }

  async resumeMapAmbient(mapName) {
    if (this.currentMode === 'battle') {
      return this.playMapAmbient(mapName)
    }
    if (this.currentMode === 'map' && this.activeLayer) {
      this.syncBgmBusGain(0.05)
      this.syncActiveLayerGain(0.05)
      return true
    }
    return this.playMapAmbient(mapName)
  }
}

export const gameBgm = new GameBgmController()

export function clearBgmPreloadCache() {
  gameBgm.bufferCache.clear()
  gameBgm.preloadPromises.clear()
}
