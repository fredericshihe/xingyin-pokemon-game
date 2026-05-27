import React, { useCallback, useMemo, useState } from 'react'
import GameCanvas from './GameCanvas'
import {
  ADVENTURE_MAP_CHAIN,
  getAdventureMapInfo,
  getEncounterZoneAt,
  loadAdventureMapGrid
} from './data/overworldMaps'
import { applyMapEventsToGrid, getMapStartPosition } from './data/mapEvents'

const PREVIEW_MAPS = ADVENTURE_MAP_CHAIN

function getPreviewSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function getInitialPreviewMap() {
  const requestedMap = getPreviewSearchParams().get('map')
  return PREVIEW_MAPS.includes(requestedMap) ? requestedMap : 'GodotMapV2'
}

function loadPreviewGrid(mapName) {
  return applyMapEventsToGrid(mapName, loadAdventureMapGrid(mapName))
}

function makeEventLine(type, message) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    message
  }
}

export default function MapRuntimePreview() {
  const initialMapName = useMemo(() => getInitialPreviewMap(), [])
  const perfMode = useMemo(() => getPreviewSearchParams().get('perf') === '1', [])
  const [mapName, setMapName] = useState(initialMapName)
  const [mapGrid, setMapGrid] = useState(() => loadPreviewGrid(initialMapName))
  const [playerPos, setPlayerPos] = useState(() => getMapStartPosition(initialMapName))
  const [zoneName, setZoneName] = useState('')
  const [logs, setLogs] = useState(() => [
    makeEventLine('info', `${initialMapName} runtime preview ready`)
  ])

  const mapInfo = useMemo(() => getAdventureMapInfo(mapName), [mapName])

  const stats = useMemo(() => ({
    size: `${mapInfo.width}x${mapInfo.height}`,
    decorations: mapInfo.decorativeObjects?.length || 0,
    zones: mapInfo.encounterZones?.length || 0,
    events: mapInfo.runtimeEvents?.length || 0
  }), [mapInfo])

  const quickJumps = useMemo(() => {
    const jumps = [
      { id: 'start', label: '起点', position: getMapStartPosition(mapName) }
    ]
    ;(mapInfo.runtimeEvents || []).forEach((event) => {
      if (!['warp', 'fast_travel', 'heal', 'boss'].includes(event.type)) return
      const label = event.type === 'warp'
        ? (event.properties?.label || '连接点').replace(/^前往|返回/, '')
        : event.type === 'fast_travel' ? '快传'
        : event.type === 'heal' ? '泉水' : '首领'
      jumps.push({
        id: event.id,
        label,
        position: {
          x: event.position.x,
          y: event.position.y,
          direction: event.type === 'warp' ? 'right' : 'down'
        }
      })
    })
    return jumps.slice(0, 8)
  }, [mapInfo, mapName])

  const pushLog = useCallback((type, message) => {
    setLogs((current) => [makeEventLine(type, message), ...current].slice(0, 5))
  }, [])

  const switchMap = useCallback((nextMapName) => {
    setMapName(nextMapName)
    setMapGrid(loadPreviewGrid(nextMapName))
    setPlayerPos(getMapStartPosition(nextMapName))
    setZoneName('')
    pushLog('info', `Loaded ${nextMapName}`)
  }, [pushLog])

  const handlePlayerMove = useCallback((nextPos) => {
    setPlayerPos(nextPos)
    const zone = getEncounterZoneAt(mapName, nextPos.x, nextPos.y)
    if (zone?.name) setZoneName(zone.name)
  }, [mapName])

  const jumpTo = useCallback((position, label) => {
    setPlayerPos(position)
    const zone = getEncounterZoneAt(mapName, position.x, position.y)
    setZoneName(zone?.name || '')
    pushLog('jump', `Jumped to ${label} (${position.x}, ${position.y})`)
  }, [mapName, pushLog])

  const handlePreviewWarp = useCallback((warp) => {
    const targetMapName = warp?.target?.mapName
    if (!targetMapName) {
      pushLog('warp', `Warp ${warp?.id || 'unknown'}`)
      return
    }
    setMapName(targetMapName)
    setMapGrid(loadPreviewGrid(targetMapName))
    setPlayerPos(warp.target.position || getMapStartPosition(targetMapName))
    setZoneName('')
    pushLog('warp', `Warp ${mapName} -> ${targetMapName}`)
  }, [mapName, pushLog])

  return (
    <div className={`map-runtime-preview${perfMode ? ' map-runtime-preview--perf' : ''}`}>
      {!perfMode && <header className="map-runtime-preview__bar">
        <div>
          <p className="map-runtime-preview__eyebrow">Map Runtime Preview</p>
          <h1>{mapInfo.displayName || mapName}</h1>
        </div>

        <div className="map-runtime-preview__switcher" role="group" aria-label="地图预览选择">
          {PREVIEW_MAPS.map((id) => (
            <button
              type="button"
              key={id}
              className={id === mapName ? 'is-active' : ''}
              onClick={() => switchMap(id)}
            >
              {id}
            </button>
          ))}
        </div>
      </header>}

      <main className="map-runtime-preview__main">
        <section className="map-runtime-preview__canvas" aria-label="地图画面">
          <GameCanvas
            playerTeam={[]}
            playerPos={playerPos}
            mapGrid={mapGrid}
            onPlayerMove={handlePlayerMove}
            onMapGridChange={setMapGrid}
            useRealMaps
            currentMapName={mapName}
            mapLevel={1}
            onEncounter={(encounter) => pushLog('encounter', `Encounter ${encounter.pokemonId} Lv.${encounter.level}`)}
            onCollect={(type, quantity, ctx) => pushLog('event', `${type} at ${ctx?.tileX ?? '-'},${ctx?.tileY ?? '-'}`)}
            onNavigate={(target) => pushLog('ui', `Open ${target}`)}
            onMapWarp={handlePreviewWarp}
            onZoneEnter={(name) => {
              setZoneName(name)
              pushLog('zone', `Entered ${name}`)
            }}
            encounterCooldownSteps={0}
            onEncounterCooldownChange={() => {}}
            cloudBlocked={false}
            mapActive
          />
        </section>

        {!perfMode && <aside className="map-runtime-preview__panel" aria-label="地图数据">
          <div className="map-runtime-preview__stat-grid">
            <span><strong>{stats.size}</strong><small>尺寸</small></span>
            <span><strong>{stats.decorations}</strong><small>装饰</small></span>
            <span><strong>{stats.zones}</strong><small>遇敌区</small></span>
            <span><strong>{stats.events}</strong><small>事件</small></span>
          </div>

          <div className="map-runtime-preview__position">
            <span>{playerPos.x}, {playerPos.y}</span>
            <small>{zoneName || '安全路径'}</small>
          </div>

          <div className="map-runtime-preview__jumps">
            {quickJumps.map((jump) => (
              <button
                type="button"
                key={jump.id}
                onClick={() => jumpTo(jump.position, jump.label)}
              >
                {jump.label}
              </button>
            ))}
          </div>

          <div className="map-runtime-preview__logs">
            {logs.map((line) => (
              <div key={line.id} className={`map-runtime-preview__log map-runtime-preview__log--${line.type}`}>
                {line.message}
              </div>
            ))}
          </div>
        </aside>}
      </main>
    </div>
  )
}
