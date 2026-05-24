import Phaser from 'phaser'
import BootScene from './scenes/BootScene'
import WorldScene from './scenes/WorldScene'

let activeGame = null

export function createPhaserGame(parentEl, bridge) {
  if (!parentEl) return null

  destroyPhaserGame()

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: parentEl,
    width: 960,
    height: 576,
    backgroundColor: '#7ec8f2',
    pixelArt: false,
    roundPixels: false,
    antialias: true,
    antialiasGL: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 576
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    },
    scene: [BootScene, WorldScene],
    audio: { noAudio: true }
  })

  game.registry.set('bridge', bridge)
  activeGame = game
  return game
}

export function destroyPhaserGame() {
  if (activeGame) {
    activeGame.destroy(true)
    activeGame = null
  }
}

export function getActivePhaserGame() {
  return activeGame
}

export function reloadWorldScene(bridge) {
  if (!activeGame) return
  activeGame.registry.set('bridge', bridge)
  const world = activeGame.scene.getScene('WorldScene')
  // 仅在世界场景已就绪后刷新，具体地图资源由 WorldScene 按需加载。
  if (world?.scene?.isActive()) {
    world.events.emit('reload-map')
  }
}

export function updateWorldBridge(bridge) {
  if (!activeGame) return
  activeGame.registry.set('bridge', bridge)
  const world = activeGame.scene.getScene('WorldScene')
  if (world?.scene?.isActive()) {
    world.events.emit('update-bridge', bridge)
  }
}

export function setWorldBlocked(blocked) {
  const world = activeGame?.scene?.getScene('WorldScene')
  world?.events?.emit('set-blocked', blocked)
}

export function nudgePlayer(direction) {
  const world = activeGame?.scene?.getScene('WorldScene')
  world?.playerController?.moveByDirection(direction)
}
