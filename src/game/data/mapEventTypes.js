export const MAP_EVENT_TYPES = Object.freeze({
  WARP: 'warp',
  FAST_TRAVEL: 'fast_travel',
  ITEM: 'item',
  PICKUP: 'pickup',
  HEAL: 'heal',
  MERCHANT: 'merchant',
  TRAINER: 'trainer',
  BOSS: 'boss',
  CHALLENGE: 'challenge',
  OBJECTIVE: 'objective',
  INFO: 'info',
  SIGN: 'sign'
})

export const MAP_EVENT_TILE_BY_TYPE = Object.freeze({
  [MAP_EVENT_TYPES.WARP]: 2,
  [MAP_EVENT_TYPES.FAST_TRAVEL]: 21,
  [MAP_EVENT_TYPES.ITEM]: 3,
  [MAP_EVENT_TYPES.PICKUP]: 3,
  [MAP_EVENT_TYPES.HEAL]: 5,
  [MAP_EVENT_TYPES.MERCHANT]: 7,
  [MAP_EVENT_TYPES.TRAINER]: 7,
  [MAP_EVENT_TYPES.BOSS]: 7,
  [MAP_EVENT_TYPES.CHALLENGE]: 10,
  [MAP_EVENT_TYPES.OBJECTIVE]: 6,
  [MAP_EVENT_TYPES.INFO]: 6,
  [MAP_EVENT_TYPES.SIGN]: 6
})

export const MAP_EVENT_LABELS = Object.freeze({
  [MAP_EVENT_TYPES.WARP]: '传送点',
  [MAP_EVENT_TYPES.FAST_TRAVEL]: '快速传送台',
  [MAP_EVENT_TYPES.ITEM]: '可见道具',
  [MAP_EVENT_TYPES.PICKUP]: '拾取点',
  [MAP_EVENT_TYPES.HEAL]: '恢复泉水',
  [MAP_EVENT_TYPES.MERCHANT]: '商人',
  [MAP_EVENT_TYPES.TRAINER]: '训练师',
  [MAP_EVENT_TYPES.BOSS]: '首领',
  [MAP_EVENT_TYPES.CHALLENGE]: '挑战点',
  [MAP_EVENT_TYPES.OBJECTIVE]: '任务机关',
  [MAP_EVENT_TYPES.INFO]: '提示点',
  [MAP_EVENT_TYPES.SIGN]: '路牌'
})

export const KNOWN_MAP_EVENT_TYPES = new Set(Object.values(MAP_EVENT_TYPES))

export function getMapEventTile(type) {
  return MAP_EVENT_TILE_BY_TYPE[type] ?? null
}
