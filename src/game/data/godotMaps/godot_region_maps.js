import { MONSTERS } from '../../../utils/gameData.js'
import { isLevelValidForSpecies } from '../../../utils/wildEncounterRules.js'
import { getEvolutionFamilyKey, resolveSpeciesForLevelWithVariety } from '../../../utils/pokemonFamilyVariety.js'
import { FAST_TRAVEL_COST, FAST_TRAVEL_EVENT_TYPE, getFastTravelStation, getFastTravelStationMeta } from '../fastTravel.js'
import { getMapEventTile } from '../mapEventTypes.js'
import { MAP_ASSET_CATALOG } from '../mapAssetCatalog.js'

const WIDTH = 40
const HEIGHT = 32

const TILE = {
  grass: 0,
  wall: 1,
  exit: 2,
  heal: 5,
  sign: 6,
  tallGrass: 8,
  water: 11,
  road: 12,
  sand: 13,
  bridge: 15,
  flowers: 16,
  paleGrass: 17,
  objectBlocker: 20
}

export const REGION_MAP_TILE = TILE

const MAP_THEME = 'kenney-region-chain-v1'
const DEFAULT_BOSS_RARE_CHANCE = 0.18
const DEFAULT_CHALLENGE_RARE_CHANCE = 0.3
const SIGN_FACE_ROTATIONS = {
  up: 0,
  down: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2
}
const SIGN_FACE_DOWN = SIGN_FACE_ROTATIONS.down
const SIGN_FACING_PRIORITY = ['down', 'left', 'right']
const CHARACTER_FACE_ROTATION = {
  down: 0,
  left: -Math.PI / 2,
  right: Math.PI / 2,
  up: Math.PI
}
const PLAYER_MATCHED_NPC_SCALE = 0.62
const PLAYER_MATCHED_NPC_HEIGHT = 0.16

function scaleFromNpcBaseline(multiplier) {
  return Number((PLAYER_MATCHED_NPC_SCALE * multiplier).toFixed(2))
}

function heightFromNpcBaseline(multiplier) {
  return Number((PLAYER_MATCHED_NPC_HEIGHT * multiplier).toFixed(2))
}

const CARDINAL_DIRECTIONS = [
  ['down', 0, 1],
  ['up', 0, -1],
  ['left', -1, 0],
  ['right', 1, 0]
]

function seededRandom(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 2246822519
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function makeGrid(fill = TILE.wall) {
  return Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => fill))
}

function inBounds(x, y) {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

function paintRect(grid, x1, y1, x2, y2, tile) {
  const minX = Math.max(0, Math.min(x1, x2))
  const maxX = Math.min(WIDTH - 1, Math.max(x1, x2))
  const minY = Math.max(0, Math.min(y1, y2))
  const maxY = Math.min(HEIGHT - 1, Math.max(y1, y2))
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      grid[y][x] = tile
    }
  }
}

function paintEllipse(grid, cx, cy, rx, ry, tile, { onlyTiles = null } = {}) {
  const allowed = onlyTiles ? new Set(onlyTiles) : null
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (!inBounds(x, y)) continue
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      if (allowed && !allowed.has(grid[y][x])) continue
      grid[y][x] = tile
    }
  }
}

function paintOrthogonalSegment(grid, start, end, tile = TILE.road, width = 3) {
  const [x1, y1] = start
  const [x2, y2] = end
  if (x1 !== x2 && y1 !== y2) {
    throw new Error(`Region map roads must be orthogonal: ${x1},${y1} -> ${x2},${y2}`)
  }
  const half = Math.floor(width / 2)
  if (x1 === x2) {
    paintRect(grid, x1 - half, Math.min(y1, y2), x1 + half, Math.max(y1, y2), tile)
  } else {
    paintRect(grid, Math.min(x1, x2), y1 - half, Math.max(x1, x2), y1 + half, tile)
  }
}

function paintOrthogonalPath(grid, points, width = 3, tile = TILE.road) {
  for (let i = 0; i < points.length - 1; i += 1) {
    paintOrthogonalSegment(grid, points[i], points[i + 1], tile, width)
  }
}

function distanceToRoadPaths(tileX, tileY, definition) {
  let best = Infinity
  ;(definition.roadPaths || []).forEach((path) => {
    const points = Array.isArray(path.points) ? path.points : []
    for (let i = 0; i < points.length - 1; i += 1) {
      const [ax, ay] = points[i]
      const [bx, by] = points[i + 1]
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq <= 0 ? 0 : Math.max(0, Math.min(1, ((tileX - ax) * dx + (tileY - ay) * dy) / lenSq))
      const px = ax + dx * t
      const py = ay + dy * t
      best = Math.min(best, Math.hypot(tileX - px, tileY - py))
    }
  })
  return best
}

function isRoadOrBridgeTile(tile) {
  return tile === TILE.road || tile === TILE.bridge || tile === TILE.exit
}

function countApproachNeighbors(grid, x, y) {
  return CARDINAL_DIRECTIONS.reduce((count, [, dx, dy]) => {
    const tile = grid[y + dy]?.[x + dx]
    return count + Number(
      CHARACTER_INTERACTION_TILES.has(tile) ||
      isRoadOrBridgeTile(tile)
    )
  }, 0)
}

function countForwardOpenSpace(grid, x, y, dx, dy) {
  const sideA = { x: dy, y: dx }
  const sideB = { x: -dy, y: -dx }
  const samples = [
    [x + dx, y + dy],
    [x + dx * 2, y + dy * 2],
    [x + dx + sideA.x, y + dy + sideA.y],
    [x + dx + sideB.x, y + dy + sideB.y]
  ]
  return samples.reduce((count, [sampleX, sampleY]) => {
    const tile = grid[sampleY]?.[sampleX]
    return count + Number(
      CHARACTER_INTERACTION_TILES.has(tile) ||
      isRoadOrBridgeTile(tile)
    )
  }, 0)
}

function getFacingTerrainScore(tile, role) {
  if (isRoadOrBridgeTile(tile)) return role === 'boss' ? 112 : 124
  if (tile === TILE.tallGrass) return role === 'boss' ? 54 : 92
  if (tile === TILE.flowers || tile === TILE.paleGrass) return 76
  if (tile === TILE.grass || tile === TILE.sand) return 70
  return -Infinity
}

function inferEventFacing(definition, x, y, role = 'normal', index = 0) {
  const start = definition.startPosition || { x: 1, y: 1 }
  const layoutGrid = buildRoadsideLayoutGrid(definition)
  const actorRoadDistance = distanceToRoadPaths(x, y, definition)
  const actorStartDistance = Math.hypot(x - start.x, y - start.y)
  const candidates = CARDINAL_DIRECTIONS
    .map(([direction, dx, dy], directionIndex) => {
      const nx = x + dx
      const ny = y + dy
      const tile = layoutGrid[ny]?.[nx]
      const terrainScore = getFacingTerrainScore(tile, role)
      const targetRoadDistance = distanceToRoadPaths(nx, ny, definition)
      const roadApproachScore = Math.max(0, 18 - targetRoadDistance * 4)
      const startApproachScore = Math.max(0, actorStartDistance - Math.hypot(nx - start.x, ny - start.y)) * 5
      const directRoadScore = isRoadOrBridgeTile(tile) ? 24 : 0
      const grassWatchScore = tile === TILE.tallGrass && role !== 'boss' ? 14 : 0
      const openSpaceScore = countForwardOpenSpace(layoutGrid, x, y, dx, dy) * 4
      const neighborScore = countApproachNeighbors(layoutGrid, nx, ny) * 2
      const roadImprovementScore = Math.max(0, actorRoadDistance - targetRoadDistance) * 3
      const tieBreak = seededRandom(x, y, index * 11 + directionIndex + (role === 'boss' ? 41 : role === 'lieutenant' ? 23 : 7))
      return {
        direction,
        score:
          terrainScore +
          roadApproachScore +
          startApproachScore +
          directRoadScore +
          grassWatchScore +
          openSpaceScore +
          neighborScore +
          roadImprovementScore +
          tieBreak
      }
    })
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score)

  return candidates[0]?.direction || 'down'
}

function getCharacterRotationFromFacing(facing) {
  return CHARACTER_FACE_ROTATION[facing] ?? CHARACTER_FACE_ROTATION.down
}

function clearEvents(grid, events) {
  events.forEach((event) => {
    const x = Math.trunc(Number(event.position?.x))
    const y = Math.trunc(Number(event.position?.y))
    if (!inBounds(x, y)) return
    if (grid[y][x] === TILE.water) return
    if (grid[y][x] === TILE.wall) grid[y][x] = TILE.grass
  })
}

function paintRuntimeEventTiles(grid, events) {
  events.forEach((event) => {
    const x = Math.trunc(Number(event.position?.x))
    const y = Math.trunc(Number(event.position?.y))
    const eventTile = getMapEventTile(event.type)
    if (!eventTile || !inBounds(x, y)) return
    if (grid[y][x] === TILE.water) return
    grid[y][x] = eventTile
  })
}

function addScatter({
  grid,
  output,
  types,
  count,
  area = { x1: 1, y1: 1, x2: WIDTH - 2, y2: HEIGHT - 2 },
  allowedTiles = [TILE.wall],
  salt = 1,
  scale = [0.86, 1.18],
  height = 0.2,
  keepAwayTiles = [TILE.road, TILE.exit, TILE.heal, TILE.sign, TILE.water, TILE.bridge],
  idPrefix = 'scatter'
}) {
  const allowed = new Set(allowedTiles)
  const blocked = new Set(keepAwayTiles)
  const candidates = []
  for (let y = area.y1; y <= area.y2; y += 1) {
    for (let x = area.x1; x <= area.x2; x += 1) {
      if (!inBounds(x, y)) continue
      if (!allowed.has(grid[y][x])) continue
      let nearBlocked = false
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (blocked.has(grid[y + oy]?.[x + ox])) {
          nearBlocked = true
          break
        }
      }
      if (nearBlocked && seededRandom(x, y, salt + 17) > 0.32) continue
      candidates.push({
        x,
        y,
        score: seededRandom(x, y, salt)
      })
    }
  }

  candidates.sort((a, b) => a.score - b.score)
  candidates.slice(0, count).forEach((cell, index) => {
    const type = types[index % types.length]
    const jitterX = (seededRandom(cell.x, cell.y, salt + 101) - 0.5) * 0.46
    const jitterY = (seededRandom(cell.x, cell.y, salt + 102) - 0.5) * 0.46
    const scaleValue = scale[0] + seededRandom(cell.x, cell.y, salt + 103) * (scale[1] - scale[0])
    output.push({
      type,
      x: Number((cell.x + jitterX).toFixed(2)),
      y: Number((cell.y + jitterY).toFixed(2)),
      scale: Number(scaleValue.toFixed(2)),
      rotation: Number((seededRandom(cell.x, cell.y, salt + 104) * Math.PI * 2).toFixed(4)),
      height,
      sourceId: `${idPrefix}_${index + 1}`
    })
  })
}

function event(type, id, x, y, extra = {}) {
  return {
    id,
    type,
    position: { x, y },
    ...extra
  }
}

function warp(id, x, y, targetMapName, targetPosition, label) {
  return event('warp', id, x, y, {
    target: { mapName: targetMapName, position: targetPosition },
    properties: { label }
  })
}

function heal(id, x, y, label) {
  return event('heal', id, x, y, {
    properties: {
      goldCost: 1,
      fullRestore: true,
      reusable: true,
      label
    }
  })
}

function fastTravel(id, mapId, label) {
  const station = getFastTravelStation(mapId)
  const meta = getFastTravelStationMeta(mapId)
  if (!station) return null
  return event(FAST_TRAVEL_EVENT_TYPE, id, station.x, station.y, {
    properties: {
      label,
      goldCost: FAST_TRAVEL_COST,
      stationTitle: meta?.title,
      placement: meta?.placement,
      landmark: meta?.landmark,
      routeTone: meta?.routeTone,
      terrain: meta?.terrain
    }
  })
}

function sign(id, x, y, message) {
  return event('sign', id, x, y, {
    properties: { message }
  })
}

function buildRoadsideLayoutGrid(definition) {
  const grid = makeGrid()

  ;(definition.clearings || []).forEach((clearing) => {
    if (clearing.shape === 'rect') {
      paintRect(grid, clearing.x1, clearing.y1, clearing.x2, clearing.y2, clearing.tile ?? TILE.grass)
    } else {
      paintEllipse(grid, clearing.x, clearing.y, clearing.rx, clearing.ry, clearing.tile ?? TILE.grass)
    }
  })

  ;(definition.waterTiles || []).forEach((water) => {
    paintEllipse(grid, water.x, water.y, water.rx, water.ry, TILE.water)
  })

  ;(definition.sandTiles || []).forEach((sand) => {
    if (sand.shape === 'rect') paintRect(grid, sand.x1, sand.y1, sand.x2, sand.y2, TILE.sand)
    else paintEllipse(grid, sand.x, sand.y, sand.rx, sand.ry, TILE.sand)
  })

  ;(definition.roadPaths || []).forEach((path) => paintOrthogonalPath(grid, path.points, path.width ?? 3))
  paintDefinedBridges(grid, definition)
  normalizeWaterRoads(grid, definition)

  ;(definition.tallGrass || []).forEach((field) => {
    if (field.shape === 'rect') paintRect(grid, field.x1, field.y1, field.x2, field.y2, TILE.tallGrass)
    else paintEllipse(grid, field.x, field.y, field.rx, field.ry, TILE.tallGrass, { onlyTiles: [TILE.grass, TILE.sand, TILE.paleGrass] })
  })

  ;(definition.roadPaths || []).forEach((path) => paintOrthogonalPath(grid, path.points, path.width ?? 3))
  paintDefinedBridges(grid, definition)
  normalizeWaterRoads(grid, definition)

  return grid
}

function collectTiles(grid, predicate) {
  const points = []
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (predicate(grid[y]?.[x], x, y)) points.push({ x, y })
    }
  }
  return points
}

function buildOrthogonalConnector(start, target, verticalFirst = false) {
  const points = []
  const addPoint = (x, y) => {
    const last = points[points.length - 1]
    if (!last || last.x !== x || last.y !== y) points.push({ x, y })
  }

  if (verticalFirst) {
    const stepY = target.y >= start.y ? 1 : -1
    for (let y = start.y; y !== target.y; y += stepY) addPoint(start.x, y)
    const stepX = target.x >= start.x ? 1 : -1
    for (let x = start.x; x !== target.x; x += stepX) addPoint(x, target.y)
  } else {
    const stepX = target.x >= start.x ? 1 : -1
    for (let x = start.x; x !== target.x; x += stepX) addPoint(x, start.y)
    const stepY = target.y >= start.y ? 1 : -1
    for (let y = start.y; y !== target.y; y += stepY) addPoint(target.x, y)
  }
  addPoint(target.x, target.y)

  return points
}

function isConnectorClear(grid, connector) {
  return connector.every((point) => inBounds(point.x, point.y) && grid[point.y]?.[point.x] !== TILE.water)
}

function carveConnector(grid, connector) {
  connector.forEach((point) => {
    const tile = grid[point.y]?.[point.x]
    if (tile === TILE.water || tile === TILE.road || tile === TILE.bridge) return
    grid[point.y][point.x] = TILE.grass
  })
}

function carveConnectorToRoadEntry(grid, connector) {
  connector.forEach((point, index) => {
    if (index === connector.length - 1) return
    const tile = grid[point.y]?.[point.x]
    if (tile === TILE.water || tile === TILE.bridge) return
    grid[point.y][point.x] = TILE.road
  })
}

function hasRoadTouchingZone(grid, zone) {
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if (!inBounds(x, y)) continue
      if (![TILE.grass, TILE.tallGrass, TILE.sand, TILE.paleGrass, TILE.flowers].includes(grid[y][x])) continue
      if (
        grid[y - 1]?.[x] === TILE.road ||
        grid[y + 1]?.[x] === TILE.road ||
        grid[y]?.[x - 1] === TILE.road ||
        grid[y]?.[x + 1] === TILE.road ||
        grid[y - 1]?.[x] === TILE.bridge ||
        grid[y + 1]?.[x] === TILE.bridge ||
        grid[y]?.[x - 1] === TILE.bridge ||
        grid[y]?.[x + 1] === TILE.bridge
      ) {
        return true
      }
    }
  }
  return false
}

const ROAD_BLOCKING_PROFILE_KEYS = ['lieutenants', 'trainers', 'boss', 'challenge', 'signs']
const ROAD_BLOCKING_EVENT_TYPES = new Set(['trainer', 'boss', 'challenge', 'info', 'sign'])

function collectDefinitionRoadBlockers(definition) {
  const blocked = new Set()
  const addPoint = (point) => {
    if (!Array.isArray(point) || point.length < 2) return
    const [x, y] = point
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    blocked.add(`${Math.trunc(x)},${Math.trunc(y)}`)
  }

  const profile = resolveGameplayProfilePositions(definition)
  ROAD_BLOCKING_PROFILE_KEYS.forEach((key) => {
    const value = profile?.positions?.[key]
    if (Array.isArray(value?.[0])) value.forEach(addPoint)
    else if (Array.isArray(value)) addPoint(value)
  })

  ;(definition.runtimeEvents || []).forEach((event) => {
    if (!ROAD_BLOCKING_EVENT_TYPES.has(event.type)) return
    const x = Number(event.position?.x)
    const y = Number(event.position?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    blocked.add(`${Math.trunc(x)},${Math.trunc(y)}`)
  })

  return blocked
}

function isConnectorUsableForRoad(grid, connector, blockedKeys) {
  return connector.every((point) => {
    if (!inBounds(point.x, point.y)) return false
    if (blockedKeys.has(`${point.x},${point.y}`)) return false
    return grid[point.y]?.[point.x] !== TILE.water
  })
}

function connectorToPathPoints(connector) {
  if (connector.length <= 2) return connector.map((point) => [point.x, point.y])

  const points = [[connector[0].x, connector[0].y]]
  for (let index = 1; index < connector.length - 1; index += 1) {
    const prev = connector[index - 1]
    const current = connector[index]
    const next = connector[index + 1]
    const fromX = current.x - prev.x
    const fromY = current.y - prev.y
    const toX = next.x - current.x
    const toY = next.y - current.y
    if (fromX !== toX || fromY !== toY) points.push([current.x, current.y])
  }
  const end = connector[connector.length - 1]
  points.push([end.x, end.y])
  return points
}

function collectZoneRoadTargets(grid, zone, blockedKeys) {
  const targets = []
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if (!inBounds(x, y)) continue
      if (blockedKeys.has(`${x},${y}`)) continue
      if ([TILE.water, TILE.wall].includes(grid[y][x])) continue
      const edgeDistance = Math.min(x - zone.x, zone.x + zone.width - 1 - x, y - zone.y, zone.y + zone.height - 1 - y)
      if (edgeDistance > 1) continue
      targets.push({ x, y, edgeDistance })
    }
  }
  return targets
}

function countConnectorTiles(grid, connector, tileType) {
  return connector.reduce((count, point) => count + Number(grid[point.y]?.[point.x] === tileType), 0)
}

function deriveEncounterEntranceRoadPaths(definition) {
  const grid = buildRoadsideLayoutGrid(definition)
  const blockedKeys = collectDefinitionRoadBlockers(definition)
  const generatedPaths = []

  ;(definition.encounterZones || []).forEach((zone) => {
    if (hasRoadTouchingZone(grid, zone)) return

    const roadTiles = collectTiles(grid, (tile, x, y) => (
      (tile === TILE.road || tile === TILE.bridge) &&
      !blockedKeys.has(`${x},${y}`)
    ))
    const targets = collectZoneRoadTargets(grid, zone, blockedKeys)
    if (roadTiles.length === 0 || targets.length === 0) return

    let best = null
    targets.forEach((target) => {
      roadTiles.forEach((start) => {
        ;[false, true].forEach((verticalFirst) => {
          const connector = buildOrthogonalConnector(start, target, verticalFirst)
          if (!isConnectorUsableForRoad(grid, connector, blockedKeys)) return

          const wallPenalty = countConnectorTiles(grid, connector, TILE.wall) * 7
          const grassPenalty = countConnectorTiles(grid, connector, TILE.tallGrass) * 2
          const bendPenalty = verticalFirst ? 1 : 0
          const score = connector.length * 10 + wallPenalty + grassPenalty + target.edgeDistance * 4 + bendPenalty
          if (!best || score < best.score) best = { connector, score }
        })
      })
    })

    if (!best) return

    const points = connectorToPathPoints(best.connector)
    if (points.length < 2) return

    const entrancePath = {
      points,
      width: 1,
      radius: 0.52,
      edgeRadius: 0.66,
      source: 'encounterZoneEntrance',
      zoneId: zone.id
    }
    generatedPaths.push(entrancePath)
    paintOrthogonalPath(grid, entrancePath.points, entrancePath.width)
  })

  return generatedPaths
}

function resolveRegionRoadPaths(definition) {
  const basePaths = definition.roadPaths || []
  // 区域大地图只保留主干道和少量主要分支，遭遇区入口仍通过 carveEncounterZoneAccessCorridors 保证可达。
  return basePaths
}

function carveEncounterZoneAccessCorridors(grid, definition) {
  const roadTiles = collectTiles(grid, (tile) => tile === TILE.road || tile === TILE.bridge)
  if (roadTiles.length === 0) return

  ;(definition.encounterZones || []).forEach((zone) => {
    if (hasRoadTouchingZone(grid, zone)) return

    const zoneTiles = []
    for (let y = zone.y; y < zone.y + zone.height; y += 1) {
      for (let x = zone.x; x < zone.x + zone.width; x += 1) {
        if (!inBounds(x, y)) continue
        const tile = grid[y][x]
        if ([TILE.grass, TILE.tallGrass, TILE.sand, TILE.paleGrass, TILE.flowers].includes(tile)) {
          const edgeDistance = Math.min(x - zone.x, zone.x + zone.width - 1 - x, y - zone.y, zone.y + zone.height - 1 - y)
          zoneTiles.push({ x, y, edgeDistance })
        }
      }
    }
    if (zoneTiles.length === 0) return

    let best = null
    zoneTiles.forEach((target) => {
      roadTiles.forEach((start) => {
        const horizontalFirst = buildOrthogonalConnector(start, target, false)
        const verticalFirst = buildOrthogonalConnector(start, target, true)
        ;[horizontalFirst, verticalFirst].forEach((connector) => {
          if (!isConnectorClear(grid, connector)) return
          const score = connector.length * 10 + target.edgeDistance
          if (!best || score < best.score) {
            best = { connector, score }
          }
        })
      })
    })

    if (best) carveConnectorToRoadEntry(grid, best.connector)
  })
}

function isInsideEllipseDefinition(x, y, ellipse, padding = 0) {
  const rx = Number(ellipse?.rx) + padding
  const ry = Number(ellipse?.ry) + padding
  const cx = Number(ellipse?.x)
  const cy = Number(ellipse?.y)
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rx <= 0 || ry <= 0) return false

  const rotation = Number(ellipse?.rotation) || 0
  const dx = x - cx
  const dy = y - cy
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1
}

function isInsideDefinedWater(definition, x, y, padding = 0) {
  return (
    (definition.waterTiles || []).some((water) => isInsideEllipseDefinition(x, y, water, padding)) ||
    (definition.waterBodies || []).some((water) => isInsideEllipseDefinition(x, y, water, padding))
  )
}

function collectCrossingBridgeTileKeys(definition) {
  const bridgeKeys = new Set()

  ;(definition.roadPaths || []).forEach((path, pathIndex) => {
    const points = Array.isArray(path.points) ? path.points : []
    const half = Math.floor((path.width ?? 3) / 2)

    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      const horizontal = ay === by
      const vertical = ax === bx
      if (!horizontal && !vertical) continue

      const start = horizontal ? Math.min(ax, bx) : Math.min(ay, by)
      const end = horizontal ? Math.max(ax, bx) : Math.max(ay, by)
      let runStart = null

      for (let cursor = start; cursor <= end; cursor += 1) {
        const x = horizontal ? cursor : ax
        const y = horizontal ? ay : cursor
        const insideWater = isInsideDefinedWater(definition, x, y)

        if (insideWater && runStart == null) runStart = cursor
        if ((!insideWater || cursor === end) && runStart != null) {
          const runEnd = insideWater && cursor === end ? cursor : cursor - 1
          const startPoint = horizontal ? { x: runStart, y: ay } : { x: ax, y: runStart }
          const endPoint = horizontal ? { x: runEnd, y: ay } : { x: ax, y: runEnd }
          const hasStartConnection =
            runStart > start ||
            index > 0 ||
            hasRoadPathConnectionAt(definition, startPoint.x, startPoint.y, pathIndex, index)
          const hasEndConnection =
            runEnd < end ||
            index < points.length - 2 ||
            hasRoadPathConnectionAt(definition, endPoint.x, endPoint.y, pathIndex, index)
          const crossesWater = hasStartConnection && hasEndConnection

          if (crossesWater) {
            for (let bridgeCursor = runStart; bridgeCursor <= runEnd; bridgeCursor += 1) {
              for (let offset = -half; offset <= half; offset += 1) {
                const tileX = horizontal ? bridgeCursor : ax + offset
                const tileY = horizontal ? ay + offset : bridgeCursor
                if (!inBounds(tileX, tileY)) continue
                if (!isInsideDefinedWater(definition, tileX, tileY)) continue
                bridgeKeys.add(`${tileX},${tileY}`)
              }
            }
          }

          runStart = null
        }
      }
    }
  })

  return bridgeKeys
}

function isPointOnOrthogonalPathSegment(x, y, start, end) {
  const [ax, ay] = start
  const [bx, by] = end
  if (ax === bx) return x === ax && y >= Math.min(ay, by) && y <= Math.max(ay, by)
  if (ay === by) return y === ay && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)
  return false
}

function hasRoadPathConnectionAt(definition, x, y, currentPathIndex, currentSegmentIndex) {
  return (definition.roadPaths || []).some((path, pathIndex) => {
    const points = Array.isArray(path.points) ? path.points : []
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      if (pathIndex === currentPathIndex && segmentIndex === currentSegmentIndex) continue
      if (isPointOnOrthogonalPathSegment(x, y, points[segmentIndex], points[segmentIndex + 1])) return true
    }
    return false
  })
}

function normalizeWaterRoads(grid, definition) {
  const bridgeKeys = collectCrossingBridgeTileKeys(definition)

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (grid[y][x] !== TILE.road) continue
      if (!isInsideDefinedWater(definition, x, y)) continue
      grid[y][x] = bridgeKeys.has(`${x},${y}`) ? TILE.bridge : TILE.water
    }
  }
}

function paintDefinedBridges(grid, definition) {
  ;(definition.bridges || []).forEach((bridge) => {
    const vertical = Math.abs(Math.sin(bridge.rotation || 0)) > 0.5
    const halfWidth = Math.max(0, Math.floor((Number(bridge.width) || 1) / 2))
    const minX = vertical ? bridge.x - halfWidth : Math.round(bridge.x - bridge.length / 2)
    const maxX = vertical ? bridge.x + halfWidth : Math.round(bridge.x + bridge.length / 2)
    const minY = vertical ? Math.round(bridge.y - bridge.length / 2) : bridge.y - halfWidth
    const maxY = vertical ? Math.round(bridge.y + bridge.length / 2) : bridge.y + halfWidth
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!inBounds(x, y)) continue
        if (![TILE.road, TILE.bridge].includes(grid[y]?.[x])) continue
        if (!isInsideDefinedWater(definition, x, y)) continue
        grid[y][x] = TILE.bridge
      }
    }
  })
}

function roadSegmentBridgeRuns(definition, points, width = 3, pathIndex = -1) {
  const runs = []

  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, ay] = points[index]
    const [bx, by] = points[index + 1]
    const horizontal = ay === by
    const vertical = ax === bx
    if (!horizontal && !vertical) continue

    const start = horizontal ? Math.min(ax, bx) : Math.min(ay, by)
    const end = horizontal ? Math.max(ax, bx) : Math.max(ay, by)
    let activeStart = null

    for (let cursor = start; cursor <= end; cursor += 1) {
      const x = horizontal ? cursor : ax
      const y = horizontal ? ay : cursor
      const hasBridge = isInsideDefinedWater(definition, x, y)

      if (hasBridge && activeStart == null) activeStart = cursor
      if ((!hasBridge || cursor === end) && activeStart != null) {
        const activeEnd = hasBridge && cursor === end ? cursor : cursor - 1
        const startPoint = horizontal ? { x: activeStart, y: ay } : { x: ax, y: activeStart }
        const endPoint = horizontal ? { x: activeEnd, y: ay } : { x: ax, y: activeEnd }
        const hasStartConnection =
          activeStart > start ||
          index > 0 ||
          hasRoadPathConnectionAt(definition, startPoint.x, startPoint.y, pathIndex, index)
        const hasEndConnection =
          activeEnd < end ||
          index < points.length - 2 ||
          hasRoadPathConnectionAt(definition, endPoint.x, endPoint.y, pathIndex, index)
        if (activeEnd - activeStart >= 1 && hasStartConnection && hasEndConnection) {
          runs.push({
            horizontal,
            x: horizontal ? (activeStart + activeEnd) / 2 : ax,
            y: horizontal ? ay : (activeStart + activeEnd) / 2,
            length: activeEnd - activeStart + 1,
            width
          })
        }
        activeStart = null
      }
    }
  }

  return runs
}

function deriveBridgeModelsFromGrid(grid, definition) {
  const derived = []
  ;(definition.roadPaths || []).forEach((path, pathIndex) => {
    roadSegmentBridgeRuns(definition, path.points || [], path.width ?? 3, pathIndex).forEach((run) => {
      const bridgeExtraLength = Number.isFinite(Number(path.bridgeExtraLength))
        ? Number(path.bridgeExtraLength)
        : 0.72
      derived.push({
        x: Number(run.x.toFixed(2)),
        y: Number(run.y.toFixed(2)),
        length: Number((run.length + bridgeExtraLength).toFixed(2)),
        width: Number(Math.min(1.16, Math.max(0.92, run.width * 0.34)).toFixed(2)),
        rotation: run.horizontal ? 0 : Math.PI / 2,
        source: 'water-road-promoted'
      })
    })
  })

  if (derived.length > 0) return derived
  return definition.bridges || []
}

function paintBridgeModelFootprints(grid, bridges) {
  bridges.forEach((bridge) => {
    const rotation = Number(bridge.rotation) || 0
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const footprint = Math.max(Number(bridge.length) || 0, Number(bridge.width) || 0)
    const minX = Math.floor(Number(bridge.x) - footprint / 2 - 1)
    const maxX = Math.ceil(Number(bridge.x) + footprint / 2 + 1)
    const minY = Math.floor(Number(bridge.y) - footprint / 2 - 1)
    const maxY = Math.ceil(Number(bridge.y) + footprint / 2 + 1)

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!inBounds(x, y)) continue
        const dx = x - bridge.x
        const dy = y - bridge.y
        const localX = dx * cos + dy * sin
        const localY = -dx * sin + dy * cos
        if (Math.abs(localX) > (Number(bridge.length) || 1) / 2 + 0.05) continue
        if (Math.abs(localY) > (Number(bridge.width) || 1) / 2 + 0.05) continue
        if (![TILE.water, TILE.bridge].includes(grid[y][x])) continue
        grid[y][x] = TILE.bridge
      }
    }
  })
}

function isInsideBridgeFootprint(bridge, x, y, padding = 0.35) {
  const rotation = Number(bridge.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - Number(bridge.x)
  const dy = y - Number(bridge.y)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (
    Math.abs(localX) <= (Number(bridge.length) || 1) / 2 + padding &&
    Math.abs(localY) <= (Number(bridge.width) || 1) / 2 + padding
  )
}

function filterBridgeSurfaceDecorations(decorations, bridges) {
  if (!Array.isArray(bridges) || bridges.length === 0) return decorations
  return decorations.filter((object) => !bridges.some((bridge) => (
    isInsideBridgeFootprint(bridge, Number(object.x), Number(object.y))
  )))
}

const FIXED_LANDMARK_CLEARANCE_RADIUS = {
  heal: 2.25,
  challenge: 2.25
}

function filterFixedLandmarkOverlaps(decorations, runtimeEvents) {
  const landmarks = (runtimeEvents || [])
    .filter((event) => event.type === 'heal' || event.type === 'challenge')
    .map((event) => ({
      id: event.id,
      type: event.type,
      x: Number(event.position?.x),
      y: Number(event.position?.y),
      radius: FIXED_LANDMARK_CLEARANCE_RADIUS[event.type] || 1.4
    }))
    .filter((event) => Number.isFinite(event.x) && Number.isFinite(event.y))

  if (landmarks.length === 0) return decorations

  return decorations.filter((object) => {
    if (object?.eventType === 'heal' || object?.eventType === 'challenge') return true
    const x = Number(object?.x)
    const y = Number(object?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true

    return !landmarks.some((landmark) => {
      if (object.eventId === landmark.id) return false
      return Math.hypot(x - landmark.x, y - landmark.y) < landmark.radius
    })
  })
}

function filterRuntimeEventTileOverlaps(decorations, runtimeEvents) {
  const eventKeys = new Set(
    (runtimeEvents || [])
      .map((event) => {
        const x = Math.trunc(Number(event.position?.x))
        const y = Math.trunc(Number(event.position?.y))
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null
        return `${x},${y}`
      })
      .filter(Boolean)
  )

  if (eventKeys.size === 0) return decorations

  return decorations.filter((object) => {
    if (object?.eventId || object?.eventType || object?.fixedSceneEventType) return true
    const x = Math.round(Number(object?.x))
    const y = Math.round(Number(object?.y))
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true
    return !eventKeys.has(`${x},${y}`)
  })
}

const DECORATIVE_ASSET_ALIASES = {
  'grass-small': 'nature_grass_small',
  'grass-large': 'nature_grass_large',
  'flower-yellow': 'nature_flower_yellow',
  'flower-red': 'nature_flower_red',
  'mushroom-red': 'nature_mushroom_red',
  'tree-oak': 'nature_tree_oak',
  'tree-default': 'nature_tree_default',
  'tree-pine': 'nature_tree_pine',
  'bush-large': 'nature_bush_large',
  'rock-large': 'nature_rock_large',
  'stone-large': 'nature_stone_large'
}

const LOW_VEGETATION_DECORATION_TYPES = new Set([
  'grass-small',
  'grass-large',
  'flower-yellow',
  'flower-red',
  'mushroom-red',
  'wetland_reed_clump'
])
const LOW_VEGETATION_TAGS = new Set(['grass', 'flower', 'mushroom', 'reed'])

const DECORATIVE_FOOTPRINT_OVERRIDES = {
  nature_fence_simple: { width: 2, height: 1 },
  nature_fence_planks: { width: 2, height: 1 },
  nature_log_stack: { width: 2, height: 1.2 },
  nature_rock_small_h: { width: 1.15, height: 1.15 },
  nature_stump_round_detailed: { width: 1.15, height: 1.15 },
  town_hedge: { width: 2, height: 1 },
  town_hedge_large: { width: 2.4, height: 1.2 },
  town_rock_small: { width: 1.15, height: 1.15 },
  pirate_boat_row_large: { width: 2.1, height: 3 },
  pirate_palm_detailed_straight: { width: 1.6, height: 1.6 },
  pirate_rocks_sand_a: { width: 1.25, height: 1.15 },
  pirate_rocks_sand_b: { width: 1.25, height: 1.15 },
  pirate_rocks_sand_c: { width: 1.25, height: 1.15 },
  pirate_patch_sand_foliage: { width: 1.2, height: 1 },
  pirate_ship_wreck: { width: 3.8, height: 2.2 },
  shore_dock_small: { width: 3, height: 2 },
  shore_rowboat: { width: 2, height: 3 },
  town_windmill: { width: 3.2, height: 3.2 },
  town_watermill: { width: 3, height: 2.8 },
  hex_building_farm: { width: 3, height: 2.6 },
  hex_building_mine: { width: 3, height: 2.6 },
  hex_building_cabin: { width: 2.6, height: 2.4 },
  hex_building_market: { width: 3, height: 2.6 },
  hex_grass_forest: { width: 1.4, height: 1.4 },
  hex_unit_tree: { width: 1.35, height: 1.35 },
  hex_water_rocks: { width: 1.35, height: 1.25 },
  platformer_platform_overhang: { width: 1.4, height: 1.2 },
  survival_rock_a: { width: 1.2, height: 1.2 },
  survival_rock_b: { width: 1.2, height: 1.2 },
  survival_rock_c: { width: 1.2, height: 1.2 },
  survival_metal_panel: { width: 1.4, height: 1 },
  survival_tool_axe: { width: 1.1, height: 0.9 },
  survival_tool_pickaxe: { width: 1.1, height: 0.9 }
}

const PATH_BLOCKING_DECORATION_TYPES = new Set([
  'nature_fence_simple',
  'nature_fence_planks',
  'nature_log_stack',
  'nature_rock_small_h',
  'nature_stump_round_detailed',
  'nature_tent_detailed_open',
  'town_cart',
  'town_hedge',
  'town_hedge_large',
  'town_rock_small',
  'town_stall_red',
  'town_tree',
  'town_tree_high',
  'pirate_barrel',
  'pirate_crate',
  'pirate_chest',
  'pirate_flag',
  'pirate_flag_pennant',
  'pirate_mast',
  'pirate_palm_detailed_straight',
  'pirate_rocks_sand_a',
  'pirate_rocks_sand_b',
  'pirate_rocks_sand_c',
  'pirate_patch_sand_foliage',
  'pirate_structure_fence',
  'pirate_cannon',
  'survival_barrel',
  'survival_box',
  'survival_chest',
  'survival_fence',
  'survival_resource_wood',
  'survival_resource_planks',
  'survival_rock_a',
  'survival_rock_b',
  'survival_rock_c',
  'survival_tent',
  'survival_tool_axe',
  'survival_tool_pickaxe',
  'survival_workbench',
  'grave_gravestone_round',
  'grave_gravestone_broken',
  'grave_gravestone_cross',
  'grave_cross_wood',
  'grave_rocks',
  'grave_coffin_old',
  'grave_bench_damaged',
  'grave_iron_fence_border',
  'grave_stone_wall_damaged',
  'platformer_rocks',
  'platformer_stones',
  'platformer_barrel',
  'platformer_crate',
  'platformer_chest',
  'platformer_fence_straight',
  'platformer_fence_low_straight',
  'platformer_hedge',
  'platformer_platform_overhang',
  'platformer_tree_pine',
  'mine_crate_strong',
  'ridge_block_grass_edge',
  'hex_stone_rocks',
  'hex_stone_hill',
  'hex_grass_forest',
  'hex_unit_tree',
  'hex_water_rocks',
  'hex_building_farm',
  'hex_building_mine',
  'hex_building_cabin',
  'hex_building_market'
])

const DECORATION_BLOCKER_PROTECTED_TILES = new Set([
  TILE.exit,
  TILE.heal,
  TILE.sign,
  TILE.tallGrass,
  TILE.water,
  TILE.road,
  TILE.bridge
])

function getDecorationAssetMeta(type) {
  return MAP_ASSET_CATALOG[type] || MAP_ASSET_CATALOG[DECORATIVE_ASSET_ALIASES[type]] || null
}

function isLowVegetationDecoration(object) {
  if (LOW_VEGETATION_DECORATION_TYPES.has(object?.type)) return true
  const asset = getDecorationAssetMeta(object?.type)
  if (!asset?.decorativeOnly) return false
  return (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag))
}

function isRuntimeGridWalkable(tile) {
  return ![TILE.wall, TILE.heal, TILE.sign, TILE.water, TILE.objectBlocker].includes(tile)
}

function hasWalkableCardinalNeighbor(grid, x, y) {
  return (
    isRuntimeGridWalkable(grid[y - 1]?.[x]) ||
    isRuntimeGridWalkable(grid[y + 1]?.[x]) ||
    isRuntimeGridWalkable(grid[y]?.[x - 1]) ||
    isRuntimeGridWalkable(grid[y]?.[x + 1])
  )
}

function isRuntimeEventDecoration(object) {
  return Boolean(object?.eventId || object?.eventType || object?.fixedSceneEventType)
}

function isPathBlockingDecoration(object) {
  if (isRuntimeEventDecoration(object)) return false
  const asset = getDecorationAssetMeta(object?.type)
  return Boolean(
    DECORATIVE_FOOTPRINT_OVERRIDES[object?.type] ||
    PATH_BLOCKING_DECORATION_TYPES.has(object?.type) ||
    asset?.defaultBlocking
  )
}

function getDecorationFootprint(object, padding = 0) {
  const asset = getDecorationAssetMeta(object?.type)
  const override = DECORATIVE_FOOTPRINT_OVERRIDES[object?.type]
  const baseWidth = Number(override?.width ?? asset?.footprint?.width ?? 1)
  const baseHeight = Number(override?.height ?? asset?.footprint?.height ?? 1)
  const scale = Math.max(0.45, Number(object?.scale ?? asset?.defaultScale ?? 1) || 1)
  return {
    width: Math.max(0.72, baseWidth * scale + padding * 2),
    height: Math.max(0.72, baseHeight * scale + padding * 2)
  }
}

function isInsideDecorationFootprint(object, x, y, padding = 0) {
  const centerX = Number(object?.x)
  const centerY = Number(object?.y)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return false
  const rotation = Number(object?.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - centerX
  const dy = y - centerY
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const footprint = getDecorationFootprint(object, padding)
  return (
    Math.abs(localX) <= footprint.width / 2 &&
    Math.abs(localY) <= footprint.height / 2
  )
}

function getDecorationFootprintCells(object, padding = 0) {
  const centerX = Number(object?.x)
  const centerY = Number(object?.y)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return []
  const footprint = getDecorationFootprint(object, padding)
  const radius = Math.ceil(Math.max(footprint.width, footprint.height) / 2 + 1)
  const cells = []
  const seen = new Set()

  for (let y = Math.floor(centerY) - radius; y <= Math.ceil(centerY) + radius; y += 1) {
    for (let x = Math.floor(centerX) - radius; x <= Math.ceil(centerX) + radius; x += 1) {
      if (!inBounds(x, y)) continue
      if (!isInsideDecorationFootprint(object, x, y, padding)) continue
      const cellKey = `${x},${y}`
      if (seen.has(cellKey)) continue
      seen.add(cellKey)
      cells.push({ x, y })
    }
  }

  return cells
}

function collectEventAccessCorridorCells(grid, runtimeEvents) {
  const cells = new Set()
  const roadTiles = collectTiles(grid, (tile) => tile === TILE.road || tile === TILE.bridge)
  if (roadTiles.length === 0) return cells

  ;(runtimeEvents || []).forEach((evt) => {
    const eventX = Math.trunc(Number(evt.position?.x))
    const eventY = Math.trunc(Number(evt.position?.y))
    const targets = EVENT_ACCESS_ADJACENT_TYPES.has(evt.type)
      ? CARDINAL_DIRECTIONS
        .map(([, dx, dy]) => ({ x: eventX + dx, y: eventY + dy }))
        .filter((point) => inBounds(point.x, point.y) && grid[point.y]?.[point.x] !== TILE.water)
      : [getEventAccessTarget(grid, evt)].filter(Boolean)

    targets.forEach((target) => {
      cells.add(`${target.x},${target.y}`)

      let best = null
      roadTiles.forEach((start) => {
        ;[false, true].forEach((verticalFirst) => {
          const connector = buildOrthogonalConnector(start, target, verticalFirst)
          if (!isConnectorClear(grid, connector)) return
          const bendPenalty = verticalFirst ? 1 : 0
          const score = connector.length * 10 + bendPenalty
          if (!best || score < best.score) best = { connector, score }
        })
      })

      if (!best) return
      best.connector.forEach((point) => cells.add(`${point.x},${point.y}`))
    })
  })

  return cells
}

function collectPathClearanceCells(grid, runtimeEvents) {
  const cells = collectEventAccessCorridorCells(grid, runtimeEvents)

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if ([TILE.road, TILE.bridge, TILE.exit].includes(grid[y]?.[x])) {
        cells.add(`${x},${y}`)
      }
    }
  }

  ;(runtimeEvents || []).forEach((evt) => {
    const x = Math.trunc(Number(evt.position?.x))
    const y = Math.trunc(Number(evt.position?.y))
    if (!inBounds(x, y)) return
    if (EVENT_ACCESS_TYPES.has(evt.type)) cells.add(`${x},${y}`)
    if (!EVENT_ACCESS_ADJACENT_TYPES.has(evt.type)) return

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const tileX = x + dx
        const tileY = y + dy
        if (!inBounds(tileX, tileY)) continue
        if (grid[tileY]?.[tileX] === TILE.water) continue
        cells.add(`${tileX},${tileY}`)
      }
    }
  })

  return cells
}

function filterPathClearanceDecorations(decorations, grid, runtimeEvents) {
  const clearanceCells = collectPathClearanceCells(grid, runtimeEvents)
  if (clearanceCells.size === 0) return decorations

  return decorations.filter((object) => {
    if (!isPathBlockingDecoration(object)) return true
    const footprintCells = getDecorationFootprintCells(object, 0.28)
    return !footprintCells.some((cell) => clearanceCells.has(`${cell.x},${cell.y}`))
  })
}

function paintBlockingDecorationFootprints(grid, decorations, runtimeEvents) {
  const eventKeys = new Set(
    (runtimeEvents || [])
      .map((event) => {
        const x = Math.trunc(Number(event.position?.x))
        const y = Math.trunc(Number(event.position?.y))
        return inBounds(x, y) ? `${x},${y}` : null
      })
      .filter(Boolean)
  )

  ;(decorations || []).forEach((object) => {
    if (!isPathBlockingDecoration(object)) return
    getDecorationFootprintCells(object, 0.08).forEach((cell) => {
      if (eventKeys.has(`${cell.x},${cell.y}`)) return
      const tile = grid[cell.y]?.[cell.x]
      if (DECORATION_BLOCKER_PROTECTED_TILES.has(tile)) return
      grid[cell.y][cell.x] = TILE.objectBlocker
    })
  })
}

function filterBlockedLowVegetationDecorations(decorations, grid) {
  return (decorations || []).filter((object) => {
    if (isRuntimeEventDecoration(object)) return true
    if (!isLowVegetationDecoration(object)) return true

    const x = Math.round(Number(object.x))
    const y = Math.round(Number(object.y))
    if (!inBounds(x, y)) return true
    if (isRuntimeGridWalkable(grid[y]?.[x])) return true
    return !hasWalkableCardinalNeighbor(grid, x, y)
  })
}

const EVENT_ACCESS_STEP_TYPES = new Set(['item', 'pickup', FAST_TRAVEL_EVENT_TYPE])
const EVENT_ACCESS_ADJACENT_TYPES = new Set(['warp', 'heal', 'sign', 'info', 'trainer', 'boss', 'challenge'])
const EVENT_ACCESS_TYPES = new Set([...EVENT_ACCESS_STEP_TYPES, ...EVENT_ACCESS_ADJACENT_TYPES])
const OPEN_GROUND_TILES = new Set([TILE.grass, TILE.sand, TILE.flowers, TILE.paleGrass])

function isProtectedOpenGround(grid, definition, runtimeEvents, x, y) {
  const start = definition.startPosition || { x: 1, y: 1 }
  if (Math.abs(x - start.x) + Math.abs(y - start.y) <= 5) return true
  if ([TILE.road, TILE.bridge, TILE.water, TILE.tallGrass, TILE.heal, TILE.sign, TILE.exit].includes(grid[y]?.[x])) return true
  if (distanceToRoadPaths(x, y, definition) <= 1.75) return true
  if ((definition.encounterZones || []).some((zone) => (
    x >= zone.x - 1 &&
    x < zone.x + zone.width + 1 &&
    y >= zone.y - 1 &&
    y < zone.y + zone.height + 1
  ))) return true
  if (runtimeEvents.some((evt) => (
    Math.abs(x - Number(evt.position?.x)) + Math.abs(y - Number(evt.position?.y)) <= 2
  ))) return true
  if (isInsideDefinedWater(definition, x, y, 1.15)) return true
  return false
}

function fillOpenGroundWithForestBlocks(grid, definition, runtimeEvents) {
  for (let y = 1; y < HEIGHT - 1; y += 1) {
    for (let x = 1; x < WIDTH - 1; x += 1) {
      if (!OPEN_GROUND_TILES.has(grid[y][x])) continue
      if (isProtectedOpenGround(grid, definition, runtimeEvents, x, y)) continue
      grid[y][x] = TILE.wall
    }
  }
}

function softenForestEdgeCollisions(grid) {
  const updates = []
  const passableTiles = new Set([
    TILE.grass,
    TILE.road,
    TILE.sand,
    TILE.bridge,
    TILE.tallGrass,
    TILE.flowers,
    TILE.paleGrass,
    TILE.heal,
    TILE.sign,
    TILE.exit
  ])

  for (let y = 2; y < HEIGHT - 2; y += 1) {
    for (let x = 2; x < WIDTH - 2; x += 1) {
      if (grid[y][x] !== TILE.wall) continue

      let touchesPassable = false
      let touchesWater = false
      let wallNeighbors = 0

      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue
          const tile = grid[y + oy]?.[x + ox]
          if (tile === TILE.wall) wallNeighbors += 1
          if (tile === TILE.water) touchesWater = true
          if (passableTiles.has(tile)) touchesPassable = true
        }
      }

      if (touchesPassable && !touchesWater && wallNeighbors <= 3) {
        updates.push([x, y])
      }
    }
  }

  updates.forEach(([x, y]) => {
    grid[y][x] = TILE.grass
  })
}

function getEventAccessTarget(grid, event) {
  const x = Math.trunc(Number(event.position?.x))
  const y = Math.trunc(Number(event.position?.y))
  if (!inBounds(x, y) || !EVENT_ACCESS_TYPES.has(event.type)) return null
  if (EVENT_ACCESS_STEP_TYPES.has(event.type)) return { x, y }

  const candidates = CARDINAL_DIRECTIONS
    .map(([, dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter((point) => inBounds(point.x, point.y) && grid[point.y]?.[point.x] !== TILE.water)
    .sort((left, right) => (
      Number(grid[left.y]?.[left.x] === TILE.road || grid[left.y]?.[left.x] === TILE.bridge) -
      Number(grid[right.y]?.[right.x] === TILE.road || grid[right.y]?.[right.x] === TILE.bridge)
    ))

  return candidates[0] || null
}

function carveEventAccessCorridors(grid, runtimeEvents) {
  const roadTiles = collectTiles(grid, (tile) => tile === TILE.road || tile === TILE.bridge)
  if (roadTiles.length === 0) return

  runtimeEvents.forEach((evt) => {
    const target = getEventAccessTarget(grid, evt)
    if (!target) return
    if (grid[target.y]?.[target.x] === TILE.road || grid[target.y]?.[target.x] === TILE.bridge) return

    let best = null
    roadTiles.forEach((start) => {
      ;[false, true].forEach((verticalFirst) => {
        const connector = buildOrthogonalConnector(start, target, verticalFirst)
        if (!isConnectorClear(grid, connector)) return
        const bendPenalty = verticalFirst ? 1 : 0
        const score = connector.length * 10 + bendPenalty
        if (!best || score < best.score) best = { connector, score }
      })
    })

    if (best) carveConnector(grid, best.connector)
  })
}

function isRoadsideSignTile(tile) {
  return tile === TILE.grass || tile === TILE.wall || tile === TILE.sand || tile === TILE.paleGrass || tile === TILE.flowers
}

function collectAdjacentRoadFacings(grid, x, y) {
  return CARDINAL_DIRECTIONS
    .filter(([, dx, dy]) => isRoadOrBridgeTile(grid[y + dy]?.[x + dx]))
    .map(([direction]) => direction)
}

function chooseReadableSideFacing(x, y) {
  return seededRandom(x, y, 503) >= 0.5 ? 'right' : 'left'
}

function getRoadsideSignFacingInfoFromGrid(grid, x, y) {
  const adjacentRoadFacings = collectAdjacentRoadFacings(grid, x, y)
  const readableRoadFacings = SIGN_FACING_PRIORITY.filter((facing) => adjacentRoadFacings.includes(facing))
  if (readableRoadFacings.length > 0) {
    return {
      facing: readableRoadFacings[0],
      facesAdjacentRoad: true,
      adjacentRoadFacings
    }
  }

  return {
    facing: adjacentRoadFacings.includes('up') ? chooseReadableSideFacing(x, y) : 'down',
    facesAdjacentRoad: false,
    adjacentRoadFacings
  }
}

function inferRoadsideSignFacing(definition, x, y) {
  const layoutGrid = buildRoadsideLayoutGrid(definition)
  return getRoadsideSignFacingInfoFromGrid(layoutGrid, x, y).facing
}

function resolveRoadsideSignRotation(definition, x, y) {
  return SIGN_FACE_ROTATIONS[inferRoadsideSignFacing(definition, x, y)] ?? SIGN_FACE_DOWN
}

function hasAdjacentRoadTile(grid, x, y) {
  return (
    grid[y + 1]?.[x] === TILE.road ||
    grid[y - 1]?.[x] === TILE.road ||
    grid[y]?.[x + 1] === TILE.road ||
    grid[y]?.[x - 1] === TILE.road ||
    grid[y + 1]?.[x] === TILE.bridge ||
    grid[y - 1]?.[x] === TILE.bridge ||
    grid[y]?.[x + 1] === TILE.bridge ||
    grid[y]?.[x - 1] === TILE.bridge
  )
}

function collectRoadsidePoints(definition) {
  const layoutGrid = buildRoadsideLayoutGrid(definition)
  const seen = new Set()
  const points = []

  const addPoint = (x, y) => {
    const ix = Math.round(Number(x))
    const iy = Math.round(Number(y))
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) return
    if (!inBounds(ix, iy)) return
    if (!isRoadsideSignTile(layoutGrid[iy]?.[ix])) return
    if (!hasAdjacentRoadTile(layoutGrid, ix, iy)) return
    const key = `${ix},${iy}`
    if (seen.has(key)) return
    seen.add(key)
    const facingInfo = getRoadsideSignFacingInfoFromGrid(layoutGrid, ix, iy)
    points.push({ x: ix, y: iy, key, ...facingInfo })
  }

  ;(definition.roadPaths || []).forEach((path) => {
    const roadPoints = Array.isArray(path?.points) ? path.points : []
    const width = Math.max(1, Math.round(Number(path?.width) || 3))
    const sideOffset = Math.floor(width / 2) + 1
    for (let index = 0; index < roadPoints.length - 1; index += 1) {
      const [ax, ay] = roadPoints[index]
      const [bx, by] = roadPoints[index + 1]
      if (ax === bx) {
        const startY = Math.min(ay, by)
        const endY = Math.max(ay, by)
        for (let y = startY; y <= endY; y += 1) {
          addPoint(ax - sideOffset, y)
          addPoint(ax + sideOffset, y)
        }
        continue
      }
      if (ay === by) {
        const startX = Math.min(ax, bx)
        const endX = Math.max(ax, bx)
        for (let x = startX; x <= endX; x += 1) {
          addPoint(x, ay - sideOffset)
          addPoint(x, ay + sideOffset)
        }
        continue
      }
      addPoint(ax, ay - sideOffset)
      addPoint(ax, ay + sideOffset)
      addPoint(ax - sideOffset, ay)
      addPoint(ax + sideOffset, ay)
      addPoint(bx, by - sideOffset)
      addPoint(bx, by + sideOffset)
      addPoint(bx - sideOffset, by)
      addPoint(bx + sideOffset, by)
    }
  })

  return points
}

const CHARACTER_STANDING_TILES = new Set([TILE.grass, TILE.sand, TILE.flowers, TILE.paleGrass, TILE.tallGrass])
const CHARACTER_INTERACTION_TILES = new Set([
  TILE.grass,
  TILE.sand,
  TILE.flowers,
  TILE.paleGrass,
  TILE.tallGrass,
  TILE.road,
  TILE.bridge,
  TILE.exit
])

const CHARACTER_PLACEMENT_RULES = {
  normal: { idealRoadDistance: 2, minRoadDistance: 1.45, remoteRoadDistance: 4.5, npcSpacing: 6.2, roadNeighborPenalty: 0, searchRadius: 14 },
  lieutenant: { idealRoadDistance: 3.2, minRoadDistance: 1.55, remoteRoadDistance: 5.5, npcSpacing: 6.4, roadNeighborPenalty: 6, searchRadius: 14 },
  boss: { idealRoadDistance: 2.6, minRoadDistance: 1.55, remoteRoadDistance: 5.5, npcSpacing: 7.2, roadNeighborPenalty: 4, searchRadius: 14 }
}

function hasAdjacentTileMatching(grid, x, y, predicate) {
  return CARDINAL_DIRECTIONS.some(([, dx, dy]) => predicate(grid[y + dy]?.[x + dx], x + dx, y + dy))
}

function hasAdjacentInteractionTile(grid, x, y) {
  return hasAdjacentTileMatching(grid, x, y, (tile) => CHARACTER_INTERACTION_TILES.has(tile))
}

function hasAdjacentRoadLikeTile(grid, x, y) {
  return hasAdjacentTileMatching(grid, x, y, (tile) => isRoadOrBridgeTile(tile))
}

function canConnectCharacterAnchorToRoad(grid, roadTiles, x, y) {
  const accessTargets = CARDINAL_DIRECTIONS
    .map(([, dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter((point) => inBounds(point.x, point.y) && grid[point.y]?.[point.x] !== TILE.water)

  return accessTargets.some((target) => {
    if (isRoadOrBridgeTile(grid[target.y]?.[target.x])) return true
    return roadTiles.some((start) => (
      isConnectorClear(grid, buildOrthogonalConnector(start, target, false)) ||
      isConnectorClear(grid, buildOrthogonalConnector(start, target, true))
    ))
  })
}

function isOutsideClearancePoints(point, clearancePoints) {
  return clearancePoints.every((clearance) => (
    Math.hypot(point.x - clearance.x, point.y - clearance.y) >= clearance.radius
  ))
}

function isFarEnoughFromNpcPositions(point, npcPositions, minDistance) {
  return npcPositions.every((npcPoint) => (
    Math.hypot(point.x - npcPoint.x, point.y - npcPoint.y) >= minDistance
  ))
}

function reserveProfilePositions(usedKeys, positions) {
  const addPoint = (point) => {
    const normalized = normalizeTargetPosition(point)
    if (!normalized) return
    usedKeys.add(`${normalized.x},${normalized.y}`)
  }

  if (Array.isArray(positions?.[0])) {
    positions.forEach(addPoint)
  } else {
    addPoint(positions)
  }
}

function addProfileClearancePoints(clearancePoints, positions, radius) {
  const addPoint = (point) => {
    const normalized = normalizeTargetPosition(point)
    if (!normalized) return
    clearancePoints.push({ ...normalized, radius })
  }

  if (Array.isArray(positions?.[0])) {
    positions.forEach(addPoint)
  } else {
    addPoint(positions)
  }
}

function resolveCharacterAnchor(
  definition,
  layoutGrid,
  roadTiles,
  preferredPosition,
  usedKeys,
  clearancePoints,
  npcPositions,
  role = 'normal',
  index = 0
) {
  const preferred = normalizeTargetPosition(preferredPosition)
  if (!preferred) return preferredPosition

  const baseRule = CHARACTER_PLACEMENT_RULES[role] || CHARACTER_PLACEMENT_RULES.normal
  const candidates = []
  const addCandidate = (x, y, {
    allowTallGrass = false,
    relaxRoadDistance = false,
    globalPenalty = 0
  } = {}) => {
    if (!inBounds(x, y)) return
    const key = `${x},${y}`
    if (usedKeys.has(key)) return
    const tile = layoutGrid[y]?.[x]
    if (!CHARACTER_STANDING_TILES.has(tile) && !(allowTallGrass && tile === TILE.tallGrass)) return
    if (!hasAdjacentInteractionTile(layoutGrid, x, y)) return
    if (!canConnectCharacterAnchorToRoad(layoutGrid, roadTiles, x, y)) return

    const roadDistance = distanceToRoadPaths(x, y, definition)
    if (!relaxRoadDistance && roadDistance < baseRule.minRoadDistance) return

    const candidate = { x, y }
    if (!isOutsideClearancePoints(candidate, clearancePoints)) return
    if (!isFarEnoughFromNpcPositions(candidate, npcPositions, baseRule.npcSpacing)) return

    const targetDistance = Math.abs(x - preferred.x) + Math.abs(y - preferred.y) + globalPenalty
    const hasRoadNeighbor = hasAdjacentRoadLikeTile(layoutGrid, x, y)
    const remoteRoadPenalty = roadDistance > baseRule.remoteRoadDistance
      ? (roadDistance - baseRule.remoteRoadDistance) * 32
      : 0
    const roadScore = Math.abs(roadDistance - baseRule.idealRoadDistance) * 8 + remoteRoadPenalty
    const roadNeighborScore = hasRoadNeighbor ? 0 : baseRule.roadNeighborPenalty + 12
    const terrainScore = tile === TILE.tallGrass ? 10 : tile === TILE.flowers ? 1 : tile === TILE.paleGrass ? 1.5 : 0
    const jitter = seededRandom(x, y, index + (role === 'boss' ? 31 : role === 'lieutenant' ? 17 : 5))
    candidates.push({
      x,
      y,
      score: targetDistance * 14 + roadScore + roadNeighborScore + terrainScore + jitter
    })
  }

  const addCandidates = ({ allowTallGrass = false, relaxRoadDistance = false }) => {
    for (let radius = 0; radius <= baseRule.searchRadius; radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
          const x = preferred.x + dx
          const y = preferred.y + dy
          addCandidate(x, y, { allowTallGrass, relaxRoadDistance })
        }
      }
    }
  }
  const addGlobalCandidates = ({ allowTallGrass = false, relaxRoadDistance = false }) => {
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        addCandidate(x, y, { allowTallGrass, relaxRoadDistance, globalPenalty: 10 })
      }
    }
  }

  addCandidates({})
  if (candidates.length === 0) addCandidates({ allowTallGrass: true })
  if (candidates.length === 0) addCandidates({ allowTallGrass: true, relaxRoadDistance: true })
  if (candidates.length === 0) addGlobalCandidates({})
  if (candidates.length === 0) addGlobalCandidates({ allowTallGrass: true, relaxRoadDistance: true })

  const selected = candidates
    .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x)[0] || preferred
  usedKeys.add(`${selected.x},${selected.y}`)
  npcPositions.push({ x: selected.x, y: selected.y })
  return [selected.x, selected.y]
}

const PICKUP_STANDING_TILES = new Set([TILE.grass, TILE.sand, TILE.flowers, TILE.paleGrass])
const PICKUP_FALLBACK_TILES = new Set([...PICKUP_STANDING_TILES, TILE.tallGrass])
const PICKUP_PLACEMENT_RULE = {
  minNpcDistance: 4,
  minPickupDistance: 4,
  minEventDistance: 2.8,
  minRoadDistance: 1.2,
  idealRoadDistance: 3.2,
  hiddenIdealRoadDistance: 4.5,
  remoteRoadDistance: 8,
  searchRadius: 10
}

const DEFAULT_PICKUP_VISUAL_SCENES = [
  { type: 'survival_chest', rotation: 0.18, accents: [{ type: 'nature_stone_flat_a', dx: -0.5, dy: 0.42, scale: 0.48 }] },
  { type: 'survival_box', rotation: -0.24, accents: [{ type: 'survival_patch_grass', dx: 0.48, dy: 0.36, scale: 0.5 }] },
  { type: 'platformer_chest', rotation: 0.28, accents: [{ type: 'nature_flower_yellow_b', dx: -0.42, dy: -0.38, scale: 0.52 }] }
]

const PICKUP_VISUAL_SCENES_BY_MAP = {
  GodotMap: [
    {
      type: 'survival_chest',
      rotation: 0.22,
      accents: [
        { type: 'survival_bedroll_packed', dx: 0.52, dy: 0.3, scale: 0.52, rotation: -0.24 },
        { type: 'town_lantern', dx: -0.48, dy: -0.34, scale: 0.46, height: 0.18 }
      ]
    },
    {
      type: 'survival_box',
      rotation: -0.18,
      accents: [
        { type: 'nature_flower_yellow_b', dx: -0.46, dy: 0.34, scale: 0.58 },
        { type: 'nature_stone_flat_b', dx: 0.46, dy: -0.36, scale: 0.42, rotation: 0.36 }
      ]
    },
    {
      type: 'platformer_chest',
      rotation: 0.3,
      accents: [
        { type: 'nature_flower_purple_a', dx: -0.42, dy: -0.36, scale: 0.58 },
        { type: 'platformer_flowers', dx: 0.5, dy: 0.34, scale: 0.52, rotation: -0.28 }
      ]
    },
    {
      type: 'survival_chest',
      rotation: -0.32,
      accents: [
        { type: 'wetland_reed_clump', dx: -0.5, dy: 0.34, scale: 0.5, rotation: 0.18 },
        { type: 'nature_lily_large', dx: 0.48, dy: -0.36, scale: 0.42, rotation: -0.26 }
      ]
    },
    {
      type: 'survival_box',
      rotation: 0.14,
      accents: [
        { type: 'nature_stone_flat_c', dx: -0.5, dy: 0.34, scale: 0.46, rotation: -0.32 },
        { type: 'town_lantern', dx: 0.46, dy: -0.34, scale: 0.42, height: 0.18, rotation: 0.18 }
      ]
    }
  ],
  GodotMapV2: [
    {
      type: 'survival_box',
      rotation: -0.2,
      accents: [
        { type: 'nature_flower_yellow_b', dx: -0.48, dy: 0.34, scale: 0.58 },
        { type: 'nature_grass_leafs', dx: 0.48, dy: -0.32, scale: 0.5 }
      ]
    },
    {
      type: 'platformer_chest',
      rotation: 0.24,
      accents: [
        { type: 'nature_flower_red_b', dx: 0.48, dy: 0.32, scale: 0.54 },
        { type: 'nature_stone_flat_a', dx: -0.48, dy: -0.36, scale: 0.42, rotation: -0.28 }
      ]
    },
    {
      type: 'survival_chest',
      rotation: 0.34,
      accents: [
        { type: 'nature_mushroom_red_tall', dx: -0.44, dy: 0.36, scale: 0.5 },
        { type: 'nature_flower_purple_a', dx: 0.46, dy: -0.34, scale: 0.52 }
      ]
    }
  ],
  GodotMapV2_MistLake: [
    {
      type: 'survival_box',
      rotation: 0.18,
      accents: [
        { type: 'wetland_reed_clump', dx: -0.48, dy: 0.34, scale: 0.54, rotation: -0.24 },
        { type: 'nature_lily_large', dx: 0.48, dy: -0.34, scale: 0.44, rotation: 0.3 }
      ]
    },
    {
      type: 'pirate_barrel',
      scaleMultiplier: 2.18,
      rotation: -0.28,
      accents: [
        { type: 'nature_stone_flat_c', dx: -0.48, dy: -0.34, scale: 0.46 },
        { type: 'wetland_reed_clump', dx: 0.48, dy: 0.36, scale: 0.5, rotation: 0.2 }
      ]
    },
    {
      type: 'platformer_chest',
      rotation: 0.32,
      accents: [
        { type: 'hex_water_rocks', dx: -0.5, dy: 0.34, scale: 0.42, rotation: -0.2 },
        { type: 'nature_lily_large', dx: 0.46, dy: 0.34, scale: 0.42 }
      ]
    }
  ],
  GodotMapV2_FarmTown: [
    {
      type: 'survival_box',
      rotation: -0.18,
      accents: [
        { type: 'nature_wheat_stage_b', dx: -0.5, dy: 0.32, scale: 0.56 },
        { type: 'nature_crop_carrot', dx: 0.48, dy: -0.34, scale: 0.5 }
      ]
    },
    {
      type: 'platformer_crate',
      rotation: 0.28,
      accents: [
        { type: 'town_stall_stool', dx: -0.46, dy: -0.32, scale: 0.48, rotation: -0.18 },
        { type: 'nature_crop_pumpkin', dx: 0.5, dy: 0.34, scale: 0.48 }
      ]
    },
    {
      type: 'survival_chest',
      rotation: 0.14,
      accents: [
        { type: 'nature_fence_simple', dx: -0.52, dy: 0.38, scale: 0.42, rotation: Math.PI / 2 },
        { type: 'nature_wheat_stage_a', dx: 0.46, dy: -0.34, scale: 0.5 }
      ]
    }
  ],
  GodotMapV2_PirateShore: [
    {
      type: 'pirate_chest',
      scaleMultiplier: 2.42,
      rotation: 0.22,
      accents: [
        { type: 'pirate_bottle', dx: -0.48, dy: 0.34, scale: 0.48, rotation: -0.28 },
        { type: 'pirate_patch_sand_foliage', dx: 0.48, dy: -0.34, scale: 0.46 }
      ]
    },
    {
      type: 'pirate_crate',
      scaleMultiplier: 2.32,
      rotation: -0.24,
      accents: [
        { type: 'pirate_barrel', dx: 0.5, dy: 0.34, scale: 0.46, rotation: 0.24 },
        { type: 'pirate_rocks_sand_a', dx: -0.5, dy: -0.34, scale: 0.44 }
      ]
    },
    {
      type: 'pirate_chest',
      scaleMultiplier: 2.38,
      rotation: 0.36,
      accents: [
        { type: 'pirate_flag_pennant', dx: -0.48, dy: -0.34, scale: 0.48, rotation: -0.18 },
        { type: 'pirate_bottle', dx: 0.5, dy: 0.32, scale: 0.42, rotation: 0.3 }
      ]
    }
  ],
  GodotMapV2_Graveyard: [
    {
      type: 'grave_coffin_old',
      scaleMultiplier: 2.18,
      heightMultiplier: 1.42,
      rotation: 0.26,
      accents: [
        { type: 'grave_candle_multiple', dx: -0.48, dy: 0.34, scale: 0.48, height: 0.18 },
        { type: 'grave_urn_round', dx: 0.48, dy: -0.34, scale: 0.42, height: 0.18 }
      ]
    },
    {
      type: 'grave_urn_round',
      scaleMultiplier: 2.0,
      heightMultiplier: 1.38,
      rotation: -0.18,
      accents: [
        { type: 'grave_candle', dx: -0.44, dy: -0.32, scale: 0.44, height: 0.18 },
        { type: 'grave_pumpkin_carved', dx: 0.48, dy: 0.34, scale: 0.46 }
      ]
    },
    {
      type: 'grave_coffin_old',
      scaleMultiplier: 2.1,
      heightMultiplier: 1.42,
      rotation: -0.34,
      accents: [
        { type: 'grave_lantern_glass', dx: 0.48, dy: -0.32, scale: 0.42, height: 0.18 },
        { type: 'grave_rocks', dx: -0.5, dy: 0.34, scale: 0.42 }
      ]
    }
  ],
  GodotMapV2_HexRuins: [
    {
      type: 'platformer_chest',
      rotation: 0.18,
      accents: [
        { type: 'hex_stone_rocks', dx: -0.5, dy: 0.34, scale: 0.42, rotation: -0.2 },
        { type: 'platformer_stones', dx: 0.48, dy: -0.34, scale: 0.44 }
      ]
    },
    {
      type: 'mine_crate_strong',
      scaleMultiplier: 2.18,
      rotation: -0.24,
      accents: [
        { type: 'mine_control_lever', dx: -0.46, dy: -0.34, scale: 0.42, height: 0.18 },
        { type: 'survival_metal_panel', dx: 0.5, dy: 0.34, scale: 0.4, rotation: 0.28 }
      ]
    },
    {
      type: 'platformer_crate',
      rotation: 0.34,
      accents: [
        { type: 'hex_stone_hill', dx: -0.48, dy: -0.34, scale: 0.4 },
        { type: 'platformer_rocks', dx: 0.48, dy: 0.34, scale: 0.42 }
      ]
    }
  ],
  GodotMapV2_SurvivalRidge: [
    {
      type: 'survival_chest',
      rotation: -0.18,
      accents: [
        { type: 'survival_resource_planks', dx: -0.5, dy: 0.34, scale: 0.48, rotation: -0.22 },
        { type: 'survival_tool_pickaxe', dx: 0.5, dy: -0.34, scale: 0.42, height: 0.18 }
      ]
    },
    {
      type: 'survival_box',
      rotation: 0.28,
      accents: [
        { type: 'survival_barrel', dx: 0.5, dy: 0.34, scale: 0.46, rotation: 0.18 },
        { type: 'nature_log_stack', dx: -0.5, dy: -0.34, scale: 0.42 }
      ]
    },
    {
      type: 'mine_crate_strong',
      scaleMultiplier: 2.12,
      rotation: 0.12,
      accents: [
        { type: 'survival_rock_a', dx: -0.48, dy: 0.34, scale: 0.44 },
        { type: 'survival_tool_axe', dx: 0.48, dy: -0.34, scale: 0.42, height: 0.18 }
      ]
    }
  ],
  GodotMapV2_BossHighland: [
    {
      type: 'platformer_chest',
      rotation: 0.24,
      accents: [
        { type: 'hex_stone_hill', dx: -0.5, dy: 0.34, scale: 0.42 },
        { type: 'platformer_flag', dx: 0.5, dy: -0.34, scale: 0.46, height: 0.18 }
      ]
    },
    {
      type: 'mine_crate_strong',
      scaleMultiplier: 2.16,
      rotation: -0.24,
      accents: [
        { type: 'survival_metal_panel', dx: -0.48, dy: -0.34, scale: 0.42, rotation: -0.26 },
        { type: 'hex_stone_rocks', dx: 0.48, dy: 0.34, scale: 0.42 }
      ]
    },
    {
      type: 'survival_chest',
      rotation: 0.34,
      accents: [
        { type: 'platformer_stones', dx: -0.5, dy: 0.34, scale: 0.44 },
        { type: 'nature_mushroom_red_tall', dx: 0.48, dy: -0.34, scale: 0.46 }
      ]
    }
  ]
}

const PICKUP_PLACEMENT_AFFINITY_BY_MAP = {
  GodotMapV2: {
    tileScores: { [TILE.flowers]: -6, [TILE.grass]: -1 },
    tallGrassNearBonus: 1.2,
    wallEdgeBonus: 0.6,
    encounterEdgeBonus: 1
  },
  GodotMapV2_MistLake: {
    tileScores: { [TILE.grass]: -1, [TILE.paleGrass]: -1 },
    waterEdgeBonus: 4.8,
    bridgeEdgeBonus: 2.4,
    tallGrassNearBonus: 1.1,
    encounterEdgeBonus: 0.8
  },
  GodotMapV2_FarmTown: {
    tileScores: { [TILE.grass]: -1 },
    tallGrassNearBonus: 2.2,
    wallEdgeBonus: 0.8,
    encounterEdgeBonus: 1.2
  },
  GodotMapV2_PirateShore: {
    tileScores: { [TILE.sand]: -7, [TILE.grass]: -0.5 },
    waterEdgeBonus: 3.6,
    bridgeEdgeBonus: 1.6,
    wallEdgeBonus: 0.8,
    encounterEdgeBonus: 1.1
  },
  GodotMapV2_Graveyard: {
    tileScores: { [TILE.paleGrass]: -6, [TILE.grass]: -1 },
    wallEdgeBonus: 2.4,
    tallGrassNearBonus: 1.3,
    encounterEdgeBonus: 1.2
  },
  GodotMapV2_HexRuins: {
    tileScores: { [TILE.grass]: -1, [TILE.paleGrass]: -1 },
    wallEdgeBonus: 2.6,
    waterEdgeBonus: 1,
    tallGrassNearBonus: 1,
    encounterEdgeBonus: 0.9
  },
  GodotMapV2_SurvivalRidge: {
    tileScores: { [TILE.grass]: -1 },
    wallEdgeBonus: 2.4,
    tallGrassNearBonus: 2,
    encounterEdgeBonus: 1
  },
  GodotMapV2_BossHighland: {
    tileScores: { [TILE.paleGrass]: -6, [TILE.grass]: -1 },
    wallEdgeBonus: 2.8,
    tallGrassNearBonus: 1.2,
    encounterEdgeBonus: 1.2
  }
}

const PINNED_PICKUP_ANCHORS_BY_MAP = {
  GodotMapV2_BossHighland: {
    3: [21, 28]
  }
}

function getNearbyTileCount(grid, x, y, tileSet, radius = 2) {
  let count = 0
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue
      if (Math.abs(dx) + Math.abs(dy) > radius + 1) continue
      if (tileSet.has(grid[y + dy]?.[x + dx])) count += 1
    }
  }
  return count
}

function getMapEdgeDistance(x, y) {
  return Math.min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y)
}

function getPickupPlacementAffinityScore(definition, grid, tile, candidate, index, isHiddenPickup, roadDistance, zoneDistance) {
  const profile = PICKUP_PLACEMENT_AFFINITY_BY_MAP[definition.id]
  if (!profile) return 0

  const { x, y } = candidate
  const waterNear = getNearbyTileCount(grid, x, y, new Set([TILE.water]), 3)
  const bridgeNear = getNearbyTileCount(grid, x, y, new Set([TILE.bridge]), 3)
  const wallNear = getNearbyTileCount(grid, x, y, new Set([TILE.wall, TILE.objectBlocker]), 2)
  const tallGrassNear = getNearbyTileCount(grid, x, y, new Set([TILE.tallGrass]), 2)
  const edgeDistance = getMapEdgeDistance(x, y)
  const tileScore = profile.tileScores?.[tile] ?? 0
  const hiddenTuckBonus = isHiddenPickup
    ? Math.max(0, 5 - edgeDistance) * 1.6 + Math.max(0, roadDistance - 3.4) * 0.8
    : 0
  const readableApproachPenalty = roadDistance > 7.4
    ? (roadDistance - 7.4) * 2.2
    : 0
  const encounterEdgeBonus = Number.isFinite(zoneDistance)
    ? Math.max(0, 4 - zoneDistance) * (profile.encounterEdgeBonus ?? 0)
    : 0

  return (
    tileScore -
    Math.min(waterNear, 5) * (profile.waterEdgeBonus ?? 0) -
    Math.min(bridgeNear, 4) * (profile.bridgeEdgeBonus ?? 0) -
    Math.min(wallNear, 6) * (profile.wallEdgeBonus ?? 0) -
    Math.min(tallGrassNear, 5) * (profile.tallGrassNearBonus ?? 0) -
    encounterEdgeBonus -
    hiddenTuckBonus +
    readableApproachPenalty +
    (index % 3) * 0.15
  )
}

function getPinnedPickupAnchor(definition, index) {
  const anchor = PINNED_PICKUP_ANCHORS_BY_MAP[definition.id]?.[index]
  if (!Array.isArray(anchor)) return null
  const [x, y] = anchor.map((value) => Math.trunc(Number(value)))
  return inBounds(x, y) ? { x, y } : null
}

function canUsePinnedPickupAnchor(anchor, layoutGrid, usedKeys, clearancePoints, npcPositions, pickupPositions) {
  if (!anchor || usedKeys.has(`${anchor.x},${anchor.y}`)) return false
  if (layoutGrid[anchor.y]?.[anchor.x] === TILE.water) return false
  if (!isOutsideClearancePoints(anchor, clearancePoints)) return false
  if (getNearestPointDistance(anchor, npcPositions) < PICKUP_PLACEMENT_RULE.minNpcDistance) return false
  if (getNearestPointDistance(anchor, pickupPositions) < PICKUP_PLACEMENT_RULE.minPickupDistance) return false
  return true
}

export function buildThemedPickupDecorations(definition, evt, pickupIndex) {
  const { x, y } = evt.position || {}
  if (!Number.isFinite(x) || !Number.isFinite(y)) return []

  const scenes = PICKUP_VISUAL_SCENES_BY_MAP[definition.id] || DEFAULT_PICKUP_VISUAL_SCENES
  const scene = scenes[pickupIndex % scenes.length]
  const mainScale = scene.scale ?? scaleFromNpcBaseline(scene.scaleMultiplier ?? 2.55)
  const mainHeight = scene.height ?? heightFromNpcBaseline(scene.heightMultiplier ?? 1.5)
  const hiddenNudge = typeof evt.id === 'string' && evt.id.includes('_hidden_') ? -0.04 : 0
  const mainObject = {
    type: scene.type,
    x,
    y,
    scale: Number((mainScale + hiddenNudge).toFixed(2)),
    height: mainHeight,
    rotation: scene.rotation ?? 0.2,
    sourceId: `${evt.id}_pickup_main`,
    eventId: evt.id,
    eventType: evt.type
  }

  const accentObjects = (scene.accents || []).map((accent, accentIndex) => ({
    type: accent.type,
    x: Number((x + (accent.dx ?? 0)).toFixed(2)),
    y: Number((y + (accent.dy ?? 0)).toFixed(2)),
    scale: accent.scale ?? 0.5,
    height: accent.height ?? 0.16,
    rotation: accent.rotation ?? Number((seededRandom(x + accentIndex, y, 880 + pickupIndex) * Math.PI * 2).toFixed(4)),
    sourceId: `${evt.id}_pickup_accent_${accentIndex + 1}`,
    fixedSceneEventType: evt.type
  }))

  return [mainObject, ...accentObjects]
}

function canConnectStepOnAnchorToRoad(grid, roadTiles, x, y) {
  if (!inBounds(x, y) || grid[y]?.[x] === TILE.water) return false
  if (isRoadOrBridgeTile(grid[y]?.[x])) return true
  return roadTiles.some((start) => (
    isConnectorClear(grid, buildOrthogonalConnector(start, { x, y }, false)) ||
    isConnectorClear(grid, buildOrthogonalConnector(start, { x, y }, true))
  ))
}

function getNearestEncounterZoneEdgeDistance(definition, point) {
  const zones = definition.encounterZones || []
  if (zones.length === 0) return Infinity
  return zones.reduce((best, zone) => Math.min(best, getEncounterZoneEdgeDistance(point, zone)), Infinity)
}

function resolvePickupAnchors(definition, layoutGrid, roadTiles, preferredPositions, usedKeys, clearancePoints, npcPositions) {
  const pickupPositions = []
  return preferredPositions.map((preferredPosition, index) => {
    const preferred = normalizeTargetPosition(preferredPosition)
    if (!preferred) return preferredPosition
    const isHiddenPickup = index >= 6
    const candidates = []

    const addCandidate = (x, y, {
      allowTallGrass = false,
      relaxEventDistance = false,
      relaxRoadDistance = false,
      globalPenalty = 0
    } = {}) => {
      if (!inBounds(x, y)) return
      const key = `${x},${y}`
      if (usedKeys.has(key)) return
      const tile = layoutGrid[y]?.[x]
      const allowedTiles = allowTallGrass ? PICKUP_FALLBACK_TILES : PICKUP_STANDING_TILES
      if (!allowedTiles.has(tile)) return
      if (!canConnectStepOnAnchorToRoad(layoutGrid, roadTiles, x, y)) return

      const candidate = { x, y }
      const roadDistance = distanceToRoadPaths(x, y, definition)
      if (!relaxRoadDistance && roadDistance < PICKUP_PLACEMENT_RULE.minRoadDistance) return
      if (!isOutsideClearancePoints(candidate, clearancePoints)) return
      if (getNearestPointDistance(candidate, npcPositions) < PICKUP_PLACEMENT_RULE.minNpcDistance) return
      if (getNearestPointDistance(candidate, pickupPositions) < PICKUP_PLACEMENT_RULE.minPickupDistance) return

      const occupiedPositions = [...usedKeys]
        .map(parsePositionKey)
        .filter(Boolean)
      const nearestEventDistance = getNearestPointDistance(candidate, occupiedPositions)
      if (!relaxEventDistance && nearestEventDistance < PICKUP_PLACEMENT_RULE.minEventDistance) return

      const targetDistance = Math.abs(x - preferred.x) + Math.abs(y - preferred.y) + globalPenalty
      const idealRoadDistance = isHiddenPickup
        ? PICKUP_PLACEMENT_RULE.hiddenIdealRoadDistance
        : PICKUP_PLACEMENT_RULE.idealRoadDistance
      const remoteRoadPenalty = roadDistance > PICKUP_PLACEMENT_RULE.remoteRoadDistance
        ? (roadDistance - PICKUP_PLACEMENT_RULE.remoteRoadDistance) * 24
        : 0
      const roadScore = Math.abs(roadDistance - idealRoadDistance) * (isHiddenPickup ? 6 : 8) + remoteRoadPenalty
      const zoneDistance = getNearestEncounterZoneEdgeDistance(definition, candidate)
      const zoneScore = zoneDistance <= 1
        ? -8
        : zoneDistance <= 3
          ? -5
          : zoneDistance <= 6
            ? 0
            : 10
      const spacingScore = Number.isFinite(nearestEventDistance)
        ? Math.max(0, 5 - nearestEventDistance) * 10
        : 0
      const terrainScore = tile === TILE.tallGrass
        ? (isHiddenPickup ? 4 : 10)
        : tile === TILE.flowers
          ? -1
          : tile === TILE.paleGrass
            ? 0.5
            : 0
      const affinityScore = getPickupPlacementAffinityScore(
        definition,
        layoutGrid,
        tile,
        candidate,
        index,
        isHiddenPickup,
        roadDistance,
        zoneDistance
      )
      const jitter = seededRandom(x, y, 601 + index)
      candidates.push({
        x,
        y,
        score: targetDistance * 12 + roadScore + zoneScore + spacingScore + terrainScore + affinityScore + jitter
      })
    }

    const addCandidates = ({
      allowTallGrass = false,
      relaxEventDistance = false,
      relaxRoadDistance = false
    } = {}) => {
      for (let radius = 0; radius <= PICKUP_PLACEMENT_RULE.searchRadius; radius += 1) {
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue
            addCandidate(preferred.x + dx, preferred.y + dy, { allowTallGrass, relaxEventDistance, relaxRoadDistance })
          }
        }
      }
    }

    const addGlobalCandidates = ({
      allowTallGrass = false,
      relaxEventDistance = false,
      relaxRoadDistance = false
    } = {}) => {
      for (let y = 0; y < HEIGHT; y += 1) {
        for (let x = 0; x < WIDTH; x += 1) {
          addCandidate(x, y, { allowTallGrass, relaxEventDistance, relaxRoadDistance, globalPenalty: 12 })
        }
      }
    }

    addCandidates({})
    if (candidates.length === 0) addCandidates({ allowTallGrass: true })
    if (candidates.length === 0) addCandidates({ allowTallGrass: true, relaxEventDistance: true })
    if (candidates.length === 0) addCandidates({ allowTallGrass: true, relaxEventDistance: true, relaxRoadDistance: true })
    if (candidates.length === 0) addGlobalCandidates({})
    if (candidates.length === 0) addGlobalCandidates({ allowTallGrass: true, relaxEventDistance: true, relaxRoadDistance: true })

    const pinnedAnchor = getPinnedPickupAnchor(definition, index)
    const selected = canUsePinnedPickupAnchor(pinnedAnchor, layoutGrid, usedKeys, clearancePoints, npcPositions, pickupPositions)
      ? pinnedAnchor
      : candidates
        .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x)[0] || preferred
    usedKeys.add(`${selected.x},${selected.y}`)
    pickupPositions.push({ x: selected.x, y: selected.y })
    return [selected.x, selected.y]
  })
}

function resolveGameplayProfilePositions(definition) {
  const profile = REGION_GAMEPLAY_PROFILES[definition.id]
  if (!profile) return null

  const layoutGrid = buildRoadsideLayoutGrid(definition)
  const roadTiles = collectTiles(layoutGrid, (tile) => tile === TILE.road || tile === TILE.bridge || tile === TILE.exit)
  const usedKeys = new Set()
  const npcPositions = []
  const clearancePoints = []
  ;(definition.runtimeEvents || []).forEach((event) => {
    const x = Math.trunc(Number(event.position?.x))
    const y = Math.trunc(Number(event.position?.y))
    if (!inBounds(x, y)) return
    usedKeys.add(`${x},${y}`)
    if (event.type === 'heal') clearancePoints.push({ x, y, radius: 3.6 })
    if (event.type === 'challenge') clearancePoints.push({ x, y, radius: 4.1 })
    if (event.type === 'sign') clearancePoints.push({ x, y, radius: 2.4 })
  })
  reserveProfilePositions(usedKeys, profile.positions.signs)
  reserveProfilePositions(usedKeys, profile.positions.challenge)
  addProfileClearancePoints(clearancePoints, profile.positions.signs, 2.2)
  const challengePosition = normalizeTargetPosition(profile.positions.challenge)
  if (challengePosition) clearancePoints.push({ ...challengePosition, radius: 4.1 })
  const station = getFastTravelStation(definition.id)
  if (station) {
    usedKeys.add(`${station.x},${station.y}`)
    clearancePoints.push({ x: station.x, y: station.y, radius: 4 })
  }

  const trainerPositions = profile.positions.trainers.map((position, index) => (
    resolveCharacterAnchor(definition, layoutGrid, roadTiles, position, usedKeys, clearancePoints, npcPositions, 'normal', index)
  ))
  const lieutenantPositions = profile.positions.lieutenants.map((position, index) => (
    resolveCharacterAnchor(definition, layoutGrid, roadTiles, position, usedKeys, clearancePoints, npcPositions, 'lieutenant', index)
  ))
  const bossPosition = resolveCharacterAnchor(
    definition,
    layoutGrid,
    roadTiles,
    profile.positions.boss,
    usedKeys,
    clearancePoints,
    npcPositions,
    'boss',
    0
  )
  const pickupPositions = resolvePickupAnchors(
    definition,
    layoutGrid,
    roadTiles,
    profile.positions.pickups,
    usedKeys,
    clearancePoints,
    npcPositions
  )

  return {
    ...profile,
    positions: {
      ...profile.positions,
      trainers: trainerPositions,
      lieutenants: lieutenantPositions,
      boss: bossPosition,
      pickups: pickupPositions
    }
  }
}

function chooseFastTravelRouteSignPosition(definition, fastTravelEvent, occupiedKeys) {
  const layoutGrid = buildRoadsideLayoutGrid(definition)
  const stationX = Math.trunc(Number(fastTravelEvent?.position?.x))
  const stationY = Math.trunc(Number(fastTravelEvent?.position?.y))
  if (!inBounds(stationX, stationY)) return null
  const stationKey = `${stationX},${stationY}`
  const occupiedPositions = [...occupiedKeys]
    .filter((keyValue) => keyValue !== stationKey)
    .map(parsePositionKey)
    .filter(Boolean)

  const collectCandidates = (minOccupiedDistance) => {
    const candidates = []
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const x = stationX + dx
        const y = stationY + dy
        if (!inBounds(x, y)) continue
        const key = `${x},${y}`
        if (occupiedKeys.has(key)) continue
        if (!OPEN_GROUND_TILES.has(layoutGrid[y]?.[x])) continue
        const adjacentRoad = hasAdjacentRoadTile(layoutGrid, x, y)
        const adjacentStation = Math.abs(dx) + Math.abs(dy) === 1
        if (!adjacentRoad && !adjacentStation) continue
        const facingInfo = getRoadsideSignFacingInfoFromGrid(layoutGrid, x, y)
        if (adjacentRoad && !facingInfo.facesAdjacentRoad) continue
        const nearestOccupiedDistance = getNearestPointDistance({ x, y }, occupiedPositions)
        if (nearestOccupiedDistance < minOccupiedDistance) continue
        const spacingPenalty = Number.isFinite(nearestOccupiedDistance)
          ? Math.max(0, 6 - nearestOccupiedDistance) * 7
          : 0
        const score =
          Math.abs(dx) * 8 +
          Math.abs(dy) * 8 +
          (adjacentRoad ? 0 : 6) +
          (dy < 0 ? 0 : 1) +
          (dx < 0 ? 0 : 0.5) +
          spacingPenalty
        candidates.push({ x, y, score })
      }
    }
    return candidates
  }

  let candidates = collectCandidates(4)
  if (candidates.length === 0) candidates = collectCandidates(3)
  if (candidates.length === 0) candidates = collectCandidates(2)
  if (candidates.length === 0) candidates = collectCandidates(0)

  return candidates
    .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x)[0] || null
}

function getEncounterZoneEdgeDistance(point, zone) {
  if (!zone || !Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return Infinity
  const minX = Number(zone.x)
  const maxX = Number(zone.x) + Number(zone.width) - 1
  const minY = Number(zone.y)
  const maxY = Number(zone.y) + Number(zone.height) - 1
  const dx = point.x < minX ? minX - point.x : point.x > maxX ? point.x - maxX : 0
  const dy = point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0
  return dx + dy
}

function getEncounterZoneCenterDistance(point, zone) {
  const centerX = Number(zone.x) + (Number(zone.width) - 1) / 2
  const centerY = Number(zone.y) + (Number(zone.height) - 1) / 2
  return Math.abs(point.x - centerX) + Math.abs(point.y - centerY)
}

function parsePositionKey(key) {
  if (typeof key !== 'string') return null
  const [x, y] = key.split(',').map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function normalizeTargetPosition(target) {
  if (!Array.isArray(target) || target.length < 2) return null
  const [x, y] = target.map(Number)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x, y }
}

function getPointDistance(a, b) {
  if (!a || !b) return Infinity
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function getNearestPointDistance(point, points) {
  if (!point || !Array.isArray(points) || points.length === 0) return Infinity
  return points.reduce((best, candidate) => (
    Math.min(best, Math.hypot(point.x - candidate.x, point.y - candidate.y))
  ), Infinity)
}

function isFarEnoughFromUsedPositions(point, usedPositions, minDistance = 3) {
  return usedPositions.every((usedPoint) => (
    Math.abs(point.x - usedPoint.x) + Math.abs(point.y - usedPoint.y) >= minDistance
  ))
}

function pickPreferredRoadsideSignAnchors(definition, targetPositions = [], usedKeys = new Set()) {
  const roadCandidates = collectRoadsidePoints(definition)
  const normalizedTargets = targetPositions
    .map(normalizeTargetPosition)
    .filter(Boolean)
  const usedPositions = [...usedKeys]
    .map(parsePositionKey)
    .filter(Boolean)
  const usedFacings = []

  const scoreRoadsideCandidate = (candidate, target) => (
    getPointDistance(candidate, target) * 10 +
    (candidate.facesAdjacentRoad ? 0 : 80) +
    (usedFacings.includes(candidate.facing) ? 6 : 0)
  )

  return normalizedTargets.map((target) => {
    const selectCandidate = (minDistance, maxTargetDistance = Infinity, requireAdjacentFacing = false) => roadCandidates
      .filter((candidate) => (
        (!requireAdjacentFacing || candidate.facesAdjacentRoad) &&
        isFarEnoughFromUsedPositions(candidate, usedPositions, minDistance) &&
        getPointDistance(candidate, target) <= maxTargetDistance
      ))
      .sort((left, right) => (
        scoreRoadsideCandidate(left, target) - scoreRoadsideCandidate(right, target) ||
        left.y - right.y ||
        left.x - right.x
      ))[0] || null

    const anchor =
      selectCandidate(10, 4, true) ||
      selectCandidate(8, 6, true) ||
      selectCandidate(6, 8, true) ||
      selectCandidate(5, 10, true) ||
      selectCandidate(4, 12, true) ||
      selectCandidate(4, Infinity, true) ||
      selectCandidate(10, 4) ||
      selectCandidate(8, 6) ||
      selectCandidate(6, 8) ||
      selectCandidate(5, 10) ||
      selectCandidate(4, 12) ||
      selectCandidate(4, Infinity)

    if (anchor) {
      usedPositions.push(anchor)
      usedFacings.push(anchor.facing)
    }
    return anchor
  })
}

function pickEncounterZoneSignAnchors(definition, count = 0, usedKeys = new Set()) {
  const zones = (definition.encounterZones || []).slice(0, count)
  const roadCandidates = collectRoadsidePoints(definition)
  const usedPositions = [...usedKeys]
    .map(parsePositionKey)
    .filter(Boolean)
  const usedFacings = []

  return zones.map((zone) => {
    const scoreCandidate = (candidate) => {
      const edgeDistance = getEncounterZoneEdgeDistance(candidate, zone)
      const outsideZoneDistance = edgeDistance === 0 ? 1.5 : edgeDistance
      return (
        outsideZoneDistance * 10 +
        getEncounterZoneCenterDistance(candidate, zone) +
        (candidate.facesAdjacentRoad ? 0 : 80) +
        (usedFacings.includes(candidate.facing) ? 6 : 0)
      )
    }

    const selectCandidate = (minDistance, maxEdgeDistance = Infinity, requireAdjacentFacing = false) => roadCandidates
      .filter((candidate) => (
        (!requireAdjacentFacing || candidate.facesAdjacentRoad) &&
        isFarEnoughFromUsedPositions(candidate, usedPositions, minDistance) &&
        getEncounterZoneEdgeDistance(candidate, zone) <= maxEdgeDistance
      ))
      .sort((left, right) => (
        scoreCandidate(left) - scoreCandidate(right) ||
        left.y - right.y ||
        left.x - right.x
      ))[0] || null

    const anchor =
      selectCandidate(10, 3, true) ||
      selectCandidate(8, 4, true) ||
      selectCandidate(6, 5, true) ||
      selectCandidate(5, 6, true) ||
      selectCandidate(4, 8, true) ||
      selectCandidate(4, Infinity, true) ||
      selectCandidate(10, 3) ||
      selectCandidate(8, 4) ||
      selectCandidate(6, 5) ||
      selectCandidate(5, 6) ||
      selectCandidate(4, 8) ||
      selectCandidate(4, Infinity)

    if (anchor) {
      usedPositions.push(anchor)
      usedFacings.push(anchor.facing)
    }
    return anchor
  })
}

const REGION_GAMEPLAY_PROFILES = {
  GodotMapV2: {
    chapterTitle: '星音草径试炼',
    bossName: '星音首领',
    ecologyHint: '西草丛偏草/毒系，南草坡偏普通/飞行系，东花地更容易遇到宝宝丁与喵喵；击败首领后会出现稀有电系气息。',
    bossRarePokemon: { pokemonId: 2, weight: 18 },
    challengeRarePool: [3, 112, 113, 116, 120, 121, 83, 84],
    signMessages: [
      '星音试炼：击败3名巡守，首领开启。',
      '草径生态：西草毒，南飞行，东有电光。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [1, 13, 39, 98, 114, 119, 4],
    positions: {
      lieutenants: [[8, 7], [11, 25], [31, 7]],
      trainers: [[7, 18], [26, 8], [18, 27], [33, 19]],
      boss: [34, 14],
      challenge: [16, 14],
      pickups: [[9, 11], [17, 28], [28, 9], [21, 29], [35, 19], [15, 7], [6, 24], [33, 8]],
      signs: [[16, 14], [18, 22], [31, 14]]
    }
  },
  GodotMapV2_MistLake: {
    chapterTitle: '雾湖苇岸试炼',
    bossName: '雾湖首领',
    ecologyHint: '西岸芦草偏可达鸭与鲤鱼王，南岸有大舌贝，东岸潮草偏墨海马与海星星；击败首领后会出现呆呆兽气息。',
    bossRarePokemon: { pokemonId: 128, weight: 18 },
    challengeRarePool: [33, 40, 71, 73, 75, 90, 91, 93],
    signMessages: [
      '雾湖试炼：击败3名巡守，首领开启。',
      '苇岸生态：西水系可达鸭，南大舌贝，东海星星。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [14, 16, 77, 78, 80, 13, 5],
    positions: {
      lieutenants: [[8, 7], [11, 25], [33, 25]],
      trainers: [[6, 18], [22, 5], [24, 26], [36, 18]],
      boss: [36, 14],
      challenge: [20, 23],
      pickups: [[11, 10], [15, 18], [5, 6], [8, 27], [34, 22], [38, 19], [22, 9], [26, 30]],
      signs: [[6, 14], [18, 10], [37, 18]]
    }
  },
  GodotMapV2_FarmTown: {
    chapterTitle: '风车农庄试炼',
    bossName: '风车首领',
    ecologyHint: '北田垄偏草/普通系，西麦田偏普通/格斗系，东麦田靠近低坡，岩石/格斗系更多。',
    bossRarePokemon: { pokemonId: 53, weight: 18 },
    challengeRarePool: [
      65,
      85,
      22,
      { pokemonId: 15, minLevel: 20, maxLevel: 24 },
      { pokemonId: 48, minLevel: 20, maxLevel: 24 },
      { pokemonId: 49, minLevel: 20, maxLevel: 24 },
      { pokemonId: 52, minLevel: 20, maxLevel: 24 },
      { pokemonId: 56, minLevel: 20, maxLevel: 24 }
    ],
    signMessages: [
      '农庄试炼：击败3名巡守，首领开启。',
      '田垄生态：北草普，西普斗，东岩斗。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [87, 88, 119, 106, 96, 22, 30, 102],
    positions: {
      lieutenants: [[8, 7], [12, 25], [29, 25]],
      trainers: [[16, 10], [24, 12], [13, 20], [31, 19]],
      boss: [32, 18],
      challenge: [18, 18],
      pickups: [[15, 6], [25, 6], [6, 18], [35, 20], [15, 27], [31, 27], [6, 7], [28, 14]],
      signs: [[18, 13], [25, 19], [28, 20]]
    }
  },
  GodotMapV2_PirateShore: {
    chapterTitle: '贝壳海岸试炼',
    bossName: '海岸首领',
    ecologyHint: '沙丘草丛偏水/岩化石系，南岸潮草偏水系，沉船潮草更容易遇到高等级巨钳蟹。',
    bossRarePokemon: { pokemonId: 24, weight: 18 },
    challengeRarePool: [
      { pokemonId: 8, minLevel: 23, maxLevel: 30 },
      { pokemonId: 18, minLevel: 28, maxLevel: 30 },
      { pokemonId: 28, minLevel: 30, maxLevel: 30 },
      { pokemonId: 31, minLevel: 28, maxLevel: 30 },
      { pokemonId: 32, minLevel: 28, maxLevel: 30 },
      { pokemonId: 42, minLevel: 30, maxLevel: 30 },
      { pokemonId: 55, minLevel: 30, maxLevel: 30 },
      { pokemonId: 115, minLevel: 30, maxLevel: 30 }
    ],
    signMessages: [
      '海岸试炼：击败3名巡守，首领开启。',
      '海岸生态：沙丘水岩，南岸水系，沉船巨钳蟹。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [79, 77, 80, 82, 81, 44, 54, 5],
    positions: {
      lieutenants: [[8, 7], [11, 25], [29, 27]],
      trainers: [[7, 18], [20, 10], [24, 18], [25, 22]],
      boss: [36, 27],
      challenge: [22, 14],
      pickups: [[10, 10], [7, 24], [16, 27], [23, 8], [28, 28], [36, 29], [18, 3], [26, 20]],
      signs: [[6, 14], [18, 18], [29, 24]]
    }
  },
  GodotMapV2_Graveyard: {
    chapterTitle: '月影墓园试炼',
    bossName: '月影首领',
    ecologyHint: '北墓草丛偏幽灵系，南墓荒草偏毒系，月影荒草更容易遇到耿鬼与月亮伊布。',
    bossRarePokemon: { pokemonId: 126, weight: 18 },
    challengeRarePool: [
      7,
      29,
      { pokemonId: 17, minLevel: 30, maxLevel: 36 },
      { pokemonId: 19, minLevel: 31, maxLevel: 36 },
      { pokemonId: 30, minLevel: 30, maxLevel: 36 },
      { pokemonId: 46, minLevel: 30, maxLevel: 36 },
      { pokemonId: 50, minLevel: 35, maxLevel: 36 },
      { pokemonId: 54, minLevel: 32, maxLevel: 36 },
      { pokemonId: 70, minLevel: 33, maxLevel: 36 },
      { pokemonId: 132, minLevel: 30, maxLevel: 36 },
      { pokemonId: 134, minLevel: 30, maxLevel: 36 },
      { pokemonId: 144, minLevel: 30, maxLevel: 36 }
    ],
    signMessages: [
      '墓园试炼：击败3名守卫，首领现身。',
      '墓园生态：北幽灵，南毒系，月影有稀有气息。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [21, 6, 43, 100, 101, 137, 20, 50],
    positions: {
      lieutenants: [[8, 7], [11, 26], [30, 26]],
      trainers: [[15, 10], [8, 18], [24, 20], [34, 18]],
      boss: [34, 16],
      challenge: [18, 14],
      pickups: [[14, 7], [25, 7], [12, 22], [16, 27], [25, 28], [35, 21], [7, 6], [29, 14]],
      signs: [[16, 13], [9, 22], [30, 18]]
    }
  },
  GodotMapV2_HexRuins: {
    chapterTitle: '六角遗迹试炼',
    bossName: '遗迹首领',
    ecologyHint: '北遗迹偏电/超能系，西遗迹偏岩石/地面系，东遗迹偏电系机关与多边兽。',
    bossRarePokemon: { pokemonId: 147, weight: 18 },
    challengeRarePool: [
      { pokemonId: 37, minLevel: 37, maxLevel: 42 },
      { pokemonId: 41, minLevel: 38, maxLevel: 42 },
      57,
      58,
      59,
      { pokemonId: 62, minLevel: 35, maxLevel: 42 },
      { pokemonId: 63, minLevel: 35, maxLevel: 42 },
      { pokemonId: 64, minLevel: 35, maxLevel: 42 },
      { pokemonId: 66, minLevel: 40, maxLevel: 42 },
      { pokemonId: 67, minLevel: 40, maxLevel: 42 },
      { pokemonId: 86, minLevel: 40, maxLevel: 42 },
      { pokemonId: 138, minLevel: 37, maxLevel: 42 }
    ],
    signMessages: [
      '遗迹试炼：击败3名守卫，首领开启。',
      '遗迹生态：北电超，西岩地，东电与多边兽。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [38, 45, 108, 103, 105, 135, 90, 91, 110, 111],
    positions: {
      lieutenants: [[9, 7], [10, 26], [31, 27]],
      trainers: [[16, 10], [11, 18], [24, 18], [27, 24]],
      boss: [28, 28],
      challenge: [18, 14],
      pickups: [[12, 8], [23, 8], [7, 24], [15, 29], [25, 24], [34, 29], [12, 14], [31, 22]],
      signs: [[23, 14], [23, 21], [30, 24]]
    }
  },
  GodotMapV2_SurvivalRidge: {
    chapterTitle: '铁木营地试炼',
    bossName: '铁木首领',
    ecologyHint: '北岭偏格斗/岩石系，南岭偏岩石/地面系，东岭偏钢/普通系。',
    bossRarePokemon: { pokemonId: 140, weight: 18 },
    challengeRarePool: [
      { pokemonId: 23, minLevel: 24, maxLevel: 29 },
      36,
      47,
      60,
      61,
      { pokemonId: 92, minLevel: 24, maxLevel: 29 },
      { pokemonId: 95, minLevel: 24, maxLevel: 29 },
      { pokemonId: 97, minLevel: 24, maxLevel: 27 },
      { pokemonId: 99, minLevel: 24, maxLevel: 29 },
      { pokemonId: 107, minLevel: 24, maxLevel: 25 },
      { pokemonId: 111, minLevel: 24, maxLevel: 29 },
      117,
      { pokemonId: 124, minLevel: 24, maxLevel: 29 },
      125,
      127,
      { pokemonId: 130, minLevel: 24, maxLevel: 29 },
      141,
      { pokemonId: 133, minLevel: 41, maxLevel: 47 }
    ],
    signMessages: [
      '营地试炼：击败3名巡守，首领开启。',
      '营地生态：北斗岩，南岩地，东钢普。',
      '完成区域试炼，会解锁隐藏稀有生态。'
    ],
    speciesPool: [34, 35, 51, 131, 109, 139, 142, 104, 143],
    positions: {
      lieutenants: [[8, 7], [10, 26], [32, 8]],
      trainers: [[11, 13], [18, 18], [25, 18], [31, 26]],
      boss: [34, 14],
      challenge: [15, 14],
      pickups: [[12, 10], [7, 25], [15, 28], [29, 8], [32, 11], [24, 28], [14, 6], [35, 7]],
      signs: [[23, 14], [23, 18], [31, 14]]
    }
  },
  GodotMapV2_BossHighland: {
    chapterTitle: '星雾高地试炼',
    bossName: '星雾首领',
    ecologyHint: '西高地偏草/龙/岩石系，南高地偏火/水系，东高地偏电/龙系。',
    bossRarePokemon: { pokemonId: 68, weight: 18 },
    challengeRareChance: 0.36,
    challengeRarePool: [
      9,
      10,
      { pokemonId: 12, minLevel: 55, maxLevel: 55 },
      25,
      26,
      27,
      69,
      { pokemonId: 94, minLevel: 47, maxLevel: 50 },
      { pokemonId: 104, minLevel: 50, maxLevel: 50 },
      { pokemonId: 122, minLevel: 47, maxLevel: 50 },
      { pokemonId: 136, minLevel: 47, maxLevel: 50 },
      { pokemonId: 142, minLevel: 55, maxLevel: 55 },
      { pokemonId: 145, minLevel: 47, maxLevel: 50 },
      { pokemonId: 146, minLevel: 47, maxLevel: 50 }
    ],
    signMessages: [
      '高地试炼：击败3名巡守，唤醒首领。',
      '高地生态：西草龙岩，南火水，东电龙。',
      '完成最终试炼，会解锁高地传说生态。'
    ],
    speciesPool: [72, 74, 76, 129, 131, 143, 9, 10, 142, 12],
    positions: {
      lieutenants: [[9, 7], [10, 26], [32, 26]],
      trainers: [[13, 18], [26, 10], [24, 24], [34, 27]],
      boss: [31, 9],
      challenge: [18, 18],
      pickups: [[12, 9], [26, 12], [7, 24], [21, 28], [27, 28], [34, 24], [18, 24], [33, 11]],
      signs: [[15, 14], [24, 21], [30, 12]]
    }
  }
}

const REGION_TRAINER_ROSTERS = {
  GodotMapV2: {
    trainers: [
      { name: '草径露营客', speciesIds: [1, 13] },
      { name: '南坡飞羽客', speciesIds: [39, 98] },
      { name: '花田采集员', speciesIds: [114, 119] },
      { name: '东岗电气迷', speciesIds: [4, 1] }
    ],
    lieutenants: [
      { name: '苔坡巡队长', speciesIds: [98, 39, 4] },
      { name: '花径哨卫', speciesIds: [114, 119, 13] },
      { name: '湖畔督导员', speciesIds: [1, 4, 39] }
    ]
  },
  GodotMapV2_MistLake: {
    trainers: [
      { name: '雾岸观测员', speciesIds: [14, 16] },
      { name: '潮滩潜水客', speciesIds: [77, 78] },
      { name: '湖心占星者', speciesIds: [80, 13] },
      { name: '苇湾垂钓者', speciesIds: [5, 14] }
    ],
    lieutenants: [
      { name: '芦苇巡队长', speciesIds: [77, 78, 80] },
      { name: '湖湾守望员', speciesIds: [5, 13, 14] },
      { name: '深水督导员', speciesIds: [16, 77, 5] }
    ]
  },
  GodotMapV2_FarmTown: {
    trainers: [
      { name: '田埂园丁', speciesIds: [87, 88] },
      { name: '谷仓跑腿员', speciesIds: [119, 106] },
      { name: '牧栏学徒', speciesIds: [96, 102] },
      { name: '风车巡看员', speciesIds: [22, 30] }
    ],
    lieutenants: [
      { name: '田垄巡队长', speciesIds: [96, 106, 22] },
      { name: '仓场守备员', speciesIds: [119, 88, 30] },
      { name: '坡地监督员', speciesIds: [87, 102, 96] }
    ]
  },
  GodotMapV2_PirateShore: {
    trainers: [
      { name: '沙洲赶海客', speciesIds: [79, 80] },
      { name: '礁湾潜水员', speciesIds: [77, 82] },
      { name: '贝丘化石迷', speciesIds: [81, 5] },
      { name: '沉船瞭望手', speciesIds: [44, 54] }
    ],
    lieutenants: [
      { name: '潮头巡队长', speciesIds: [80, 82, 54] },
      { name: '礁岩守备员', speciesIds: [77, 81, 44] },
      { name: '船坞督导员', speciesIds: [5, 80, 79] }
    ]
  },
  GodotMapV2_Graveyard: {
    trainers: [
      { name: '墓道夜巡者', speciesIds: [20, 100] },
      { name: '梦魇占卜师', speciesIds: [43, 137] },
      { name: '毒雾拾荒者', speciesIds: [101, 21] },
      { name: '灵灯看守人', speciesIds: [6, 137] }
    ],
    lieutenants: [
      { name: '墓园巡队长', speciesIds: [21, 43, 137] },
      { name: '黑雾守备员', speciesIds: [100, 101, 43] },
      { name: '夜巡督导员', speciesIds: [6, 137, 100] }
    ]
  },
  GodotMapV2_HexRuins: {
    trainers: [
      { name: '线圈维护员', speciesIds: [90, 45] },
      { name: '终端勘测员', speciesIds: [108, 111] },
      { name: '岩层修复师', speciesIds: [103, 105] },
      { name: '幻象记录员', speciesIds: [135, 91] }
    ],
    lieutenants: [
      { name: '电枢巡队长', speciesIds: [38, 45, 108] },
      { name: '岩壁守望员', speciesIds: [103, 105, 135] },
      { name: '中枢监理员', speciesIds: [110, 90, 135] }
    ]
  },
  GodotMapV2_SurvivalRidge: {
    trainers: [
      { name: '峡口力士', speciesIds: [34, 35] },
      { name: '岩壁猎手', speciesIds: [51, 131] },
      { name: '营地技师', speciesIds: [109, 139] },
      { name: '高坡驯兽员', speciesIds: [143, 104] }
    ],
    lieutenants: [
      { name: '山脊巡队长', speciesIds: [34, 51, 131] },
      { name: '钢壁守备员', speciesIds: [139, 143, 35] },
      { name: '峡谷监理员', speciesIds: [109, 104, 34] }
    ]
  },
  GodotMapV2_BossHighland: {
    trainers: [
      { name: '天幕园艺师', speciesIds: [72, 74] },
      { name: '峰顶潜修者', speciesIds: [76, 129] },
      { name: '岩龙勘察员', speciesIds: [131, 143] },
      { name: '云海看守人', speciesIds: [9, 10] }
    ],
    lieutenants: [
      { name: '高地巡队长', speciesIds: [74, 76, 12] },
      { name: '星雾守备员', speciesIds: [131, 143, 9] },
      { name: '天穹监理员', speciesIds: [72, 10, 129] }
    ]
  }
}

function regionEventPrefix(mapId) {
  return mapId.replace(/^GodotMapV2_?/, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'region'
}

function clampLevel(level) {
  return Math.max(1, Math.min(100, Math.trunc(Number(level)) || 1))
}

function pickSpecies(pool, start, count) {
  if (!Array.isArray(pool) || pool.length === 0) return []
  return Array.from({ length: count }, (_, index) => pool[(start + index) % pool.length])
}

function normalizeRarePoolEntries(pool) {
  if (!Array.isArray(pool)) return []
  return pool
    .map((entry, index) => {
      const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
      if (!Number.isInteger(pokemonId)) return null
      const normalized = {
        pokemonId,
        weight: Math.max(1, Math.trunc(Number(entry?.weight ?? Math.max(5, 18 - index))) || 1)
      }
      const minLevel = Math.trunc(Number(entry?.minLevel))
      const maxLevel = Math.trunc(Number(entry?.maxLevel))
      if (Number.isInteger(minLevel)) normalized.minLevel = minLevel
      if (Number.isInteger(maxLevel)) normalized.maxLevel = maxLevel
      return normalized
    })
    .filter(Boolean)
}

function formatRarePoolNames(pool, maxNames = 4) {
  const names = normalizeRarePoolEntries(pool)
    .map((entry) => MONSTERS.find((monster) => monster.id === entry.pokemonId)?.name)
    .filter(Boolean)
  if (names.length === 0) return '隐藏稀有宝可梦'
  const shown = names.slice(0, maxNames).join('、')
  return names.length > maxNames ? `${shown}等 ${names.length} 种` : shown
}

function makeTeam(speciesIds, levels, fallbackPool = speciesIds) {
  const localPoolIds = Array.from(new Set([
    ...(Array.isArray(speciesIds) ? speciesIds : []),
    ...(Array.isArray(fallbackPool) ? fallbackPool : [])
  ].map((value) => Math.trunc(Number(value))).filter(Number.isInteger)))
  const usedSpeciesIds = new Set()
  const usedFamilyKeys = new Set()

  return speciesIds.map((pokemonId, index) => ({
    level: clampLevel(levels[index] ?? levels[levels.length - 1])
  })).map((entry, index) => {
    const preferredId = speciesIds[index]
    const resolvedId = resolveSpeciesForLevelWithVariety({
      preferredIds: [preferredId, ...localPoolIds],
      level: entry.level,
      localPoolIds,
      usedSpeciesIds,
      usedFamilyKeys
    }) || resolveSpeciesForLevelWithVariety({
      preferredIds: [preferredId, ...localPoolIds],
      level: entry.level,
      localPoolIds,
      usedSpeciesIds: new Set(),
      usedFamilyKeys: new Set()
    }) || Math.trunc(Number(preferredId)) || localPoolIds[0]

    usedSpeciesIds.add(resolvedId)
    const familyKey = getEvolutionFamilyKey(resolvedId)
    if (familyKey.length > 0) usedFamilyKeys.add(familyKey)

    return {
      pokemonId: resolvedId,
      level: entry.level
    }
  })
}

function makePickupReward(regionOrder, index) {
  const isLate = regionOrder >= 6
  const isMid = regionOrder >= 3
  const ballKey = isLate ? 'pokeball_ultra' : isMid ? 'pokeball_great' : 'pokeball_basic'
  const potionKey = isLate ? 'hyper_potion' : isMid ? 'super_potion' : 'potion'
  const expKey = isLate ? 'exp_potion_large' : isMid ? 'exp_potion_medium' : 'exp_potion_small'
  const rewards = [
    { itemType: 'pokeball', itemKey: ballKey, quantity: 1 },
    { itemType: 'potion', itemKey: potionKey, quantity: 1 },
    { itemType: 'expPotion', itemKey: expKey, quantity: 1 },
    { itemType: 'pokeball', itemKey: ballKey, quantity: 2 },
    { itemType: 'potion', itemKey: potionKey, quantity: 2 },
    { itemType: 'expPotion', itemKey: expKey, quantity: 1 },
    { itemType: 'potion', itemKey: potionKey, quantity: 1, hidden: true },
    { itemType: 'pokeball', itemKey: ballKey, quantity: 1, hidden: true }
  ]
  return rewards[index % rewards.length]
}

function makeBossReward(regionOrder) {
  const isLate = regionOrder >= 6
  const isMid = regionOrder >= 3
  return [
    {
      itemType: 'pokeball',
      itemKey: isLate ? 'pokeball_ultra' : isMid ? 'pokeball_great' : 'pokeball_basic',
      quantity: isLate ? 2 : 1
    },
    {
      itemType: 'potion',
      itemKey: isLate ? 'hyper_potion' : isMid ? 'super_potion' : 'potion',
      quantity: 1
    },
    {
      itemType: 'expPotion',
      itemKey: isLate ? 'exp_potion_large' : isMid ? 'exp_potion_medium' : 'exp_potion_small',
      quantity: 1
    }
  ]
}

const MAX_CHALLENGE_CHAIN_BATTLES = 6
const CHALLENGE_RARE_UNLOCK_STAGE_COUNT = 4

function getChallengeChainLength(regionOrder) {
  const order = Math.max(1, Math.trunc(Number(regionOrder)) || 1)
  if (order >= 7) return MAX_CHALLENGE_CHAIN_BATTLES
  if (order >= 5) return 5
  if (order >= 3) return 4
  return 3
}

function makeChallengeLevels(minLevel, maxLevel, chainLength, regionOrder) {
  const length = Math.max(3, Math.min(MAX_CHALLENGE_CHAIN_BATTLES, Math.trunc(Number(chainLength)) || 3))
  const order = Math.max(1, Math.trunc(Number(regionOrder)) || 1)
  const softCapBonus = order >= 7 ? 2 : order >= 5 ? 1 : 0
  const cap = clampLevel(maxLevel + softCapBonus)
  const start = Math.max(minLevel, Math.min(cap, maxLevel - Math.max(0, length - 3)))
  return Array.from({ length }, (_, index) => (
    clampLevel(Math.round(start + (cap - start) * (index / Math.max(1, length - 1))))
  ))
}

function getChallengeRareUnlockedCountForStage(totalCount, stage) {
  const total = Math.max(0, Math.trunc(Number(totalCount)) || 0)
  if (total <= 0) return 0
  const stageCount = Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, total)
  const safeStage = Math.max(0, Math.min(stageCount, Math.trunc(Number(stage)) || 0))
  if (safeStage <= 0) return 0
  if (safeStage >= stageCount) return total
  return Math.max(1, Math.min(total, Math.round((total * safeStage) / stageCount)))
}

function getChallengeFinalThreeRareEntries(challengeRarePool) {
  const entries = normalizeRarePoolEntries(challengeRarePool)
  if (entries.length === 0) return []
  const stageCount = Math.min(CHALLENGE_RARE_UNLOCK_STAGE_COUNT, entries.length)
  const startStage = Math.max(0, stageCount - 3)
  const startIndex = getChallengeRareUnlockedCountForStage(entries.length, startStage)
  return entries.slice(startIndex)
}

function pickUniqueFamilyPoolIds(poolIds, targetCount) {
  const uniqueIds = Array.from(new Set((Array.isArray(poolIds) ? poolIds : []).filter(Number.isInteger)))
  const selected = []
  const usedFamilyKeys = new Set()

  uniqueIds.forEach((pokemonId) => {
    if (selected.length >= targetCount) return
    const familyKey = getEvolutionFamilyKey(pokemonId)
    if (familyKey && usedFamilyKeys.has(familyKey)) return
    selected.push(pokemonId)
    if (familyKey) usedFamilyKeys.add(familyKey)
  })

  if (selected.length >= targetCount) return selected

  uniqueIds.forEach((pokemonId) => {
    if (selected.length >= targetCount) return
    if (selected.includes(pokemonId)) return
    selected.push(pokemonId)
  })

  return selected
}

function pickBossTeamSpeciesFromChallengeFinalThreeBatches(challengeRarePool, bossRarePokemon, fallbackPool = []) {
  const bossRareId = Math.trunc(Number(bossRarePokemon?.pokemonId ?? bossRarePokemon?.id))
  const finalBatchIds = getChallengeFinalThreeRareEntries(challengeRarePool)
    .map((entry) => Math.trunc(Number(entry.pokemonId)))
    .filter(Number.isInteger)
    .filter((pokemonId) => pokemonId !== bossRareId)
  const fallbackIds = normalizeRarePoolEntries(fallbackPool)
    .map((entry) => entry.pokemonId)
    .filter((pokemonId) => pokemonId !== bossRareId)
  const supportPool = finalBatchIds.length > 0
    ? Array.from(new Set(finalBatchIds))
    : Array.from(new Set(fallbackIds))
  const supportCount = Number.isInteger(bossRareId) ? 5 : 6
  const supports = pickUniqueFamilyPoolIds(supportPool, supportCount)
  return Number.isInteger(bossRareId) ? [...supports, bossRareId] : supports
}

function isRareEntryAvailableAtLevel(entry, level) {
  const safeLevel = clampLevel(level)
  if (Number.isInteger(entry?.minLevel) && safeLevel < entry.minLevel) return false
  if (Number.isInteger(entry?.maxLevel) && safeLevel > entry.maxLevel) return false
  return true
}

function rotateEntries(entries, start) {
  if (!Array.isArray(entries) || entries.length === 0) return []
  const offset = Math.max(0, Math.trunc(Number(start)) || 0) % entries.length
  return [...entries.slice(offset), ...entries.slice(0, offset)]
}

function pickChallengeTrialSpecies(challengeRarePool, levels, fallbackPool = []) {
  const rareEntries = normalizeRarePoolEntries(challengeRarePool)
  const rarePoolIds = Array.from(new Set(rareEntries.map((entry) => entry.pokemonId)))
  const fallbackIds = normalizeRarePoolEntries(fallbackPool).map((entry) => entry.pokemonId)
  const fallbackPoolIds = Array.from(new Set([...rarePoolIds, ...fallbackIds]))
  const usedSpeciesIds = new Set()
  const usedFamilyKeys = new Set()
  const markChosenSpecies = (pokemonId) => {
    if (!Number.isInteger(pokemonId)) return pokemonId
    usedSpeciesIds.add(pokemonId)
    const familyKey = getEvolutionFamilyKey(pokemonId)
    if (familyKey.length > 0) usedFamilyKeys.add(familyKey)
    return pokemonId
  }

  return levels
    .map((level, index) => {
      const safeLevel = clampLevel(level)
      const orderedRareEntries = rotateEntries(rareEntries, index)
      const pickFromEntries = (entries, {
        respectEntryLevel = true,
        allowReuse = false
      } = {}) => {
        for (const entry of entries) {
          if (respectEntryLevel && !isRareEntryAvailableAtLevel(entry, safeLevel)) continue
          const resolvedId = resolveSpeciesForLevelWithVariety({
            preferredIds: [entry.pokemonId, ...rarePoolIds],
            level: safeLevel,
            localPoolIds: rarePoolIds,
            usedSpeciesIds: allowReuse ? new Set() : usedSpeciesIds,
            usedFamilyKeys: allowReuse ? new Set() : usedFamilyKeys
          })
          if (Number.isInteger(resolvedId) && isLevelValidForSpecies(resolvedId, safeLevel)) return resolvedId
        }
        return null
      }

      const uniqueRareId = pickFromEntries(orderedRareEntries)
      if (uniqueRareId) {
        return markChosenSpecies(uniqueRareId)
      }

      const uniqueLevelLegalId = pickFromEntries(orderedRareEntries, { respectEntryLevel: false })
      if (uniqueLevelLegalId) {
        return markChosenSpecies(uniqueLevelLegalId)
      }

      const duplicateRareId = pickFromEntries(orderedRareEntries, { allowReuse: true })
      if (duplicateRareId) return markChosenSpecies(duplicateRareId)

      const duplicateLevelLegalId = pickFromEntries(orderedRareEntries, { respectEntryLevel: false, allowReuse: true })
      if (duplicateLevelLegalId) return markChosenSpecies(duplicateLevelLegalId)

      const fallbackId = resolveSpeciesForLevelWithVariety({
        preferredIds: fallbackPoolIds,
        level: safeLevel,
        localPoolIds: fallbackPoolIds,
        usedSpeciesIds,
        usedFamilyKeys
      }) || fallbackPoolIds.find((pokemonId) => isLevelValidForSpecies(pokemonId, safeLevel))
      return markChosenSpecies(fallbackId || rarePoolIds[0] || fallbackPoolIds[0] || null)
    })
    .filter(Number.isInteger)
}

function makeChallengeReward(regionOrder, chainLength = getChallengeChainLength(regionOrder)) {
  const length = Math.max(3, Math.min(MAX_CHALLENGE_CHAIN_BATTLES, Math.trunc(Number(chainLength)) || 3))
  const isLate = regionOrder >= 6
  const isMid = regionOrder >= 3
  const isFinal = regionOrder >= 8
  return [
    {
      itemType: 'expPotion',
      itemKey: isLate ? 'exp_potion_large' : isMid ? 'exp_potion_medium' : 'exp_potion_small',
      quantity: length >= 6 ? 2 : 1
    },
    {
      itemType: 'pokeball',
      itemKey: isLate ? 'pokeball_ultra' : isMid ? 'pokeball_great' : 'pokeball_basic',
      quantity: Math.max(1, Math.floor(length / 2))
    },
    ...(isMid ? [{
      itemType: 'potion',
      itemKey: isLate ? 'hyper_potion' : 'super_potion',
      quantity: isFinal ? 2 : 1
    }] : [])
  ]
}

function hasLegalRareLevel(entry, definition) {
  const [mapMinLevel, mapMaxLevel] = definition.levelRange
  const rawMinLevel = Math.trunc(Number(entry?.minLevel))
  const rawMaxLevel = Math.trunc(Number(entry?.maxLevel))
  const minLevel = Number.isInteger(rawMinLevel) ? rawMinLevel : mapMinLevel
  const maxLevel = Number.isInteger(rawMaxLevel) ? rawMaxLevel : mapMaxLevel
  if (maxLevel < minLevel) return false
  for (let level = minLevel; level <= maxLevel; level += 1) {
    if (isLevelValidForSpecies(entry.pokemonId, level)) return true
  }
  return false
}

function normalizeChallengeRarePoolForRegion(pool, definition) {
  return normalizeRarePoolEntries(pool)
    .filter((entry) => hasLegalRareLevel(entry, definition))
}

function normalizeBossRareForRegion(entry, definition) {
  const [normalizedEntry] = normalizeRarePoolEntries(Array.isArray(entry) ? entry : [entry])
  if (!normalizedEntry || !hasLegalRareLevel(normalizedEntry, definition)) return null
  return normalizedEntry
}

function buildRegionGameplayEvents(definition) {
  const profile = resolveGameplayProfilePositions(definition)
  if (!profile) return []

  const prefix = regionEventPrefix(definition.id)
  const [minLevel, maxLevel] = definition.levelRange
  const midLevel = clampLevel(Math.round((minLevel + maxLevel) / 2))
  const lieutenantIds = profile.positions.lieutenants.map((_, index) => `${prefix}_lieutenant_${index + 1}`)
  const rosterConfig = REGION_TRAINER_ROSTERS[definition.id] || {}
  const events = []

  profile.positions.trainers.forEach(([x, y], index) => {
    const trainerConfig = rosterConfig.trainers?.[index] || {}
    const trainerName = trainerConfig.name || `区域训练师 ${index + 1}`
    const trainerSpecies = Array.isArray(trainerConfig.speciesIds) && trainerConfig.speciesIds.length > 0
      ? trainerConfig.speciesIds
      : pickSpecies(profile.speciesPool, index * 2, 2)
    const facing = inferEventFacing(definition, x, y, 'normal', index)
    events.push(event('trainer', `${prefix}_trainer_${index + 1}`, x, y, {
      properties: {
        role: 'normal',
        facing,
        name: trainerName,
        title: `${trainerName} · ${definition.displayName}`,
        difficultyLabel: '普通训练家 · 区域巡游',
        battleTier: 'normal',
        team: makeTeam(
          trainerSpecies,
          [minLevel + index, minLevel + index + 1],
          profile.speciesPool
        ),
        beforeBattleText: `${trainerName}作为普通训练家挡住了你的去路：想继续探索，就来一场认真对战吧！`,
        defeatedText: `${trainerName}认真记下了这次对战：继续寻找三名部下训练师吧。`,
        dailyDefeatedText: `${trainerName}：我会变得更强，明天再来吧！`
      }
    }))
  })

  profile.positions.lieutenants.forEach(([x, y], index) => {
    const lieutenantConfig = rosterConfig.lieutenants?.[index] || {}
    const lieutenantName = lieutenantConfig.name || `区域部下 ${index + 1}`
    const lieutenantSpecies = Array.isArray(lieutenantConfig.speciesIds) && lieutenantConfig.speciesIds.length > 0
      ? lieutenantConfig.speciesIds
      : pickSpecies(profile.speciesPool, index * 3 + 1, 3)
    const facing = inferEventFacing(definition, x, y, 'lieutenant', index)
    events.push(event('trainer', lieutenantIds[index], x, y, {
      properties: {
        role: 'lieutenant',
        facing,
        name: lieutenantName,
        title: `${lieutenantName} · ${profile.chapterTitle}`,
        difficultyLabel: '部下训练家 · 区域门禁',
        battleTier: 'lieutenant',
        requiredForBoss: true,
        team: makeTeam(
          lieutenantSpecies,
          [midLevel, midLevel + 1, midLevel + 2],
          profile.speciesPool
        ),
        beforeBattleText: `${lieutenantName}作为部下训练家守着试炼印记：想见${profile.bossName}，先拿到我的认可。`,
        defeatedText: `你击败了${lieutenantName}，获得了一枚试炼印记。`,
        dailyDefeatedText: `${lieutenantName}：印记已经交给你了，继续前往首领挑战吧！`
      }
    }))
  })

  const bossRarePokemon = normalizeBossRareForRegion(profile.bossRarePokemon, definition)
  const bossRareName = bossRarePokemon
    ? (MONSTERS.find((monster) => monster.id === bossRarePokemon.pokemonId)?.name || '专属稀有宝可梦')
    : ''
  const bossRareChance = Number(profile.bossRareChance ?? DEFAULT_BOSS_RARE_CHANCE)
  const bossRareChanceText = `${Math.round(Math.max(0, Math.min(1, bossRareChance)) * 100)}%`
  const challengeRarePool = normalizeChallengeRarePoolForRegion(profile.challengeRarePool, definition)
    .filter((entry) => entry.pokemonId !== bossRarePokemon?.pokemonId)
  const bossTeamSpecies = pickBossTeamSpeciesFromChallengeFinalThreeBatches(
    challengeRarePool,
    bossRarePokemon,
    profile.speciesPool
  )
  const bossTeamSourceIds = getChallengeFinalThreeRareEntries(challengeRarePool).map((entry) => entry.pokemonId)
  const bossFacing = inferEventFacing(definition, profile.positions.boss[0], profile.positions.boss[1], 'boss', 0)
  events.push(event('boss', `${prefix}_boss`, profile.positions.boss[0], profile.positions.boss[1], {
    properties: {
      role: 'boss',
      facing: bossFacing,
      name: profile.bossName,
      title: `Boss训练家 · ${profile.chapterTitle}`,
      difficultyLabel: 'Boss训练家 · 区域首领',
      battleTier: 'boss',
      teamSource: 'challengeFinalThreeBatches',
      challengeFinalThreeBatchPokemonIds: bossTeamSourceIds,
      requiredTrainerIds: lieutenantIds,
      team: makeTeam(
        bossTeamSpecies,
        [maxLevel + 1, maxLevel + 1, maxLevel + 2, maxLevel + 2, maxLevel + 3, maxLevel + 3]
      ),
      lockedText: `这里有一股强大的气息。先击败${definition.displayName}里的 3 名部下训练师，${profile.bossName}才会接受挑战。`,
      beforeBattleText: bossRarePokemon
        ? `${profile.bossName}：三枚试炼印记已经发光。来吧，见识最终三批试炼守护者与${bossRareName}的力量！`
        : `${profile.bossName}：三枚试炼印记已经发光。来吧，证明你能穿过${definition.displayName}的最终试炼。`,
      defeatedText: `${profile.bossName}收起了气势：这片区域已经认可你了。`,
      rewardItems: makeBossReward(definition.regionOrder),
      bossRarePokemon,
      bossRareChance,
      rareUnlockText: bossRarePokemon
        ? `${definition.displayName}专属稀有宝可梦解锁：${bossRareName}会以约 ${bossRareChanceText} 的概率在本地图草丛中出现。`
        : `${definition.displayName}的稀有气息被唤醒了。`
    }
  }))

  const challengeChainLength = getChallengeChainLength(definition.regionOrder)
  const challengeLevels = makeChallengeLevels(minLevel, maxLevel, challengeChainLength, definition.regionOrder)
  const challengeRareNames = formatRarePoolNames(challengeRarePool)
  const challengeRareChance = Number(profile.challengeRareChance ?? DEFAULT_CHALLENGE_RARE_CHANCE)
  const challengeRareChanceText = `${Math.round(Math.max(0, Math.min(1, challengeRareChance)) * 100)}%`
  const challengeRareUnlockText = challengeRarePool.length > 0
    ? `${definition.displayName}隐藏生态会按批次解锁：${challengeRareNames}会以约 ${challengeRareChanceText} 的稀有概率在草丛中出现。`
    : ''
  const challengeTrialSpecies = pickChallengeTrialSpecies(challengeRarePool, challengeLevels, profile.speciesPool)
  const challengeLevelText = challengeLevels.length > 0
    ? `Lv.${Math.min(...challengeLevels)}-${Math.max(...challengeLevels)}`
    : ''

  events.push(event('challenge', `${prefix}_challenge_stone`, profile.positions.challenge[0], profile.positions.challenge[1], {
    properties: {
      role: 'challenge',
      name: `${definition.displayName}区域试炼`,
      title: `区域试炼 · 3-${MAX_CHALLENGE_CHAIN_BATTLES} 连战`,
      difficultyLabel: '试炼守护者 · 隐藏生态连战',
      battleTier: 'challenge',
      teamSource: 'challengeRarePool',
      maxChainBattles: MAX_CHALLENGE_CHAIN_BATTLES,
      chainLength: challengeChainLength,
      team: makeTeam(
        challengeTrialSpecies,
        challengeLevels
      ),
      beforeBattleText: `试炼标记发出光芒：隐藏生态守护者会从 3 连战开始，逐步提升到最多 ${MAX_CHALLENGE_CHAIN_BATTLES} 连战（${challengeLevelText}）。完成后，它们才会按批次在草丛中出现。`,
      defeatedText: '试炼标记的光芒安静下来，你已经完成了这次挑战。',
      completedText: `${definition.displayName}区域试炼今天已完成，明天凌晨刷新后会以新的强度再次开放。首通奖励不会重复，隐藏生态会按批次继续解锁。`,
      challengeRarePool,
      challengeRareChance,
      challengeRareUnlockText,
      challengeRarePreviewText: challengeRarePool.length > 0
        ? `每次通关分批解锁隐藏生态：${challengeRareNames}，草丛约 ${challengeRareChanceText} 遇见`
        : '',
      dailyDefeatedText: `${definition.displayName}区域试炼今天已完成，明天凌晨刷新后会以新的强度再次开放。首通奖励不会重复，隐藏生态会按批次继续解锁。`,
      rewardItems: makeChallengeReward(definition.regionOrder, challengeChainLength)
    }
  }))

  profile.positions.pickups.forEach(([x, y], index) => {
    const reward = makePickupReward(definition.regionOrder, index)
    const usedToBeHiddenPickup = Boolean(reward.hidden)
    const id = `${prefix}_${usedToBeHiddenPickup ? 'hidden' : 'pickup'}_${index + 1}`
    events.push(event('item', id, x, y, {
      properties: {
        visible: true,
        itemType: reward.itemType,
        itemKey: reward.itemKey,
        quantity: reward.quantity,
        text: `你拾取了${definition.displayName}的补给。`
      }
    }))
  })

  const signMessages = Array.isArray(profile.signMessages) && profile.signMessages.length >= 3
    ? profile.signMessages.slice(0, 3)
    : [
        `${profile.chapterTitle}：击败3名部下，首领开启。`,
        `${definition.displayName}生态：分区草丛会遇到不同宝可梦。`,
        `${definition.displayName}补给：先整队。建议 Lv.${minLevel}+。`
      ]
  const existingEventPositionKeys = new Set(
    [...(definition.runtimeEvents || []), ...events]
      .map((evt) => evt?.position ? `${evt.position.x},${evt.position.y}` : null)
      .filter(Boolean)
  )
  const fastTravelEvent = fastTravel(
    `${prefix}_fast_travel_station`,
    definition.id,
    `${definition.displayName}快速传送台`
  )
  if (fastTravelEvent && !existingEventPositionKeys.has(`${fastTravelEvent.position.x},${fastTravelEvent.position.y}`)) {
    events.push(fastTravelEvent)
    existingEventPositionKeys.add(`${fastTravelEvent.position.x},${fastTravelEvent.position.y}`)
    const routeSign = chooseFastTravelRouteSignPosition(definition, fastTravelEvent, existingEventPositionKeys)
    if (routeSign) {
      events.push(sign(
        `${prefix}_fast_travel_route_sign`,
        routeSign.x,
        routeSign.y,
        `快速传送：${FAST_TRAVEL_COST}金币，去已解锁站点。`
      ))
      existingEventPositionKeys.add(`${routeSign.x},${routeSign.y}`)
    }
  }
  const preferredSignTargets = profile.positions.signs || []
  const signAnchors = preferredSignTargets.length >= signMessages.length
    ? pickPreferredRoadsideSignAnchors(definition, preferredSignTargets.slice(0, signMessages.length), existingEventPositionKeys)
    : pickEncounterZoneSignAnchors(definition, signMessages.length, existingEventPositionKeys)

  signMessages.forEach((message, index) => {
    const fallbackPosition = profile.positions.signs?.[index] || null
    const anchor = signAnchors[index] || (fallbackPosition
      ? { x: fallbackPosition[0], y: fallbackPosition[1] }
      : null)
    if (!anchor) return
    events.push(sign(`${prefix}_clue_sign_${index + 1}`, anchor.x, anchor.y, message))
  })

  return events
}

function buildRegionGameplayDecorations(definition, gameplayEvents) {
  const profile = REGION_GAMEPLAY_PROFILES[definition.id]
  if (!profile) return []

  const characterTypes = [
    'blocky_character_a',
    'blocky_character_b',
    'blocky_character_c',
    'blocky_character_d',
    'blocky_character_e',
    'blocky_character_f'
  ]
  const normalTrainerScale = PLAYER_MATCHED_NPC_SCALE
  const normalTrainerHeight = PLAYER_MATCHED_NPC_HEIGHT
  const lieutenantTrainerScale = scaleFromNpcBaseline(1.48)
  const lieutenantTrainerHeight = heightFromNpcBaseline(1.38)
  const bossTrainerScale = scaleFromNpcBaseline(1.68)
  const bossTrainerHeight = heightFromNpcBaseline(1.5)
  let pickupVisualIndex = 0

  return gameplayEvents
    .flatMap((evt, index) => {
      const { x, y } = evt.position || {}
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      if (evt.type === 'trainer') {
        return [{
          type: evt.properties?.role === 'lieutenant'
            ? characterTypes[(index + 2) % characterTypes.length]
            : characterTypes[index % characterTypes.length],
          x,
          y,
          scale: evt.properties?.role === 'lieutenant' ? lieutenantTrainerScale : normalTrainerScale,
          height: evt.properties?.role === 'lieutenant' ? lieutenantTrainerHeight : normalTrainerHeight,
          rotation: getCharacterRotationFromFacing(evt.properties?.facing),
          npcRole: evt.properties?.role === 'lieutenant' ? 'lieutenant' : 'normal',
          sourceId: `${evt.id}_npc`,
          eventId: evt.id,
          eventType: evt.type
        }]
      }
      if (evt.type === 'boss') {
        return [{
          type: characterTypes[(index + 4) % characterTypes.length],
          x,
          y,
          scale: bossTrainerScale,
          height: bossTrainerHeight,
          rotation: getCharacterRotationFromFacing(evt.properties?.facing),
          npcRole: 'boss',
          sourceId: `${evt.id}_npc`,
          eventId: evt.id,
          eventType: evt.type
        }]
      }
      if (evt.type === 'challenge') {
        return buildFixedTrialArenaScene(evt)
      }
      if (evt.type === 'heal') {
        return buildFixedHealingSpringScene(evt)
      }
      if (evt.type === 'item' || evt.type === 'pickup') {
        const decorations = buildThemedPickupDecorations(definition, evt, pickupVisualIndex)
        pickupVisualIndex += 1
        return decorations
      }
      return []
    })
    .filter(Boolean)
}

function buildRuntimeSignDecorations(definition, runtimeEvents) {
  const signScale = scaleFromNpcBaseline(definition.id === 'GodotMap' ? 2.61 : 2.66)

  return (runtimeEvents || [])
    .filter((evt) => evt.type === 'sign')
    .flatMap((evt) => {
      const { x, y } = evt.position || {}
      if (!Number.isFinite(x) || !Number.isFinite(y)) return []
      return [{
        type: 'trail_sign',
        x,
        y,
        scale: Number(evt.properties?.scale) || signScale,
        rotation: resolveRoadsideSignRotation(definition, x, y),
        sourceId: `${evt.id}_sign`,
        eventId: evt.id,
        eventType: evt.type
      }]
    })
}

function makeFixedSceneObject(evt, suffix, type, dx, dy, {
  scale = 1,
  rotation = 0,
  height = 0.16,
  eventType = null
} = {}) {
  const { x, y } = evt.position || {}
  const eventId = typeof evt?.id === 'string' ? evt.id : null
  const fixedSceneEventType = typeof evt?.type === 'string' ? evt.type : null
  return {
    type,
    x: Number((x + dx).toFixed(2)),
    y: Number((y + dy).toFixed(2)),
    scale,
    rotation,
    height,
    sourceId: `${evt.id}_${suffix}`,
    ...(eventId ? { eventId } : {}),
    ...(fixedSceneEventType ? { fixedSceneEventType } : {}),
    ...(eventType ? { eventId: evt.id, eventType } : {})
  }
}

function buildFixedHealingSpringScene(evt) {
  return [
    makeFixedSceneObject(evt, 'spring_fountain', 'town_fountain_round', 0, 0, {
      scale: 1.08,
      height: 0.18,
      eventType: 'heal'
    }),
    makeFixedSceneObject(evt, 'spring_lily_w', 'nature_lily_large', -0.5, -0.38, { scale: 0.55, rotation: 0.2 }),
    makeFixedSceneObject(evt, 'spring_lily_e', 'nature_lily_large', 0.5, 0.38, { scale: 0.52, rotation: -0.35 }),
    makeFixedSceneObject(evt, 'spring_stone_w', 'nature_stone_flat_b', -0.82, 0.18, { scale: 0.62, rotation: -0.25 }),
    makeFixedSceneObject(evt, 'spring_lantern_e', 'town_lantern', 0.86, -0.16, { scale: 0.6, rotation: 0.18 })
  ]
}

function buildFixedFastTravelStationScene(evt) {
  const terrain = evt?.properties?.terrain || 'meadow'
  const base = [
    makeFixedSceneObject(evt, 'signal_stone', 'nature_path_stone', 0, 0, {
      scale: 1.16,
      height: 0.13,
      rotation: 0.08,
      eventType: FAST_TRAVEL_EVENT_TYPE
    }),
    makeFixedSceneObject(evt, 'lamp_left', 'town_lantern', -0.62, -0.42, { scale: 0.7, rotation: -0.22 }),
    makeFixedSceneObject(evt, 'lamp_right', 'town_lantern', 0.62, -0.42, { scale: 0.7, rotation: 0.22 })
  ]

  const themed = {
    meadow: [
      makeFixedSceneObject(evt, 'flower_w', 'nature_flower_yellow_b', -0.72, 0.52, { scale: 0.82 }),
      makeFixedSceneObject(evt, 'flower_e', 'nature_flower_purple_a', 1.42, -0.62, { scale: 0.78 })
    ],
    lake: [
      makeFixedSceneObject(evt, 'reed_w', 'wetland_reed_clump', -0.82, 0.56, { scale: 0.68, rotation: -0.2 }),
      makeFixedSceneObject(evt, 'lily_e', 'nature_lily_large', 0.7, 0.54, { scale: 0.56, rotation: 0.24 })
    ],
    farm: [
      makeFixedSceneObject(evt, 'fence_w', 'nature_fence_simple', -0.88, 0.2, { scale: 0.62, rotation: Math.PI / 2 }),
      makeFixedSceneObject(evt, 'wheat_e', 'nature_wheat_stage_b', 0.76, 0.58, { scale: 0.72 })
    ],
    shore: [
      makeFixedSceneObject(evt, 'shore_flag', 'pirate_flag_pennant', -0.82, 0.58, { scale: 0.64, rotation: -0.2 }),
      makeFixedSceneObject(evt, 'shore_barrel', 'pirate_barrel', 0.82, 0.58, { scale: 0.58, rotation: 0.28 })
    ],
    grave: [
      makeFixedSceneObject(evt, 'grave_lantern', 'grave_lantern_glass', -0.82, 0.58, { scale: 0.58, rotation: -0.12 }),
      makeFixedSceneObject(evt, 'grave_candles', 'grave_candle_multiple', 0.72, 0.56, { scale: 0.54, rotation: 0.16 })
    ],
    ruins: [
      makeFixedSceneObject(evt, 'hex_rock_w', 'hex_stone_rocks', -0.82, 0.58, { scale: 0.58, rotation: 0.18 }),
      makeFixedSceneObject(evt, 'hex_rock_e', 'platformer_stones', 0.72, 0.56, { scale: 0.54, rotation: -0.2 })
    ],
    ridge: [
      makeFixedSceneObject(evt, 'ridge_signpost', 'survival_signpost', -0.82, 0.58, { scale: 0.62, rotation: -0.18 }),
      makeFixedSceneObject(evt, 'ridge_planks', 'survival_resource_planks', 0.78, 0.56, { scale: 0.58, rotation: 0.22 })
    ],
    peak: [
      makeFixedSceneObject(evt, 'peak_flag_w', 'platformer_flag', -0.72, 0.58, { scale: 0.68, rotation: -0.16 }),
      makeFixedSceneObject(evt, 'peak_rock_e', 'hex_stone_hill', 0.78, 0.54, { scale: 0.52, rotation: 0.2 })
    ]
  }

  return [...base, ...(themed[terrain] || themed.meadow)]
}

function getWarpApproachLayout(evt) {
  const x = Number(evt?.position?.x)
  const y = Number(evt?.position?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { dx: 0, dy: 0, px: 0, py: 1, signRotation: SIGN_FACE_DOWN }
  }
  if (x <= 2) return { dx: 0.9, dy: 0, px: 0, py: 1, signRotation: SIGN_FACE_ROTATIONS.right }
  if (x >= WIDTH - 2) return { dx: -0.9, dy: 0, px: 0, py: 1, signRotation: SIGN_FACE_ROTATIONS.left }
  if (y <= 2) return { dx: 0, dy: 0.9, px: 1, py: 0, signRotation: SIGN_FACE_ROTATIONS.down }
  if (y >= HEIGHT - 2) return { dx: 0, dy: -0.9, px: 1, py: 0, signRotation: SIGN_FACE_ROTATIONS.up }
  return { dx: 0, dy: 0, px: 0, py: 1, signRotation: SIGN_FACE_DOWN }
}

function getWarpDestinationTheme(targetMapName = '') {
  if (/PirateShore|Shore/i.test(targetMapName)) return 'shore'
  if (/MistLake|Lake/i.test(targetMapName)) return 'lake'
  if (/FarmTown|Farm/i.test(targetMapName)) return 'farm'
  if (/Graveyard|Grave/i.test(targetMapName)) return 'grave'
  if (/HexRuins|Hex|Ruins/i.test(targetMapName)) return 'ruins'
  if (/SurvivalRidge|Ridge/i.test(targetMapName)) return 'ridge'
  if (/BossHighland|Peak|Highland/i.test(targetMapName)) return 'peak'
  return 'meadow'
}

function buildFixedWarpConnectionScene(evt) {
  const layout = getWarpApproachLayout(evt)
  const theme = getWarpDestinationTheme(evt?.target?.mapName)
  const cx = layout.dx
  const cy = layout.dy
  const sx = layout.px
  const sy = layout.py
  const side = 1.14

  const themed = {
    meadow: [
      makeFixedSceneObject(evt, 'route_flower_l', 'nature_flower_yellow_b', cx + sx * side, cy + sy * side, { scale: 0.72, rotation: 0.18 }),
      makeFixedSceneObject(evt, 'route_lantern_r', 'town_lantern', cx - sx * side, cy - sy * side, { scale: 0.58, rotation: -0.18 })
    ],
    lake: [
      makeFixedSceneObject(evt, 'route_reed_l', 'wetland_reed_clump', cx + sx * side, cy + sy * side, { scale: 0.58, rotation: -0.12 }),
      makeFixedSceneObject(evt, 'route_lily_r', 'nature_lily_large', cx - sx * side, cy - sy * side, { scale: 0.54, rotation: 0.28 })
    ],
    farm: [
      makeFixedSceneObject(evt, 'route_fence_l', 'nature_fence_simple', cx + sx * side, cy + sy * side, { scale: 0.58, rotation: layout.signRotation }),
      makeFixedSceneObject(evt, 'route_wheat_r', 'nature_wheat_stage_b', cx - sx * side, cy - sy * side, { scale: 0.62, rotation: -0.16 })
    ],
    shore: [
      makeFixedSceneObject(evt, 'route_flag_l', 'pirate_flag_pennant', cx + sx * side, cy + sy * side, { scale: 0.58, rotation: layout.signRotation + 0.18 }),
      makeFixedSceneObject(evt, 'route_barrel_r', 'pirate_barrel', cx - sx * side, cy - sy * side, { scale: 0.54, rotation: 0.22 })
    ],
    grave: [
      makeFixedSceneObject(evt, 'route_lantern_l', 'grave_lantern_glass', cx + sx * side, cy + sy * side, { scale: 0.54, rotation: -0.12 }),
      makeFixedSceneObject(evt, 'route_stone_r', 'grave_gravestone_broken', cx - sx * side, cy - sy * side, { scale: 0.5, rotation: 0.18 })
    ],
    ruins: [
      makeFixedSceneObject(evt, 'route_hex_l', 'hex_stone_hill', cx + sx * side, cy + sy * side, { scale: 0.5, rotation: 0.14 }),
      makeFixedSceneObject(evt, 'route_stones_r', 'platformer_stones', cx - sx * side, cy - sy * side, { scale: 0.52, rotation: -0.2 })
    ],
    ridge: [
      makeFixedSceneObject(evt, 'route_signpost_l', 'survival_signpost', cx + sx * side, cy + sy * side, { scale: 0.56, rotation: layout.signRotation }),
      makeFixedSceneObject(evt, 'route_planks_r', 'survival_resource_planks', cx - sx * side, cy - sy * side, { scale: 0.52, rotation: 0.2 })
    ],
    peak: [
      makeFixedSceneObject(evt, 'route_flag_l', 'platformer_flag', cx + sx * side, cy + sy * side, { scale: 0.6, rotation: layout.signRotation }),
      makeFixedSceneObject(evt, 'route_rock_r', 'hex_stone_hill', cx - sx * side, cy - sy * side, { scale: 0.5, rotation: 0.2 })
    ]
  }

  return [
    makeFixedSceneObject(evt, 'route_marker', 'nature_path_stone', cx, cy, {
      scale: 1.22,
      height: 0.13,
      rotation: 0.08,
      eventType: 'warp'
    }),
    makeFixedSceneObject(evt, 'route_flag', 'platformer_flag', cx + layout.dx * 0.58 + sx * 1.54, cy + layout.dy * 0.58 + sy * 1.54, {
      scale: 0.72,
      height: 0.16,
      rotation: layout.signRotation
    }),
    ...(themed[theme] || themed.meadow)
  ]
}

function buildFixedRuntimeEventSceneDecorations(runtimeEvents) {
  return (runtimeEvents || []).flatMap((evt) => {
    if (evt.type === 'warp') return buildFixedWarpConnectionScene(evt)
    if (evt.type === 'heal') return buildFixedHealingSpringScene(evt)
    if (evt.type === FAST_TRAVEL_EVENT_TYPE) return buildFixedFastTravelStationScene(evt)
    return []
  })
}

function buildFixedTrialArenaScene(evt) {
  return [
    makeFixedSceneObject(evt, 'monument', 'platformer_flag', 0, 0, {
      scale: 1.32,
      height: 0.2,
      rotation: SIGN_FACE_DOWN,
      eventType: 'challenge'
    }),
    makeFixedSceneObject(evt, 'trial_stone_n', 'platformer_stones', 0, -0.82, { scale: 0.62, rotation: 0.1 }),
    makeFixedSceneObject(evt, 'trial_stone_s', 'platformer_stones', 0, 0.82, { scale: 0.62, rotation: Math.PI }),
    makeFixedSceneObject(evt, 'trial_rock_w', 'hex_stone_rocks', -0.86, 0, { scale: 0.58, rotation: -Math.PI / 2 }),
    makeFixedSceneObject(evt, 'trial_rock_e', 'hex_stone_rocks', 0.86, 0, { scale: 0.58, rotation: Math.PI / 2 }),
    makeFixedSceneObject(evt, 'trial_lantern_w', 'grave_lantern_glass', -0.72, -0.58, { scale: 0.56, rotation: -0.2 }),
    makeFixedSceneObject(evt, 'trial_lantern_e', 'grave_lantern_glass', 0.72, -0.58, { scale: 0.56, rotation: 0.2 })
  ]
}

function isManualFixedSceneDuplicate(object, gameplayEvents) {
  if (object?.type !== 'town_fountain_round') return false
  const x = Number(object.x)
  const y = Number(object.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return gameplayEvents.some((evt) => {
    if (evt.type !== 'heal') return false
    const dx = x - evt.position.x
    const dy = y - evt.position.y
    return Math.hypot(dx, dy) <= 0.75
  })
}

function makeVisualPath(points, radius = 0.78, edgeRadius = 0.92) {
  return { points, radius, edgeRadius, source: 'roadPaths' }
}

function deriveRoadPathEndpoints(roadPaths) {
  return (roadPaths || [])
    .flatMap((path) => {
      const points = Array.isArray(path.points) ? path.points : []
      if (points.length < 2) return []
      const first = points[0]
      const last = points[points.length - 1]
      return [
        { x: first[0], y: first[1], pathId: path.id || null, endpoint: 'start' },
        { x: last[0], y: last[1], pathId: path.id || null, endpoint: 'end' }
      ]
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function deriveVisualPathsFromGrid(grid, roadPaths) {
  const visualPaths = []

  ;(roadPaths || []).forEach((path) => {
    const points = Array.isArray(path.points) ? path.points : []
    const radius = path.radius ?? 0.78
    const edgeRadius = path.edgeRadius ?? 0.92

    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      const horizontal = ay === by
      const vertical = ax === bx
      if (!horizontal && !vertical) continue

      const start = horizontal ? Math.min(ax, bx) : Math.min(ay, by)
      const end = horizontal ? Math.max(ax, bx) : Math.max(ay, by)
      let runStart = null

      for (let cursor = start; cursor <= end; cursor += 1) {
        const x = horizontal ? cursor : ax
        const y = horizontal ? ay : cursor
        const isRoad = grid[y]?.[x] === TILE.road || grid[y]?.[x] === TILE.exit

        if (isRoad && runStart == null) runStart = cursor
        if ((!isRoad || cursor === end) && runStart != null) {
          const runEnd = isRoad && cursor === end ? cursor : cursor - 1
          if (runEnd > runStart) {
            visualPaths.push(makeVisualPath(
              horizontal
                ? [[runStart, ay], [runEnd, ay]]
                : [[ax, runStart], [ax, runEnd]],
              radius,
              edgeRadius
            ))
          }
          runStart = null
        }
      }
    }
  })

  return visualPaths
}

export function buildGodotRegionMap(rawDefinition) {
  const definition = {
    ...rawDefinition,
    roadPaths: resolveRegionRoadPaths(rawDefinition)
  }
  const grid = makeGrid()
  const gameplayEvents = buildRegionGameplayEvents(definition)
  const runtimeEvents = [...(definition.runtimeEvents || []), ...gameplayEvents]
  const handPlacedDecorations = (definition.decorativeObjects || [])
    .filter((object) => !isManualFixedSceneDuplicate(object, runtimeEvents))
  let decorations = [
    ...handPlacedDecorations,
    ...buildFixedRuntimeEventSceneDecorations(runtimeEvents),
    ...buildRuntimeSignDecorations(definition, runtimeEvents),
    ...buildRegionGameplayDecorations(definition, gameplayEvents)
  ]

  ;(definition.clearings || []).forEach((clearing) => {
    if (clearing.shape === 'rect') {
      paintRect(grid, clearing.x1, clearing.y1, clearing.x2, clearing.y2, clearing.tile ?? TILE.grass)
    } else {
      paintEllipse(grid, clearing.x, clearing.y, clearing.rx, clearing.ry, clearing.tile ?? TILE.grass)
    }
  })

  ;(definition.waterTiles || []).forEach((water) => {
    paintEllipse(grid, water.x, water.y, water.rx, water.ry, TILE.water)
  })

  ;(definition.sandTiles || []).forEach((sand) => {
    if (sand.shape === 'rect') paintRect(grid, sand.x1, sand.y1, sand.x2, sand.y2, TILE.sand)
    else paintEllipse(grid, sand.x, sand.y, sand.rx, sand.ry, TILE.sand)
  })

  // roadPaths 是分区地图唯一的道路源数据：
  // 同一份 points 同时派生 mapGrid 可走格子和 ThreeLowPolyMap 的 visualPaths。
  // 后续扩图只维护 roadPaths，避免“能走的路”和“看见的路”分叉。
  ;(definition.roadPaths || []).forEach((path) => paintOrthogonalPath(grid, path.points, path.width ?? 3))
  paintDefinedBridges(grid, definition)
  normalizeWaterRoads(grid, definition)

  ;(definition.tallGrass || []).forEach((field) => {
    if (field.shape === 'rect') paintRect(grid, field.x1, field.y1, field.x2, field.y2, TILE.tallGrass)
    else paintEllipse(grid, field.x, field.y, field.rx, field.ry, TILE.tallGrass, { onlyTiles: [TILE.grass, TILE.sand, TILE.paleGrass] })
  })

  ;(definition.roadPaths || []).forEach((path) => paintOrthogonalPath(grid, path.points, path.width ?? 3))
  paintDefinedBridges(grid, definition)
  normalizeWaterRoads(grid, definition)
  fillOpenGroundWithForestBlocks(grid, definition, runtimeEvents)
  carveEncounterZoneAccessCorridors(grid, definition)
  carveEventAccessCorridors(grid, runtimeEvents)
  paintDefinedBridges(grid, definition)
  normalizeWaterRoads(grid, definition)
  clearEvents(grid, runtimeEvents)
  softenForestEdgeCollisions(grid)

  ;(definition.scatter || []).forEach((group) => addScatter({ grid, output: decorations, ...group }))

  const bridges = deriveBridgeModelsFromGrid(grid, definition)
  paintBridgeModelFootprints(grid, bridges)
  decorations = filterPathClearanceDecorations(decorations, grid, runtimeEvents)
  decorations = filterFixedLandmarkOverlaps(decorations, runtimeEvents)
  decorations = filterBridgeSurfaceDecorations(decorations, bridges)
  decorations = filterRuntimeEventTileOverlaps(decorations, runtimeEvents)
  paintBlockingDecorationFootprints(grid, decorations, runtimeEvents)
  decorations = filterBlockedLowVegetationDecorations(decorations, grid)
  paintRuntimeEventTiles(grid, runtimeEvents)

  const signs = Object.fromEntries(
    runtimeEvents
      .filter((evt) => evt.type === 'sign' && evt.properties?.message)
      .map((evt) => [`${evt.position.x},${evt.position.y}`, evt.properties.message])
  )

  return {
    id: definition.id,
    name: definition.id,
    displayName: definition.displayName,
    width: WIDTH,
    height: HEIGHT,
    renderMode: 'three-lowpoly',
    theme: MAP_THEME,
    roadRenderStyle: 'orthogonal',
    tallGrassRate: definition.tallGrassRate ?? 0.22,
    regionOrder: definition.regionOrder,
    recommendedLevel: definition.recommendedLevel,
    levelRange: definition.levelRange,
    startPosition: definition.startPosition,
    mapGrid: grid,
    visualPaths: deriveVisualPathsFromGrid(grid, definition.roadPaths),
    roadPathEndpoints: deriveRoadPathEndpoints(definition.roadPaths),
    forestTrails: [],
    roadJunctions: definition.roadJunctions || [],
    waterBodies: definition.waterBodies || [],
    bridges,
    decorativeObjects: decorations,
    encounterZones: definition.encounterZones,
    runtimeEvents,
    signs,
    expansionSlots: definition.expansionSlots || [],
    generationNotes: {
      generatedFrom: 'src/game/data/godotMaps/godot_region_maps.js',
      roadSingleSource: true,
      design: 'Region-chain maps replace the old 100x100 GodotMapV2 runtime. Roads are orthogonal and expansion is definition-driven.'
    }
  }
}

const REGIONS = [
  {
    id: 'GodotMapV2',
    displayName: '星音草径',
    regionOrder: 1,
    recommendedLevel: 8,
    levelRange: [5, 12],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 12, x2: 9, y2: 20 },
      { shape: 'rect', x1: 9, y1: 6, x2: 15, y2: 12 },
      { shape: 'rect', x1: 29, y1: 12, x2: 38, y2: 20 },
      { shape: 'rect', x1: 16, y1: 22, x2: 25, y2: 30 }
    ],
    roadPaths: [
      { points: [[1, 16], [20, 16], [20, 24], [25, 24], [25, 16], [38, 16]], width: 3 },
      { points: [[12, 16], [12, 9]], width: 3 },
      { points: [[20, 24], [20, 30]], width: 3 }
    ],
    roadJunctions: [{ x: 20, y: 16, rx: 1.2, ry: 1.2 }, { x: 20, y: 24, rx: 1.1, ry: 1.1 }],
    tallGrass: [
      { shape: 'rect', x1: 4, y1: 4, x2: 18, y2: 10 },
      { shape: 'rect', x1: 5, y1: 22, x2: 16, y2: 28 },
      { shape: 'rect', x1: 27, y1: 5, x2: 36, y2: 10 }
    ],
    waterBodies: [{ type: 'pond', x: 12, y: 9, rx: 2.2, ry: 1.6, rotation: 0.04, salt: 11 }],
    runtimeEvents: [
      warp('warp_meadow_back_valley', 1, 16, 'GodotMap', { x: 36, y: 14, direction: 'left' }, '返回新手山谷'),
      warp('warp_meadow_to_lake', 38, 16, 'GodotMapV2_MistLake', { x: 3, y: 16, direction: 'right' }, '前往雾湖苇岸'),
      warp('warp_meadow_to_farm', 20, 30, 'GodotMapV2_FarmTown', { x: 20, y: 3, direction: 'down' }, '前往风车农庄'),
      heal('heal_meadow_spring', 12, 11, '星音泉水'),
      sign('sign_meadow_gate', 2, 14, '星音草径 Lv.5-12：东雾湖，南农庄。')
    ],
    encounterZones: [
      { id: 'meadow_west_grass', name: '星音西草丛', x: 4, y: 4, width: 15, height: 7, encounterTableId: 'region_meadow_5_12', tallGrassRate: 0.22 },
      { id: 'meadow_south_grass', name: '星音南草坡', x: 5, y: 22, width: 12, height: 7, encounterTableId: 'region_meadow_south_5_12', tallGrassRate: 0.24 },
      { id: 'meadow_east_flowers', name: '星音东花地', x: 27, y: 5, width: 10, height: 6, encounterTableId: 'region_meadow_east_5_12', tallGrassRate: 0.2 }
    ],
    decorativeObjects: [
      { type: 'nature_lily_large', x: 11.3, y: 8.7, scale: 0.8 },
      { type: 'town_lantern', x: 2.8, y: 15.1, scale: 1.05 },
      { type: 'town_lantern', x: 36.7, y: 15.1, scale: 1.05 }
    ],
    scatter: [
      { idPrefix: 'meadow_flowers', types: ['nature_flower_yellow', 'nature_flower_red', 'nature_flower_purple_a', 'platformer_flowers'], count: 54, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 120, scale: [0.72, 1.05], height: 0.16 },
      { idPrefix: 'meadow_edges', types: ['nature_bush_large', 'nature_stone_flat_a', 'nature_stone_flat_b', 'town_hedge'], count: 40, allowedTiles: [TILE.wall], salt: 131, scale: [0.78, 1.16] }
    ]
  },
  {
    id: 'GodotMapV2_MistLake',
    displayName: '雾湖苇岸',
    regionOrder: 2,
    recommendedLevel: 14,
    levelRange: [11, 18],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 13, x2: 15, y2: 19 },
      { shape: 'rect', x1: 17, y1: 5, x2: 24, y2: 11 },
      { shape: 'rect', x1: 20, y1: 23, x2: 26, y2: 30 },
      { shape: 'rect', x1: 31, y1: 13, x2: 38, y2: 19 }
    ],
    waterTiles: [{ x: 27, y: 16, rx: 8.4, ry: 6.2 }],
    roadPaths: [
      { points: [[1, 16], [38, 16]], width: 3, bridgeExtraLength: 1.2 },
      { points: [[14, 16], [14, 8], [21, 8]], width: 3 },
      { points: [[36, 16], [36, 24], [21, 24], [21, 30]], width: 3 },
      { points: [[30, 24], [28, 24], [28, 23]], width: 1 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 4, y1: 5, x2: 13, y2: 10 },
      { shape: 'rect', x1: 5, y1: 22, x2: 16, y2: 28 },
      { shape: 'rect', x1: 29, y1: 22, x2: 37, y2: 28 }
    ],
    waterBodies: [{ type: 'lake', x: 27, y: 16, rx: 8.8, ry: 6.5, rotation: -0.05, salt: 31 }],
    runtimeEvents: [
      warp('warp_lake_to_meadow', 1, 16, 'GodotMapV2', { x: 36, y: 16, direction: 'left' }, '返回星音草径'),
      warp('warp_lake_to_shore', 38, 16, 'GodotMapV2_PirateShore', { x: 20, y: 3, direction: 'down' }, '前往贝壳海岸'),
      warp('warp_lake_to_farm', 21, 30, 'GodotMapV2_FarmTown', { x: 28, y: 3, direction: 'down' }, '前往风车农庄'),
      heal('heal_lake_spring', 28, 23, '雾湖泉水'),
      sign('sign_lake_reeds', 2, 14, '雾湖苇岸 Lv.11-18：东海岸，南农庄。')
    ],
    encounterZones: [
      { id: 'lake_west_reeds', name: '西岸芦草', x: 4, y: 5, width: 10, height: 6, encounterTableId: 'region_lake_11_18', tallGrassRate: 0.22 },
      { id: 'lake_south_reeds', name: '南岸芦草', x: 5, y: 22, width: 12, height: 7, encounterTableId: 'region_lake_south_11_18', tallGrassRate: 0.24 },
      { id: 'lake_east_reeds', name: '东岸潮草', x: 29, y: 22, width: 9, height: 7, encounterTableId: 'region_lake_east_11_18', tallGrassRate: 0.23 }
    ],
    decorativeObjects: [
      { type: 'nature_canoe', x: 27.4, y: 13.1, scale: 1.15, rotation: 0.3 }
    ],
    scatter: [
      { idPrefix: 'lake_reeds', types: ['wetland_reed_clump', 'nature_lily_large', 'survival_patch_grass_large', 'nature_stone_flat_c'], count: 62, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 210, scale: [0.74, 1.18], height: 0.16 },
      { idPrefix: 'lake_bank', types: ['nature_rock_small_h', 'survival_rock_a', 'hex_water_rocks'], count: 38, allowedTiles: [TILE.wall], salt: 216, scale: [0.75, 1.1] }
    ]
  },
  {
    id: 'GodotMapV2_FarmTown',
    displayName: '风车农庄',
    regionOrder: 3,
    recommendedLevel: 20,
    levelRange: [17, 24],
    startPosition: { x: 20, y: 3, direction: 'down' },
    clearings: [
      { shape: 'rect', x1: 14, y1: 1, x2: 31, y2: 12 },
      { shape: 'rect', x1: 5, y1: 11, x2: 36, y2: 22 },
      { shape: 'rect', x1: 14, y1: 24, x2: 26, y2: 30 }
    ],
    roadPaths: [
      { points: [[20, 1], [20, 16], [38, 16]], width: 3 },
      { points: [[20, 16], [20, 30]], width: 3 },
      { points: [[5, 16], [20, 16]], width: 3 },
      { points: [[28, 1], [28, 16]], width: 3 },
      { points: [[12, 16], [12, 12]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 5, y1: 5, x2: 12, y2: 10 },
      { shape: 'rect', x1: 7, y1: 23, x2: 17, y2: 28 },
      { shape: 'rect', x1: 24, y1: 23, x2: 35, y2: 28 }
    ],
    waterTiles: [{ x: 8.9, y: 11.1, rx: 1.42, ry: 1.18, rotation: -0.08 }],
    waterBodies: [{ type: 'pond', x: 8.9, y: 11.1, rx: 1.62, ry: 1.32, rotation: -0.08, salt: 320 }],
    runtimeEvents: [
      warp('warp_farm_to_meadow', 20, 1, 'GodotMapV2', { x: 20, y: 28, direction: 'up' }, '返回星音草径'),
      warp('warp_farm_to_lake', 28, 1, 'GodotMapV2_MistLake', { x: 21, y: 28, direction: 'up' }, '前往雾湖苇岸'),
      warp('warp_farm_to_shore', 38, 16, 'GodotMapV2_PirateShore', { x: 3, y: 16, direction: 'right' }, '前往贝壳海岸'),
      warp('warp_farm_to_grave', 20, 30, 'GodotMapV2_Graveyard', { x: 20, y: 3, direction: 'down' }, '前往月影墓园'),
      heal('heal_farm_spring', 11, 11, '农庄泉水'),
      sign('sign_farm_rows', 22, 3, '风车农庄 Lv.17-24：东海岸，南墓园。')
    ],
    encounterZones: [
      { id: 'farm_north_rows', name: '北田垄', x: 5, y: 5, width: 8, height: 6, encounterTableId: 'region_farm_17_24', tallGrassRate: 0.2 },
      { id: 'farm_west_rows', name: '西麦田', x: 7, y: 23, width: 11, height: 6, encounterTableId: 'region_farm_west_17_24', tallGrassRate: 0.23 },
      { id: 'farm_east_rows', name: '东麦田', x: 24, y: 23, width: 12, height: 6, encounterTableId: 'region_farm_east_17_24', tallGrassRate: 0.23 }
    ],
    decorativeObjects: [
      { type: 'town_windmill', x: 8, y: 8, scale: 1.25 },
      { type: 'hex_building_farm', x: 31, y: 9, scale: 1.05 },
      { type: 'farm_cart_high', x: 25, y: 14, scale: 1.1 }
    ],
    scatter: [
      { idPrefix: 'farm_rows', types: ['nature_wheat_stage_a', 'nature_wheat_stage_b', 'nature_crop_carrot', 'nature_crop_pumpkin'], count: 76, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 310, scale: [0.8, 1.08], height: 0.16 },
      { idPrefix: 'farm_edges', types: ['town_fence_low', 'nature_fence_simple', 'nature_fence_planks', 'town_lantern'], count: 54, allowedTiles: [TILE.wall], salt: 318, scale: [0.8, 1.12] }
    ]
  },
  {
    id: 'GodotMapV2_PirateShore',
    displayName: '贝壳海岸',
    regionOrder: 4,
    recommendedLevel: 26,
    levelRange: [23, 30],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 12, x2: 38, y2: 20, tile: TILE.sand },
      { shape: 'rect', x1: 17, y1: 1, x2: 25, y2: 12, tile: TILE.sand },
      { shape: 'rect', x1: 28, y1: 22, x2: 37, y2: 29, tile: TILE.sand }
    ],
    waterTiles: [{ x: 32, y: 16, rx: 5.45, ry: 10.8 }],
    sandTiles: [{ x: 25, y: 16, rx: 11, ry: 8 }],
    roadPaths: [
      { points: [[1, 16], [20, 16], [20, 1]], width: 3 },
      { points: [[20, 16], [38, 16]], width: 3, bridgeExtraLength: 0.1 },
      { points: [[31, 16], [31, 28]], width: 3, bridgeExtraLength: 0.1 },
      { points: [[20, 11], [24, 11]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 4, y1: 5, x2: 13, y2: 10 },
      { shape: 'rect', x1: 6, y1: 23, x2: 17, y2: 28 },
      { shape: 'rect', x1: 24, y1: 24, x2: 36, y2: 29 }
    ],
    waterBodies: [{ type: 'lake', x: 32, y: 16, rx: 5.7, ry: 10.95, rotation: 0.04, salt: 42 }],
    runtimeEvents: [
      warp('warp_shore_to_farm', 1, 16, 'GodotMapV2_FarmTown', { x: 36, y: 16, direction: 'left' }, '返回风车农庄'),
      warp('warp_shore_to_lake', 20, 1, 'GodotMapV2_MistLake', { x: 36, y: 16, direction: 'left' }, '返回雾湖苇岸'),
      warp('warp_shore_to_hex', 38, 16, 'GodotMapV2_HexRuins', { x: 20, y: 3, direction: 'down' }, '前往六角遗迹'),
      heal('heal_shore_spring', 25, 11, '海岸泉水'),
      sign('sign_shore_cargo', 2, 14, '贝壳海岸 Lv.23-30：东遗迹，北雾湖。')
    ],
    encounterZones: [
      { id: 'shore_dune_grass', name: '沙丘草丛', x: 4, y: 5, width: 10, height: 6, encounterTableId: 'region_shore_23_30', tallGrassRate: 0.22 },
      { id: 'shore_south_grass', name: '南岸潮草', x: 6, y: 23, width: 12, height: 6, encounterTableId: 'region_shore_south_23_30', tallGrassRate: 0.24 },
      { id: 'shore_wreck_grass', name: '沉船潮草', x: 24, y: 24, width: 13, height: 6, encounterTableId: 'region_shore_wreck_23_30', tallGrassRate: 0.25 }
    ],
    decorativeObjects: [
      { type: 'pirate_ship_wreck', x: 34, y: 24, scale: 1.18, rotation: -0.2 },
      { type: 'pirate_boat_row_large', x: 30, y: 13, scale: 1.05, rotation: 0.45 }
    ],
    scatter: [
      { idPrefix: 'shore_cargo', types: ['pirate_barrel', 'pirate_crate', 'pirate_chest', 'pirate_flag', 'pirate_flag_pennant', 'pirate_bottle'], count: 76, allowedTiles: [TILE.sand, TILE.grass, TILE.tallGrass], salt: 410, scale: [0.78, 1.12] },
      { idPrefix: 'shore_edges', types: ['pirate_palm_detailed_straight', 'pirate_rocks_sand_a', 'pirate_rocks_sand_b', 'pirate_rocks_sand_c', 'pirate_patch_sand_foliage'], count: 54, allowedTiles: [TILE.wall], salt: 419, scale: [0.78, 1.2] }
    ]
  },
  {
    id: 'GodotMapV2_Graveyard',
    displayName: '月影墓园',
    regionOrder: 5,
    recommendedLevel: 32,
    levelRange: [29, 36],
    startPosition: { x: 20, y: 3, direction: 'down' },
    clearings: [
      { shape: 'rect', x1: 12, y1: 1, x2: 27, y2: 11, tile: TILE.paleGrass },
      { shape: 'rect', x1: 4, y1: 12, x2: 36, y2: 23, tile: TILE.paleGrass },
      { shape: 'rect', x1: 30, y1: 13, x2: 38, y2: 19, tile: TILE.paleGrass }
    ],
    roadPaths: [
      { points: [[20, 1], [20, 16], [38, 16]], width: 3 },
      { points: [[20, 16], [10, 16], [10, 23]], width: 3 },
      { points: [[10, 20], [15, 20]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 5, y1: 5, x2: 13, y2: 10 },
      { shape: 'rect', x1: 5, y1: 24, x2: 17, y2: 29 },
      { shape: 'rect', x1: 24, y1: 24, x2: 36, y2: 29 }
    ],
    waterTiles: [{ x: 18.1, y: 20.1, rx: 1.65, ry: 1.18, rotation: 0.06 }],
    waterBodies: [{ type: 'pond', x: 18.1, y: 20.1, rx: 1.86, ry: 1.32, rotation: 0.06, salt: 520 }],
    runtimeEvents: [
      warp('warp_grave_to_farm', 20, 1, 'GodotMapV2_FarmTown', { x: 20, y: 28, direction: 'up' }, '返回风车农庄'),
      warp('warp_grave_to_hex', 38, 16, 'GodotMapV2_HexRuins', { x: 3, y: 16, direction: 'right' }, '前往六角遗迹'),
      heal('heal_grave_spring', 16, 20, '月影泉水'),
      sign('sign_grave_warning', 22, 3, '月影墓园 Lv.29-36：东遗迹。幽灵毒系。')
    ],
    encounterZones: [
      { id: 'grave_north_thicket', name: '北墓草丛', x: 5, y: 5, width: 9, height: 6, encounterTableId: 'region_grave_29_36', tallGrassRate: 0.24 },
      { id: 'grave_south_thicket', name: '南墓荒草', x: 5, y: 24, width: 13, height: 6, encounterTableId: 'region_grave_south_29_36', tallGrassRate: 0.28 },
      { id: 'grave_moon_grass', name: '月影荒草', x: 24, y: 24, width: 13, height: 6, encounterTableId: 'region_grave_moon_29_36', tallGrassRate: 0.27 }
    ],
    decorativeObjects: [
      { type: 'grave_character_ghost', x: 28, y: 13, scale: 1.05 },
      { type: 'grave_coffin_old', x: 13, y: 19, scale: 1.0, rotation: 0.2 }
    ],
    scatter: [
      { idPrefix: 'grave_stones', types: ['grave_gravestone_round', 'grave_gravestone_broken', 'grave_gravestone_cross', 'grave_cross_wood', 'grave_pumpkin', 'grave_pumpkin_carved', 'grave_urn_round'], count: 92, allowedTiles: [TILE.paleGrass, TILE.grass, TILE.tallGrass], salt: 510, scale: [0.78, 1.12] },
      { idPrefix: 'grave_edges', types: ['grave_lantern_glass', 'grave_candle', 'grave_candle_multiple', 'grave_iron_fence_border', 'grave_stone_wall_damaged'], count: 48, allowedTiles: [TILE.wall], salt: 518, scale: [0.78, 1.1] }
    ]
  },
  {
    id: 'GodotMapV2_HexRuins',
    displayName: '六角遗迹',
    regionOrder: 6,
    recommendedLevel: 38,
    levelRange: [35, 42],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 12, x2: 38, y2: 20 },
      { shape: 'rect', x1: 16, y1: 1, x2: 24, y2: 12 },
      { shape: 'rect', x1: 10, y1: 22, x2: 29, y2: 30 }
    ],
    roadPaths: [
      { points: [[1, 16], [20, 16], [20, 1]], width: 3 },
      { points: [[20, 16], [38, 16]], width: 3 },
      { points: [[20, 16], [20, 26], [30, 26]], width: 3 },
      { points: [[28, 16], [28, 13]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 5, y1: 5, x2: 14, y2: 10 },
      { shape: 'rect', x1: 5, y1: 23, x2: 15, y2: 29 },
      { shape: 'rect', x1: 25, y1: 23, x2: 35, y2: 29 }
    ],
    waterTiles: [{ x: 30.1, y: 12.2, rx: 1.58, ry: 1.18, rotation: 0.04 }],
    waterBodies: [{ type: 'pond', x: 30.1, y: 12.2, rx: 1.78, ry: 1.32, rotation: 0.04, salt: 620 }],
    runtimeEvents: [
      warp('warp_hex_to_grave', 1, 16, 'GodotMapV2_Graveyard', { x: 36, y: 16, direction: 'left' }, '返回月影墓园'),
      warp('warp_hex_to_shore', 20, 1, 'GodotMapV2_PirateShore', { x: 36, y: 16, direction: 'left' }, '返回贝壳海岸'),
      warp('warp_hex_to_ridge', 38, 16, 'GodotMapV2_SurvivalRidge', { x: 3, y: 16, direction: 'right' }, '前往铁木营地'),
      heal('heal_hex_spring', 28, 12, '遗迹泉水'),
      sign('sign_hex_ruin', 2, 14, '六角遗迹 Lv.35-42：东营地，北海岸。')
    ],
    encounterZones: [
      { id: 'hex_north_ruins', name: '北遗迹草丛', x: 5, y: 5, width: 10, height: 6, encounterTableId: 'region_ruin_35_42', tallGrassRate: 0.24 },
      { id: 'hex_west_ruins', name: '西遗迹草丛', x: 5, y: 23, width: 11, height: 7, encounterTableId: 'region_ruin_west_35_42', tallGrassRate: 0.26 },
      { id: 'hex_east_ruins', name: '东遗迹草丛', x: 25, y: 23, width: 11, height: 7, encounterTableId: 'region_ruin_east_35_42', tallGrassRate: 0.27 }
    ],
    decorativeObjects: [
      { type: 'hex_building_market', x: 10, y: 15, scale: 1.0 },
      { type: 'hex_building_cabin', x: 28, y: 10, scale: 1.0 },
      { type: 'hex_building_mine', x: 28, y: 22, scale: 1.0 }
    ],
    scatter: [
      { idPrefix: 'hex_ruins', types: ['hex_stone_rocks', 'hex_stone_hill', 'hex_grass_forest', 'hex_unit_tree', 'platformer_stones', 'platformer_rocks'], count: 86, allowedTiles: [TILE.grass, TILE.tallGrass, TILE.wall], salt: 610, scale: [0.76, 1.12] },
      { idPrefix: 'hex_edges', types: ['survival_metal_panel', 'platformer_platform_overhang', 'town_rock_small'], count: 32, allowedTiles: [TILE.wall], salt: 618, scale: [0.82, 1.18] }
    ]
  },
  {
    id: 'GodotMapV2_SurvivalRidge',
    displayName: '铁木营地',
    regionOrder: 7,
    recommendedLevel: 44,
    levelRange: [41, 47],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 12, x2: 38, y2: 20 },
      { shape: 'rect', x1: 10, y1: 5, x2: 17, y2: 11 },
      { shape: 'rect', x1: 22, y1: 22, x2: 32, y2: 29 }
    ],
    roadPaths: [
      { points: [[1, 16], [20, 16], [38, 16]], width: 3 },
      { points: [[20, 16], [13, 16], [13, 8]], width: 3 },
      { points: [[20, 16], [26, 16], [26, 26]], width: 3 },
      { points: [[23, 16], [23, 13]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 4, y1: 5, x2: 12, y2: 10 },
      { shape: 'rect', x1: 5, y1: 23, x2: 15, y2: 29 },
      { shape: 'rect', x1: 28, y1: 5, x2: 36, y2: 11 }
    ],
    waterTiles: [{ x: 25.0, y: 12.0, rx: 1.62, ry: 1.16, rotation: -0.08 }],
    waterBodies: [{ type: 'pond', x: 25.0, y: 12.0, rx: 1.82, ry: 1.3, rotation: -0.08, salt: 720 }],
    runtimeEvents: [
      warp('warp_ridge_to_hex', 1, 16, 'GodotMapV2_HexRuins', { x: 36, y: 16, direction: 'left' }, '返回六角遗迹'),
      warp('warp_ridge_to_peak', 38, 16, 'GodotMapV2_BossHighland', { x: 3, y: 16, direction: 'right' }, '前往星雾高地'),
      heal('heal_ridge_spring', 23, 12, '铁木泉水'),
      sign('sign_ridge_camp', 2, 14, '铁木营地 Lv.41-47：东星雾高地。')
    ],
    encounterZones: [
      { id: 'ridge_north_grass', name: '北岭草丛', x: 4, y: 5, width: 9, height: 6, encounterTableId: 'region_ridge_41_47', tallGrassRate: 0.26 },
      { id: 'ridge_south_grass', name: '南岭草丛', x: 5, y: 23, width: 11, height: 7, encounterTableId: 'region_ridge_south_41_47', tallGrassRate: 0.27 },
      { id: 'ridge_east_grass', name: '东岭草丛', x: 28, y: 5, width: 9, height: 7, encounterTableId: 'region_ridge_east_41_47', tallGrassRate: 0.27 }
    ],
    decorativeObjects: [
      { type: 'survival_tent', x: 25, y: 25, scale: 1.1 },
      { type: 'survival_workbench', x: 28, y: 25, scale: 1.0 },
      { type: 'survival_campfire_pit', x: 24, y: 27, scale: 1.0 }
    ],
    scatter: [
      { idPrefix: 'ridge_camp', types: ['survival_box', 'survival_barrel', 'survival_chest', 'survival_resource_wood', 'survival_resource_planks', 'survival_tool_axe', 'survival_tool_pickaxe'], count: 76, allowedTiles: [TILE.grass, TILE.tallGrass], salt: 710, scale: [0.78, 1.12] },
      { idPrefix: 'ridge_rocks', types: ['survival_rock_a', 'survival_rock_b', 'survival_rock_c', 'nature_log_stack', 'nature_stump_round_detailed'], count: 58, allowedTiles: [TILE.wall], salt: 718, scale: [0.76, 1.18] }
    ]
  },
  {
    id: 'GodotMapV2_BossHighland',
    displayName: '星雾高地',
    regionOrder: 8,
    recommendedLevel: 50,
    levelRange: [47, 50],
    startPosition: { x: 3, y: 16, direction: 'right' },
    clearings: [
      { shape: 'rect', x1: 1, y1: 12, x2: 38, y2: 20, tile: TILE.paleGrass },
      { shape: 'rect', x1: 24, y1: 6, x2: 34, y2: 12, tile: TILE.paleGrass },
      { shape: 'rect', x1: 17, y1: 22, x2: 28, y2: 29, tile: TILE.paleGrass }
    ],
    roadPaths: [
      { points: [[1, 16], [20, 16], [31, 16], [31, 9]], width: 3 },
      { points: [[20, 16], [20, 26]], width: 3 },
      { points: [[17, 16], [17, 13]], width: 3 }
    ],
    tallGrass: [
      { shape: 'rect', x1: 4, y1: 5, x2: 15, y2: 10 },
      { shape: 'rect', x1: 5, y1: 23, x2: 16, y2: 29 },
      { shape: 'rect', x1: 28, y1: 22, x2: 37, y2: 29 },
      { shape: 'rect', x1: 37, y1: 13, x2: 38, y2: 18 }
    ],
    waterTiles: [{ x: 15.1, y: 12.1, rx: 1.62, ry: 1.16, rotation: 0.04 }],
    waterBodies: [{ type: 'pond', x: 15.1, y: 12.1, rx: 1.82, ry: 1.3, rotation: 0.04, salt: 820 }],
    runtimeEvents: [
      warp('warp_peak_to_ridge', 1, 16, 'GodotMapV2_SurvivalRidge', { x: 36, y: 16, direction: 'left' }, '返回铁木营地'),
      heal('heal_peak_spring', 17, 12, '星雾泉水'),
      sign('sign_peak_final', 2, 14, '星雾高地 Lv.47-50：北侧 Boss。')
    ],
    encounterZones: [
      { id: 'peak_west_grass', name: '西高地草丛', x: 4, y: 5, width: 12, height: 6, encounterTableId: 'region_peak_47_50', tallGrassRate: 0.27 },
      { id: 'peak_south_grass', name: '南高地草丛', x: 5, y: 23, width: 12, height: 7, encounterTableId: 'region_peak_south_47_50', tallGrassRate: 0.28 },
      { id: 'peak_east_grass', name: '东高地草丛', x: 28, y: 22, width: 10, height: 8, encounterTableId: 'region_peak_east_47_50', tallGrassRate: 0.3 }
    ],
    decorativeObjects: [
      { type: 'hex_stone_hill', x: 31, y: 9, scale: 1.25 },
      { type: 'platformer_flag', x: 29, y: 9, scale: 1.2 },
      { type: 'platformer_flag', x: 33, y: 9, scale: 1.2 }
    ],
    scatter: [
      { idPrefix: 'peak_stones', types: ['hex_stone_rocks', 'hex_stone_hill', 'platformer_rocks', 'platformer_stones', 'ridge_block_grass_edge'], count: 88, allowedTiles: [TILE.paleGrass, TILE.grass, TILE.tallGrass, TILE.wall], salt: 810, scale: [0.78, 1.16] },
      { idPrefix: 'peak_supplies', types: ['mine_crate_strong', 'survival_metal_panel', 'survival_workbench', 'platformer_chest', 'pirate_cannon'], count: 36, allowedTiles: [TILE.wall], salt: 818, scale: [0.78, 1.12] }
    ],
    expansionSlots: [
      { direction: 'east', recommendedLevel: 55, note: 'Reserved for post-50 expansion.' }
    ]
  }
]

export const GODOT_REGION_MAPS = Object.fromEntries(
  REGIONS.map((definition) => [definition.id, buildGodotRegionMap(definition)])
)

export const GODOT_REGION_MAP_IDS = REGIONS.map((definition) => definition.id)

export const GODOT_REGION_MAP_CONFIGS = Object.fromEntries(
  REGIONS.map((definition) => [
    definition.id,
    {
      displayName: definition.displayName,
      description: `分区地图链第 ${definition.regionOrder} 区，推荐 Lv.${definition.recommendedLevel}，野生宝可梦约 Lv.${definition.levelRange[0]}-${definition.levelRange[1]}。`,
      difficulty: definition.regionOrder + 1,
      recommendedLevel: definition.recommendedLevel,
      minLevel: definition.levelRange[0],
      maxLevel: definition.levelRange[1],
      encounterRate: definition.tallGrassRate ?? 0.22,
      tallGrassRate: definition.tallGrassRate ?? 0.22,
      regionOrder: definition.regionOrder,
      renderMode: 'three-lowpoly'
    }
  ])
)

export default GODOT_REGION_MAPS
