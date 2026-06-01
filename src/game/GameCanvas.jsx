import React, { Component, memo, useMemo } from 'react'
import { getMapConfig } from '../data/maps/mapConfig'
import { getAdventureMapInfo } from './data/overworldMaps'
import ThreeLowPolyMap from './ThreeLowPolyMap'

class ThreeMapLazyErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('[GameCanvas] Failed to load 3D map module:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="map-screen-v2">
          <div className="map-scene-area">
            <div className="map-viewport-shell">
              <div className="map-viewport flex items-center justify-center text-white/90">
                <div className="game-card p-4 text-center text-slate-700">
                  <div className="text-lg font-black mb-2">地图资源加载失败</div>
                  <div className="text-sm font-bold text-slate-500 mb-3">请重新加载页面后再试。</div>
                  <button type="button" className="game-primary-button px-4 py-2" onClick={() => window.location.reload()}>
                    重新加载
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function GameCanvas({
  playerPos,
  mapGrid,
  onPlayerMove,
  useRealMaps,
  currentMapName,
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
  mapEventVisualState = {},
  encounterZoneLocks = {}
}) {
  const mapConfig = useMemo(
    () => (useRealMaps ? getMapConfig(currentMapName) : null),
    [currentMapName, useRealMaps]
  )
  const adventureMapInfo = useMemo(
    () => (useRealMaps ? getAdventureMapInfo(currentMapName) : null),
    [currentMapName, useRealMaps]
  )
  const renderMode = adventureMapInfo?.renderMode || null

  if (!mapGrid?.length) {
    return <div className="text-white p-4">Loading Map...</div>
  }

  if (renderMode && renderMode !== 'three-lowpoly') {
    return (
      <div className="map-screen-v2">
        <div className="map-scene-area">
          <div className="map-viewport-shell">
            <div className="map-viewport flex items-center justify-center text-white/90">
              <div className="game-card p-4 text-center text-slate-700">
                <div className="text-lg font-black mb-2">地图渲染模式不受支持</div>
                <div className="text-sm font-bold text-slate-500">
                  当前工程已统一切换为 3D 低多边形地图，请检查地图配置。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <ThreeMapLazyErrorBoundary>
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
        encounterZoneLocks={encounterZoneLocks}
      />
    </ThreeMapLazyErrorBoundary>
  )
}

export default memo(GameCanvas)
