import Phaser from 'phaser'
import { PLAYER_DEPTH_OFFSET, TILE_SIZE, WORLD_DEPTH_BASE } from '../world/constants'
import { INTERACTION_LEGACY_TILES } from '../world/constants'
import { legacyGridToTileIndices, findLegacySpawn } from '../world/LegacyGridAdapter'
import { PlayerController } from '../world/PlayerController'
import { EncounterSystem } from '../world/EncounterSystem'
import {
  getAdventureMapInfo,
  getEncounterZoneAt,
  isKenneyIsometricMap,
  isTiledJsonMap
} from '../data/overworldMaps'
import {
  createPlayerPlaceholder,
  PLAYER_TEXTURE_KEY,
  registerPlayerAnimations
} from '../world/TextureFactory'

function flatToRows(flat, width, height) {
  const rows = []
  for (let y = 0; y < height; y++) {
    rows.push(flat.slice(y * width, (y + 1) * width))
  }
  return rows
}

export default class WorldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WorldScene' })
  }

  init(data) {
    this.bridge = data?.bridge || this.registry.get('bridge')
  }

  create() {
    this.rebuildMap()
    this.cameras.main.setBackgroundColor('#9fd879')
    this.cameras.main.setRoundPixels(false)

    this.events.on('reload-map', this.rebuildMap, this)
    this.events.on('update-bridge', (bridge) => {
      this.bridge = bridge
      this.encounterSystem?.setBridge(bridge)
      this.playerController?.setMapGrid(bridge?.mapGrid)
    }, this)
    this.events.on('set-blocked', (blocked) => {
      this.playerController?.setBlocked(blocked)
      if (!blocked) {
        this.encounterSystem?.setCooldown(this.registry.get('bridge')?.encounterCooldownSteps ?? 0)
      }
    }, this)
  }

  rebuildMap() {
    if (this.playerController) {
      this.tweens.killAll()
    }
    this.children.removeAll(true)
    this.playerController = null
    this.encounterSystem = null

    const bridge = this.registry.get('bridge') || this.bridge
    if (!bridge?.mapGrid?.length) return

    const mapName = bridge.currentMapName
    const mapInfo = getAdventureMapInfo(mapName)
    const width = bridge.mapGrid[0].length
    const height = bridge.mapGrid.length

    let layer = null
    this.mapGroundImage = null
    this.tallGrassSprites = new Map()

    if (isKenneyIsometricMap(mapName)) {
      if (!this.areKenneyIsometricAssetsReady(mapInfo)) {
        this.queueKenneyIsometricReload(bridge, mapInfo)
        return
      }
      this.buildKenneyIsometricVisual(mapInfo, bridge.mapGrid)
    } else if (isTiledJsonMap(mapName)) {
      if (!this.cache.tilemap.exists(mapInfo.tilemapKey) || !this.textures.exists(mapInfo.tilesetKey)) {
        this.queueTiledJsonMapReload(bridge, mapInfo)
        return
      }
      this.buildTiledJsonVisual(mapInfo)
    } else {
      const map = this.make.tilemap({
        tileWidth: TILE_SIZE,
        tileHeight: TILE_SIZE,
        width,
        height
      })
      const { ground } = legacyGridToTileIndices(bridge.mapGrid)
      const tileset = map.addTilesetImage(
        'overworld',
        'overworld-tiles',
        TILE_SIZE,
        TILE_SIZE,
        0,
        0
      )
      layer = map.createBlankLayer('ground', tileset, 0, 0, width, height)
      layer.putTilesAt(flatToRows(ground, width, height), 0, 0)
      layer.setDepth(0)
      this.createSceneryObjects(bridge.mapGrid)
    }

    if (this.mapGroundImage) {
      this.mapGroundImage.setDepth(0)
    }
    const playerTextureKey = createPlayerPlaceholder(this, PLAYER_TEXTURE_KEY)
    registerPlayerAnimations(this, playerTextureKey)

    const mapWidthPx = width * TILE_SIZE
    const mapHeightPx = height * TILE_SIZE

    const spawn = findLegacySpawn(bridge.mapGrid, bridge.playerPos)
    const playerY = isKenneyIsometricMap(mapName)
      ? spawn.y * TILE_SIZE + TILE_SIZE * 0.72
      : spawn.y * TILE_SIZE + TILE_SIZE * 0.85
    const player = this.add.sprite(
      spawn.x * TILE_SIZE + TILE_SIZE / 2,
      playerY,
      playerTextureKey,
      0
    )
    player.setDepth(this.depthForWorldY(player.y, PLAYER_DEPTH_OFFSET))
    player.setOrigin(0.5, 0.85)

    this.encounterSystem = new EncounterSystem(bridge)
    this.encounterSystem.setCooldown(bridge.encounterCooldownSteps ?? 0)

    this.playerController = new PlayerController(
      this,
      player,
      bridge.mapGrid,
      spawn,
      (step) => this.onPlayerStep(step)
    )

    const cam = this.cameras.main
    cam.startFollow(player, true, 0.14, 0.14)
    cam.setBounds(0, 0, mapWidthPx, mapHeightPx)
    cam.setZoom(this.getCameraZoom(mapWidthPx, mapHeightPx))
    cam.setRoundPixels(false)

    this.mapLayer = layer
    this.mapSize = { width, height }

    this.cameras.main.setBackgroundColor(
      isKenneyIsometricMap(mapName) ? '#9fd879' : '#7ec8f2'
    )
  }

  queueTiledJsonMapReload(bridge, mapInfo) {
    if (this._tiledMapLoadQueued) return
    this._tiledMapLoadQueued = true
    this.bridge = bridge

    if (!this.cache.tilemap.exists(mapInfo.tilemapKey)) {
      this.load.tilemapTiledJSON(mapInfo.tilemapKey, mapInfo.tilemapUrl)
    }
    if (!this.textures.exists(mapInfo.tilesetKey)) {
      this.load.image(mapInfo.tilesetKey, mapInfo.tilesetUrl)
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this._tiledMapLoadQueued = false
      if (this.scene.isActive()) {
        this.rebuildMap()
      }
    })
    this.load.start()
  }

  areKenneyIsometricAssetsReady(mapInfo) {
    if (!mapInfo?.visualAssets?.length) return true
    return mapInfo.visualAssets.every((asset) => this.textures.exists(asset.key))
  }

  queueKenneyIsometricReload(bridge, mapInfo) {
    if (this._kenneyIsometricLoadQueued) return
    this._kenneyIsometricLoadQueued = true
    this.bridge = bridge

    mapInfo.visualAssets?.forEach((asset) => {
      if (!this.textures.exists(asset.key)) {
        this.load.image(asset.key, asset.url)
      }
    })

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this._kenneyIsometricLoadQueued = false
      if (this.scene.isActive()) {
        this.rebuildMap()
      }
    })
    this.load.start()
  }

  buildTiledJsonVisual(mapInfo) {
    const map = this.make.tilemap({ key: mapInfo.tilemapKey })
    const tileset = map.addTilesetImage(mapInfo.tilesetName, mapInfo.tilesetKey)
    map.layers.forEach((layerData, index) => {
      const layer = map.createLayer(layerData.name, tileset, 0, 0)
      if (!layer) return
      layer.setScale(TILE_SIZE / map.tileWidth)
      layer.setDepth(index)
    })
    return map
  }

  buildKenneyIsometricVisual(mapInfo, mapGrid) {
    if (!mapGrid?.length) return

    const width = mapGrid[0].length
    const height = mapGrid.length

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const legacyTile = mapGrid[y][x]
        const cx = x * TILE_SIZE + TILE_SIZE / 2
        const cy = y * TILE_SIZE + TILE_SIZE / 2
        const baseTile = this.add.image(cx, cy + 8, 'kenney-platform-grass')
        baseTile.setOrigin(0.5, 0.62)
        baseTile.setDisplaySize(TILE_SIZE * 1.72, TILE_SIZE * 0.98)
        baseTile.setDepth(WORLD_DEPTH_BASE - 500 + y * 2 + x * 0.01)

        const tileKey = this.getKenneyGroundKey(legacyTile)
        if (tileKey && tileKey !== 'kenney-platform-grass') {
          const overlay = this.add.image(cx, cy + 8, tileKey)
          overlay.setOrigin(0.5, 0.62)
          overlay.setDisplaySize(TILE_SIZE * 1.88, TILE_SIZE)
          overlay.setDepth(WORLD_DEPTH_BASE - 490 + y * 2 + x * 0.01)
        }

        if (legacyTile === 8) {
          const grassKey = (x + y) % 2 === 0 ? 'kenney-grass-large' : 'kenney-grass-leafs-large'
          const grass = this.add.image(cx, cy + 18, grassKey)
          grass.setOrigin(0.5, 0.82)
          grass.setDisplaySize(TILE_SIZE * 0.92, TILE_SIZE * 0.66)
          grass.setDepth(this.depthForWorldY(cy, 2))
          this.tallGrassSprites.set(`${x},${y}`, grass)
        }

        if (legacyTile === 1) {
          const objectKey = this.getKenneyTreeKey(x, y)
          const tree = this.add.image(cx, cy + 18, objectKey)
          tree.setOrigin(0.5, 0.82)
          tree.setDisplaySize(TILE_SIZE * 0.92, TILE_SIZE * 1.76)
          tree.setDepth(this.depthForWorldY(cy, 14))
        }

        if (legacyTile === 11 && (x + y) % 5 === 0) {
          const shimmer = this.add.ellipse(cx, cy + 18, TILE_SIZE * 0.86, TILE_SIZE * 0.16, 0xffffff, 0.22)
          shimmer.setDepth(this.depthForWorldY(cy, 1))
        }
      }
    }

    this.createKenneyDecorativeObjects(mapInfo)
  }

  getKenneyGroundKey(legacyTile) {
    switch (legacyTile) {
      case 11:
        return 'kenney-water-tile'
      case 12:
      case 2:
        return 'kenney-path-tile'
      default:
        return null
    }
  }

  getKenneyTreeKey(x, y) {
    const variant = (x * 7 + y * 11) % 3
    if (variant === 0) return 'kenney-tree-oak'
    if (variant === 1) return 'kenney-tree-default'
    return 'kenney-tree-pine'
  }

  createKenneyDecorativeObjects(mapInfo) {
    mapInfo.decorativeObjects?.forEach((object, index) => {
      const cx = object.x * TILE_SIZE + TILE_SIZE / 2
      const cy = object.y * TILE_SIZE + TILE_SIZE / 2
      const key = this.getKenneyDecorativeKey(object.type)
      if (!key || !this.textures.exists(key)) return

      const sprite = this.add.image(cx, cy + 16, key)
      const scale = this.getKenneyDecorativeScale(object.type)
      sprite.setOrigin(0.5, 0.8)
      sprite.setDisplaySize(TILE_SIZE * scale.width, TILE_SIZE * scale.height)
      sprite.setDepth(this.depthForWorldY(cy, 20 + index * 0.01))
    })
  }

  getKenneyDecorativeKey(type) {
    switch (type) {
      case 'tent':
        return 'kenney-tent'
      case 'campfire':
        return 'kenney-campfire'
      case 'sign':
        return 'kenney-sign'
      case 'flower-yellow':
        return 'kenney-flower-yellow'
      case 'flower-red':
        return 'kenney-flower-red'
      case 'mushroom-red':
        return 'kenney-mushroom-red'
      case 'rock':
        return 'kenney-rock-large'
      case 'stone':
        return 'kenney-stone-large'
      default:
        return null
    }
  }

  getKenneyDecorativeScale(type) {
    switch (type) {
      case 'campfire':
      case 'sign':
      case 'flower-yellow':
      case 'flower-red':
      case 'mushroom-red':
        return { width: 0.58, height: 0.72 }
      case 'tent':
        return { width: 1.15, height: 1.08 }
      default:
        return { width: 0.82, height: 0.82 }
    }
  }

  getCameraZoom(mapWidthPx, mapHeightPx) {
    const viewW = this.scale.width
    const viewH = this.scale.height
    const zoomX = viewW / Math.max(mapWidthPx, 1)
    const zoomY = viewH / Math.max(mapHeightPx, 1)
    const fitZoom = Math.min(zoomX, zoomY) * 2.35
    return Phaser.Math.Clamp(fitZoom, 0.66, 1.05)
  }

  depthForWorldY(y, offset = 0) {
    return WORLD_DEPTH_BASE + y + offset
  }

  createSceneryObjects(mapGrid) {
    if (!mapGrid?.length) return

    mapGrid.forEach((row, tileY) => {
      row.forEach((legacyTile, tileX) => {
        const centerX = tileX * TILE_SIZE + TILE_SIZE / 2
        const baseY = tileY * TILE_SIZE + TILE_SIZE

        if (legacyTile === 1) {
          const tree = this.add.image(centerX, baseY + 4, 'tree-object')
          tree.setOrigin(0.5, 0.92)
          tree.setDepth(this.depthForWorldY(baseY, 4))
          return
        }

        if (legacyTile === 8) {
          const variant = (tileX + tileY) % 2
          const grass = this.add.image(
            centerX,
            baseY + 4,
            `tall-grass-object-${variant}`
          )
          grass.setOrigin(0.5, 1)
          grass.setDepth(this.depthForWorldY(baseY, 6))
          this.tallGrassSprites.set(`${tileX},${tileY}`, grass)
          return
        }

        if (legacyTile === 18) {
          const rock = this.add.image(centerX, baseY + 2, 'rock-object')
          rock.setOrigin(0.5, 0.9)
          rock.setDepth(this.depthForWorldY(baseY, 5))
          return
        }

        if (legacyTile === 20) {
          const house = this.add.image(centerX, baseY + 2, 'house-object')
          house.setOrigin(0.5, 0.92)
          house.setDepth(this.depthForWorldY(baseY, 8))
        }
      })
    })
  }

  async onPlayerStep(step) {
    const bridge = this.registry.get('bridge')
    if (!bridge) return
    const interactionType = INTERACTION_LEGACY_TILES[step.legacyTile]

    if (!step.interactionOnly) {
      bridge.onPlayerMove?.({ x: step.tileX, y: step.tileY, direction: step.direction })
      const zone = getEncounterZoneAt(bridge.currentMapName, step.tileX, step.tileY)
      const zoneId = zone?.id ?? null
      if (zoneId !== this.lastZoneId) {
        this.lastZoneId = zoneId
        if (zone?.name) bridge.onZoneEnter?.(zone.name)
      }
    }

    if (step.legacyTile === 8) {
      this.animateGrass(step.tileX, step.tileY)
    }

    if (interactionType) {
      this.playerController.setBlocked(true)
    }

    try {
      const paused = await this.encounterSystem.handleStep(step)
      if (paused) {
        this.playerController.setBlocked(true)
      } else if (!this.registry.get('bridge')?.cloudBlocked) {
        this.playerController.setBlocked(false)
      }
    } catch (error) {
      console.error('World interaction resolution failed:', error)
      if (!this.registry.get('bridge')?.cloudBlocked) {
        this.playerController.setBlocked(false)
      }
    }
  }

  update() {
    this.playerController?.update()
  }

  animateGrass(tileX, tileY) {
    const grass = this.tallGrassSprites?.get(`${tileX},${tileY}`)
    if (!grass) return

    this.tweens.killTweensOf(grass)
    grass.setScale(1)
    grass.setAngle(0)
    this.tweens.add({
      targets: grass,
      scaleX: 1.12,
      scaleY: 0.92,
      angle: Phaser.Math.Between(-4, 4),
      duration: 75,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        grass.setScale(1)
        grass.setAngle(0)
      }
    })
  }

  shutdown() {
    this.events.off('reload-map', this.rebuildMap, this)
    this.events.off('update-bridge')
    this.events.off('set-blocked')
  }
}
