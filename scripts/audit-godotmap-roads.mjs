import fs from 'node:fs'
import { withViteAuditServer } from './load-vite-module.mjs'

const mapSource = fs.readFileSync(new URL('../src/game/data/godotMaps/my_first_map.js', import.meta.url), 'utf8')
const BLOCKED_LEGACY_TILES = new Set([1, 11, 14, 18, 20])
const ROAD_RELATED_TILES = new Set([2, 6, 12, 15])
const VISUAL_ROAD_TOLERANCE = 0.03

const failures = []
let newbieValleyMap = null
let ROAD_PATHS = []
let hasAdventureMapGridVisualRoadMismatch = null
let derivedVisualPaths = []

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

function isInsideEllipse(tileX, tileY, ellipse, padding = 0) {
  const rx = Number(ellipse?.rx) + padding
  const ry = Number(ellipse?.ry) + padding
  if (rx <= 0 || ry <= 0) return false

  const dx = (tileX - ellipse.x) / rx
  const dy = (tileY - ellipse.y) / ry
  return dx * dx + dy * dy <= 1
}

function isInsideBridgeFootprint(tileX, tileY, bridge, padding = 0) {
  const rotation = Number(bridge?.rotation) || 0
  const dx = tileX - bridge.x
  const dy = tileY - bridge.y
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos

  return (
    Math.abs(localX) <= (Number(bridge.length) || 3) / 2 + padding &&
    Math.abs(localY) <= (Number(bridge.width) || 1.2) / 2 + padding
  )
}

function findBlockedVisibleFootprints() {
  const blocked = []
  const grid = newbieValleyMap.mapGrid

  for (let y = 0; y < newbieValleyMap.height; y += 1) {
    for (let x = 0; x < newbieValleyMap.width; x += 1) {
      const tile = grid[y]?.[x]
      if (!BLOCKED_LEGACY_TILES.has(tile)) continue

      for (const [index, path] of (newbieValleyMap.visualPaths || []).entries()) {
        if (isInsidePathFootprint(x, y, path, VISUAL_ROAD_TOLERANCE)) {
          blocked.push({ x, y, tile, source: `visualPaths[${index}]` })
        }
      }
      for (const [index, trail] of (newbieValleyMap.forestTrails || []).entries()) {
        if (isInsidePathFootprint(x, y, { points: trail.points, radius: trail.radius }, VISUAL_ROAD_TOLERANCE)) {
          blocked.push({ x, y, tile, source: `forestTrails[${index}]` })
        }
      }
      for (const [index, junction] of (newbieValleyMap.roadJunctions || []).entries()) {
        if (isInsideEllipse(x, y, junction, VISUAL_ROAD_TOLERANCE)) {
          blocked.push({ x, y, tile, source: `roadJunctions[${index}]` })
        }
      }
      for (const [index, bridge] of (newbieValleyMap.bridges || []).entries()) {
        if (isInsideBridgeFootprint(x, y, bridge, VISUAL_ROAD_TOLERANCE)) {
          blocked.push({ x, y, tile, source: `bridges[${index}]` })
        }
      }
    }
  }

  return [...new Map(blocked.map((entry) => [`${entry.x},${entry.y},${entry.source}`, entry])).values()]
}

function findUnreachableRoadTiles() {
  const grid = newbieValleyMap.mapGrid
  const start = newbieValleyMap.startPosition
  const queue = [[start.x, start.y]]
  const seen = new Set([`${start.x},${start.y}`])

  for (let index = 0; index < queue.length; index += 1) {
    const [x, y] = queue[index]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= newbieValleyMap.width || ny >= newbieValleyMap.height) continue
      if (seen.has(`${nx},${ny}`)) continue
      if (BLOCKED_LEGACY_TILES.has(grid[ny]?.[nx])) continue
      seen.add(`${nx},${ny}`)
      queue.push([nx, ny])
    }
  }

  const unreachable = []
  for (let y = 0; y < newbieValleyMap.height; y += 1) {
    for (let x = 0; x < newbieValleyMap.width; x += 1) {
      if (!ROAD_RELATED_TILES.has(grid[y]?.[x])) continue
      if (!seen.has(`${x},${y}`)) unreachable.push({ x, y, tile: grid[y][x] })
    }
  }

  return unreachable
}

function findInvalidSignDecorations() {
  const invalid = []
  const signKeys = new Set(Object.keys(newbieValleyMap.signs || {}))
  const runtimeSignKeys = new Set(
    (newbieValleyMap.runtimeEvents || [])
      .filter((event) => event.type === 'sign' || event.type === 'info')
      .map((event) => `${Math.trunc(Number(event.position?.x))},${Math.trunc(Number(event.position?.y))}`)
  )

  ;(newbieValleyMap.decorativeObjects || [])
    .filter((object) => object.type === 'sign' || object.type === 'trail_sign')
    .forEach((object) => {
      const x = Math.round(Number(object.x))
      const y = Math.round(Number(object.y))
      const coordinate = `${x},${y}`
      const tile = newbieValleyMap.mapGrid[y]?.[x]
      if (tile !== 6 || !signKeys.has(coordinate) || !runtimeSignKeys.has(coordinate)) {
        invalid.push({
          type: object.type,
          sourceId: object.sourceId,
          x,
          y,
          tile,
          hasText: signKeys.has(coordinate),
          hasRuntimeEvent: runtimeSignKeys.has(coordinate)
        })
      }
    })

  Object.entries(newbieValleyMap.signs || {}).forEach(([coordinate, message]) => {
    const [x, y] = coordinate.split(',').map(Number)
    const tile = newbieValleyMap.mapGrid[y]?.[x]
    const hasDecoration = (newbieValleyMap.decorativeObjects || []).some((object) =>
      (object.type === 'sign' || object.type === 'trail_sign') &&
      Math.round(Number(object.x)) === x &&
      Math.round(Number(object.y)) === y
    )
    if (tile !== 6 || !message || !hasDecoration || !runtimeSignKeys.has(coordinate)) {
      invalid.push({
        type: 'static_sign_text',
        x,
        y,
        tile,
        hasText: Boolean(message),
        hasDecoration,
        hasRuntimeEvent: runtimeSignKeys.has(coordinate)
      })
    }
  })

  return invalid
}

function deriveClippedVisualPathsFromGrid() {
  const paths = []
  const grid = newbieValleyMap.mapGrid

  ROAD_PATHS.forEach((path) => {
    const points = Array.isArray(path.points) ? path.points : []
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
        const isRoad = grid[y]?.[x] === 12 || grid[y]?.[x] === 2

        if (isRoad && runStart == null) runStart = cursor
        if ((!isRoad || cursor === end) && runStart != null) {
          const runEnd = isRoad && cursor === end ? cursor : cursor - 1
          if (runEnd > runStart) {
            paths.push({
              points: horizontal
                ? [[runStart, ay], [runEnd, ay]]
                : [[ax, runStart], [ax, runEnd]],
              radius: path.visualRadius,
              edgeRadius: path.edgeRadius,
              source: 'roadPaths'
            })
          }
          runStart = null
        }
      }
    }
  })

  return paths
}

await withViteAuditServer(async ({ loadModule }) => {
  const mapModule = await loadModule('/src/game/data/godotMaps/my_first_map.js')
  const overworldModule = await loadModule('/src/game/data/overworldMaps.js')
  newbieValleyMap = mapModule.default
  ROAD_PATHS = mapModule.ROAD_PATHS || []
  hasAdventureMapGridVisualRoadMismatch = overworldModule.hasAdventureMapGridVisualRoadMismatch
  derivedVisualPaths = deriveClippedVisualPathsFromGrid()

  if (JSON.stringify(newbieValleyMap.visualPaths) !== JSON.stringify(derivedVisualPaths)) {
    failures.push('GodotMap visualPaths must be derived from ROAD_PATHS and clipped by the final mapGrid.')
  }

  if (/const\s+visualPaths\s*=\s*\[/.test(mapSource)) {
    failures.push('GodotMap must not define a handwritten visualPaths array.')
  }

  const pathIds = new Set()
  for (const path of ROAD_PATHS) {
    if (!path.id) failures.push('Every ROAD_PATHS entry needs a stable id.')
    if (pathIds.has(path.id)) failures.push(`Duplicate ROAD_PATHS id: ${path.id}`)
    pathIds.add(path.id)

    if (!Array.isArray(path.points) || path.points.length < 2) {
      failures.push(`ROAD_PATHS ${path.id} needs at least two points.`)
    }
    if (typeof path.paintRadius !== 'number') {
      failures.push(`ROAD_PATHS ${path.id} needs numeric paintRadius.`)
    }
    if (typeof path.visualRadius !== 'number') {
      failures.push(`ROAD_PATHS ${path.id} needs numeric visualRadius.`)
    }
    if (typeof path.edgeRadius !== 'number') {
      failures.push(`ROAD_PATHS ${path.id} needs numeric edgeRadius.`)
    }
  }

  const blockedVisibleFootprints = findBlockedVisibleFootprints()
  if (blockedVisibleFootprints.length > 0) {
    failures.push(
      `Visible road/trail/bridge footprint contains blocked tiles: ${JSON.stringify(blockedVisibleFootprints.slice(0, 12))}`
    )
  }

  const unreachableRoadTiles = findUnreachableRoadTiles()
  if (unreachableRoadTiles.length > 0) {
    failures.push(
      `Road/sign/exit/bridge tiles must be reachable from the player start: ${JSON.stringify(unreachableRoadTiles.slice(0, 12))}`
    )
  }

  const invalidSignDecorations = findInvalidSignDecorations()
  if (invalidSignDecorations.length > 0) {
    failures.push(
      `Every visible sign must have a blocking sign tile and sign text: ${JSON.stringify(invalidSignDecorations.slice(0, 12))}`
    )
  }

  if (hasAdventureMapGridVisualRoadMismatch('GodotMap', newbieValleyMap.mapGrid)) {
    failures.push('GodotMap mapGrid is out of sync with its visible road footprint.')
  }

  if (failures.length > 0) {
    console.error('[audit-godotmap-roads] FAILED')
    failures.forEach((failure) => console.error(`- ${failure}`))
    process.exit(1)
  }

  console.log(`[audit-godotmap-roads] OK: ${ROAD_PATHS.length} paths are single-sourced, visible roads are walkable, and road tiles are reachable.`)
})
