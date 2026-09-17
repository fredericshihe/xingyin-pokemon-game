import { ELITE_FOUR_CEREMONY_MAP_IDS } from './data/eliteFourCeremony.js'

export const NPC_WANDER_RADIUS = 2

const EXCLUDED_MAPS = new Set(ELITE_FOUR_CEREMONY_MAP_IDS)
const DIRECTIONS = Object.freeze([
  { name: 'up', x: 0, y: -1 },
  { name: 'down', x: 0, y: 1 },
  { name: 'left', x: -1, y: 0 },
  { name: 'right', x: 1, y: 0 }
])
const tileKey = (x, y) => `${x},${y}`
const normalizeCoordinate = (value) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0
const normalizeHome = (home) => ({ x: normalizeCoordinate(home?.x), y: normalizeCoordinate(home?.y) })

export function isNpcWanderEnabled({ mapId, event, npcRole } = {}) {
  if (EXCLUDED_MAPS.has(mapId)) return false
  if (event?.type === 'boss' || event?.properties?.role === 'boss' || event?.role === 'boss' || npcRole === 'boss') return false
  // The renderer verifies that an eventless decoration is a character.
  return !event || event.type === 'trainer' || event.type === 'merchant'
}

/** Build the connected part of the NPC's own pocket; callbacks receive (x, y). */
export function buildNpcWanderArea({ home, radius = NPC_WANDER_RADIUS, canVisit = () => true } = {}) {
  const origin = normalizeHome(home)
  const safeRadius = Number.isFinite(Number(radius)) ? Math.max(0, Math.floor(Number(radius))) : NPC_WANDER_RADIUS
  const area = new Set([tileKey(origin.x, origin.y)])
  const visited = new Set(area)
  const queue = [origin]

  for (let index = 0; index < queue.length; index += 1) {
    for (const direction of DIRECTIONS) {
      const x = queue[index].x + direction.x
      const y = queue[index].y + direction.y
      if (Math.max(Math.abs(x - origin.x), Math.abs(y - origin.y)) > safeRadius) continue
      const key = tileKey(x, y)
      if (visited.has(key)) continue
      visited.add(key)
      if (!canVisit(x, y)) continue
      area.add(key)
      queue.push({ x, y })
    }
  }
  return area
}

/**
 * A visual simulation driven only by active elapsed time. The caller owns live
 * collision checks and reads occupiedTiles before allowing another actor in.
 */
export function createNpcWanderer({ home, area, direction = 'down', random = Math.random } = {}) {
  const origin = normalizeHome(home)
  const allowedTiles = new Set(area || [tileKey(origin.x, origin.y)])
  allowedTiles.add(tileKey(origin.x, origin.y))
  const sample = () => {
    const value = Number(random())
    return Number.isFinite(value) ? Math.min(1 - Number.EPSILON, Math.max(0, value)) : 0.5
  }
  const choose = (values) => values[Math.floor(sample() * values.length)]
  const pauseDuration = () => 1500 + sample() * 2500
  const state = {
    x: origin.x,
    y: origin.y,
    tileX: origin.x,
    tileY: origin.y,
    direction: DIRECTIONS.some((entry) => entry.name === direction) ? direction : 'down',
    moving: false,
    target: null,
    occupiedTiles: [{ ...origin }],
    stepProgress: 0
  }
  let pauseRemainingMs = pauseDuration()
  let stepElapsedMs = 0
  let stepDurationMs = 0
  let burstStepsRemaining = 0

  const stopAndWait = () => {
    burstStepsRemaining = 0
    pauseRemainingMs = pauseDuration()
  }
  const turnInPlace = () => {
    state.direction = choose(DIRECTIONS.filter((entry) => entry.name !== state.direction)).name
    stopAndWait()
  }

  const update = (deltaMs, { paused = false, nearPlayer = false, canOccupy = () => true } = {}) => {
    const elapsed = Number(deltaMs)
    if (paused || !Number.isFinite(elapsed) || elapsed <= 0) return state

    if (state.moving) {
      stepElapsedMs = Math.min(stepDurationMs, stepElapsedMs + elapsed)
      state.stepProgress = stepElapsedMs / stepDurationMs
      state.x = state.tileX + (state.target.x - state.tileX) * state.stepProgress
      state.y = state.tileY + (state.target.y - state.tileY) * state.stepProgress
      if (state.stepProgress >= 1) {
        state.tileX = state.target.x
        state.tileY = state.target.y
        state.moving = false
        state.target = null
        state.occupiedTiles = [{ x: state.tileX, y: state.tileY }]
        state.stepProgress = 0
        burstStepsRemaining = Math.max(0, burstStepsRemaining - 1)
        if (nearPlayer || burstStepsRemaining === 0) stopAndWait()
        else pauseRemainingMs = 0
      }
      // Finish at most one reserved step per update, even after a long frame.
      return state
    }

    if (nearPlayer) return state
    pauseRemainingMs = Math.max(0, pauseRemainingMs - elapsed)
    if (pauseRemainingMs > 0) return state

    if (burstStepsRemaining === 0 && sample() < 0.3) {
      turnInPlace()
      return state
    }
    const candidates = DIRECTIONS.map((entry) => ({
      x: state.tileX + entry.x,
      y: state.tileY + entry.y,
      direction: entry.name
    })).filter((tile) => allowedTiles.has(tileKey(tile.x, tile.y)) && canOccupy(tile.x, tile.y))
    if (candidates.length === 0) {
      turnInPlace()
      return state
    }

    const next = choose(candidates)
    state.direction = next.direction
    state.moving = true
    state.target = { x: next.x, y: next.y }
    state.occupiedTiles = [{ x: state.tileX, y: state.tileY }, { ...state.target }]
    state.stepProgress = 0
    stepElapsedMs = 0
    stepDurationMs = 700 + sample() * 400
    if (burstStepsRemaining === 0) burstStepsRemaining = 1 + Math.floor(sample() * 3)
    return state
  }

  return { state, update }
}
