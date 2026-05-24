import { MONSTERS } from '../../utils/gameData'
import { ENCOUNTER_TABLES } from './encounterTables'
import { MAP_EVENT_LABELS, KNOWN_MAP_EVENT_TYPES, getMapEventTile } from './mapEventTypes'
import {
  MAP_CHAIN,
  getMapConfigData,
  getMapInfo,
  getMapSourceData
} from './mapCatalog'

export const MAP_TILE_LABELS = Object.freeze({
  0: '草地',
  1: '阻挡',
  2: '传送点',
  3: '道具',
  5: '恢复泉水',
  6: '路牌',
  7: '训练师',
  8: '高草丛',
  10: '挑战点',
  11: '水域',
  12: '道路',
  13: '沙地',
  15: '桥',
  16: '花地',
  17: '浅草',
  21: '快速传送台'
})

export const MAP_BLOCKED_TILES = new Set([1, 5, 6, 11, 14, 18, 20])

export const MAP_MANAGEMENT_POLICY = Object.freeze({
  default: {
    requiredHealCount: 1,
    maxHealCount: 1,
    minEncounterZones: 3,
    requireSigns: true
  },
  maps: {
    GodotMap: {
      // 当前新手山谷仍是 44x36 入门区，恢复泉水尚未接入。
      // 想统一成所有地图都有泉水时，只改这里和地图事件即可。
      requiredHealCount: 0,
      maxHealCount: 1,
      minEncounterZones: 5,
      requireSigns: true
    }
  }
})

function getMonsterName(id) {
  return MONSTERS.find((monster) => monster.id === id)?.name || `#${id}`
}

function getPolicy(mapId) {
  return {
    ...MAP_MANAGEMENT_POLICY.default,
    ...(MAP_MANAGEMENT_POLICY.maps[mapId] || {})
  }
}

function inBounds(mapInfo, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) &&
    x >= 0 && y >= 0 && x < mapInfo.width && y < mapInfo.height
}

function countTilesInZone(mapInfo, zone, targetTile) {
  let count = 0
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if (mapInfo.mapGrid[y]?.[x] === targetTile) count += 1
    }
  }
  return count
}

function makeCoordinateKey(position) {
  return `${position.x},${position.y}`
}

function summarizeEncounterTable(tableId) {
  const table = ENCOUNTER_TABLES[tableId]
  if (!table) {
    return {
      id: tableId,
      exists: false,
      species: [],
      speciesCount: 0,
      minLevel: null,
      maxLevel: null
    }
  }

  const species = table.pokemon.map((entry) => ({
    id: entry.id,
    name: getMonsterName(entry.id),
    minLevel: Number(entry.minLevel ?? entry.level ?? 1),
    maxLevel: Number(entry.maxLevel ?? entry.level ?? entry.minLevel ?? 1),
    weight: Number(entry.weight) || 0
  }))

  return {
    id: tableId,
    exists: true,
    baseRate: table.baseRate,
    tallGrassRate: table.tallGrassRate,
    safeStepsAfterBattle: table.safeStepsAfterBattle,
    species,
    speciesCount: species.length,
    minLevel: species.length ? Math.min(...species.map((entry) => entry.minLevel)) : null,
    maxLevel: species.length ? Math.max(...species.map((entry) => entry.maxLevel)) : null
  }
}

function collectEvents(mapInfo) {
  const events = Array.isArray(mapInfo.runtimeEvents) ? mapInfo.runtimeEvents : []
  return events.map((event) => {
    const x = Math.trunc(Number(event.position?.x))
    const y = Math.trunc(Number(event.position?.y))
    const tile = mapInfo.mapGrid[y]?.[x]
    const eventTile = getMapEventTile(event.type)
    return {
      id: event.id,
      type: event.type,
      label: MAP_EVENT_LABELS[event.type] || event.type,
      x,
      y,
      coordinate: `${x},${y}`,
      knownType: KNOWN_MAP_EVENT_TYPES.has(event.type),
      inBounds: inBounds(mapInfo, x, y),
      baseTile: tile,
      baseTileLabel: MAP_TILE_LABELS[tile] || String(tile),
      eventTile,
      eventTileLabel: MAP_TILE_LABELS[eventTile] || String(eventTile),
      baseBlocked: MAP_BLOCKED_TILES.has(tile),
      properties: event.properties || {},
      target: event.target || null
    }
  })
}

function collectSigns(mapInfo, events) {
  const eventSigns = events
    .filter((event) => event.type === 'sign' || event.type === 'info')
    .map((event) => ({
      id: event.id,
      source: 'runtimeEvents',
      x: event.x,
      y: event.y,
      coordinate: event.coordinate,
      message: event.properties?.message || ''
    }))

  const eventSignKeys = new Set(eventSigns.map((sign) => sign.coordinate))
  const staticSigns = Object.entries(mapInfo.signs || {}).map(([coordinate, message]) => {
    const [x, y] = coordinate.split(',').map((value) => Math.trunc(Number(value)))
    return {
      id: `static_sign_${coordinate}`,
      source: eventSignKeys.has(coordinate) ? 'runtimeEvents+signs' : 'signs',
      x,
      y,
      coordinate,
      message
    }
  })

  const signByKey = new Map()
  ;[...eventSigns, ...staticSigns].forEach((sign) => {
    const existing = signByKey.get(sign.coordinate)
    if (existing) {
      signByKey.set(sign.coordinate, {
        ...existing,
        source: `${existing.source}+${sign.source}`,
        message: existing.message || sign.message
      })
      return
    }
    signByKey.set(sign.coordinate, sign)
  })

  return [...signByKey.values()].map((sign) => {
    const tile = mapInfo.mapGrid[sign.y]?.[sign.x]
    return {
      ...sign,
      inBounds: inBounds(mapInfo, sign.x, sign.y),
      baseTile: tile,
      baseTileLabel: MAP_TILE_LABELS[tile] || String(tile),
      baseBlocked: MAP_BLOCKED_TILES.has(tile)
    }
  })
}

function collectEncounterZones(mapInfo) {
  return (mapInfo.encounterZones || []).map((zone) => {
    const table = summarizeEncounterTable(zone.encounterTableId)
    return {
      ...zone,
      table,
      inBounds: inBounds(mapInfo, zone.x, zone.y) &&
        inBounds(mapInfo, zone.x + zone.width - 1, zone.y + zone.height - 1),
      tallGrassTiles: countTilesInZone(mapInfo, zone, 8),
      totalTiles: zone.width * zone.height
    }
  })
}

function groupEventsByType(events) {
  return events.reduce((acc, event) => {
    acc[event.type] = (acc[event.type] || 0) + 1
    return acc
  }, {})
}

export function getManagedMapRecord(mapId) {
  const mapInfo = getMapInfo(mapId)
  const config = getMapConfigData(mapId)
  const sources = getMapSourceData(mapId)
  const policy = getPolicy(mapId)
  const events = collectEvents(mapInfo)
  const healPoints = events.filter((event) => event.type === 'heal')
  const signs = collectSigns(mapInfo, events)
  const encounterZones = collectEncounterZones(mapInfo)
  const encounterTables = [...new Map(
    encounterZones.map((zone) => [zone.table.id, zone.table])
  ).values()]
  const species = [...new Map(
    encounterTables.flatMap((table) => table.species).map((entry) => [entry.id, {
      id: entry.id,
      name: entry.name
    }])
  ).values()].sort((a, b) => a.id - b.id)

  return {
    id: mapId,
    displayName: mapInfo.displayName || mapInfo.name || mapId,
    width: mapInfo.width,
    height: mapInfo.height,
    renderMode: mapInfo.renderMode,
    sources,
    policy,
    config,
    startPosition: mapInfo.startPosition,
    events,
    eventCounts: groupEventsByType(events),
    healPoints,
    signs,
    encounterZones,
    encounterTables,
    species,
    summary: {
      eventCount: events.length,
      healCount: healPoints.length,
      signCount: signs.length,
      encounterZoneCount: encounterZones.length,
      encounterTableCount: encounterTables.length,
      speciesCount: species.length
    }
  }
}

export function getManagedMapRecords() {
  return MAP_CHAIN.map((mapId) => getManagedMapRecord(mapId))
}

export function getMapManagementIndex() {
  const records = getManagedMapRecords()
  return {
    mapCount: records.length,
    maps: records,
    eventTypes: Object.values(MAP_EVENT_LABELS).length,
    encounterTableIds: [...new Set(records.flatMap((record) =>
      record.encounterTables.map((table) => table.id)
    ))].sort()
  }
}
