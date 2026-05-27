import { TYPES } from './constants'

export const AUDIO_SETTINGS_STORAGE_KEY = 'pokemon-game:sfx-settings:v1'

const DEFAULT_AUDIO_SETTINGS = {
  enabled: true,
  volume: 0.72,
}

const MIN_VOLUME = 0
const MAX_VOLUME = 1
const MIN_ENVELOPE_GAIN = 0.0001
const AUDIO_DEBUG_GLOBAL_KEY = '__POKEMON_GAME_AUDIO_DEBUG__'
const AUDIO_DEBUG_ENABLED = Boolean(import.meta?.env?.DEV)

const getErrorMessage = (error) => {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (typeof error?.message === 'string') return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

const clampVolume = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_AUDIO_SETTINGS.volume
  return Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, numeric))
}

export const normalizeAudioSettings = (value = null) => ({
  enabled: value?.enabled !== false,
  volume: clampVolume(value?.volume),
})

export const readStoredAudioSettings = () => {
  if (typeof window === 'undefined') return DEFAULT_AUDIO_SETTINGS
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_AUDIO_SETTINGS
    return normalizeAudioSettings(JSON.parse(raw))
  } catch {
    return DEFAULT_AUDIO_SETTINGS
  }
}

export const writeStoredAudioSettings = (value = null) => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      AUDIO_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeAudioSettings(value))
    )
  } catch {
    // Ignore local preference persistence failures.
  }
}

const AUDIO_TYPE_STYLE = {
  [TYPES.FIRE]: { waveform: 'sawtooth', from: 932, to: 392, duration: 0.16, noise: true },
  [TYPES.WATER]: { waveform: 'sine', from: 392, to: 246.94, duration: 0.18, shimmer: true },
  [TYPES.GRASS]: { waveform: 'triangle', from: 349.23, to: 523.25, duration: 0.16, accent: 659.25 },
  [TYPES.ELECTRIC]: { waveform: 'square', from: 830.61, to: 659.25, duration: 0.12, spark: true },
  [TYPES.ICE]: { waveform: 'sine', from: 659.25, to: 293.66, duration: 0.18, shimmer: true },
  [TYPES.FIGHTING]: { waveform: 'square', from: 311.13, to: 220, duration: 0.1, thump: true },
  [TYPES.POISON]: { waveform: 'sawtooth', from: 415.3, to: 246.94, duration: 0.14, wobble: true },
  [TYPES.GROUND]: { waveform: 'square', from: 220, to: 138.59, duration: 0.12, thump: true },
  [TYPES.FLYING]: { waveform: 'triangle', from: 659.25, to: 987.77, duration: 0.12, flutter: true },
  [TYPES.PSYCHIC]: { waveform: 'sine', from: 523.25, to: 880, duration: 0.18, wobble: true },
  [TYPES.BUG]: { waveform: 'square', from: 493.88, to: 740, duration: 0.11, flutter: true },
  [TYPES.ROCK]: { waveform: 'square', from: 246.94, to: 164.81, duration: 0.12, thump: true },
  [TYPES.GHOST]: { waveform: 'sine', from: 415.3, to: 196, duration: 0.2, wobble: true },
  [TYPES.DRAGON]: { waveform: 'sawtooth', from: 392, to: 783.99, duration: 0.18, accent: 987.77 },
  [TYPES.DARK]: { waveform: 'sawtooth', from: 261.63, to: 146.83, duration: 0.14, wobble: true },
  [TYPES.STEEL]: { waveform: 'triangle', from: 466.16, to: 311.13, duration: 0.11, metallic: true },
  [TYPES.FAIRY]: { waveform: 'sine', from: 523.25, to: 1046.5, duration: 0.17, sparkle: true },
}

const getAudioCtor = () => {
  if (typeof window === 'undefined') return null
  return window.AudioContext || window.webkitAudioContext || null
}

class GameAudioController {
  constructor() {
    const defaults = readStoredAudioSettings()
    this.enabled = defaults.enabled
    this.volume = defaults.volume
    this.context = null
    this.master = null
    this.noiseBuffer = null
    this.diagnosticFlags = new Set()
    this.resumePromise = null
    this.debugState = {
      supported: null,
      contextState: 'idle',
      reason: 'boot',
      lastError: '',
      scheduledTones: 0,
      scheduledNoise: 0,
      lastScheduledStart: '',
    }
    this.updateDebugState()
  }

  updateDebugState(patch = {}) {
    this.debugState = {
      ...this.debugState,
      ...patch,
    }
    if (typeof window !== 'undefined') {
      window[AUDIO_DEBUG_GLOBAL_KEY] = { ...this.debugState }
    }
    if (typeof document !== 'undefined' && document?.documentElement) {
      const root = document.documentElement
      root.dataset.audioState = String(this.debugState.contextState || '')
      root.dataset.audioReason = String(this.debugState.reason || '')
      root.dataset.audioEnabled = this.enabled ? 'true' : 'false'
      root.dataset.audioVolume = String(this.volume)
      root.dataset.audioSupported = this.debugState.supported == null ? 'unknown' : String(Boolean(this.debugState.supported))
      root.dataset.audioError = String(this.debugState.lastError || '')
      root.dataset.audioScheduledTones = String(this.debugState.scheduledTones || 0)
      root.dataset.audioScheduledNoise = String(this.debugState.scheduledNoise || 0)
      root.dataset.audioLastScheduledStart = String(this.debugState.lastScheduledStart || '')
    }
  }

  logOnce(key, level = 'warn', ...args) {
    if (this.diagnosticFlags.has(key)) return
    this.diagnosticFlags.add(key)
    const logger = console?.[level] || console?.warn || console?.log
    logger?.('[gameAudio]', ...args)
  }

  logDebug(level = 'info', ...args) {
    if (!AUDIO_DEBUG_ENABLED) return
    const logger = console?.[level] || console?.log
    logger?.('[gameAudio]', ...args)
  }

  resetContext() {
    if (this.context) {
      try {
        this.context.onstatechange = null
      } catch {
        // Ignore context teardown issues.
      }
    }
    this.context = null
    this.master = null
    this.noiseBuffer = null
    this.resumePromise = null
  }

  applySettings(value = null) {
    const next = normalizeAudioSettings(value)
    this.enabled = next.enabled
    this.volume = next.volume
    this.updateDebugState({
      reason: 'settings-applied',
      enabled: this.enabled,
      volume: this.volume,
    })
    this.syncMasterGain()
  }

  syncMasterGain() {
    if (!this.master || !this.context) return
    const now = this.context.currentTime
    const target = this.enabled ? this.volume : 0
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setTargetAtTime(target, now, 0.01)
  }

  resolveScheduleStart(context, requestedStart, fallbackLeadMs = 120) {
    const currentTime = Number(context?.currentTime) || 0
    const fallbackStart = currentTime + Math.max(0.02, fallbackLeadMs / 1000)
    return Math.max(Number(requestedStart) || 0, context?.state === 'running' ? currentTime + 0.005 : fallbackStart)
  }

  ensureContext() {
    const AudioCtor = getAudioCtor()
    if (!AudioCtor) {
      this.updateDebugState({
        supported: false,
        contextState: 'unavailable',
        reason: 'missing-audio-context',
        lastError: 'AudioContext unavailable',
      })
      this.logOnce('missing-audio-context', 'warn', 'AudioContext API 不可用，合成音效不会播放。')
      return null
    }

    if (this.context && this.master) {
      if (this.context.state !== 'closed') {
        this.updateDebugState({
          supported: true,
          contextState: this.context.state,
          reason: 'reuse-context',
          lastError: '',
        })
        return this.context
      }
      this.logOnce('context-closed', 'warn', '检测到已关闭的 AudioContext，正在尝试重建。')
      this.resetContext()
    }

    try {
      const context = new AudioCtor()
      const master = context.createGain()
      master.gain.value = this.enabled ? this.volume : 0
      master.connect(context.destination)

      context.onstatechange = () => {
        this.updateDebugState({
          supported: true,
          contextState: context.state,
          reason: 'state-change',
        })
        if (context.state === 'closed') {
          this.logOnce('state-closed', 'warn', 'AudioContext 已进入 closed 状态，下一次播放会尝试重建。')
        }
      }

      this.context = context
      this.master = master
      this.noiseBuffer = null
      this.updateDebugState({
        supported: true,
        contextState: context.state,
        reason: 'context-created',
        lastError: '',
      })
      this.logDebug('info', `AudioContext created (${context.state}).`)
      return this.context
    } catch (error) {
      const message = getErrorMessage(error)
      this.updateDebugState({
        supported: false,
        contextState: 'error',
        reason: 'context-create-failed',
        lastError: message,
      })
      this.logOnce('context-create-failed', 'warn', '创建 AudioContext 失败。', message)
      this.resetContext()
      return null
    }
  }

  resumeContext(context = null) {
    const targetContext = context || this.ensureContext()
    if (!targetContext) return Promise.resolve(null)

    const needsResume = targetContext.state === 'suspended' || targetContext.state === 'interrupted'
    if (!needsResume) {
      this.updateDebugState({
        supported: true,
        contextState: targetContext.state,
        reason: targetContext.state === 'running' ? 'ready' : 'resume-not-needed',
        lastError: '',
      })
      return Promise.resolve(targetContext)
    }

    if (!this.resumePromise) {
      this.logDebug('info', `Attempting to resume AudioContext from ${targetContext.state}.`)
      this.resumePromise = targetContext.resume()
        .then(() => {
          this.updateDebugState({
            supported: true,
            contextState: targetContext.state,
            reason: 'context-resumed',
            lastError: '',
          })
          this.logDebug('info', `AudioContext resumed (${targetContext.state}).`)
          return targetContext
        })
        .catch((error) => {
          const message = getErrorMessage(error)
          this.updateDebugState({
            supported: true,
            contextState: targetContext.state,
            reason: 'resume-failed',
            lastError: message,
          })
          this.logOnce('context-resume-failed', 'warn', '恢复 AudioContext 失败。', message)
          return null
        })
        .finally(() => {
          this.resumePromise = null
        })
    }

    return this.resumePromise
  }

  prime() {
    const context = this.ensureContext()
    if (!context) return null
    if (context.state === 'closed') {
      this.resetContext()
      return this.ensureContext()
    }
    void this.resumeContext(context)
    this.syncMasterGain()
    this.updateDebugState({
      supported: true,
      contextState: context.state,
      reason: context.state === 'running' ? 'ready' : 'primed',
      lastError: '',
    })
    return context
  }

  async unlock() {
    if (!this.canPlay()) return false
    let context = this.ensureContext()
    if (!context) return false
    if (context.state === 'closed') {
      this.resetContext()
      context = this.ensureContext()
      if (!context) return false
    }
    const readyContext = await this.resumeContext(context)
    this.syncMasterGain()
    const running = readyContext?.state === 'running'
    this.updateDebugState({
      supported: true,
      contextState: readyContext?.state || context.state,
      reason: running ? 'unlocked' : 'unlock-pending',
      lastError: running ? '' : this.debugState.lastError,
    })
    return running
  }

  withReadyContext(callback) {
    if (typeof callback !== 'function' || !this.canPlay()) return null
    const context = this.ensureContext()
    if (!context) return null

    const invoke = (readyContext) => {
      if (readyContext?.state !== 'running') return
      try {
        callback(readyContext)
      } catch (error) {
        const message = getErrorMessage(error)
        this.updateDebugState({
          reason: 'playback-callback-failed',
          lastError: message,
        })
        this.logOnce('playback-callback-failed', 'warn', '音效回调执行失败。', message)
      }
    }

    if (context.state === 'running') {
      invoke(context)
      return context
    }

    void this.resumeContext(context).then(invoke)
    return context
  }

  canPlay() {
    return this.enabled && this.volume > 0.001
  }

  getNoiseBuffer() {
    const context = this.ensureContext()
    if (!context) return null
    if (this.noiseBuffer) return this.noiseBuffer

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1
    }
    this.noiseBuffer = buffer
    return buffer
  }

  createFilter(type, frequency = 1200, q = 0.6) {
    const context = this.ensureContext()
    if (!context) return null
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q
    return filter
  }

  scheduleTone({
    start,
    frequency,
    toFrequency = null,
    duration = 0.1,
    gain = 0.06,
    attack = 0.004,
    release = 0.06,
    waveform = 'square',
    filterType = null,
    filterFrequency = 1800,
    q = 0.8,
    detune = 0,
  }) {
    const context = this.ensureContext()
    if (!context || !this.master) return
    if (context.state !== 'running') {
      this.logOnce('schedule-tone-suspended', 'warn', 'AudioContext 未解锁，已跳过音效调度。')
      return
    }
    const safeStart = this.resolveScheduleStart(context, start)
    this.updateDebugState({
      scheduledTones: (Number(this.debugState.scheduledTones) || 0) + 1,
      lastScheduledStart: safeStart.toFixed(4),
      reason: 'tone-scheduled',
    })

    const oscillator = context.createOscillator()
    const gainNode = context.createGain()
    let destination = gainNode

    if (filterType) {
      const filter = this.createFilter(filterType, filterFrequency, q)
      if (filter) {
        oscillator.connect(filter)
        filter.connect(gainNode)
        destination = filter
      }
    }

    if (destination === gainNode) {
      oscillator.connect(gainNode)
    }

    gainNode.connect(this.master)
    oscillator.type = waveform
    oscillator.detune.value = detune
    oscillator.frequency.setValueAtTime(Math.max(32, frequency), safeStart)
    if (toFrequency && Math.abs(toFrequency - frequency) > 0.01) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(32, toFrequency), safeStart + duration)
    }

    gainNode.gain.setValueAtTime(MIN_ENVELOPE_GAIN, safeStart)
    gainNode.gain.linearRampToValueAtTime(Math.max(MIN_ENVELOPE_GAIN, gain), safeStart + attack)
    gainNode.gain.exponentialRampToValueAtTime(MIN_ENVELOPE_GAIN, safeStart + duration + release)

    oscillator.start(safeStart)
    oscillator.stop(safeStart + duration + release + 0.01)
  }

  scheduleNoise({
    start,
    duration = 0.08,
    gain = 0.04,
    highpass = 320,
    lowpass = 3600,
  }) {
    const context = this.ensureContext()
    const buffer = this.getNoiseBuffer()
    if (!context || !buffer || !this.master) return
    if (context.state !== 'running') {
      this.logOnce('schedule-noise-suspended', 'warn', 'AudioContext 未解锁，已跳过噪音调度。')
      return
    }
    const safeStart = this.resolveScheduleStart(context, start)
    this.updateDebugState({
      scheduledNoise: (Number(this.debugState.scheduledNoise) || 0) + 1,
      lastScheduledStart: safeStart.toFixed(4),
      reason: 'noise-scheduled',
    })

    const source = context.createBufferSource()
    source.buffer = buffer

    const highpassFilter = this.createFilter('highpass', highpass, 0.4)
    const lowpassFilter = this.createFilter('lowpass', lowpass, 0.4)
    const gainNode = context.createGain()

    source.connect(highpassFilter)
    highpassFilter.connect(lowpassFilter)
    lowpassFilter.connect(gainNode)
    gainNode.connect(this.master)

    gainNode.gain.setValueAtTime(MIN_ENVELOPE_GAIN, safeStart)
    gainNode.gain.linearRampToValueAtTime(Math.max(MIN_ENVELOPE_GAIN, gain), safeStart + 0.005)
    gainNode.gain.exponentialRampToValueAtTime(MIN_ENVELOPE_GAIN, safeStart + duration)

    source.start(safeStart)
    source.stop(safeStart + duration + 0.02)
  }

  playUiSelect() {
    if (!this.canPlay()) return
    this.withReadyContext((context) => {
      const start = context.currentTime + 0.005
      this.scheduleTone({ start, frequency: 622.25, toFrequency: 783.99, duration: 0.06, gain: 0.035, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.038, frequency: 830.61, toFrequency: 987.77, duration: 0.05, gain: 0.026, waveform: 'square' })
    })
  }

  playUiConfirm() {
    if (!this.canPlay()) return
    this.withReadyContext((context) => {
      const start = context.currentTime + 0.005
      this.scheduleTone({ start, frequency: 523.25, toFrequency: 783.99, duration: 0.07, gain: 0.04, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.05, frequency: 783.99, toFrequency: 1046.5, duration: 0.08, gain: 0.034, waveform: 'square' })
    })
  }

  playUiBack() {
    if (!this.canPlay()) return
    this.withReadyContext((context) => {
      const start = context.currentTime + 0.005
      this.scheduleTone({ start, frequency: 659.25, toFrequency: 440, duration: 0.08, gain: 0.033, waveform: 'triangle' })
    })
  }

  playEncounter({ trainer = false, boss = false, challenge = false, rare = false } = {}) {
    if (!this.canPlay()) return
    this.withReadyContext((context) => {
      const start = context.currentTime + 0.01

      if (boss) {
        this.scheduleTone({ start, frequency: 196, toFrequency: 261.63, duration: 0.12, gain: 0.055, waveform: 'sawtooth', filterType: 'lowpass', filterFrequency: 1200 })
        this.scheduleTone({ start: start + 0.08, frequency: 246.94, toFrequency: 392, duration: 0.16, gain: 0.052, waveform: 'sawtooth', filterType: 'lowpass', filterFrequency: 1400 })
        this.scheduleNoise({ start: start + 0.025, duration: 0.12, gain: 0.03, highpass: 480, lowpass: 1600 })
        return
      }

      if (trainer || challenge) {
        this.scheduleTone({ start, frequency: 293.66, toFrequency: 440, duration: 0.08, gain: 0.046, waveform: 'square' })
        this.scheduleTone({ start: start + 0.07, frequency: 392, toFrequency: 659.25, duration: 0.11, gain: 0.04, waveform: 'triangle' })
        this.scheduleNoise({ start: start + 0.03, duration: 0.07, gain: 0.018, highpass: 1200, lowpass: 4200 })
        return
      }

      this.scheduleTone({ start, frequency: 440, toFrequency: 659.25, duration: 0.08, gain: 0.038, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.055, frequency: rare ? 783.99 : 698.46, toFrequency: rare ? 1046.5 : 880, duration: 0.09, gain: 0.032, waveform: rare ? 'sine' : 'square' })
      if (rare) {
        this.scheduleTone({ start: start + 0.12, frequency: 1174.66, toFrequency: 1318.51, duration: 0.06, gain: 0.02, waveform: 'sine' })
      }
    })
  }

  playBattleMove(move = null) {
    this.withReadyContext((context) => {
    const moveType = move?.type || TYPES.NORMAL
    const isStatusMove = move?.category === 'status'
    const style = AUDIO_TYPE_STYLE[moveType] || {
      waveform: isStatusMove ? 'triangle' : 'square',
      from: isStatusMove ? 523.25 : 392,
      to: isStatusMove ? 659.25 : 293.66,
      duration: isStatusMove ? 0.12 : 0.1,
    }
    const start = context.currentTime + 0.005

    this.scheduleTone({
      start,
      frequency: style.from,
      toFrequency: style.to,
      duration: style.duration,
      gain: isStatusMove ? 0.03 : 0.042,
      waveform: style.waveform,
      filterType: style.waveform === 'sawtooth' ? 'lowpass' : null,
      filterFrequency: 2400,
    })

    if (style.accent) {
      this.scheduleTone({
        start: start + 0.04,
        frequency: style.accent,
        toFrequency: style.accent * 1.08,
        duration: 0.06,
        gain: 0.02,
        waveform: 'sine',
      })
    }

    if (style.shimmer || style.sparkle) {
      this.scheduleTone({
        start: start + 0.03,
        frequency: style.to * 1.3,
        toFrequency: style.to * 1.55,
        duration: 0.05,
        gain: 0.016,
        waveform: 'sine',
      })
    }

    if (style.spark || style.noise || style.thump || style.metallic) {
      this.scheduleNoise({
        start: start + 0.01,
        duration: style.thump ? 0.05 : 0.06,
        gain: style.thump ? 0.028 : 0.016,
        highpass: style.thump ? 180 : 1200,
        lowpass: style.metallic ? 5200 : (style.thump ? 900 : 4200),
      })
    }
    })
  }

  playBattleImpact({ effectiveness = 1, didHit = true, outcome = 'hit', targetFainted = false } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01

    if (!didHit || outcome === 'miss') {
      this.scheduleTone({ start, frequency: 740, toFrequency: 392, duration: 0.08, gain: 0.028, waveform: 'triangle' })
      return
    }

    if (outcome === 'fizzle' || effectiveness <= 0) {
      this.scheduleTone({ start, frequency: 220, toFrequency: 164.81, duration: 0.08, gain: 0.026, waveform: 'square', filterType: 'lowpass', filterFrequency: 800 })
      return
    }

    const hitGain = effectiveness > 1 ? 0.044 : effectiveness < 1 ? 0.03 : 0.036
    const hitDuration = effectiveness > 1 ? 0.11 : 0.09
    this.scheduleNoise({ start, duration: hitDuration, gain: effectiveness > 1 ? 0.032 : 0.024, highpass: 700, lowpass: effectiveness > 1 ? 2600 : 1900 })
    this.scheduleTone({ start, frequency: effectiveness > 1 ? 293.66 : 246.94, toFrequency: effectiveness > 1 ? 146.83 : 174.61, duration: hitDuration, gain: hitGain, waveform: 'square' })

    if (targetFainted) {
      this.scheduleTone({ start: start + 0.04, frequency: 174.61, toFrequency: 92.5, duration: 0.14, gain: 0.025, waveform: 'triangle' })
    }
    })
  }

  playBattleStatus(status = 'status', variant = 'apply') {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01

    const patterns = {
      poison: () => {
        this.scheduleTone({ start, frequency: 392, toFrequency: 233.08, duration: 0.13, gain: 0.028, waveform: 'sawtooth' })
        if (variant === 'tick') {
          this.scheduleNoise({ start: start + 0.02, duration: 0.06, gain: 0.014, highpass: 1800, lowpass: 3600 })
        }
      },
      burn: () => {
        this.scheduleTone({ start, frequency: 659.25, toFrequency: 311.13, duration: 0.12, gain: 0.03, waveform: 'sawtooth' })
        this.scheduleNoise({ start: start + 0.012, duration: 0.05, gain: 0.016, highpass: 900, lowpass: 2600 })
      },
      paralysis: () => {
        this.scheduleTone({ start, frequency: 880, toFrequency: 622.25, duration: 0.06, gain: 0.024, waveform: 'square' })
        this.scheduleTone({ start: start + 0.03, frequency: 740, toFrequency: 466.16, duration: 0.05, gain: 0.018, waveform: 'square' })
      },
      sleep: () => {
        const toFrequency = variant === 'recover' ? 392 : 196
        this.scheduleTone({ start, frequency: 261.63, toFrequency, duration: 0.14, gain: 0.024, waveform: 'sine' })
      },
      freeze: () => {
        const nextTo = variant === 'recover' ? 659.25 : 246.94
        this.scheduleTone({ start, frequency: 659.25, toFrequency: nextTo, duration: 0.15, gain: 0.023, waveform: 'sine' })
        this.scheduleTone({ start: start + 0.03, frequency: 987.77, toFrequency: 523.25, duration: 0.07, gain: 0.012, waveform: 'sine' })
      },
      confusion: () => {
        this.scheduleTone({ start, frequency: 466.16, toFrequency: 698.46, duration: 0.06, gain: 0.018, waveform: 'sine' })
        this.scheduleTone({ start: start + 0.035, frequency: 698.46, toFrequency: 415.3, duration: 0.06, gain: 0.018, waveform: 'sine' })
      },
      flinch: () => {
        this.scheduleTone({ start, frequency: 277.18, toFrequency: 196, duration: 0.07, gain: 0.024, waveform: 'square' })
      },
      heal: () => {
        this.scheduleTone({ start, frequency: 523.25, toFrequency: 783.99, duration: 0.09, gain: 0.028, waveform: 'triangle' })
        this.scheduleTone({ start: start + 0.05, frequency: 659.25, toFrequency: 987.77, duration: 0.08, gain: 0.022, waveform: 'sine' })
      },
      buff: () => {
        this.scheduleTone({ start, frequency: 392, toFrequency: 587.33, duration: 0.08, gain: 0.026, waveform: 'triangle' })
      },
      debuff: () => {
        this.scheduleTone({ start, frequency: 392, toFrequency: 220, duration: 0.08, gain: 0.024, waveform: 'square' })
      },
    }

    const playPattern = patterns[status] || patterns.buff
    playPattern()
    })
  }

  playSwitch({ side = 'player' } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    const startFrequency = side === 'enemy' ? 349.23 : 440
    const endFrequency = side === 'enemy' ? 523.25 : 659.25
    this.scheduleTone({ start, frequency: startFrequency, toFrequency: endFrequency, duration: 0.09, gain: 0.032, waveform: 'triangle' })
    this.scheduleNoise({ start: start + 0.01, duration: 0.05, gain: 0.012, highpass: 1400, lowpass: 4600 })
    })
  }

  playFaint({ side = 'enemy' } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    const from = side === 'player' ? 246.94 : 293.66
    this.scheduleNoise({ start, duration: 0.08, gain: 0.025, highpass: 500, lowpass: 1600 })
    this.scheduleTone({ start, frequency: from, toFrequency: 82.41, duration: 0.2, gain: 0.032, waveform: 'square', filterType: 'lowpass', filterFrequency: 900 })
    })
  }

  playVictory({ trainer = false } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    const melody = trainer
      ? [
          [523.25, 0],
          [659.25, 0.07],
          [783.99, 0.14],
          [1046.5, 0.24],
        ]
      : [
          [493.88, 0],
          [622.25, 0.07],
          [739.99, 0.14],
          [987.77, 0.24],
        ]

    melody.forEach(([frequency, offset], index) => {
      this.scheduleTone({
        start: start + offset,
        frequency,
        toFrequency: frequency * (index === melody.length - 1 ? 1.04 : 1.02),
        duration: index === melody.length - 1 ? 0.22 : 0.12,
        gain: index === melody.length - 1 ? 0.04 : 0.03,
        waveform: index % 2 === 0 ? 'triangle' : 'square',
      })
    })
    })
  }

  playDefeat() {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    this.scheduleTone({ start, frequency: 392, toFrequency: 220, duration: 0.16, gain: 0.03, waveform: 'triangle' })
    this.scheduleTone({ start: start + 0.09, frequency: 220, toFrequency: 130.81, duration: 0.2, gain: 0.026, waveform: 'square', filterType: 'lowpass', filterFrequency: 1000 })
    })
  }

  playEscape({ success = true } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01

    if (success) {
      this.scheduleTone({ start, frequency: 440, toFrequency: 659.25, duration: 0.08, gain: 0.028, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.05, frequency: 659.25, toFrequency: 880, duration: 0.08, gain: 0.022, waveform: 'sine' })
      return
    }

    this.scheduleTone({ start, frequency: 329.63, toFrequency: 196, duration: 0.09, gain: 0.024, waveform: 'square' })
    this.scheduleNoise({ start: start + 0.01, duration: 0.05, gain: 0.012, highpass: 900, lowpass: 2000 })
    })
  }

  playCaptureThrow() {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    this.scheduleTone({ start, frequency: 783.99, toFrequency: 392, duration: 0.08, gain: 0.02, waveform: 'triangle' })
    this.scheduleNoise({ start: start + 0.015, duration: 0.05, gain: 0.012, highpass: 1200, lowpass: 4200 })
    })
  }

  playCaptureSuccess() {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    this.scheduleTone({ start, frequency: 523.25, toFrequency: 783.99, duration: 0.08, gain: 0.028, waveform: 'sine' })
    this.scheduleTone({ start: start + 0.08, frequency: 659.25, toFrequency: 987.77, duration: 0.08, gain: 0.026, waveform: 'triangle' })
    this.scheduleTone({ start: start + 0.16, frequency: 783.99, toFrequency: 1174.66, duration: 0.11, gain: 0.024, waveform: 'sine' })
    })
  }

  playCaptureFail() {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    this.scheduleTone({ start, frequency: 415.3, toFrequency: 220, duration: 0.08, gain: 0.022, waveform: 'square' })
    this.scheduleNoise({ start: start + 0.02, duration: 0.05, gain: 0.012, highpass: 1200, lowpass: 2800 })
    })
  }

  playItemUse({ category = 'potion' } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01

    if (category === 'shop') {
      this.scheduleTone({ start, frequency: 880, toFrequency: 1174.66, duration: 0.06, gain: 0.024, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.045, frequency: 1174.66, toFrequency: 1567.98, duration: 0.06, gain: 0.02, waveform: 'triangle' })
      return
    }

    if (category === 'exp') {
      this.scheduleTone({ start, frequency: 659.25, toFrequency: 987.77, duration: 0.06, gain: 0.024, waveform: 'sine' })
      this.scheduleTone({ start: start + 0.05, frequency: 830.61, toFrequency: 1318.51, duration: 0.08, gain: 0.02, waveform: 'sine' })
      return
    }

    if (category === 'pickup' || category === 'berry') {
      this.scheduleTone({ start, frequency: 587.33, toFrequency: 783.99, duration: 0.06, gain: 0.024, waveform: 'triangle' })
      this.scheduleTone({ start: start + 0.04, frequency: 783.99, toFrequency: 987.77, duration: 0.06, gain: 0.018, waveform: 'triangle' })
      return
    }

    this.scheduleTone({ start, frequency: 523.25, toFrequency: 698.46, duration: 0.08, gain: 0.026, waveform: 'triangle' })
    })
  }

  playHeal({ strong = false } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01

    this.scheduleTone({ start, frequency: 523.25, toFrequency: 783.99, duration: 0.1, gain: 0.028, waveform: 'sine' })
    this.scheduleTone({ start: start + 0.06, frequency: 659.25, toFrequency: 987.77, duration: 0.1, gain: 0.024, waveform: 'sine' })
    if (strong) {
      this.scheduleTone({ start: start + 0.12, frequency: 783.99, toFrequency: 1174.66, duration: 0.12, gain: 0.022, waveform: 'triangle' })
    }
    })
  }

  playTravel({ kind = 'warp' } = {}) {
    this.withReadyContext((context) => {
    const start = context.currentTime + 0.01
    const isFastTravel = kind === 'fast'

    this.scheduleNoise({
      start,
      duration: isFastTravel ? 0.14 : 0.11,
      gain: isFastTravel ? 0.016 : 0.012,
      highpass: 900,
      lowpass: isFastTravel ? 5200 : 4200,
    })
    this.scheduleTone({
      start,
      frequency: isFastTravel ? 261.63 : 329.63,
      toFrequency: isFastTravel ? 1046.5 : 783.99,
      duration: isFastTravel ? 0.22 : 0.16,
      gain: isFastTravel ? 0.032 : 0.026,
      waveform: 'sine',
    })
    })
  }
}

export const gameAudio = new GameAudioController()
