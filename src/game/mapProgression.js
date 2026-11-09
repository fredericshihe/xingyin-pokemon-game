import { MAP_CHAIN, getMapConfigData, getMapInfo, hasMap } from './data/mapCatalog.js'
import { getPlayerAverageLevel } from '../utils/gameBalance.js'

const eventsFor = (mapId) => getMapInfo(mapId)?.runtimeEvents || []
const bossFor = (mapId) => eventsFor(mapId).find((event) => event.type === 'boss')
const eventIdCounts = new Map()
MAP_CHAIN.forEach((mapId) => eventsFor(mapId).forEach((event) => {
  eventIdCounts.set(event.id, (eventIdCounts.get(event.id) || 0) + 1)
}))

function hasCompletedEvent(world, key, mapId, eventId) {
  const ids = Array.isArray(world?.[key]) ? world[key] : []
  return ids.includes(`${mapId}:${eventId}`) || (
    (eventIdCounts.get(eventId) || 0) <= 1 && ids.includes(eventId)
  )
}

// Every forward route uses the complete chapter prefix. Checking only the
// source chapter lets incomplete older saves bypass earlier bosses via a shortcut.
export function getForwardMapBossGate({ currentMapName, targetMapName, world }) {
  const currentIndex = MAP_CHAIN.indexOf(currentMapName)
  const targetIndex = MAP_CHAIN.indexOf(targetMapName)
  if (targetIndex <= 0 || (currentIndex >= 0 && targetIndex <= currentIndex)) return null

  const requiredMapId = MAP_CHAIN.slice(0, targetIndex).find((mapId) => {
    const boss = bossFor(mapId)
    return boss && !hasCompletedEvent(world, 'defeatedBossIds', mapId, boss.id)
  })
  if (!requiredMapId) return null
  const config = getMapConfigData(requiredMapId)
  const boss = bossFor(requiredMapId)
  return {
    mapId: requiredMapId,
    bossId: boss.id,
    bossName: boss.properties?.name || `${config.displayName}首领`,
    mapName: config.displayName
  }
}

export function getWarpEventLockState({ currentMapName, warpEvent, world, playerTeam }) {
  const props = warpEvent?.properties || {}
  const requiredTrainerIds = (Array.isArray(props.requiredTrainerIds)
    ? props.requiredTrainerIds
    : [props.requiredTrainerIds]).filter((id) => typeof id === 'string' && id.length > 0)
  const requiredAverageLevel = Math.max(0, Math.trunc(Number(props.requiredAverageLevel) || 0))
  const destinationLabel = getMapConfigData(warpEvent?.target?.mapName)?.displayName ||
    String(props.label || '').replace(/^前往/u, '').trim() || '下一张地图'
  const missingTrainerCount = requiredTrainerIds.filter((id) =>
    !hasCompletedEvent(world, 'defeatedTrainerIds', currentMapName, id)).length
  const levelLocked = requiredAverageLevel > 0 && getPlayerAverageLevel(playerTeam, 1) < requiredAverageLevel
  if (!levelLocked && missingTrainerCount === 0) return { locked: false, reason: '' }

  const explicitText = typeof props.lockedText === 'string' ? props.lockedText.trim() : ''
  if (explicitText) return { locked: true, reason: explicitText }
  const requirements = []
  if (levelLocked) requirements.push(`队伍平均等级达到 Lv.${requiredAverageLevel}`)
  if (missingTrainerCount > 0) requirements.push(missingTrainerCount === requiredTrainerIds.length
    ? `先击败 ${requiredTrainerIds.length} 位训练家`
    : `还需击败 ${missingTrainerCount} 位训练家`)
  return { locked: true, reason: `${requirements.join('，且')}，才能前往${destinationLabel}。` }
}

// Fast travel and chapter status share this gate. Earlier chapters remain
// available for retreat even when an older save is missing completion records.
export function getFastTravelMapLockState({ targetMapName, currentMapName, world, playerTeam }) {
  if (!targetMapName || !hasMap(targetMapName)) return { locked: true, reason: '道路未开放。' }
  if (targetMapName === currentMapName) return { locked: false, current: true, reason: '当前所在区域' }
  const targetIndex = MAP_CHAIN.indexOf(targetMapName)
  const currentIndex = MAP_CHAIN.indexOf(currentMapName)
  if (targetIndex === 0 || (currentIndex >= 0 && targetIndex < currentIndex)) {
    return { locked: false, reason: '' }
  }

  const bossGate = getForwardMapBossGate({ currentMapName, targetMapName, world })
  if (bossGate) return {
    locked: true,
    reason: `先击败${bossGate.mapName}的${bossGate.bossName}，才能前往${getMapConfigData(targetMapName).displayName}。`
  }

  const entranceStates = MAP_CHAIN.slice(0, targetIndex).flatMap((mapId) => eventsFor(mapId)
    .filter((event) => event.type === 'warp' && event.target?.mapName === targetMapName)
    .map((warpEvent) => getWarpEventLockState({ currentMapName: mapId, warpEvent, world, playerTeam })))
  if (entranceStates.some((state) => !state.locked)) return { locked: false, reason: '' }
  const reasons = [...new Set(entranceStates.map((state) => state.reason).filter(Boolean))]
  return { locked: true, reason: reasons.length > 1 ? `满足其一：${reasons.join(' / ')}` : reasons[0] || '道路未开放。' }
}
