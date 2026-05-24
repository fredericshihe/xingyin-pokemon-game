import React, { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { getMapConfig } from '../data/maps/mapConfig'
import { getAdventureMapInfo } from './data/overworldMaps'

const ThreeLowPolyMap = lazy(() => import('./ThreeLowPolyMap'))
const loadPhaserBridgeModule = () => import('./phaserGame')

function GameCanvas({
  playerTeam,
  playerPos,
  mapGrid,
  onPlayerMove,
  onMapGridChange,
  useRealMaps,
  currentMapName,
  mapLevel,
  onEncounter,
  onCollect,
  onNavigate,
  onMapWarp,
  onZoneEnter,
  cloudBlocked = false,
  encounterCooldownSteps = 0,
  onEncounterCooldownChange,
  mapActive = true,
  collectedEventIds = [],
  springRestoreAnimation = null,
  currentMapBossCompleted = false,
  mapEventVisualState = {}
}) {
  const containerRef = useRef(null)
  const bridgeRef = useRef(null)
  const phaserBridgeModuleRef = useRef(null)
  const phaserBridgePromiseRef = useRef(null)

  const mapConfig = useMemo(
    () => (useRealMaps ? getMapConfig(currentMapName) : null),
    [currentMapName, useRealMaps]
  )
  const adventureMapInfo = useMemo(
    () => (useRealMaps ? getAdventureMapInfo(currentMapName) : null),
    [currentMapName, useRealMaps]
  )
  const isThreeLowPolyMap = adventureMapInfo?.renderMode === 'three-lowpoly'
  const hasMapGrid = Boolean(mapGrid?.length)

  const ensurePhaserBridgeModule = useCallback(async () => {
    if (phaserBridgeModuleRef.current) return phaserBridgeModuleRef.current
    if (!phaserBridgePromiseRef.current) {
      phaserBridgePromiseRef.current = loadPhaserBridgeModule()
        .then((module) => {
          phaserBridgeModuleRef.current = module
          return module
        })
        .catch((error) => {
          phaserBridgePromiseRef.current = null
          throw error
        })
    }
    return phaserBridgePromiseRef.current
  }, [])

  const clearTile = useCallback((x, y) => {
    if (!mapGrid?.length) return
    const next = mapGrid.map((row, rowY) =>
      rowY === y ? row.map((tile, colX) => (colX === x ? 0 : tile)) : [...row]
    )
    onMapGridChange?.(next)
  }, [mapGrid, onMapGridChange])

  bridgeRef.current = {
    playerTeam,
    playerPos,
    mapGrid,
    useRealMaps,
    currentMapName,
    mapInfo: adventureMapInfo,
    mapLevel,
    mapConfig,
    encounterCooldownSteps,
    onPlayerMove,
    onEncounter,
    onCollect,
    onNavigate,
    onMapWarp,
    onZoneEnter,
    onEncounterCooldownChange,
    collectedEventIds,
    springRestoreAnimation,
    currentMapBossCompleted,
    mapEventVisualState,
    clearTile
  }

  useEffect(() => {
    if (isThreeLowPolyMap) {
      phaserBridgeModuleRef.current?.destroyPhaserGame?.()
      return undefined
    }
    const parent = containerRef.current
    if (!parent || !hasMapGrid) return undefined

    let disposed = false
    ensurePhaserBridgeModule()
      .then((phaserBridge) => {
        if (disposed) {
          phaserBridge.destroyPhaserGame()
          return
        }
        phaserBridge.createPhaserGame(parent, bridgeRef.current)
      })
      .catch((error) => {
        console.error('[GameCanvas] Failed to load Phaser map runtime:', error)
      })

    return () => {
      disposed = true
      phaserBridgeModuleRef.current?.destroyPhaserGame?.()
    }
  }, [currentMapName, ensurePhaserBridgeModule, hasMapGrid, isThreeLowPolyMap, useRealMaps])

  useEffect(() => {
    if (isThreeLowPolyMap) return undefined
    if (!mapGrid?.length) return
    // 延迟一帧，确保 BootScene 预加载完成后再 reload
    let cancelled = false
    const id = requestAnimationFrame(() => {
      ensurePhaserBridgeModule()
        .then((phaserBridge) => {
          if (!cancelled) phaserBridge.reloadWorldScene(bridgeRef.current)
        })
        .catch((error) => {
          console.error('[GameCanvas] Failed to refresh Phaser world scene:', error)
        })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [currentMapName, ensurePhaserBridgeModule, isThreeLowPolyMap, mapGrid, useRealMaps])

  useEffect(() => {
    if (isThreeLowPolyMap) return
    ensurePhaserBridgeModule()
      .then((phaserBridge) => {
        phaserBridge.updateWorldBridge(bridgeRef.current)
      })
      .catch((error) => {
        console.error('[GameCanvas] Failed to update Phaser bridge:', error)
      })
  })

  useEffect(() => {
    if (isThreeLowPolyMap) return
    ensurePhaserBridgeModule()
      .then((phaserBridge) => {
        phaserBridge.setWorldBlocked(cloudBlocked || !mapActive)
      })
      .catch((error) => {
        console.error('[GameCanvas] Failed to update Phaser blocked state:', error)
      })
  }, [cloudBlocked, ensurePhaserBridgeModule, isThreeLowPolyMap, mapActive])

  useEffect(() => {
    if (isThreeLowPolyMap) {
      phaserBridgeModuleRef.current?.destroyPhaserGame?.()
    }
  }, [isThreeLowPolyMap])

  const handleDpad = (direction) => {
    if (cloudBlocked) return
    ensurePhaserBridgeModule()
      .then((phaserBridge) => {
        phaserBridge.nudgePlayer(direction)
      })
      .catch((error) => {
        console.error('[GameCanvas] Failed to handle D-pad input:', error)
      })
  }

  if (!mapGrid?.length) {
    return <div className="text-white p-4">Loading Map...</div>
  }

  if (isThreeLowPolyMap) {
    return (
      <Suspense fallback={<div className="map-screen-v2"><div className="map-scene-area"><div className="map-viewport-shell"><div className="map-viewport flex items-center justify-center text-white/90">地图场景加载中...</div></div></div></div>}>
        <ThreeLowPolyMap
          playerPos={playerPos}
          mapGrid={mapGrid}
          currentMapName={currentMapName}
          mapConfig={mapConfig}
          encounterCooldownSteps={encounterCooldownSteps}
          cloudBlocked={cloudBlocked}
          mapActive={mapActive}
          onPlayerMove={onPlayerMove}
          onEncounter={onEncounter}
          onCollect={onCollect}
          onNavigate={onNavigate}
          onMapWarp={onMapWarp}
          onZoneEnter={onZoneEnter}
          onEncounterCooldownChange={onEncounterCooldownChange}
          collectedEventIds={collectedEventIds}
          springRestoreAnimation={springRestoreAnimation}
          currentMapBossCompleted={currentMapBossCompleted}
          mapEventVisualState={mapEventVisualState}
        />
      </Suspense>
    )
  }

  return (
    <div className="map-screen-v2">
      <div className="map-scene-area">
        <div className="map-viewport-shell">
          <div
            ref={containerRef}
            className="map-viewport phaser-map-host"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      </div>

      <div className="map-controls-v2">
        <div className="dpad">
          <button type="button" disabled={cloudBlocked} onClick={() => handleDpad('up')} className="dpad-button dpad-up">
            <i className="fas fa-arrow-up text-lg"></i>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => handleDpad('down')} className="dpad-button dpad-down">
            <i className="fas fa-arrow-down text-lg"></i>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => handleDpad('left')} className="dpad-button dpad-left">
            <i className="fas fa-arrow-left text-lg"></i>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => handleDpad('right')} className="dpad-button dpad-right">
            <i className="fas fa-arrow-right text-lg"></i>
          </button>
          <div className="dpad-center"></div>
        </div>
        <div className="map-action-grid">
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate('bag')} className="map-action-button">
            <i className="fa-solid fa-bag-shopping"></i><span>背包</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate('team')} className="map-action-button">
            <i className="fa-solid fa-paw"></i><span>宝可梦</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate('dex')} className="map-action-button">
            <i className="fa-solid fa-book-open"></i><span>图鉴</span>
          </button>
          <button type="button" disabled={cloudBlocked} onClick={() => onNavigate('shop')} className="map-action-button">
            <i className="fa-solid fa-store"></i><span>商店</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default memo(GameCanvas)
