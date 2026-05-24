import { BLOCKED_LEGACY_TILES, LEGACY_TILE_TO_INDEX } from './constants'

/**
 * 将现有 React mapGrid（数字矩阵）转为 Phaser 可用的层数据
 */
export function legacyGridToTileIndices(mapGrid) {
  if (!mapGrid?.length) return { width: 0, height: 0, ground: [], collision: [], grass: [] }

  const height = mapGrid.length
  const width = mapGrid[0].length
  const ground = []
  const collision = []
  const grass = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const legacy = mapGrid[y][x]
      const index = LEGACY_TILE_TO_INDEX[legacy] ?? 0
      ground.push(index)
      collision.push(BLOCKED_LEGACY_TILES.has(legacy) ? index : -1)
      grass.push(legacy === 8 ? 7 + ((x + y) % 2 === 0 ? 0 : 3) : -1)
    }
  }

  return { width, height, ground, collision, grass }
}

export function findLegacySpawn(mapGrid, preferred = { x: 1, y: 1 }) {
  if (!mapGrid?.length) return { x: 1, y: 1 }

  const px = preferred.x
  const py = preferred.y
  if (isWalkable(mapGrid, px, py)) return { x: px, y: py }

  for (let y = 0; y < mapGrid.length; y++) {
    for (let x = 0; x < mapGrid[0].length; x++) {
      if (isWalkable(mapGrid, x, y)) return { x, y }
    }
  }
  return { x: 1, y: 1 }
}

export function isWalkable(mapGrid, x, y) {
  if (y < 0 || y >= mapGrid.length || x < 0 || x >= mapGrid[0].length) return false
  return !BLOCKED_LEGACY_TILES.has(mapGrid[y][x])
}

export function getLegacyTile(mapGrid, x, y) {
  if (y < 0 || y >= mapGrid.length || x < 0 || x >= mapGrid[0].length) return 1
  return mapGrid[y][x]
}
