import {
  MOVE_DURATION_MS,
  PLAYER_DEPTH_OFFSET,
  TILE_SIZE,
  WORLD_DEPTH_BASE
} from './constants'
import { INTERACTION_LEGACY_TILES } from './constants'
import { getLegacyTile, isWalkable } from './LegacyGridAdapter'
import { getPlayerWalkAnimKey } from './TextureFactory'

const BLOCKED_INTERACTIONS = new Set(['exit', 'heal', 'trainer', 'boss', 'challenge', 'info'])

const DIR_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}

export class PlayerController {
  constructor(scene, sprite, mapGrid, startTile, onStepComplete) {
    this.scene = scene
    this.sprite = sprite
    this.mapGrid = mapGrid
    this.tileX = startTile.x
    this.tileY = startTile.y
    this.direction = 'down'
    this.isMoving = false
    this.queuedDirection = null
    this.onStepComplete = onStepComplete
    this.blocked = false
    this.visualMode = scene.registry.get('bridge')?.mapInfo?.renderMode || 'legacy'

    this.cursors = scene.input.keyboard.createCursorKeys()
    this.wasd = scene.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    })

    this.syncSpritePosition(false)
    this.updateDepth()
    this.playIdle()
  }

  setMapGrid(mapGrid) {
    this.mapGrid = mapGrid
    this.visualMode = this.scene.registry.get('bridge')?.mapInfo?.renderMode || this.visualMode
  }

  setBlocked(blocked) {
    this.blocked = blocked
    if (blocked) this.queuedDirection = null
  }

  setTilePosition(tileX, tileY, direction = this.direction) {
    this.tileX = tileX
    this.tileY = tileY
    this.direction = direction
    this.isMoving = false
    this.queuedDirection = null
    this.scene.tweens.killTweensOf(this.sprite)
    this.syncSpritePosition(false)
    this.playIdle()
  }

  getDirectionFromInput() {
    if (this.cursors.up.isDown || this.wasd.up.isDown) return 'up'
    if (this.cursors.down.isDown || this.wasd.down.isDown) return 'down'
    if (this.cursors.left.isDown || this.wasd.left.isDown) return 'left'
    if (this.cursors.right.isDown || this.wasd.right.isDown) return 'right'
    return null
  }

  update() {
    if (this.blocked) return

    const dir = this.getDirectionFromInput()
    if (!dir) return

    if (this.isMoving) {
      if (dir !== this.direction) this.queuedDirection = dir
      return
    }

    this.tryMove(dir)
  }

  tryMove(direction) {
    const vec = DIR_VECTORS[direction]
    if (!vec) return

    const nextX = this.tileX + vec.x
    const nextY = this.tileY + vec.y
    const targetLegacy = getLegacyTile(this.mapGrid, nextX, nextY)
    const interaction = INTERACTION_LEGACY_TILES[targetLegacy]

    if (!isWalkable(this.mapGrid, nextX, nextY)) {
      this.direction = direction
      this.playIdle()
      if (interaction && BLOCKED_INTERACTIONS.has(interaction)) {
        this.onStepComplete?.({
          tileX: this.tileX,
          tileY: this.tileY,
          direction: this.direction,
          legacyTile: targetLegacy,
          interactionOnly: true,
          targetX: nextX,
          targetY: nextY
        })
      }
      return
    }
    if (interaction && BLOCKED_INTERACTIONS.has(interaction)) {
      this.direction = direction
      this.playIdle()
      this.onStepComplete?.({
        tileX: this.tileX,
        tileY: this.tileY,
        direction: this.direction,
        legacyTile: targetLegacy,
        interactionOnly: true,
        targetX: nextX,
        targetY: nextY
      })
      return
    }

    this.direction = direction
    this.isMoving = true
    this.tileX = nextX
    this.tileY = nextY

    const targetX = nextX * TILE_SIZE + TILE_SIZE / 2
    const targetY = this.getSpriteY(nextY)

    this.sprite.anims.play(getPlayerWalkAnimKey(direction), true)

    const legacyTile = getLegacyTile(this.mapGrid, nextX, nextY)
    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration: MOVE_DURATION_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => this.updateDepth(),
      onComplete: () => {
        this.updateDepth()
        this.isMoving = false
        this.playIdle()
        this.onStepComplete?.({
          tileX: this.tileX,
          tileY: this.tileY,
          direction: this.direction,
          legacyTile
        })

        if (this.queuedDirection) {
          const queued = this.queuedDirection
          this.queuedDirection = null
          this.tryMove(queued)
        }
      }
    })
  }

  /** 供 React 方向键按钮调用 */
  moveByDirection(direction) {
    if (this.blocked) return
    if (this.isMoving) {
      if (direction !== this.direction) this.queuedDirection = direction
      return
    }
    this.tryMove(direction)
  }

  syncSpritePosition(animate = true) {
    const x = this.tileX * TILE_SIZE + TILE_SIZE / 2
    const y = this.getSpriteY(this.tileY)
    if (!animate) {
      this.sprite.setPosition(x, y)
      this.updateDepth()
    }
  }

  getSpriteY(tileY) {
    const offset = this.visualMode === 'kenney-isometric' ? 0.72 : 0.85
    return tileY * TILE_SIZE + TILE_SIZE * offset
  }

  updateDepth() {
    this.sprite.setDepth(WORLD_DEPTH_BASE + this.sprite.y + PLAYER_DEPTH_OFFSET)
  }

  playIdle() {
    this.sprite.anims.stop()
    const frameOffset = { down: 0, left: 4, right: 8, up: 12 }[this.direction] ?? 0
    this.sprite.setFrame(frameOffset)
  }
}
