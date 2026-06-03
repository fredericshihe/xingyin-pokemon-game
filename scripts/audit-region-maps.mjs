#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const addError = (errors, message) => errors.push(message)

const WALKABLE_ROAD_TILES = new Set([2, 12, 15])
const PASSABLE_REGION_TILES = new Set([0, 2, 8, 12, 13, 15, 16, 17])
const EVENT_BLOCKING_TYPES = new Set(['trainer', 'boss', 'challenge', 'info', 'sign'])
const HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND = 'hidden_zone_unlock'

function positionKey(x, y) {
  return `${x},${y}`
}

function neighbors(point) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ]
}

function collectEventBlockers(map) {
  return new Set(
    (map.runtimeEvents || [])
      .filter((event) => !isHiddenEncounterGateEvent(event))
      .filter((event) => EVENT_BLOCKING_TYPES.has(event.type))
      .map((event) => positionKey(Math.trunc(event.position?.x), Math.trunc(event.position?.y)))
  )
}

function isHiddenEncounterGateEvent(event) {
  return event?.type === 'sign' && event?.properties?.interactionKind === HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND
}

function isPremiumHiddenZone(zone) {
  return zone?.premiumHiddenZone === true && Array.isArray(zone?.levelRange) && zone.levelRange.length >= 2
}

function getZoneLevelBounds(zone, config) {
  if (isPremiumHiddenZone(zone)) {
    const minLevel = Math.max(1, Math.trunc(Number(zone.levelRange[0])) || 1)
    const maxLevel = Math.max(minLevel, Math.trunc(Number(zone.levelRange[1])) || minLevel)
    return { minLevel, maxLevel, source: 'hidden' }
  }
  return { minLevel: config.minLevel, maxLevel: config.maxLevel, source: 'map' }
}

function collectReachableTiles(map, blockedKeys) {
  const start = {
    x: Math.trunc(Number(map.startPosition?.x)),
    y: Math.trunc(Number(map.startPosition?.y))
  }
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) return new Set()

  const queue = [start]
  const seen = new Set([positionKey(start.x, start.y)])

  while (queue.length > 0) {
    const current = queue.shift()
    ;[[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
      const x = current.x + dx
      const y = current.y + dy
      const key = positionKey(x, y)
      if (seen.has(key) || blockedKeys.has(key)) return
      if (!PASSABLE_REGION_TILES.has(map.mapGrid[y]?.[x])) return
      seen.add(key)
      queue.push({ x, y })
    })
  }

  return seen
}

function buildUnlockedHiddenGateAuditMap(map, getHiddenEncounterGatePassageTiles, regionTile) {
  const grid = (map.mapGrid || []).map((row) => Array.isArray(row) ? [...row] : row)
  ;(map.runtimeEvents || [])
    .filter(isHiddenEncounterGateEvent)
    .forEach((event) => {
      const { lockedTiles } = getHiddenEncounterGatePassageTiles(map, map.mapGrid, event, map.runtimeEvents)
      const rawOpenTile = Number(event?.properties?.openTile)
      const openTile = Number.isFinite(rawOpenTile) ? Math.trunc(rawOpenTile) : regionTile.road
      lockedTiles.forEach(({ x, y }) => {
        if (grid[y]?.[x] === undefined) return
        grid[y][x] = openTile
      })
    })
  return { ...map, mapGrid: grid }
}

function hasReachableEncounterTile(map, zone, reachableKeys, blockedKeys) {
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      const key = positionKey(x, y)
      const tile = map.mapGrid[y]?.[x]
      if ([0, 8, 13, 16, 17].includes(tile) && !blockedKeys.has(key) && reachableKeys.has(key)) return true
    }
  }

  return false
}

function sampleOrthogonalSegment([x1, y1], [x2, y2]) {
  const points = []
  if (x1 !== x2 && y1 !== y2) return points
  if (x1 === x2) {
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)
    for (let y = minY; y <= maxY; y += 1) points.push([x1, y])
  } else {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    for (let x = minX; x <= maxX; x += 1) points.push([x, y1])
  }
  return points
}

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { isLevelValidForSpecies } = await loadModule('/src/utils/wildEncounterRules.js')
  const { getHiddenEncounterGatePassageTiles, REGION_MAP_TILE } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')

  const regionMapIds = ADVENTURE_MAP_CHAIN.filter((mapId) => mapId.startsWith('GodotMapV2'))
  const errors = []

  if (regionMapIds.length < 8) {
    addError(errors, `分区地图数量不足，当前 ${regionMapIds.length}`)
  }

  const highestRecommendedLevel = Math.max(
    ...regionMapIds.map((mapId) => Number(getMapConfig(mapId).recommendedLevel) || 0)
  )
  const minimumFinalRecommendedLevel = 50
  if (highestRecommendedLevel < minimumFinalRecommendedLevel) {
    addError(errors, `最高区域推荐等级至少应覆盖 Lv.${minimumFinalRecommendedLevel}，当前 ${highestRecommendedLevel}`)
  }

  const newbieMap = getAdventureMapInfo('GodotMap')
  const hasRegionEntrance = newbieMap.runtimeEvents?.some((event) => (
    event.type === 'warp' && event.target?.mapName === 'GodotMapV2'
  ))
  if (!hasRegionEntrance) {
    addError(errors, '新手山谷缺少进入 GodotMapV2 分区链的连接点')
  }

  const metrics = regionMapIds.map((mapId) => {
    const map = getAdventureMapInfo(mapId)
    const reachabilityMap = buildUnlockedHiddenGateAuditMap(map, getHiddenEncounterGatePassageTiles, REGION_MAP_TILE)
    const config = getMapConfig(mapId)
    const healEvents = (map.runtimeEvents || []).filter((event) => event.type === 'heal')
    const warpEvents = (map.runtimeEvents || []).filter((event) => event.type === 'warp')
    const roadTiles = map.mapGrid.flat().filter((tile) => tile === 12 || tile === 15).length
    const blockedFillTiles = map.mapGrid.flat().filter((tile) => tile === 1).length
    const blockedKeys = collectEventBlockers(map)
    const reachableKeys = collectReachableTiles(reachabilityMap, blockedKeys)

    if (map.width >= 60 || map.height >= 60) {
      addError(errors, `${mapId} 仍然过大：${map.width}x${map.height}`)
    }

    if (map.generationNotes?.roadSingleSource !== true) {
      addError(errors, `${mapId} 必须声明 roadSingleSource=true，确保 roadPaths 同时派生可走格和视觉道路`)
    }

    if (healEvents.length !== 1) {
      addError(errors, `${mapId} 必须恰好有 1 个恢复泉水，当前 ${healEvents.length}`)
    }
    healEvents.forEach((event) => {
      if (Number(event.properties?.goldCost) !== 1 || event.properties?.fullRestore !== true) {
        addError(errors, `${mapId}/${event.id} 恢复泉水必须 1 金币全队满状态恢复`)
      }
      const tile = map.mapGrid[event.position.y]?.[event.position.x]
      if (tile === 1 || tile === 11 || tile == null) {
        addError(errors, `${mapId}/${event.id} 恢复泉水落在不可用地块`)
      }
      const hasReachableNeighbor = neighbors({
        x: Math.trunc(Number(event.position?.x)),
        y: Math.trunc(Number(event.position?.y))
      }).some((neighbor) => reachableKeys.has(positionKey(neighbor.x, neighbor.y)))
      if (!hasReachableNeighbor) {
        addError(errors, `${mapId}/${event.id} 恢复泉水缺少相邻可达格，玩家无法贴近互动`)
      }
    })

    if (mapId !== 'GodotMapV2_BossHighland' && warpEvents.length < 2) {
      addError(errors, `${mapId} 相邻区域连接点过少，当前 ${warpEvents.length}`)
    }
    warpEvents.forEach((event) => {
      if (!ADVENTURE_MAP_CHAIN.includes(event.target?.mapName)) {
        addError(errors, `${mapId}/${event.id} 指向不存在地图 ${event.target?.mapName}`)
      }
    })

    ;(map.visualPaths || []).forEach((path) => {
      const points = path.points || []
      for (let i = 0; i < points.length - 1; i += 1) {
        const [x1, y1] = points[i]
        const [x2, y2] = points[i + 1]
        if (x1 !== x2 && y1 !== y2) {
          addError(errors, `${mapId}/${path.id || 'visualPath'} 存在倾斜道路：${x1},${y1} -> ${x2},${y2}`)
          continue
        }
        for (const [sampleX, sampleY] of sampleOrthogonalSegment([x1, y1], [x2, y2])) {
          const tile = map.mapGrid[sampleY]?.[sampleX]
          if (!WALKABLE_ROAD_TILES.has(tile)) {
            addError(errors, `${mapId}/${path.id || 'visualPath'} 视觉道路中心线 ${sampleX},${sampleY} 不是可走道路格，当前 tile=${tile}`)
            break
          }
        }
      }
    })

    ;(map.encounterZones || []).forEach((zone) => {
      if (!hasReachableEncounterTile(reachabilityMap, zone, reachableKeys, blockedKeys)) {
        addError(errors, `${mapId}/${zone.id} 缺少可达的草丛/野外遭遇格`)
      }

      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      if (!table) {
        addError(errors, `${mapId}/${zone.id} 缺少遇敌表 ${zone.encounterTableId}`)
        return
      }
      const bounds = getZoneLevelBounds(zone, config)
      table.pokemon.forEach((entry) => {
        if (entry.minLevel < bounds.minLevel || entry.maxLevel > bounds.maxLevel) {
          addError(errors, `${mapId}/${zone.encounterTableId} 等级 ${entry.minLevel}-${entry.maxLevel} 超出${bounds.source === 'hidden' ? '隐藏区' : '地图'} ${bounds.minLevel}-${bounds.maxLevel}`)
        }
        let hasValidLevel = false
        for (let level = entry.minLevel; level <= entry.maxLevel; level += 1) {
          if (isLevelValidForSpecies(entry.id, level)) {
            hasValidLevel = true
            break
          }
        }
        if (!hasValidLevel) {
          addError(errors, `${mapId}/${zone.encounterTableId} 宝可梦 ${entry.id} 在 ${entry.minLevel}-${entry.maxLevel} 没有合法等级`)
        }
      })
    })

    return {
      mapId,
      size: `${map.width}x${map.height}`,
      recommendedLevel: config.recommendedLevel,
      levelRange: `${config.minLevel}-${config.maxLevel}`,
      decorations: map.decorativeObjects?.length || 0,
      roadTiles,
      blockedFillTiles,
      warps: warpEvents.length,
      healSprings: healEvents.length,
      encounterZones: map.encounterZones?.length || 0
    }
  })

  console.log('Region map audit')
  metrics.forEach((row) => {
    console.log(`- ${row.mapId}: ${row.size}, Lv.${row.recommendedLevel} (${row.levelRange}), decorations=${row.decorations}, road=${row.roadTiles}, filled=${row.blockedFillTiles}, warps=${row.warps}, springs=${row.healSprings}, zones=${row.encounterZones}`)
  })

  if (errors.length > 0) {
    console.error('\nErrors:')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('\nRegion map audit passed.')
})
