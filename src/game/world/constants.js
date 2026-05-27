export const TILE_SIZE = 64
export const MOVE_DURATION_MS = 240
export const WORLD_DEPTH_BASE = 1000
export const PLAYER_DEPTH_OFFSET = 10

/** 旧 mapGrid 数字 -> 历史瓦片索引映射（保留给当前 legacy grid 兼容层） */
export const LEGACY_TILE_TO_INDEX = {
  0: 0, // grass
  1: 1, // tree / wall
  2: 2, // exit flower
  3: 3, // item (walkable)
  4: 0,
  5: 4, // heal marker
  6: 5, // sign
  7: 6, // trainer
  8: 0, // tall grass base grass; overlay layer renders grass blades
  9: 11, // berry
  10: 12, // challenge
  11: 8, // water
  12: 9, // road
  13: 13, // sand
  14: 14, // cliff
  15: 15, // bridge
  16: 16, // flowers
  17: 17, // pale grass
  18: 8, // ocean rock base
  19: 18, // dock
  20: 0, // house object base
  21: 4 // fast travel marker uses the service pad base
}

// 5 = heal spring, 6 = sign/info tile.
// 这两类都有明确实体占位，不再作为可踏入地板处理，统一改为贴近交互。
export const BLOCKED_LEGACY_TILES = new Set([1, 5, 6, 11, 14, 18, 20])

export const ENCOUNTER_LEGACY_TILES = new Set([8])

export const INTERACTION_LEGACY_TILES = {
  2: 'exit',
  3: 'item',
  4: 'gold',
  5: 'heal',
  6: 'info',
  7: 'trainer',
  9: 'berry',
  10: 'challenge',
  21: 'fast_travel'
}
