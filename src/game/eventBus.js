/** 轻量事件总线：Phaser 场景与 React 通信 */
const listeners = new Map()

export const gameEventBus = {
  on(event, handler) {
    if (!listeners.has(event)) listeners.set(event, new Set())
    listeners.get(event).add(handler)
    return () => listeners.get(event)?.delete(handler)
  },

  emit(event, payload) {
    listeners.get(event)?.forEach((handler) => {
      try {
        handler(payload)
      } catch (error) {
        console.error(`[gameEventBus] ${event}`, error)
      }
    })
  },

  clear() {
    listeners.clear()
  }
}

export const GAME_EVENTS = {
  ENCOUNTER: 'encounter',
  COLLECT: 'collect',
  PLAYER_MOVE: 'playerMove',
  OPEN_MAP_SELECTION: 'openMapSelection',
  NAVIGATE: 'navigate',
  DIALOG: 'dialog'
}
