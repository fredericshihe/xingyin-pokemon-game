const CLEARED_ROUTE_BLOCKER_STATES = new Set(['cleared', 'completed'])

const STEP_ASIDE_OFFSETS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
})

export function isEliteRouteBlockerEvent(mapEvent) {
  return Boolean(
    mapEvent &&
    ['trainer', 'boss'].includes(mapEvent.type) &&
    mapEvent.properties?.blocksRouteUntilDefeated === true
  )
}

export function isEliteRouteBlockerCleared(mapEvent, visualState = 'available', currentMapBossCompleted = false) {
  if (!isEliteRouteBlockerEvent(mapEvent)) return false
  if (mapEvent.type === 'boss' && currentMapBossCompleted) return true
  return CLEARED_ROUTE_BLOCKER_STATES.has(visualState)
}

export function getEliteRouteStepAsideOffset(mapEvent) {
  if (!isEliteRouteBlockerEvent(mapEvent)) return { x: 0, y: 0, distance: 0 }
  const direction = mapEvent.properties?.stepAsideDirection
  const offset = STEP_ASIDE_OFFSETS[direction]
  if (!offset) return { x: 0, y: 0, distance: 0 }
  const configuredDistance = Number(mapEvent.properties?.stepAsideDistance)
  const distance = Number.isFinite(configuredDistance)
    ? Math.max(0.65, Math.min(1.2, configuredDistance))
    : 1
  return { x: offset.x, y: offset.y, distance }
}

export function getEliteRouteStepAsideTile(mapEvent) {
  const eventX = Math.trunc(Number(mapEvent?.position?.x))
  const eventY = Math.trunc(Number(mapEvent?.position?.y))
  const offset = getEliteRouteStepAsideOffset(mapEvent)
  if (!Number.isSafeInteger(eventX) || !Number.isSafeInteger(eventY) || offset.distance <= 0) return null
  return {
    x: eventX + offset.x,
    y: eventY + offset.y
  }
}

export function getEliteRouteBlockerInteractionTile(
  mapEvent,
  visualState = 'available',
  currentMapBossCompleted = false
) {
  if (!isEliteRouteBlockerEvent(mapEvent)) return null
  if (isEliteRouteBlockerCleared(mapEvent, visualState, currentMapBossCompleted)) {
    return getEliteRouteStepAsideTile(mapEvent)
  }
  const x = Math.trunc(Number(mapEvent.position?.x))
  const y = Math.trunc(Number(mapEvent.position?.y))
  return Number.isSafeInteger(x) && Number.isSafeInteger(y) ? { x, y } : null
}
