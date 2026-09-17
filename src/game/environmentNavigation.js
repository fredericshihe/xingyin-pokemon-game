import { BLOCKED_LEGACY_TILES } from './world/constants.js'

export const environmentTileKey = (x, y) => `${x},${y}`

// The terrain remains authoritative. Scenery adds a small, separate collision
// mask only on unused ground; it never rewrites a road or encounter tile.
export function getEnvironmentBlockedCells(map, bounds) {
  const cells = []
  for (let y = Math.ceil(bounds.y1 - .25); y <= Math.floor(bounds.y2 + .25); y++) {
    for (let x = Math.ceil(bounds.x1 - .25); x <= Math.floor(bounds.x2 + .25); x++) {
      if ([0, 13, 17].includes(map.mapGrid[y]?.[x])) cells.push(environmentTileKey(x, y))
    }
  }
  return cells
}

export function isEnvironmentTileBlocked(map, x, y) {
  return map?.environmentBlockedTiles?.has(environmentTileKey(x, y)) === true
}

export function findEnvironmentSpawn(map, position, grid = map.mapGrid) {
  if (!isEnvironmentTileBlocked(map, position.x, position.y)) return position
  // Old saves can point to a newly furnished tile. Recover locally; never move
  // a valid save, and don't count recovery as a step or trigger an encounter.
  const queue = [{ x: position.x, y: position.y }], seen = new Set()
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i], key = environmentTileKey(p.x, p.y)
    if (seen.has(key)) continue
    seen.add(key)
    const tile = grid[p.y]?.[p.x]
    if (tile == null || BLOCKED_LEGACY_TILES.has(tile)) continue
    if (!isEnvironmentTileBlocked(map, p.x, p.y)) return { ...position, ...p }
    for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) queue.push({ x: p.x + dx, y: p.y + dy })
  }
  return { ...position, ...map.startPosition }
}

export function createEnvironmentConnectivityGuard(map) {
  // Track each pre-existing component separately, including locked side areas.
  // Every remaining walkable tile must stay in its original connected area.
  const components = [], visited = new Set()
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const key = environmentTileKey(x, y)
    if (visited.has(key) || BLOCKED_LEGACY_TILES.has(map.mapGrid[y][x])) continue
    const component = [], queue = [{ x, y }]
    visited.add(key)
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i]
      component.push(environmentTileKey(p.x, p.y))
      for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        const nx = p.x + dx, ny = p.y + dy, next = environmentTileKey(nx, ny)
        const tile = map.mapGrid[ny]?.[nx]
        if (tile == null || BLOCKED_LEGACY_TILES.has(tile) || visited.has(next)) continue
        visited.add(next); queue.push({ x: nx, y: ny })
      }
    }
    components.push(component)
  }
  return blocked => components.every(component => {
    const available = new Set(component.filter(key => !blocked.has(key)))
    if (!available.size) return false
    const queue = [available.values().next().value]
    available.delete(queue[0])
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(',').map(Number)
      for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        const key = environmentTileKey(x + dx, y + dy)
        if (available.delete(key)) queue.push(key)
      }
    }
    return available.size === 0
  })
}
