import {
  getMapInfo,
  getMapRuntimeEvents,
  getMapSignText,
  getMapStartPositionData
} from './mapCatalog'
import { getMapEventTile } from './mapEventTypes'

const cloneGrid = (grid) => grid.map((row) => [...row])

export function getMapStartPosition(mapName) {
  return getMapStartPositionData(mapName)
}

export function getMapEvents(mapName) {
  return getMapRuntimeEvents(mapName)
}

export function getMapEventAt(mapName, tileX, tileY, type) {
  return (
    getMapEvents(mapName).find((event) => {
      if (type && event.type !== type) return false
      return event.position.x === tileX && event.position.y === tileY
    }) || null
  )
}

export function applyMapEventsToGrid(mapName, sourceGrid) {
  const grid = cloneGrid(sourceGrid)
  const events = getMapEvents(mapName)

  events.forEach((event) => {
    const tile = getMapEventTile(event.type)
    if (!tile) return
    const { x, y } = event.position
    if (grid[y]?.[x] === undefined) return
    if (grid[y][x] === 1 || grid[y][x] === 11) return
    grid[y][x] = tile
  })

  return grid
}

export function getMapSignMessage(mapName, tileX, tileY) {
  return getMapSignText(mapName, tileX, tileY)
}

export function getMapInfoForEvents(mapName) {
  return getMapInfo(mapName)
}
