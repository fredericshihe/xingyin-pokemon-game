import { ENCOUNTER_LEGACY_TILES, INTERACTION_LEGACY_TILES } from './constants'
import { getEncounterTable, pickWildPokemon } from '../data/encounterTables'
import { resolveEncounterTableId } from '../data/mapRegistry'
import { getMapEventAt } from '../data/mapEvents'
import { getEncounterZoneAt } from '../data/overworldMaps'

const NON_BATTLE_INFO_EVENT_STATUSES = new Set(['cleared', 'completed', 'locked', 'daily_complete'])

function shouldRouteBattleEventToInfo(mapEvent, bridge = {}) {
  if (!mapEvent || !['trainer', 'boss', 'challenge'].includes(mapEvent.type)) return false
  if (mapEvent.type === 'boss' && bridge.currentMapBossCompleted) return true
  const status = bridge.mapEventVisualState?.[mapEvent.id]?.status
  return typeof status === 'string' && NON_BATTLE_INFO_EVENT_STATUSES.has(status)
}

export class EncounterSystem {
  constructor(bridge) {
    this.bridge = bridge
    this.cooldownSteps = bridge.encounterCooldownSteps ?? 0
  }

  setBridge(bridge) {
    this.bridge = bridge
  }

  setCooldown(steps) {
    this.cooldownSteps = steps
  }

  resolveEncounterTable(tileX, tileY) {
    const mapName = this.bridge.currentMapName
    const zone = getEncounterZoneAt(mapName, tileX, tileY)
    if (zone?.encounterTableId) return zone.encounterTableId
    return resolveEncounterTableId(mapName, this.bridge.useRealMaps)
  }

  resolveEncounterRate(tileX, tileY, table = null) {
    const mapName = this.bridge.currentMapName
    const zone = getEncounterZoneAt(mapName, tileX, tileY)
    if (zone?.tallGrassRate != null) return zone.tallGrassRate
    if (table?.tallGrassRate != null) return table.tallGrassRate
    if (table?.baseRate != null) return table.baseRate
    return this.bridge.mapConfig?.tallGrassRate ?? 0.25
  }

  async handleStep({ tileX, tileY, legacyTile, interactionOnly, targetX, targetY, direction }) {
    if (interactionOnly) {
      const interaction = INTERACTION_LEGACY_TILES[legacyTile]
      if (interaction) {
        return this.handleInteraction(interaction, {
          tileX: targetX ?? tileX,
          tileY: targetY ?? tileY,
          playerX: tileX,
          playerY: tileY,
          legacyTile,
          direction: direction || this.bridge.playerPos?.direction
        })
      }
      return false
    }

    const interaction = INTERACTION_LEGACY_TILES[legacyTile]
    if (interaction) {
      return this.handleInteraction(interaction, { tileX, tileY, legacyTile })
    }

    if (!ENCOUNTER_LEGACY_TILES.has(legacyTile)) return false

    const tableId = this.resolveEncounterTable(tileX, tileY)
    const table = getEncounterTable(tableId)
    const rate = this.resolveEncounterRate(tileX, tileY, table)

    if (this.cooldownSteps > 0) {
      this.cooldownSteps -= 1
      this.bridge.onEncounterCooldownChange?.(this.cooldownSteps)
      return false
    }

    if (Math.random() >= rate) return false

    const encounter = pickWildPokemon(tableId)
    if (!encounter) return false

    const safeSteps = Math.max(0, Math.trunc(Number(table?.safeStepsAfterBattle ?? 5) || 0))
    this.cooldownSteps = safeSteps
    this.bridge.onEncounterCooldownChange?.(safeSteps)

    const zone = getEncounterZoneAt(this.bridge.currentMapName, tileX, tileY)

    this.bridge.onEncounter?.({
      pokemonId: encounter.id,
      level: encounter.level,
      zoneId: zone?.id ?? null,
      zoneName: zone?.name ?? null,
      terrainType: legacyTile,
      playerPos: {
        x: tileX,
        y: tileY,
        direction: direction || this.bridge.playerPos?.direction || 'down'
      },
      encounterCooldownSteps: this.cooldownSteps
    })
    return true
  }

  async handleInteraction(type, ctx) {
    const mapEvent = getMapEventAt(this.bridge.currentMapName, ctx.tileX, ctx.tileY)
    if (type === 'fast_travel' && mapEvent?.type !== 'fast_travel') {
      return false
    }
    const effectiveType = (() => {
      if (!mapEvent?.type) return type
      if (mapEvent.type === 'warp') return 'exit'
      if (mapEvent.type === 'fast_travel') return 'fast_travel'
      if (mapEvent.type === 'sign') return 'info'
      if (mapEvent.type === 'pickup') return 'item'
      if (shouldRouteBattleEventToInfo(mapEvent, this.bridge)) return 'info'
      if (['item', 'heal', 'trainer', 'boss', 'challenge'].includes(mapEvent.type)) {
        return mapEvent.type
      }
      return type
    })()
    const interactionContext = {
      tileX: ctx.tileX,
      tileY: ctx.tileY,
      mapEvent,
      playerPos: {
        x: ctx.playerX ?? ctx.tileX,
        y: ctx.playerY ?? ctx.tileY,
        direction: ctx.direction || this.bridge.playerPos?.direction || 'down'
      },
      encounterCooldownSteps: this.cooldownSteps
    }

    switch (effectiveType) {
      case 'exit':
        if (this.bridge.useRealMaps) {
          const warp = mapEvent?.type === 'warp' ? mapEvent : getMapEventAt(
            this.bridge.currentMapName,
            ctx.tileX,
            ctx.tileY,
            'warp'
          )
          if (warp) {
            this.bridge.onMapWarp?.(warp)
          } else {
            this.bridge.onCollect?.('info', 1, interactionContext)
          }
        } else {
          this.bridge.onCollect?.('info', 1, interactionContext)
        }
        return true
      case 'item':
      case 'gold':
      case 'heal':
      case 'info':
      case 'trainer':
      case 'boss':
      case 'berry':
      case 'challenge':
      case 'fast_travel':
        return await this.bridge.onCollect?.(
          effectiveType === 'item' ? 'item' : effectiveType,
          1,
          interactionContext
        ) ?? false
      default:
        return false
    }
  }
}
