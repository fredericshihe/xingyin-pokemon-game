import Phaser from 'phaser'
import {
  createOverworldTileset,
  createPlayerPlaceholder,
  PLAYER_TEXTURE_KEY,
  createWorldObjectTextures,
  registerPlayerAnimations
} from '../world/TextureFactory'

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload() {
    createOverworldTileset(this)
    createWorldObjectTextures(this)
    createPlayerPlaceholder(this, PLAYER_TEXTURE_KEY)
  }

  create() {
    registerPlayerAnimations(this, PLAYER_TEXTURE_KEY)
    const bridge = this.registry.get('bridge')
    this.scene.start('WorldScene', { bridge })
  }
}
