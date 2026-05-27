export const BATTLE_TEXT_CHAR_MS = 24
export const BATTLE_LOG_MIN_READ_MS = 980
export const BATTLE_LOG_MAX_READ_MS = 2600
export const BATTLE_LOG_AFTER_ACTION_MS = 180

export const BATTLE_MOVE_START_MS = 920
export const BATTLE_MOVE_IMPACT_MS = 1450
export const BATTLE_MOVE_STATUS_MS = 1320
export const BATTLE_MOVE_SECONDARY_MS = 820
export const BATTLE_MOVE_CHARGE_MS = 1480
export const BATTLE_MOVE_MISS_MS = 1180

const BATTLE_MOVE_PHASE_DURATIONS = {
  start: BATTLE_MOVE_START_MS,
  charge: BATTLE_MOVE_CHARGE_MS,
  hit: BATTLE_MOVE_IMPACT_MS,
  status: BATTLE_MOVE_STATUS_MS,
  secondary: BATTLE_MOVE_SECONDARY_MS,
  heal: BATTLE_MOVE_STATUS_MS,
  drain: BATTLE_MOVE_STATUS_MS,
  miss: BATTLE_MOVE_MISS_MS,
  fizzle: BATTLE_MOVE_MISS_MS,
  copy: BATTLE_MOVE_START_MS,
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const waitForPaint = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  } else {
    resolve()
  }
})

export const getBattleLogReadDelay = (
  message,
  {
    minMs = BATTLE_LOG_MIN_READ_MS,
    maxMs = BATTLE_LOG_MAX_READ_MS,
    extraMs = BATTLE_LOG_AFTER_ACTION_MS,
  } = {}
) => {
  const textLength = String(message || '').length
  return Math.min(maxMs, Math.max(minMs, textLength * BATTLE_TEXT_CHAR_MS + extraMs))
}

export const getBattleMovePhaseDuration = (phase = 'hit') => (
  BATTLE_MOVE_PHASE_DURATIONS[phase] || BATTLE_MOVE_IMPACT_MS
)

export const getBattleMoveImpactDelay = (phase = 'hit', durationMs = getBattleMovePhaseDuration(phase)) => {
  if (['hit', 'status', 'heal', 'drain'].includes(phase)) {
    return Math.min(540, Math.max(360, Math.round(durationMs * 0.34)))
  }

  if (phase === 'secondary') {
    return Math.min(260, Math.max(180, Math.round(durationMs * 0.24)))
  }

  if (['miss', 'fizzle'].includes(phase)) {
    return Math.min(460, Math.max(300, Math.round(durationMs * 0.32)))
  }

  return Math.min(
    Math.max(180, Math.round(durationMs * (phase === 'charge' ? 0.18 : 0.32))),
    Math.max(180, durationMs - 520)
  )
}

export const getBattleMomentDelay = (message, {
  phase = 'hit',
  durationMs = getBattleMovePhaseDuration(phase),
  minMs = BATTLE_LOG_MIN_READ_MS,
  maxMs = BATTLE_LOG_MAX_READ_MS,
  extraMs = BATTLE_LOG_AFTER_ACTION_MS,
} = {}) => Math.max(
  durationMs,
  getBattleLogReadDelay(message, { minMs, maxMs, extraMs })
)

export const waitForBattleLog = (message, options) => wait(getBattleLogReadDelay(message, options))

export const addBattleLogAndWait = async (addLog, message, options) => {
  addLog?.(message)
  await waitForBattleLog(message, options)
}

export const addBattleLogsSequentially = async (addLog, messages, options) => {
  for (const message of messages || []) {
    await addBattleLogAndWait(addLog, message, options)
  }
}
