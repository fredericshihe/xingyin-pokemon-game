import React, { useCallback, useMemo, useState } from 'react'
import '../game.css'
import EliteFourCeremonyOverlay from '../components/Game/EliteFourCeremonyOverlay'
import EliteUnlockMinigameOverlay from '../components/Game/EliteUnlockMinigameOverlay'
import GameCanvas from './GameCanvas'
import { createEliteFourCeremony } from './data/eliteFourCeremony'
import { ELITE_UNLOCK_TASKS, ELITE_UNLOCK_TASK_BY_ID } from './data/longTermProgression'
import {
  ADVENTURE_MAP_CHAIN,
  getAdventureMapInfo,
  getEncounterZoneAt,
  loadAdventureMapGrid
} from './data/overworldMaps'
import { applyMapEventsToGrid, getMapStartPosition } from './data/mapEvents'
import { getEliteRouteStepAsideTile } from './eliteRouteBlocker'

const PREVIEW_MAPS = ADVENTURE_MAP_CHAIN
const PREVIEW_EVENT_PRIORITY = {
  heal: 1,
  objective: 2,
  trainer: 2,
  boss: 3,
  challenge: 3,
  warp: 4,
  fast_travel: 5
}

function getPreviewJumpPosition(event, routeCleared = false) {
  const interactionPosition = routeCleared
    ? getEliteRouteStepAsideTile(event) || event?.position
    : event?.position
  const x = Number(interactionPosition?.x)
  const y = Number(interactionPosition?.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return event?.position
  if (!['trainer', 'boss'].includes(event.type)) {
    return { x, y, direction: event.type === 'warp' ? 'right' : 'down' }
  }

  const facing = event.properties?.facing || 'down'
  const approaches = {
    up: { x, y: y - 1, direction: 'down' },
    down: { x, y: y + 1, direction: 'up' },
    left: { x: x - 1, y, direction: 'right' },
    right: { x: x + 1, y, direction: 'left' }
  }
  return approaches[facing] || approaches.down
}

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
  const previewRouteCleared = useMemo(() => getPreviewSearchParams().get('routeState') === 'cleared', [])
  const initialCeremonyPhase = useMemo(() => {
    const phase = getPreviewSearchParams().get('ceremony')
    return ['entry', 'victory'].includes(phase) ? phase : null
  }, [])
  const [mapName, setMapName] = useState(initialMapName)
  const [mapGrid, setMapGrid] = useState(() => loadPreviewGrid(initialMapName))
  const [playerPos, setPlayerPos] = useState(() => getMapStartPosition(initialMapName))
  const [sceneRevision, setSceneRevision] = useState(0)
  const [zoneName, setZoneName] = useState('')
  const [previewCeremony, setPreviewCeremony] = useState(() => (
    initialCeremonyPhase ? createEliteFourCeremony(initialMapName, initialCeremonyPhase) : null
  ))
  const [previewMinigame, setPreviewMinigame] = useState(() => {
    const task = ELITE_UNLOCK_TASK_BY_ID[getPreviewSearchParams().get('minigame')]
    return task?.minigame ? task : null
  })
  const [logs, setLogs] = useState(() => [
    makeEventLine('info', `${initialMapName} runtime preview ready`)
  ])

  const mapInfo = useMemo(() => getAdventureMapInfo(mapName), [mapName])
  const previewMapEventVisualState = useMemo(() => {
    if (!previewRouteCleared) return {}
    return Object.fromEntries(
      (mapInfo.runtimeEvents || [])
        .filter((event) => event.properties?.blocksRouteUntilDefeated === true)
        .map((event) => [event.id, {
          status: event.type === 'boss' ? 'completed' : 'cleared',
          eventType: event.type,
          role: event.properties?.role
        }])
    )
  }, [mapInfo, previewRouteCleared])

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
    ;[...(mapInfo.runtimeEvents || [])]
      .filter((event) => PREVIEW_EVENT_PRIORITY[event.type] != null)
      .sort((left, right) => PREVIEW_EVENT_PRIORITY[left.type] - PREVIEW_EVENT_PRIORITY[right.type])
      .forEach((event) => {
      if (!['warp', 'fast_travel', 'heal', 'objective', 'trainer', 'boss', 'challenge'].includes(event.type)) return
      const label = event.type === 'warp'
        ? (event.properties?.label || '连接点').replace(/^前往|返回/, '')
        : event.type === 'fast_travel' ? '快传'
        : event.type === 'heal' ? '泉水'
        : event.type === 'objective' ? (event.properties?.stepName || event.properties?.taskTitle || '任务机关')
        : event.type === 'trainer' ? (event.properties?.name || '部下')
        : event.type === 'challenge' ? (event.properties?.name || '挑战')
        : '首领'
      jumps.push({
        id: event.id,
        label,
        position: getPreviewJumpPosition(event, previewRouteCleared)
      })
      })
    return jumps.slice(0, 20)
  }, [mapInfo, mapName, previewRouteCleared])

  const previewMinigames = useMemo(() => (
    ELITE_UNLOCK_TASKS.filter((task) => task.mapId === mapName && task.minigame)
  ), [mapName])

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
    setSceneRevision((current) => current + 1)
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

  const handlePreviewCollect = useCallback((type, quantity, ctx) => {
    pushLog('event', `${type} at ${ctx?.tileX ?? '-'},${ctx?.tileY ?? '-'}`)
  }, [pushLog])

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
            key={`${mapName}:${sceneRevision}`}
            playerTeam={[]}
            playerPos={playerPos}
            mapGrid={mapGrid}
            onPlayerMove={handlePlayerMove}
            onMapGridChange={setMapGrid}
            useRealMaps
            currentMapName={mapName}
            currentMapBossCompleted={previewRouteCleared}
            mapEventVisualState={previewMapEventVisualState}
            mapLevel={1}
            onEncounter={(encounter) => pushLog('encounter', `Encounter ${encounter.pokemonId} Lv.${encounter.level}`)}
            onCollect={handlePreviewCollect}
            onNavigate={(target) => pushLog('ui', `Open ${target}`)}
            onMapWarp={handlePreviewWarp}
            onZoneEnter={(name) => {
              setZoneName(name)
              pushLog('zone', `Entered ${name}`)
            }}
            encounterCooldownSteps={0}
            onEncounterCooldownChange={() => {}}
            cloudBlocked={Boolean(previewMinigame)}
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

          {previewMinigames.length > 0 && (
            <div className="map-runtime-preview__jumps" aria-label="小游戏安全预览">
              {previewMinigames.map((task) => (
                <button type="button" key={task.id} onClick={() => setPreviewMinigame(task)}>
                  {task.title}
                </button>
              ))}
            </div>
          )}

          <div className="map-runtime-preview__logs">
            {logs.map((line) => (
              <div key={line.id} className={`map-runtime-preview__log map-runtime-preview__log--${line.type}`}>
                {line.message}
              </div>
            ))}
          </div>
        </aside>}
      </main>

      <EliteFourCeremonyOverlay
        ceremony={previewCeremony}
        onComplete={(ceremonyId) => {
          setPreviewCeremony((current) => current?.id === ceremonyId ? null : current)
        }}
      />
      {previewMinigame && (
        <EliteUnlockMinigameOverlay
          key={previewMinigame.id}
          task={previewMinigame}
          onCommit={async () => true}
          onClose={() => setPreviewMinigame(null)}
        />
      )}
    </div>
  )
}
