import {
  MAP_CATALOG,
  MAP_CHAIN,
  getMapEncounterZoneAt,
  getMapInfo,
  getMapSignText,
  hasMap,
  isMapRenderMode,
  loadMapGrid
} from './mapCatalog'

const BLOCKED_LEGACY_TILES = new Set([1, 5, 6, 11, 14, 18, 20])
const VISUAL_ROAD_TOLERANCE = 0.03

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq <= 0.0001) return Math.hypot(px - ax, py - ay)

  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function isInsidePathFootprint(tileX, tileY, path, padding = 0) {
  const points = Array.isArray(path?.points) ? path.points : []
  if (points.length < 2) return false

  const radius = Number(path.radius ?? path.visualRadius ?? 0.7) + padding
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i]
    const [bx, by] = points[i + 1]
    if (distanceToSegment(tileX, tileY, ax, ay, bx, by) <= radius) return true
  }

  return points.some(([x, y]) => Math.hypot(tileX - x, tileY - y) <= radius)
}

function isInsideEllipse(tileX, tileY, ellipse) {
  const rx = Number(ellipse?.rx) || 0
  const ry = Number(ellipse?.ry) || 0
  if (rx <= 0 || ry <= 0) return false

  const dx = (tileX - ellipse.x) / rx
  const dy = (tileY - ellipse.y) / ry
  return dx * dx + dy * dy <= 1
}

function isInsideBridgeFootprint(tileX, tileY, bridge) {
  const rotation = Number(bridge?.rotation) || 0
  const dx = tileX - bridge.x
  const dy = tileY - bridge.y
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos

  return (
    Math.abs(localX) <= (Number(bridge.length) || 3) / 2 + VISUAL_ROAD_TOLERANCE &&
    Math.abs(localY) <= (Number(bridge.width) || 1.2) / 2 + VISUAL_ROAD_TOLERANCE
  )
}

export const ADVENTURE_MAP_CHAIN = [...MAP_CHAIN]

export const ADVENTURE_MAP_INFO = Object.fromEntries(
  MAP_CHAIN.map((mapId) => [mapId, getMapInfo(mapId)])
)

export function hasAdventureMap(mapName) {
  return hasMap(mapName)
}

export function getAdventureMapInfo(mapName) {
  return getMapInfo(mapName)
}

export function loadAdventureMapGrid(mapName) {
  return loadMapGrid(mapName)
}

export function hasAdventureMapGridVisualRoadMismatch(mapName, mapGrid) {
  const info = getAdventureMapInfo(mapName)
  if (!info || !Array.isArray(mapGrid) || mapGrid.length === 0) return true
  if (mapGrid.length !== info.height || mapGrid[0]?.length !== info.width) return true

  const visualPaths = Array.isArray(info.visualPaths) ? info.visualPaths : []
  const forestTrails = Array.isArray(info.forestTrails) ? info.forestTrails : []
  const roadJunctions = Array.isArray(info.roadJunctions) ? info.roadJunctions : []
  const bridges = Array.isArray(info.bridges) ? info.bridges : []

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const tile = mapGrid[y]?.[x]
      if (!BLOCKED_LEGACY_TILES.has(tile)) continue

      const blocksVisibleRoad = visualPaths.some((path) =>
        isInsidePathFootprint(x, y, path, VISUAL_ROAD_TOLERANCE)
      )
      const blocksJunction = roadJunctions.some((junction) =>
        isInsideEllipse(x, y, {
          x: junction.x,
          y: junction.y,
          rx: (Number(junction.rx) || 0) + VISUAL_ROAD_TOLERANCE,
          ry: (Number(junction.ry) || 0) + VISUAL_ROAD_TOLERANCE
        })
      )
      const blocksForestTrail = forestTrails.some((trail) =>
        isInsidePathFootprint(x, y, { points: trail.points, radius: trail.radius }, VISUAL_ROAD_TOLERANCE)
      )
      const blocksBridge = bridges.some((bridge) => isInsideBridgeFootprint(x, y, bridge))

      if (blocksVisibleRoad || blocksJunction || blocksForestTrail || blocksBridge) {
        return true
      }
    }
  }

  return false
}

export function getEncounterZoneAt(mapName, tileX, tileY) {
  return getMapEncounterZoneAt(mapName, tileX, tileY)
}

export function getMapSignMessage(mapName, tileX, tileY) {
  return getMapSignText(mapName, tileX, tileY)
}

export function isTiledJsonMap(mapName) {
  return isMapRenderMode(mapName, 'tiled-json')
}

export function isKenneyIsometricMap(mapName) {
  return isMapRenderMode(mapName, 'kenney-isometric')
}

export function isThreeLowPolyMap(mapName) {
  return isMapRenderMode(mapName, 'three-lowpoly')
}

export { MAP_CATALOG }
