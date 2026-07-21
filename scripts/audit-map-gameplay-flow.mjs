#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const BLOCKED_TILES = new Set([1, 5, 6, 11, 14, 18, 20])
const STEP_ON_EVENT_TYPES = new Set(['item', 'pickup', 'fast_travel'])
const ADJACENT_EVENT_TYPES = new Set(['warp', 'heal', 'sign', 'info', 'trainer', 'boss', 'challenge'])
const NPC_EVENT_TYPES = new Set(['trainer', 'boss'])
const ACTIVE_ITEM_TYPES = new Set(['pokeball', 'potion', 'expPotion', 'statBoost'])
const ROAD_END_MEANINGFUL_EVENT_TYPES = new Set(['warp', 'fast_travel', 'item', 'pickup', 'heal', 'trainer', 'boss', 'challenge'])
const TALL_GRASS_TILE = 8
const ROAD_TILE = 12
const BRIDGE_TILE = 15
const ROAD_CONNECTION_TILES = new Set([2, 5, 6, ROAD_TILE])
const SIGN_ROADSIDE_TILES = new Set([2, ROAD_TILE, BRIDGE_TILE])
const ROAD_CENTERLINE_BLOCK_DISTANCE = 1.05
const NPC_MIN_DISTANCE = 6
const SIGN_MIN_DISTANCE = 4
const SIGN_MESSAGE_MAX_LENGTH = 28
const ITEM_MIN_DISTANCE = 4
const ITEM_NPC_MIN_DISTANCE = 4
const ITEM_LANDMARK_MIN_DISTANCE = 3
const REGION_SIGN_MAX_COUNT = 6
const ROAD_END_EVENT_RADIUS = 3
const ROAD_END_MIN_GRASS_TILES = 10
const ROAD_END_MIN_FOREST_TILES = 10
const ROAD_END_MAX_OPEN_GROUND_TILES = 8
const OPEN_GROUND_TILES = new Set([0, 13, 16, 17])
const NPC_FACING_TARGET_TILES = new Set([0, 2, 8, 12, 13, 15, 16, 17])
const SPRING_VEGETATION_TILES = new Set([0, TALL_GRASS_TILE, 16, 17])
const FIXED_LANDMARK_CLEARANCE_RADIUS = {
  heal: 2.25,
  challenge: 2.25
}
const HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND = 'hidden_zone_unlock'
const ELITE_DOJO_MAP_IDS = new Set([
  'GodotMapV2_FrostDojo',
  'GodotMapV2_TideDojo',
  'GodotMapV2_IronDojo',
  'GodotMapV2_DragonDojo'
])
const CHAMPION_TOWER_MAP_ID = 'GodotMapV2_ChampionTower'
const REQUIRED_ADVENTURE_MAP_IDS = [
  'GodotMap',
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland',
  ...ELITE_DOJO_MAP_IDS
]
const LEGACY_DECORATIVE_ASSET_ALIASES = {
  'grass-small': 'nature_grass_small',
  'grass-large': 'nature_grass_large',
  'flower-yellow': 'nature_flower_yellow',
  'flower-red': 'nature_flower_red',
  'mushroom-red': 'nature_mushroom_red',
  'tree-oak': 'nature_tree_oak',
  'tree-default': 'nature_tree_default',
  'tree-pine': 'nature_tree_pine',
  'bush-large': 'nature_bush_large',
  'rock-large': 'nature_rock_large',
  'stone-large': 'nature_stone_large'
}
const LEGACY_LOW_VEGETATION_DECOR_TYPES = new Set([
  'grass-small',
  'grass-large',
  'flower-yellow',
  'flower-red',
  'mushroom-red',
  'wetland_reed_clump'
])
const LOW_VEGETATION_TAGS = new Set(['grass', 'flower', 'mushroom', 'reed'])
const DECORATIVE_FOOTPRINT_OVERRIDES = {
  nature_fence_simple: { width: 2, height: 1 },
  nature_fence_planks: { width: 2, height: 1 },
  nature_log_stack: { width: 2, height: 1.2 },
  nature_rock_small_h: { width: 1.15, height: 1.15 },
  nature_stump_round_detailed: { width: 1.15, height: 1.15 },
  town_hedge: { width: 2, height: 1 },
  town_hedge_large: { width: 2.4, height: 1.2 },
  town_rock_small: { width: 1.15, height: 1.15 },
  pirate_boat_row_large: { width: 2.1, height: 3 },
  pirate_palm_detailed_straight: { width: 1.6, height: 1.6 },
  pirate_rocks_sand_a: { width: 1.25, height: 1.15 },
  pirate_rocks_sand_b: { width: 1.25, height: 1.15 },
  pirate_rocks_sand_c: { width: 1.25, height: 1.15 },
  pirate_patch_sand_foliage: { width: 1.2, height: 1 },
  pirate_ship_wreck: { width: 3.8, height: 2.2 },
  shore_dock_small: { width: 3, height: 2 },
  shore_rowboat: { width: 2, height: 3 },
  town_windmill: { width: 3.2, height: 3.2 },
  town_watermill: { width: 3, height: 2.8 },
  hex_building_farm: { width: 3, height: 2.6 },
  hex_building_mine: { width: 3, height: 2.6 },
  hex_building_cabin: { width: 2.6, height: 2.4 },
  hex_building_market: { width: 3, height: 2.6 },
  hex_grass_forest: { width: 1.4, height: 1.4 },
  hex_unit_tree: { width: 1.35, height: 1.35 },
  hex_water_rocks: { width: 1.35, height: 1.25 },
  platformer_platform_overhang: { width: 1.4, height: 1.2 },
  survival_rock_a: { width: 1.2, height: 1.2 },
  survival_rock_b: { width: 1.2, height: 1.2 },
  survival_rock_c: { width: 1.2, height: 1.2 },
  survival_metal_panel: { width: 1.4, height: 1 },
  survival_tool_axe: { width: 1.1, height: 0.9 },
  survival_tool_pickaxe: { width: 1.1, height: 0.9 }
}
const PATH_BLOCKING_DECORATION_TYPES = new Set([
  'nature_fence_simple',
  'nature_fence_planks',
  'nature_log_stack',
  'nature_rock_small_h',
  'nature_stump_round_detailed',
  'nature_tent_detailed_open',
  'town_cart',
  'town_hedge',
  'town_hedge_large',
  'town_rock_small',
  'town_stall_red',
  'town_tree',
  'town_tree_high',
  'pirate_barrel',
  'pirate_crate',
  'pirate_chest',
  'pirate_flag',
  'pirate_flag_pennant',
  'pirate_mast',
  'pirate_palm_detailed_straight',
  'pirate_rocks_sand_a',
  'pirate_rocks_sand_b',
  'pirate_rocks_sand_c',
  'pirate_patch_sand_foliage',
  'pirate_structure_fence',
  'pirate_cannon',
  'survival_barrel',
  'survival_box',
  'survival_chest',
  'survival_fence',
  'survival_resource_wood',
  'survival_resource_planks',
  'survival_rock_a',
  'survival_rock_b',
  'survival_rock_c',
  'survival_tent',
  'survival_tool_axe',
  'survival_tool_pickaxe',
  'survival_workbench',
  'grave_gravestone_round',
  'grave_gravestone_broken',
  'grave_gravestone_cross',
  'grave_cross_wood',
  'grave_rocks',
  'grave_coffin_old',
  'grave_bench_damaged',
  'grave_iron_fence_border',
  'grave_stone_wall_damaged',
  'platformer_rocks',
  'platformer_stones',
  'platformer_barrel',
  'platformer_crate',
  'platformer_chest',
  'platformer_fence_straight',
  'platformer_fence_low_straight',
  'platformer_hedge',
  'platformer_platform_overhang',
  'platformer_tree_pine',
  'mine_crate_strong',
  'ridge_block_grass_edge',
  'hex_stone_rocks',
  'hex_stone_hill',
  'hex_grass_forest',
  'hex_unit_tree',
  'hex_water_rocks',
  'hex_building_farm',
  'hex_building_mine',
  'hex_building_cabin',
  'hex_building_market'
])

const add = (list, message) => list.push(message)
const key = (x, y) => `${x},${y}`
const FACING_OFFSETS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
}
const SIGN_ROTATION_FACINGS = {
  up: 0,
  down: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2
}
const SIGN_ALLOWED_FACINGS = new Set(['down', 'left', 'right'])
const SIGN_CONTEXT_TERMS = [
  'Lv.',
  '入口',
  '出口',
  '通往',
  '东去',
  '西回',
  '南去',
  '北回',
  '泉水',
  '草丛',
  '生态',
  '试炼',
  '战斗',
  '快速传送',
  '道路',
  '岔路'
]
const TEMPLATE_SIGN_PHRASES = [
  '阅读线索牌、击败 3 名部下训练师后',
  '战斗提醒：这里野生宝可梦约',
  '不同草丛会出现不同宝可梦'
]

function inBounds(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height
}

function isWalkableTile(tile) {
  return tile != null && !BLOCKED_TILES.has(tile)
}

function distanceToSegment(tileX, tileY, start, end) {
  const [ax, ay] = start
  const [bx, by] = end
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  const t = lenSq <= 0
    ? 0
    : Math.max(0, Math.min(1, ((tileX - ax) * dx + (tileY - ay) * dy) / lenSq))
  const px = ax + dx * t
  const py = ay + dy * t
  return Math.hypot(tileX - px, tileY - py)
}

function distanceToVisualRoads(map, tileX, tileY) {
  return (map.visualPaths || []).reduce((best, path) => {
    const points = path.points || []
    for (let index = 0; index < points.length - 1; index += 1) {
      best = Math.min(best, distanceToSegment(tileX, tileY, points[index], points[index + 1]))
    }
    return best
  }, Infinity)
}

function getDecorativeAsset(type, catalog) {
  return catalog[type] || catalog[LEGACY_DECORATIVE_ASSET_ALIASES[type]] || null
}

function isRuntimeEventDecoration(object) {
  return Boolean(object?.eventId || object?.eventType || object?.fixedSceneEventType)
}

function isHiddenEncounterGateEvent(event) {
  return event?.type === 'sign' && event?.properties?.interactionKind === HIDDEN_ENCOUNTER_GATE_INTERACTION_KIND
}

function isHiddenZoneRuleDecoration(object) {
  return Boolean(object?.hiddenZonePerimeter || object?.hiddenZoneCorner || object?.hiddenGateMarker || object?.hiddenGateEntranceBlocker)
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
  return {
    minLevel: Math.max(1, Math.trunc(Number(config.minLevel || 1)) || 1),
    maxLevel: Math.max(1, Math.trunc(Number(config.maxLevel || config.minLevel || 1)) || 1),
    source: 'map'
  }
}

function isPathBlockingDecoration(object, catalog) {
  if (isRuntimeEventDecoration(object)) return false
  if (isHiddenZoneRuleDecoration(object)) return false
  const asset = getDecorativeAsset(object?.type, catalog)
  return Boolean(
    DECORATIVE_FOOTPRINT_OVERRIDES[object?.type] ||
    PATH_BLOCKING_DECORATION_TYPES.has(object?.type) ||
    asset?.defaultBlocking
  )
}

function getDecorationFootprint(object, catalog, padding = 0) {
  const asset = getDecorativeAsset(object?.type, catalog)
  const override = DECORATIVE_FOOTPRINT_OVERRIDES[object?.type]
  const baseWidth = Number(override?.width ?? asset?.footprint?.width ?? 1)
  const baseHeight = Number(override?.height ?? asset?.footprint?.height ?? 1)
  const scale = Math.max(0.45, Number(object?.scale ?? asset?.defaultScale ?? 1) || 1)
  return {
    width: Math.max(0.72, baseWidth * scale + padding * 2),
    height: Math.max(0.72, baseHeight * scale + padding * 2)
  }
}

function isInsideDecorationFootprint(object, catalog, x, y, padding = 0) {
  const centerX = Number(object?.x)
  const centerY = Number(object?.y)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return false
  const rotation = Number(object?.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - centerX
  const dy = y - centerY
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  const footprint = getDecorationFootprint(object, catalog, padding)
  return (
    Math.abs(localX) <= footprint.width / 2 &&
    Math.abs(localY) <= footprint.height / 2
  )
}

function getDecorationFootprintCells(map, object, catalog, padding = 0) {
  const centerX = Number(object?.x)
  const centerY = Number(object?.y)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return []
  const footprint = getDecorationFootprint(object, catalog, padding)
  const radius = Math.ceil(Math.max(footprint.width, footprint.height) / 2 + 1)
  const cells = []
  const seen = new Set()

  for (let y = Math.floor(centerY) - radius; y <= Math.ceil(centerY) + radius; y += 1) {
    for (let x = Math.floor(centerX) - radius; x <= Math.ceil(centerX) + radius; x += 1) {
      if (!inBounds(map, x, y)) continue
      if (!isInsideDecorationFootprint(object, catalog, x, y, padding)) continue
      const cellKey = key(x, y)
      if (seen.has(cellKey)) continue
      seen.add(cellKey)
      cells.push({ x, y })
    }
  }

  return cells
}

function isLowVegetationDecorationType(type, catalog) {
  if (LEGACY_LOW_VEGETATION_DECOR_TYPES.has(type)) return true
  const asset = getDecorativeAsset(type, catalog)
  if (!asset?.decorativeOnly) return false
  return (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag))
}

function neighbors(point) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ]
}

function reachableTerrain(map) {
  const start = map.startPosition
  const visited = new Set()
  const queue = []

  if (inBounds(map, start?.x, start?.y) && isWalkableTile(map.mapGrid[start.y]?.[start.x])) {
    visited.add(key(start.x, start.y))
    queue.push({ x: start.x, y: start.y })
  }

  while (queue.length > 0) {
    const point = queue.shift()
    for (const next of neighbors(point)) {
      if (!inBounds(map, next.x, next.y)) continue
      if (!isWalkableTile(map.mapGrid[next.y]?.[next.x])) continue
      const nextKey = key(next.x, next.y)
      if (visited.has(nextKey)) continue
      visited.add(nextKey)
      queue.push(next)
    }
  }

  return visited
}

function buildUnlockedHiddenGateAuditMap(map, getHiddenEncounterGatePassageTiles, regionTile) {
  const grid = (map.mapGrid || []).map((row) => Array.isArray(row) ? [...row] : row)
  ;(map.runtimeEvents || [])
    .filter(isHiddenEncounterGateEvent)
    .forEach((event) => {
      const { lockedTiles, sealedTiles } = getHiddenEncounterGatePassageTiles(map, map.mapGrid, event, map.runtimeEvents)
      const rawOpenTile = Number(event?.properties?.openTile)
      const openTile = Number.isFinite(rawOpenTile) ? Math.trunc(rawOpenTile) : regionTile.road
      sealedTiles.forEach(({ x, y }) => {
        if (grid[y]?.[x] === undefined) return
        grid[y][x] = regionTile.objectBlocker
      })
      lockedTiles.forEach(({ x, y }) => {
        if (grid[y]?.[x] === undefined) return
        grid[y][x] = openTile
      })
    })
  return { ...map, mapGrid: grid }
}

function findMisleadingBlockedLowVegetation(map, catalog, reachable) {
  return (map.decorativeObjects || [])
    .filter((object) => {
      if (object.eventType) return false
      if (!isLowVegetationDecorationType(object.type, catalog)) return false
      const x = Math.round(Number(object.x))
      const y = Math.round(Number(object.y))
      if (!inBounds(map, x, y)) return false
      if (isWalkableTile(map.mapGrid[y]?.[x])) return false
      return neighbors({ x, y }).some((point) => reachable.has(key(point.x, point.y)))
    })
    .map((object) => ({
      type: object.type,
      x: object.x,
      y: object.y
    }))
}

function countTilesInZone(map, zone, tile) {
  let count = 0
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    for (let x = zone.x; x < zone.x + zone.width; x += 1) {
      if (map.mapGrid[y]?.[x] === tile) count += 1
    }
  }
  return count
}

function isInsideWaterBody(tileX, tileY, body, padding = 0) {
  if (body?.type === 'rect') {
    const x = Number(body.x)
    const y = Number(body.y)
    const width = Number(body.width)
    const height = Number(body.height)
    if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0 || height <= 0) return false
    return (
      tileX >= x - padding &&
      tileX <= x + width - 1 + padding &&
      tileY >= y - padding &&
      tileY <= y + height - 1 + padding
    )
  }

  const rx = Number(body?.rx) + padding
  const ry = Number(body?.ry) + padding
  const cx = Number(body?.x)
  const cy = Number(body?.y)
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || rx <= 0 || ry <= 0) return false

  const rotation = Number(body?.rotation) || 0
  const dx = tileX - cx
  const dy = tileY - cy
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1
}

function isInsideAnyWaterBody(map, tileX, tileY, padding = 0) {
  return (map.waterBodies || []).some((body) => isInsideWaterBody(tileX, tileY, body, padding))
}

function isWaterFeatureTile(map, tileX, tileY) {
  return map.mapGrid[tileY]?.[tileX] === 11 || isInsideAnyWaterBody(map, tileX, tileY, 0.15)
}

function hasNearbyWaterFeature(map, position, maxDistance = 2) {
  for (let y = position.y - maxDistance; y <= position.y + maxDistance; y += 1) {
    for (let x = position.x - maxDistance; x <= position.x + maxDistance; x += 1) {
      if (!inBounds(map, x, y)) continue
      if (Math.hypot(x - position.x, y - position.y) > maxDistance) continue
      if (isWaterFeatureTile(map, x, y)) return true
    }
  }
  return false
}

function hasNearbySpringVegetation(map, position, maxDistance = 1) {
  for (let y = position.y - maxDistance; y <= position.y + maxDistance; y += 1) {
    for (let x = position.x - maxDistance; x <= position.x + maxDistance; x += 1) {
      if (x === position.x && y === position.y) continue
      if (!inBounds(map, x, y)) continue
      if (SPRING_VEGETATION_TILES.has(map.mapGrid[y]?.[x])) return true
    }
  }
  return false
}

function hasAdjacentRoadOrBridge(map, position) {
  return neighbors(position).some((point) => (
    map.mapGrid[point.y]?.[point.x] === ROAD_TILE ||
    map.mapGrid[point.y]?.[point.x] === BRIDGE_TILE
  ))
}

function hasNearbyRoadPathEndpoint(map, position, maxDistance = 3) {
  const endpoints = Array.isArray(map.roadPathEndpoints) ? map.roadPathEndpoints : []
  return endpoints.some((endpoint) => (
    Math.abs(Number(endpoint.x) - position.x) + Math.abs(Number(endpoint.y) - position.y) <= maxDistance
  ))
}

function countAdjacentRoadOrBridge(map, position) {
  return neighbors(position).filter((point) => (
    map.mapGrid[point.y]?.[point.x] === ROAD_TILE ||
    map.mapGrid[point.y]?.[point.x] === BRIDGE_TILE
  )).length
}

function countNearbyOpenGround(map, position, maxDistance = 1) {
  let count = 0
  for (let y = position.y - maxDistance; y <= position.y + maxDistance; y += 1) {
    for (let x = position.x - maxDistance; x <= position.x + maxDistance; x += 1) {
      if (x === position.x && y === position.y) continue
      if (!inBounds(map, x, y)) continue
      if (OPEN_GROUND_TILES.has(map.mapGrid[y]?.[x])) count += 1
    }
  }
  return count
}

function reachableWithoutTallGrassFromRoad(map) {
  const visited = new Set()
  const queue = []

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.mapGrid[y]?.[x]
      if (tile !== ROAD_TILE && tile !== BRIDGE_TILE) continue
      const pointKey = key(x, y)
      visited.add(pointKey)
      queue.push({ x, y })
    }
  }

  while (queue.length > 0) {
    const point = queue.shift()
    for (const next of neighbors(point)) {
      if (!inBounds(map, next.x, next.y)) continue
      const tile = map.mapGrid[next.y]?.[next.x]
      if (!isWalkableTile(tile) || tile === TALL_GRASS_TILE) continue
      const nextKey = key(next.x, next.y)
      if (visited.has(nextKey)) continue
      visited.add(nextKey)
      queue.push(next)
    }
  }

  return visited
}

function buildOrthogonalConnector(start, target, verticalFirst = false) {
  const points = []
  const addPoint = (x, y) => {
    const last = points[points.length - 1]
    if (!last || last.x !== x || last.y !== y) points.push({ x, y })
  }

  if (verticalFirst) {
    const stepY = target.y >= start.y ? 1 : -1
    for (let y = start.y; y !== target.y; y += stepY) addPoint(start.x, y)
    const stepX = target.x >= start.x ? 1 : -1
    for (let x = start.x; x !== target.x; x += stepX) addPoint(x, target.y)
  } else {
    const stepX = target.x >= start.x ? 1 : -1
    for (let x = start.x; x !== target.x; x += stepX) addPoint(x, start.y)
    const stepY = target.y >= start.y ? 1 : -1
    for (let y = start.y; y !== target.y; y += stepY) addPoint(target.x, y)
  }
  addPoint(target.x, target.y)

  return points
}

function connectorClear(map, connector) {
  return connector.every((point) => (
    inBounds(map, point.x, point.y) &&
    map.mapGrid[point.y]?.[point.x] !== 11
  ))
}

function getEventAccessTarget(map, event) {
  const position = eventPosition(event)
  if (!inBounds(map, position.x, position.y)) return null
  if (STEP_ON_EVENT_TYPES.has(event.type)) return position
  if (!ADJACENT_EVENT_TYPES.has(event.type)) return null

  return neighbors(position)
    .filter((point) => inBounds(map, point.x, point.y) && map.mapGrid[point.y]?.[point.x] !== 11)
    .sort((left, right) => (
      Number(map.mapGrid[left.y]?.[left.x] === ROAD_TILE || map.mapGrid[left.y]?.[left.x] === BRIDGE_TILE) -
      Number(map.mapGrid[right.y]?.[right.x] === ROAD_TILE || map.mapGrid[right.y]?.[right.x] === BRIDGE_TILE)
    ))[0] || null
}

function collectPathClearanceCells(map, events) {
  const cells = new Set()
  const roadTiles = []

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.mapGrid[y]?.[x]
      if (tile === ROAD_TILE || tile === BRIDGE_TILE) {
        roadTiles.push({ x, y })
        cells.add(key(x, y))
      }
      if (tile === 2) cells.add(key(x, y))
    }
  }

  if (roadTiles.length === 0) return cells

  ;(events || []).forEach((event) => {
    const position = eventPosition(event)
    const targets = ADJACENT_EVENT_TYPES.has(event.type)
      ? neighbors(position).filter((point) => inBounds(map, point.x, point.y) && map.mapGrid[point.y]?.[point.x] !== 11)
      : [getEventAccessTarget(map, event)].filter(Boolean)

    targets.forEach((target) => {
      cells.add(key(target.x, target.y))

      let best = null
      roadTiles.forEach((start) => {
        ;[false, true].forEach((verticalFirst) => {
          const connector = buildOrthogonalConnector(start, target, verticalFirst)
          if (!connectorClear(map, connector)) return
          const bendPenalty = verticalFirst ? 1 : 0
          const score = connector.length * 10 + bendPenalty
          if (!best || score < best.score) best = { connector, score }
        })
      })

      if (!best) return
      best.connector.forEach((point) => cells.add(key(point.x, point.y)))
    })
  })

  ;(events || []).forEach((event) => {
    const position = eventPosition(event)
    if (!inBounds(map, position.x, position.y)) return
    if (STEP_ON_EVENT_TYPES.has(event.type) || ADJACENT_EVENT_TYPES.has(event.type)) {
      cells.add(key(position.x, position.y))
    }
    if (!ADJACENT_EVENT_TYPES.has(event.type)) return

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const tileX = position.x + dx
        const tileY = position.y + dy
        if (!inBounds(map, tileX, tileY)) continue
        if (map.mapGrid[tileY]?.[tileX] === 11) continue
        cells.add(key(tileX, tileY))
      }
    }
  })

  return cells
}

function validateDecorationPathClearance({ errors, mapId, map, events, catalog }) {
  const clearanceCells = collectPathClearanceCells(map, events)
  const overlapping = (map.decorativeObjects || [])
    .filter((object) => isPathBlockingDecoration(object, catalog))
    .map((object) => ({
      object,
      cells: getDecorationFootprintCells(map, object, catalog, 0.28)
        .filter((cell) => clearanceCells.has(key(cell.x, cell.y)))
    }))
    .filter((entry) => entry.cells.length > 0)

  if (overlapping.length <= 0) return
  const samples = overlapping
    .slice(0, 6)
    .map(({ object, cells }) => `${object.type}@${object.x},${object.y}->${cells.slice(0, 3).map((cell) => `${cell.x},${cell.y}`).join('/')}`)
    .join('；')
  add(errors, `${mapId} 存在 ${overlapping.length} 个非事件模型压到道路或事件必经通路：${samples}`)
}

function hasNonGrassAccessFromRoad(map, position) {
  const reachable = reachableWithoutTallGrassFromRoad(map)
  return neighbors(position).some((point) => reachable.has(key(point.x, point.y)))
}

function validateFixedLandmarkModelClearance({ errors, map, mapId, event }) {
  const radius = FIXED_LANDMARK_CLEARANCE_RADIUS[event.type] || 1.4
  const position = eventPosition(event)
  const overlapping = (map.decorativeObjects || []).filter((object) => {
    if (object.eventId === event.id) return false
    const x = Number(object.x)
    const y = Number(object.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    return Math.hypot(x - position.x, y - position.y) < radius
  })

  if (overlapping.length > 0) {
    add(errors, `${mapId}/${event.id} 固定场景与其他模型距离过近：${overlapping.slice(0, 4).map((object) => `${object.type}@${object.x},${object.y}`).join('、')}`)
  }
}

function rotationIsCardinal(rotation) {
  const normalized = ((Number(rotation) || 0) % Math.PI + Math.PI) % Math.PI
  return Math.min(
    Math.abs(normalized),
    Math.abs(normalized - Math.PI / 2),
    Math.abs(normalized - Math.PI)
  ) < 0.001
}

function normalizeAngle(rotation) {
  const fullTurn = Math.PI * 2
  return ((Number(rotation) || 0) % fullTurn + fullTurn) % fullTurn
}

function angleDistance(left, right) {
  const fullTurn = Math.PI * 2
  const diff = Math.abs(normalizeAngle(left) - normalizeAngle(right))
  return Math.min(diff, fullTurn - diff)
}

function signFacingFromRotation(rotation) {
  const entries = Object.entries(SIGN_ROTATION_FACINGS)
    .map(([facing, angle]) => ({ facing, distance: angleDistance(rotation, angle) }))
    .sort((left, right) => left.distance - right.distance)
  const best = entries[0]
  return best && best.distance < 0.001 ? best.facing : null
}

function adjacentRoadFacings(map, x, y) {
  return Object.entries(FACING_OFFSETS)
    .filter(([, offset]) => SIGN_ROADSIDE_TILES.has(map.mapGrid[y + offset.y]?.[x + offset.x]))
    .map(([facing]) => facing)
}

function signMessageHasRouteContext(message, map) {
  const text = String(message || '')
  if (!text.trim()) return false
  if (text.includes(map.displayName)) return true
  return SIGN_CONTEXT_TERMS.some((term) => text.includes(term))
}

function bridgeDirection(bridge) {
  const rotation = Number(bridge?.rotation) || 0
  return {
    x: Math.cos(rotation),
    y: Math.sin(rotation),
    px: -Math.sin(rotation),
    py: Math.cos(rotation)
  }
}

function findBridgeRoadConnection(map, bridge, side) {
  const length = Number(bridge?.length) || 0
  const width = Number(bridge?.width) || 1
  const direction = bridgeDirection(bridge)
  const lateralOffsets = [0, -Math.min(0.55, width / 2), Math.min(0.55, width / 2)]

  for (let distance = 0.35; distance <= 2.25; distance += 0.25) {
    for (const offset of lateralOffsets) {
      const x = Number(bridge.x) + direction.x * side * (length / 2 + distance) + direction.px * offset
      const y = Number(bridge.y) + direction.y * side * (length / 2 + distance) + direction.py * offset
      const tileX = Math.round(x)
      const tileY = Math.round(y)
      if (!inBounds(map, tileX, tileY)) continue
      const tile = map.mapGrid[tileY]?.[tileX]
      if (tile === BRIDGE_TILE) return { x: tileX, y: tileY, tile }
      if (!ROAD_CONNECTION_TILES.has(tile)) continue
      if (isInsideAnyWaterBody(map, tileX, tileY, 0.05)) continue
      return { x: tileX, y: tileY, tile }
    }
  }

  return null
}

function sampleBridgeModel(map, bridge) {
  const length = Number(bridge?.length) || 0
  const direction = bridgeDirection(bridge)
  const samples = Math.max(8, Math.ceil(length * 4))
  const sampledTiles = new Set()
  let waterSamples = 0
  let bridgeTileSamples = 0

  for (let index = 0; index <= samples; index += 1) {
    const offset = -length / 2 + (length * index) / samples
    const x = Number(bridge.x) + direction.x * offset
    const y = Number(bridge.y) + direction.y * offset
    const tileX = Math.round(x)
    const tileY = Math.round(y)
    if (!inBounds(map, tileX, tileY)) continue
    if (sampledTiles.has(key(tileX, tileY))) continue
    sampledTiles.add(key(tileX, tileY))

    if (isInsideAnyWaterBody(map, x, y)) waterSamples += 1
    if (map.mapGrid[tileY]?.[tileX] === BRIDGE_TILE) bridgeTileSamples += 1
  }

  return { totalSamples: sampledTiles.size, waterSamples, bridgeTileSamples }
}

function isInsideBridgeFootprint(bridge, x, y, padding = 0.35) {
  const rotation = Number(bridge?.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - Number(bridge?.x)
  const dy = y - Number(bridge?.y)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (
    Math.abs(localX) <= (Number(bridge?.length) || 1) / 2 + padding &&
    Math.abs(localY) <= (Number(bridge?.width) || 1) / 2 + padding
  )
}

function validateBridgeSurfaceClear({ errors, mapId, map, bridge, index }) {
  const label = `${mapId} 第 ${index + 1} 座桥`

  ;(map.decorativeObjects || []).forEach((object) => {
    if (isHiddenZoneRuleDecoration(object)) return
    if (!isInsideBridgeFootprint(bridge, Number(object.x), Number(object.y))) return
    add(errors, `${label} 桥面上有装饰物 ${object.type}@${object.x},${object.y}`)
  })

  ;(map.runtimeEvents || []).forEach((event) => {
    const x = Number(event.position?.x)
    const y = Number(event.position?.y)
    if (!isInsideBridgeFootprint(bridge, x, y, 0.2)) return
    add(errors, `${label} 桥面上有事件 ${event.id || event.type}@${x},${y}`)
  })

  ;(map.roadJunctions || []).forEach((junction) => {
    const x = Number(junction.x)
    const y = Number(junction.y)
    const padding = Math.max(Number(junction.rx) || 0, Number(junction.ry) || 0, 0.35)
    if (!isInsideBridgeFootprint(bridge, x, y, padding)) return
    add(errors, `${label} 桥面上有路口面片 ${junction.id || `${x},${y}`}`)
  })
}

function validateBridgeModel({ errors, mapId, map, bridge, index }) {
  const label = `${mapId} 第 ${index + 1} 座桥`
  const length = Number(bridge?.length)
  const width = Number(bridge?.width)
  if (!Number.isFinite(Number(bridge?.x)) || !Number.isFinite(Number(bridge?.y)) || !Number.isFinite(length) || length <= 0 || !Number.isFinite(width) || width <= 0) {
    add(errors, `${label} 几何参数非法: ${JSON.stringify(bridge)}`)
    return
  }

  const { waterSamples, bridgeTileSamples } = sampleBridgeModel(map, bridge)
  if (waterSamples <= 0) {
    add(errors, `${label} 没有跨过水域`)
  }
  if (bridgeTileSamples < Math.max(2, Math.ceil(waterSamples * 0.6))) {
    add(errors, `${label} 桥面中心线没有足够的可走 bridge tile: bridge=${bridgeTileSamples}, water=${waterSamples}`)
  }

  const startConnection = findBridgeRoadConnection(map, bridge, -1)
  const endConnection = findBridgeRoadConnection(map, bridge, 1)
  if (!startConnection || !endConnection) {
    const startText = startConnection ? `(${startConnection.x},${startConnection.y})` : '缺失'
    const endText = endConnection ? `(${endConnection.x},${endConnection.y})` : '缺失'
    add(errors, `${label} 两头必须接非水面道路/出口，当前: ${startText} -> ${endText}`)
  }

  validateBridgeSurfaceClear({ errors, mapId, map, bridge, index })
}

function validateStaticSigns({ errors, mapId, map, reachable, events = [] }) {
  const runtimeSignCoordinates = new Set(
    events
      .filter((event) => !isHiddenEncounterGateEvent(event))
      .filter((event) => event.type === 'sign' || event.type === 'info')
      .map((event) => key(event.position?.x, event.position?.y))
  )
  const visibleSignDecorations = (map.decorativeObjects || [])
    .filter((object) => object.type === 'sign' || object.type === 'trail_sign')
    .filter((object) => !isHiddenZoneRuleDecoration(object))
    .filter((object) => {
      if (object.eventType && object.eventType !== 'sign') return false
      if (object.fixedSceneEventType && object.fixedSceneEventType !== 'sign') return false
      return true
    })
  const visibleSignCoordinates = new Set(
    visibleSignDecorations.map((object) => key(Math.round(Number(object.x)), Math.round(Number(object.y))))
  )
  const visibleSignFacings = new Set()

  Object.entries(map.signs || {}).forEach(([coordinate, message]) => {
    const [x, y] = coordinate.split(',').map((value) => Math.trunc(Number(value)))
    if (!inBounds(map, x, y)) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 越界`)
      return
    }
    if (!message) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 缺少文本`)
    } else if (!signMessageHasRouteContext(message, map)) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 文案缺少路线、等级、区域或玩法上下文: ${message}`)
    }
    const tile = map.mapGrid[y]?.[x]
    if (tile !== 6) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 必须落在阻挡路牌 tile=6，当前 tile=${tile}`)
    }
    if (!runtimeSignCoordinates.has(coordinate)) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 必须有对应 runtimeEvent，避免只有模型没有触发`)
    }
    if (!visibleSignCoordinates.has(coordinate)) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 缺少可见 trail_sign 模型`)
    }
    const hasReachableNeighbor = neighbors({ x, y }).some((point) => reachable.has(key(point.x, point.y)))
    if (!hasReachableNeighbor) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 没有相邻可达格，玩家无法读牌`)
    }
    const roadFacings = adjacentRoadFacings(map, x, y)
    if (roadFacings.length === 0) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 不在道路/桥/出口两侧，缺少相邻道路格`)
    }
    if (roadFacings.length >= 3) {
      add(errors, `${mapId} 静态路牌 ${coordinate} 被 ${roadFacings.length} 个道路格包围，位置仍像压在主路上`)
    }
  })

  visibleSignDecorations
    .forEach((object) => {
      const x = Math.round(Number(object.x))
      const y = Math.round(Number(object.y))
      const coordinate = `${x},${y}`
      if (map.mapGrid[y]?.[x] !== 6 || !Object.prototype.hasOwnProperty.call(map.signs || {}, coordinate) || !runtimeSignCoordinates.has(coordinate)) {
        add(errors, `${mapId} 可见路牌 ${object.sourceId || object.type}@${coordinate} 必须同时有 tile=6、signs 文本和 runtimeEvent 触发`)
      }
      const facing = signFacingFromRotation(object.rotation)
      if (!facing) {
        add(errors, `${mapId} 可见路牌 ${object.sourceId || object.type}@${coordinate} 朝向必须是上/下/左/右之一，当前 rotation=${object.rotation}`)
        return
      }
      visibleSignFacings.add(facing)
      if (!SIGN_ALLOWED_FACINGS.has(facing)) {
        add(errors, `${mapId} 可见路牌 ${object.sourceId || object.type}@${coordinate} 不能朝上`)
      }
      const roadFacings = adjacentRoadFacings(map, x, y)
      if (roadFacings.length > 0 && !roadFacings.includes(facing)) {
        add(errors, `${mapId} 可见路牌 ${object.sourceId || object.type}@${coordinate} 朝向 ${facing} 没有面向相邻道路，可用方向: ${roadFacings.join('/')}`)
      }
    })

  if (visibleSignFacings.size <= 1 && visibleSignDecorations.length > 1) {
    add(errors, `${mapId} 所有可见路牌朝向都相同，至少应按道路两侧分成不同方向`)
  }
}

function distanceToNearestTile(map, start, predicate) {
  const visited = new Set()
  const queue = []
  if (!inBounds(map, start.x, start.y)) return Infinity
  visited.add(key(start.x, start.y))
  queue.push({ x: start.x, y: start.y, distance: 0 })

  while (queue.length > 0) {
    const point = queue.shift()
    if (predicate(map.mapGrid[point.y]?.[point.x], point.x, point.y)) return point.distance
    for (const next of neighbors(point)) {
      if (!inBounds(map, next.x, next.y)) continue
      const nextKey = key(next.x, next.y)
      if (visited.has(nextKey)) continue
      visited.add(nextKey)
      queue.push({ ...next, distance: point.distance + 1 })
    }
  }

  return Infinity
}

function openGroundComponents(map) {
  const visited = new Set()
  const components = []

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (!OPEN_GROUND_TILES.has(map.mapGrid[y]?.[x])) continue
      const startKey = key(x, y)
      if (visited.has(startKey)) continue

      const queue = [{ x, y }]
      const cells = []
      visited.add(startKey)

      while (queue.length > 0) {
        const point = queue.shift()
        cells.push(point)
        for (const next of neighbors(point)) {
          if (!inBounds(map, next.x, next.y)) continue
          if (!OPEN_GROUND_TILES.has(map.mapGrid[next.y]?.[next.x])) continue
          const nextKey = key(next.x, next.y)
          if (visited.has(nextKey)) continue
          visited.add(nextKey)
          queue.push(next)
        }
      }

      components.push(cells)
    }
  }

  return components
}

function eventProps(event) {
  return event?.properties && typeof event.properties === 'object' ? event.properties : {}
}

function eventPosition(event) {
  return {
    x: Math.trunc(Number(event?.position?.x)),
    y: Math.trunc(Number(event?.position?.y))
  }
}

function eventDistance(left, right) {
  const a = eventPosition(left)
  const b = eventPosition(right)
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return Infinity
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function isPointOnAxisAlignedSegment(point, start, end) {
  if (!point || !Array.isArray(start) || !Array.isArray(end)) return false
  const [ax, ay] = start.map(Number)
  const [bx, by] = end.map(Number)
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(bx) || !Number.isFinite(by)) return false
  if (ax === bx) return point.x === ax && point.y >= Math.min(ay, by) && point.y <= Math.max(ay, by)
  if (ay === by) return point.y === ay && point.x >= Math.min(ax, bx) && point.x <= Math.max(ax, bx)
  return false
}

function isSegmentEndpoint(point, start, end) {
  return (
    (point.x === Number(start?.[0]) && point.y === Number(start?.[1])) ||
    (point.x === Number(end?.[0]) && point.y === Number(end?.[1]))
  )
}

function visualRoadEndpointIncidentCount(map, endpoint) {
  return (map.visualPaths || []).reduce((count, path) => {
    const points = path.points || []
    for (let index = 0; index < points.length - 1; index += 1) {
      if (!isPointOnAxisAlignedSegment(endpoint, points[index], points[index + 1])) continue
      count += isSegmentEndpoint(endpoint, points[index], points[index + 1]) ? 1 : 2
    }
    return count
  }, 0)
}

function roadPathEndpointDuplicateCount(map, endpoint) {
  return (map.roadPathEndpoints || []).filter((candidate) => (
    Number(candidate.x) === endpoint.x && Number(candidate.y) === endpoint.y
  )).length
}

function countNearbyTiles(map, position, radius, predicate) {
  let count = 0
  for (let y = position.y - radius; y <= position.y + radius; y += 1) {
    for (let x = position.x - radius; x <= position.x + radius; x += 1) {
      if (!inBounds(map, x, y)) continue
      if (Math.hypot(x - position.x, y - position.y) > radius) continue
      if (predicate(map.mapGrid[y]?.[x], x, y)) count += 1
    }
  }
  return count
}

function nearestRoadEndEvent(events, endpoint) {
  return events
    .filter((event) => ROAD_END_MEANINGFUL_EVENT_TYPES.has(event.type))
    .map((event) => ({
      event,
      distance: Math.hypot(Number(event.position?.x) - endpoint.x, Number(event.position?.y) - endpoint.y)
    }))
    .sort((left, right) => left.distance - right.distance)[0] || null
}

function validateRoadEndpointDestinations({ errors, mapId, map, events }) {
  const endpoints = Array.isArray(map.roadPathEndpoints) ? map.roadPathEndpoints : []
  const checked = new Set()

  endpoints.forEach((rawEndpoint) => {
    const endpoint = {
      x: Math.trunc(Number(rawEndpoint.x)),
      y: Math.trunc(Number(rawEndpoint.y))
    }
    if (!inBounds(map, endpoint.x, endpoint.y)) return

    const endpointKey = key(endpoint.x, endpoint.y)
    if (checked.has(endpointKey)) return
    checked.add(endpointKey)
    if (map.mapGrid[endpoint.y]?.[endpoint.x] === BRIDGE_TILE) return

    const incidentCount = visualRoadEndpointIncidentCount(map, endpoint)
    const duplicateCount = roadPathEndpointDuplicateCount(map, endpoint)
    if (incidentCount >= 2 || duplicateCount >= 2) return

    const nearestEvent = nearestRoadEndEvent(events, endpoint)
    if (nearestEvent?.distance <= ROAD_END_EVENT_RADIUS) return

    const grassTiles = countNearbyTiles(map, endpoint, 3, (tile) => tile === TALL_GRASS_TILE)
    if (grassTiles >= ROAD_END_MIN_GRASS_TILES) return

    const forestTiles = countNearbyTiles(map, endpoint, 3, (tile) => tile === 1)
    const openGroundTiles = countNearbyTiles(map, endpoint, 3, (tile) => OPEN_GROUND_TILES.has(tile))
    if (forestTiles >= ROAD_END_MIN_FOREST_TILES && openGroundTiles <= ROAD_END_MAX_OPEN_GROUND_TILES) return

    const nearestText = nearestEvent
      ? `${nearestEvent.event.id}(${nearestEvent.event.type}) 距离 ${nearestEvent.distance.toFixed(1)}`
      : '附近没有玩法事件'
    add(
      errors,
      `${mapId} 道路尽头 (${endpoint.x},${endpoint.y}) 缺少明确目标：应接传送点/快速传送，或 3 格内有补给、泉水、训练师等玩法事件，或被成片草丛/树林包围；当前草丛=${grassTiles}, 树林=${forestTiles}, 空地=${openGroundTiles}, ${nearestText}`
    )
  })
}

function validateNpcSpacing({ errors, mapId, npcs }) {
  for (let leftIndex = 0; leftIndex < npcs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < npcs.length; rightIndex += 1) {
      const left = npcs[leftIndex]
      const right = npcs[rightIndex]
      const distance = eventDistance(left, right)
      if (distance < NPC_MIN_DISTANCE) {
        add(errors, `${mapId}/${left.id} 与 ${right.id} 距离过近：${distance.toFixed(1)} 格，应至少 ${NPC_MIN_DISTANCE} 格`)
      }
    }
  }
}

function validatePairSpacing({ errors, mapId, events, minDistance, label }) {
  for (let leftIndex = 0; leftIndex < events.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex += 1) {
      const left = events[leftIndex]
      const right = events[rightIndex]
      const distance = eventDistance(left, right)
      if (distance < minDistance) {
        add(errors, `${mapId}/${left.id} 与 ${right.id} ${label}过近：${distance.toFixed(1)} 格，应至少 ${minDistance} 格`)
      }
    }
  }
}

function validateItemNpcSpacing({ errors, mapId, items, npcs }) {
  items.forEach((item) => {
    npcs.forEach((npc) => {
      const distance = eventDistance(item, npc)
      if (distance < ITEM_NPC_MIN_DISTANCE) {
        add(errors, `${mapId}/${item.id} 补给离 ${npc.id} 过近：${distance.toFixed(1)} 格，容易像训练师掉落物或造成交互拥挤`)
      }
    })
  })
}

function validateItemLandmarkSpacing({ errors, mapId, items, landmarks }) {
  items.forEach((item) => {
    landmarks.forEach((landmark) => {
      const distance = eventDistance(item, landmark)
      if (distance < ITEM_LANDMARK_MIN_DISTANCE) {
        const label = landmark.type === 'heal' ? '恢复泉水' : landmark.type === 'challenge' ? '区域试炼' : '快速传送台'
        add(errors, `${mapId}/${item.id} 补给离${label} ${landmark.id} 过近：${distance.toFixed(1)} 格，应保持独立奖励点`)
      }
    })
  })
}

function validateSignCopyDiversity({ errors, warnings, mapId, map, signs, isRegion }) {
  const messages = signs
    .map((event) => String(eventProps(event).message || map.signs?.[key(event.position?.x, event.position?.y)] || '').trim())
    .filter(Boolean)
  const normalizedMessages = messages.map((message) => message.replace(/\s+/g, ''))
  const uniqueMessages = new Set(normalizedMessages)
  if (uniqueMessages.size !== normalizedMessages.length) {
    add(errors, `${mapId} 存在重复路牌文案，路牌应按所在位置提供不同信息`)
  }

  messages.forEach((message) => {
    const length = [...message].length
    if (length > SIGN_MESSAGE_MAX_LENGTH) {
      add(errors, `${mapId} 路牌文案过长（${length}/${SIGN_MESSAGE_MAX_LENGTH}）：${message}`)
    }
    TEMPLATE_SIGN_PHRASES.forEach((phrase) => {
      if (message.includes(phrase)) {
        add(errors, `${mapId} 路牌仍使用模板化文案，应改成与当前地图地形和玩法位置相关的说明: ${message}`)
      }
    })
  })

  if (!isRegion) return
  if (messages.length > REGION_SIGN_MAX_COUNT) {
    add(warnings, `${mapId} 路牌数量偏多，当前 ${messages.length}，建议控制在 ${REGION_SIGN_MAX_COUNT} 个以内`)
  }

  const joined = messages.join('\n')
  if (!/(部下|巡守|守卫|印记|首领|Boss|试炼)/.test(joined)) {
    add(errors, `${mapId} 缺少解释部下/印记/首领解锁关系的路牌`)
  }
  if (!/(生态|草丛|水系|幽灵|岩石|电系|格斗|龙系|普通系|毒系|飞行系)/.test(joined)) {
    add(errors, `${mapId} 缺少根据本地图生态和草丛分区给出的路牌`)
  }
  if (!/(补给|泉水|药水|快速传送|Lv\.)/.test(joined)) {
    add(errors, `${mapId} 缺少补给、泉水、等级或传送相关的实用路牌`)
  }
}

function minDistanceToEvents(event, candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return Infinity
  return Math.min(...candidates.map((candidate) => eventDistance(event, candidate)))
}

function findMonster(monsters, id) {
  return monsters.find((monster) => Number(monster.id) === Number(id)) || null
}

function itemDetails(defs, itemType, itemKey) {
  if (itemType === 'pokeball') return defs.POKEBALLS[itemKey]
  if (itemType === 'potion') return defs.POTIONS[itemKey]
  if (itemType === 'expPotion') return defs.EXP_POTIONS[itemKey]
  if (itemType === 'statBoost') return defs.STAT_BOOST_ITEMS[itemKey]
  return null
}

function normalizeRewardItems(rewardItems) {
  return Array.isArray(rewardItems) ? rewardItems : []
}

function hasLegalLevelForSpecies(bounds, pokemonId, minLevel, maxLevel) {
  const levelBounds = bounds(pokemonId)
  const min = Math.max(Number(levelBounds.min) || 1, Number(minLevel) || 1)
  const max = Math.min(Number(levelBounds.max) || 100, Number(maxLevel) || min)
  return min <= max
}

function validateEventTeam({ errors, warnings, mapId, event, monsters, isLevelValidForSpecies }) {
  const team = eventProps(event).team
  if (!Array.isArray(team) || team.length === 0) {
    add(errors, `${mapId}/${event.id} 缺少固定队伍，玩家会遇到随机队伍而不是配置玩法`)
    return
  }

  const expected = event.type === 'boss' ? [5, 6] : event.type === 'challenge' ? [3, 6] : eventProps(event).role === 'lieutenant' ? [3, 4] : [2, 3]
  if (team.length < expected[0] || team.length > expected[1]) {
    add(warnings, `${mapId}/${event.id} 队伍数量 ${team.length} 不在建议范围 ${expected[0]}-${expected[1]}`)
  }

  team.forEach((entry, index) => {
    const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id))
    const level = Math.trunc(Number(entry?.level))
    if (!findMonster(monsters, pokemonId)) {
      add(errors, `${mapId}/${event.id} 队伍第 ${index + 1} 只宝可梦不存在: ${pokemonId}`)
      return
    }
    if (!Number.isInteger(level) || level < 1 || level > 100) {
      add(errors, `${mapId}/${event.id} 队伍第 ${index + 1} 只等级非法: ${entry?.level}`)
      return
    }
    if (!isLevelValidForSpecies(pokemonId, level)) {
      add(warnings, `${mapId}/${event.id} ${findMonster(monsters, pokemonId)?.name || pokemonId} Lv.${level} 与进化阶段不完全匹配`)
    }
  })
}

function validateRewardItems({ errors, mapId, eventId, rewardItems, defs }) {
  normalizeRewardItems(rewardItems).forEach((reward, index) => {
    const itemType = reward?.itemType
    const itemKey = reward?.itemKey
    const quantity = Math.trunc(Number(reward?.quantity ?? 1))
    if (!ACTIVE_ITEM_TYPES.has(itemType)) {
      add(errors, `${mapId}/${eventId} 奖励第 ${index + 1} 个 itemType 非法: ${itemType}`)
      return
    }
    if (!itemDetails(defs, itemType, itemKey)) {
      add(errors, `${mapId}/${eventId} 奖励第 ${index + 1} 个 itemKey 不存在: ${itemKey}`)
    }
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 20) {
      add(errors, `${mapId}/${eventId} 奖励第 ${index + 1} 个数量异常: ${reward?.quantity}`)
    }
  })
}

function mapHasWaterFeature(map) {
  if ((map.waterBodies || []).length > 0) return true
  return (map.mapGrid || []).some((row) => row?.some((tile) => tile === 11))
}

function validateFixedLandmarkSpacing({ errors, warnings, map, mapId, event, npcs, events }) {
  const position = eventPosition(event)
  const npcDistance = minDistanceToEvents(event, npcs)
  const otherEventDistance = minDistanceToEvents(
    event,
    events.filter((other) => other.id !== event.id && other.type !== 'sign')
  )
  const label = event.type === 'heal' ? '恢复泉水' : '区域试炼'

  if (!hasNonGrassAccessFromRoad(map, position)) {
    add(errors, `${mapId}/${event.id} ${label}从道路过去需要穿过高草丛，应保证无高草通路`)
  }

  if (event.type === 'heal') {
    if (map.mapGrid[position.y]?.[position.x] === TALL_GRASS_TILE) {
      add(errors, `${mapId}/${event.id} 恢复泉水不能放在高草丛 tile 上`)
    }
    if (!mapHasWaterFeature(map)) {
      add(warnings, `${mapId}/${event.id} 当前地图没有已有小水湖，无法在不新增地图水体的前提下让恢复泉水贴近水景`)
    } else if (!hasNearbyWaterFeature(map, position, 2)) {
      add(errors, `${mapId}/${event.id} 恢复泉水旁缺少小水湖或水面，应与水景组成恢复场景`)
    }
    if (!hasNearbySpringVegetation(map, position, 2)) {
      add(errors, `${mapId}/${event.id} 恢复泉水旁缺少草丛/草地，应靠近草丛形成自然恢复点`)
    }
    if (!hasNearbyRoadPathEndpoint(map, position, 3)) {
      add(errors, `${mapId}/${event.id} 恢复泉水应靠近道路尽头或短支路终点，避免放在主路中段造成动线混乱`)
    }
  }

  if (event.type === 'challenge') {
    if (map.mapGrid[position.y]?.[position.x] === TALL_GRASS_TILE) {
      add(errors, `${mapId}/${event.id} 区域试炼不能放在高草丛 tile 上`)
    }
    if (!hasAdjacentRoadOrBridge(map, position)) {
      add(errors, `${mapId}/${event.id} 区域试炼不在道路旁，应放在主路旁边的空地上`)
    }
    if (countNearbyOpenGround(map, position, 1) < 2) {
      add(errors, `${mapId}/${event.id} 区域试炼周围空地不足，应保留清楚的试炼场地`)
    }
  }
  const minNpcDistance = event.type === 'heal' ? 3.5 : 4
  if (npcDistance < minNpcDistance) {
    add(errors, `${mapId}/${event.id} ${label}离训练师/Boss 过近：${npcDistance.toFixed(1)} 格，应保持独立场地感`)
  }
  if (otherEventDistance < 3) {
    add(errors, `${mapId}/${event.id} ${label}离其他事件过近：${otherEventDistance.toFixed(1)} 格，容易造成视觉和交互拥挤`)
  }
  validateFixedLandmarkModelClearance({ errors, map, mapId, event })
}

function validateFastTravelStationPlacement({ errors, map, mapId, event, events }) {
  const position = eventPosition(event)
  const adjacentRoadCount = countAdjacentRoadOrBridge(map, position)
  if (!hasAdjacentRoadOrBridge(map, position)) {
    add(errors, `${mapId}/${event.id} 快速传送台必须放在道路旁的空地上，不能离主路太远`)
  }
  if (adjacentRoadCount >= 3) {
    add(errors, `${mapId}/${event.id} 快速传送台被 ${adjacentRoadCount} 个道路/桥格包围，说明仍然压在主路上`)
  }
  if (!hasNonGrassAccessFromRoad(map, position)) {
    add(errors, `${mapId}/${event.id} 快速传送台从道路过去需要穿过高草丛，应保证无高草通路`)
  }

  const otherEventDistance = minDistanceToEvents(
    event,
    events.filter((other) => (
      other.id !== event.id &&
      other.type !== 'sign' &&
      !String(other.id || '').includes('fast_travel_route_sign')
    ))
  )
  if (otherEventDistance < 3) {
    add(errors, `${mapId}/${event.id} 快速传送台离其他事件过近：${otherEventDistance.toFixed(1)} 格，容易造成视觉和交互拥挤`)
  }

  const signalObjects = (map.decorativeObjects || []).filter((object) => (
    object.eventId === event.id && object.eventType === 'fast_travel'
  ))
  if (signalObjects.length !== 1) {
    add(errors, `${mapId}/${event.id} 快速传送台必须正好 1 个传送光圈锚点，当前 ${signalObjects.length} 个`)
  }
  signalObjects.forEach((object) => {
    if (Math.hypot(Number(object.x) - position.x, Number(object.y) - position.y) > 0.1) {
      add(errors, `${mapId}/${event.id} 快速传送光圈锚点没有落在传送台中心：${object.sourceId || object.type}@${object.x},${object.y}`)
    }
  })
}

function validateFastTravelRouteSignPlacement({ errors, map, mapId, event }) {
  const position = eventPosition(event)
  const adjacentRoadCount = countAdjacentRoadOrBridge(map, position)
  if (!hasAdjacentRoadOrBridge(map, position)) {
    add(errors, `${mapId}/${event.id} 快速传送说明牌必须在道路旁，方便玩家读到`)
  }
  if (adjacentRoadCount >= 3) {
    add(errors, `${mapId}/${event.id} 快速传送说明牌被 ${adjacentRoadCount} 个道路/桥格包围，说明说明牌仍然压在主路上`)
  }
}

function getLieutenants(events) {
  return events.filter((event) => event.type === 'trainer' && eventProps(event).role === 'lieutenant')
}

function getNormalTrainers(events) {
  return events.filter((event) => event.type === 'trainer' && eventProps(event).role !== 'lieutenant')
}

function getBoss(events) {
  return events.find((event) => event.type === 'boss') || null
}

function getChallenge(events) {
  return events.find((event) => event.type === 'challenge') || null
}

function getSignCount(map, events) {
  const eventSignCoordinates = events
    .filter((event) => !isHiddenEncounterGateEvent(event))
    .filter((event) => event.type === 'sign' || event.type === 'info')
    .map((event) => key(event.position?.x, event.position?.y))
  const staticSignCoordinates = Object.keys(map.signs || {})
  return new Set([...eventSignCoordinates, ...staticSignCoordinates]).size
}

function getConfiguredSpecies(team) {
  return Array.isArray(team)
    ? team.map((entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id))).filter(Number.isInteger)
    : []
}

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { MAP_ASSET_CATALOG } = await loadModule('/src/game/data/mapAssetCatalog.js')
  const { MONSTERS, POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS } = await loadModule('/src/utils/gameData.js')
  const { getSpeciesLevelBounds, isLevelValidForSpecies } = await loadModule('/src/utils/wildEncounterRules.js')
  const { getHiddenEncounterGatePassageTiles, REGION_MAP_TILE } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')

  const errors = []
  const warnings = []
  const rows = []
  const mapSet = new Set(ADVENTURE_MAP_CHAIN)

  REQUIRED_ADVENTURE_MAP_IDS.forEach((mapId) => {
    if (!mapSet.has(mapId)) add(errors, `冒险地图链缺少必需地图 ${mapId}`)
  })
  const expectedMapCount = REQUIRED_ADVENTURE_MAP_IDS.length + (mapSet.has(CHAMPION_TOWER_MAP_ID) ? 1 : 0)
  if (ADVENTURE_MAP_CHAIN.length !== expectedMapCount) {
    add(errors, `冒险地图数量应为 ${expectedMapCount}（主线、四馆${mapSet.has(CHAMPION_TOWER_MAP_ID) ? '与冠军塔' : ''}），实际 ${ADVENTURE_MAP_CHAIN.length}`)
  }
  if (ADVENTURE_MAP_CHAIN[0] !== 'GodotMap') {
    add(errors, `第一张地图必须是新手山谷 GodotMap，当前 ${ADVENTURE_MAP_CHAIN[0]}`)
  }

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const map = getAdventureMapInfo(mapId)
    const reachabilityMap = buildUnlockedHiddenGateAuditMap(map, getHiddenEncounterGatePassageTiles, REGION_MAP_TILE)
    const config = getMapConfig(mapId)
    const events = Array.isArray(map.runtimeEvents) ? map.runtimeEvents : []
    const reachable = reachableTerrain(reachabilityMap)
    const isEliteDojo = ELITE_DOJO_MAP_IDS.has(mapId)
    const isChampionTower = mapId === CHAMPION_TOWER_MAP_ID
    const isSpecialChallengeMap = isEliteDojo || isChampionTower
    const isRegion = mapId.startsWith('GodotMapV2') && !isSpecialChallengeMap
    const eventIds = new Set()
    const warps = events.filter((event) => event.type === 'warp')
    const fastTravelEvents = events.filter((event) => event.type === 'fast_travel')
    const healPoints = events.filter((event) => event.type === 'heal')
    const signEvents = events.filter((event) => (event.type === 'sign' || event.type === 'info') && !isHiddenEncounterGateEvent(event))
    const signCount = getSignCount(map, events)
    const items = events.filter((event) => event.type === 'item' || event.type === 'pickup')
    const normalTrainers = getNormalTrainers(events)
    const lieutenants = getLieutenants(events)
    const boss = getBoss(events)
    const challenge = getChallenge(events)
    const npcEvents = [...normalTrainers, ...lieutenants, boss].filter(Boolean)

    if (!map?.mapGrid?.length || map.mapGrid.length !== map.height || map.mapGrid[0]?.length !== map.width) {
      add(errors, `${mapId} mapGrid 尺寸和 width/height 不一致`)
      continue
    }

    if (!inBounds(map, map.startPosition?.x, map.startPosition?.y)) {
      add(errors, `${mapId} 出生点越界`)
    } else if (!reachable.has(key(map.startPosition.x, map.startPosition.y))) {
      add(errors, `${mapId} 出生点不可达或不可行走`)
    }

    events.forEach((event) => {
      if (!event?.id) add(errors, `${mapId} 存在缺少 id 的 runtimeEvent`)
      if (eventIds.has(event.id)) add(errors, `${mapId} runtimeEvent id 重复: ${event.id}`)
      eventIds.add(event.id)

      const x = Math.trunc(Number(event?.position?.x))
      const y = Math.trunc(Number(event?.position?.y))
      if (!inBounds(map, x, y)) {
        add(errors, `${mapId}/${event.id} 坐标越界`)
        return
      }

      const tile = map.mapGrid[y]?.[x]
      if (NPC_EVENT_TYPES.has(event.type) && !isSpecialChallengeMap) {
        const roadDistance = distanceToVisualRoads(map, x, y)
        if (roadDistance <= ROAD_CENTERLINE_BLOCK_DISTANCE) {
          add(errors, `${mapId}/${event.id} NPC 不能站在道路上: (${x},${y}) 距道路中心线 ${roadDistance.toFixed(2)}`)
        }
        if (!['up', 'down', 'left', 'right'].includes(event.properties?.facing)) {
          add(errors, `${mapId}/${event.id} NPC 缺少合理朝向`)
        } else {
          const offset = FACING_OFFSETS[event.properties.facing]
          const frontTile = map.mapGrid[y + offset.y]?.[x + offset.x]
          if (!NPC_FACING_TARGET_TILES.has(frontTile)) {
            add(errors, `${mapId}/${event.id} NPC 面向了不可用区域: facing=${event.properties.facing}, frontTile=${frontTile}`)
          }
        }
      }
      if (STEP_ON_EVENT_TYPES.has(event.type) && !isWalkableTile(tile)) {
        add(errors, `${mapId}/${event.id} 需要踩上触发，但落在不可行走 tile=${tile}`)
      }
      if (STEP_ON_EVENT_TYPES.has(event.type) && !reachable.has(key(x, y))) {
        add(errors, `${mapId}/${event.id} 需要踩上触发，但从出生点不可达`)
      }
      if (ADJACENT_EVENT_TYPES.has(event.type)) {
        const hasReachableNeighbor = neighbors({ x, y }).some((point) => reachable.has(key(point.x, point.y)))
        if (!hasReachableNeighbor) add(errors, `${mapId}/${event.id} 没有相邻可达格，玩家无法互动`)
      }
      if (event.type === 'warp') {
        const targetMapName = event.target?.mapName
        const targetPosition = event.target?.position
        if (!mapSet.has(targetMapName)) {
          add(errors, `${mapId}/${event.id} 指向不存在地图 ${targetMapName}`)
        } else {
          const targetMap = getAdventureMapInfo(targetMapName)
          const tx = Math.trunc(Number(targetPosition?.x))
          const ty = Math.trunc(Number(targetPosition?.y))
          if (!inBounds(targetMap, tx, ty)) {
            add(errors, `${mapId}/${event.id} 目标坐标越界: ${targetMapName} (${tx},${ty})`)
          } else if (!isWalkableTile(targetMap.mapGrid[ty]?.[tx])) {
            add(errors, `${mapId}/${event.id} 目标坐标不可行走: ${targetMapName} (${tx},${ty}) tile=${targetMap.mapGrid[ty]?.[tx]}`)
          }
        }

        const currentOrder = Number(config.regionOrder || 0)
        const targetOrder = Number(getMapConfig(targetMapName).regionOrder || 0)
        if (targetOrder > currentOrder + 1) {
          const intermediateMapsHaveBosses = ADVENTURE_MAP_CHAIN
            .filter((candidateMapId) => {
              const order = Number(getMapConfig(candidateMapId).regionOrder || 0)
              return order > currentOrder && order < targetOrder
            })
            .every((candidateMapId) => getBoss(getAdventureMapInfo(candidateMapId).runtimeEvents || []))
          if (!intermediateMapsHaveBosses) {
            add(warnings, `${mapId}/${event.id} 跨级连接到第 ${targetOrder} 区，但中间地图缺少可用于顺序解锁的 Boss`)
          }
        }
      }
      if (event.type === 'fast_travel') {
        validateFastTravelStationPlacement({ errors, map, mapId, event, events })
      }
      if (event.type === 'sign' && String(event.id || '').includes('fast_travel_route_sign')) {
        validateFastTravelRouteSignPlacement({ errors, map, mapId, event })
      }
    })

    if (!isSpecialChallengeMap) {
      validateStaticSigns({ errors, mapId, map, reachable, events })
      validateRoadEndpointDestinations({ errors, mapId, map, events })
    }
    validatePairSpacing({ errors, mapId, events: signEvents, minDistance: SIGN_MIN_DISTANCE, label: '路牌距离' })
    validatePairSpacing({ errors, mapId, events: items, minDistance: ITEM_MIN_DISTANCE, label: '补给距离' })
    validateItemNpcSpacing({ errors, mapId, items, npcs: npcEvents })
    validateItemLandmarkSpacing({
      errors,
      mapId,
      items,
      landmarks: [...healPoints, challenge, ...fastTravelEvents].filter(Boolean)
    })
    if (!isSpecialChallengeMap) {
      validateSignCopyDiversity({ errors, warnings, mapId, map, signs: signEvents, isRegion })
    }

    let unreachableTallGrass = 0
    let roadOverWater = 0
    let orphanBridgeTiles = 0
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const tile = map.mapGrid[y]?.[x]
        if (tile === TALL_GRASS_TILE && !reachable.has(key(x, y))) unreachableTallGrass += 1
        if (tile === ROAD_TILE && isInsideAnyWaterBody(map, x, y)) roadOverWater += 1
        if (tile === BRIDGE_TILE && !isInsideAnyWaterBody(map, x, y, 0.85)) orphanBridgeTiles += 1
      }
    }
    if (unreachableTallGrass > 0) {
      add(errors, `${mapId} 存在 ${unreachableTallGrass} 个不可达草丛 tile，草丛必须都有可走路径`)
    }
    if (roadOverWater > 0) {
      add(errors, `${mapId} 存在 ${roadOverWater} 个水体上的道路 tile，跨湖必须改为桥`)
    }
    if (orphanBridgeTiles > 3) {
      add(errors, `${mapId} 存在 ${orphanBridgeTiles} 个明显离开水体的桥 tile，离开湖后应恢复道路`)
    }

    const misleadingLowVegetation = findMisleadingBlockedLowVegetation(map, MAP_ASSET_CATALOG, reachable)
    if (misleadingLowVegetation.length > 0) {
      const samples = misleadingLowVegetation
        .slice(0, 5)
        .map((item) => `${item.type}@${item.x},${item.y}`)
        .join('；')
      add(errors, `${mapId} 存在 ${misleadingLowVegetation.length} 个低矮草/花/蘑菇/芦苇装饰落在不可走边界格：${samples}`)
    }
    validateDecorationPathClearance({ errors, mapId, map, events, catalog: MAP_ASSET_CATALOG })

    ;(isSpecialChallengeMap ? [] : (map.bridges || [])).forEach((bridge, index) => {
      if (!rotationIsCardinal(bridge.rotation)) {
        add(errors, `${mapId} 第 ${index + 1} 座桥不是 0/90/180 度摆放`)
      }
      validateBridgeModel({ errors, mapId, map, bridge, index })
    })

    const largestOpenGround = Math.max(0, ...openGroundComponents(map).map((component) => component.length))
    if (largestOpenGround > (isRegion ? 95 : 140)) {
      add(warnings, `${mapId} 最大空旷地块 ${largestOpenGround}，建议继续用成块树林/草丛/地标切分`)
    }

    ;(map.encounterZones || []).forEach((zone) => {
      const zoneInBounds = inBounds(map, zone.x, zone.y) && inBounds(map, zone.x + zone.width - 1, zone.y + zone.height - 1)
      if (!zoneInBounds) {
        add(errors, `${mapId}/${zone.id} 遇敌区域越界`)
        return
      }
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      if (!table) {
        add(errors, `${mapId}/${zone.id} 缺少遇敌表 ${zone.encounterTableId}`)
        return
      }
      const grassTiles = countTilesInZone(map, zone, 8)
      if (grassTiles <= 0) add(errors, `${mapId}/${zone.id} 没有任何高草丛 tile`)
      if (grassTiles / (zone.width * zone.height) < 0.18) {
        add(warnings, `${mapId}/${zone.id} 高草丛占比偏低: ${grassTiles}/${zone.width * zone.height}`)
      }

      const zoneBounds = getZoneLevelBounds(zone, config)
      table.pokemon.forEach((entry) => {
        const speciesExists = Boolean(findMonster(MONSTERS, entry.id))
        if (!speciesExists) {
          add(errors, `${mapId}/${zone.encounterTableId} 宝可梦不存在: ${entry.id}`)
          return
        }
        if (entry.minLevel < zoneBounds.minLevel || entry.maxLevel > zoneBounds.maxLevel) {
          const boundLabel = zoneBounds.source === 'hidden' ? '隐藏区' : '地图'
          add(errors, `${mapId}/${zone.encounterTableId} ${findMonster(MONSTERS, entry.id)?.name || entry.id} 等级 ${entry.minLevel}-${entry.maxLevel} 超出${boundLabel} ${zoneBounds.minLevel}-${zoneBounds.maxLevel}`)
        }
        if (!hasLegalLevelForSpecies(getSpeciesLevelBounds, entry.id, entry.minLevel, entry.maxLevel)) {
          add(errors, `${mapId}/${zone.encounterTableId} ${findMonster(MONSTERS, entry.id)?.name || entry.id} 在 ${entry.minLevel}-${entry.maxLevel} 没有合法形态等级`)
        }
      })
    })

    if (!isSpecialChallengeMap && (map.encounterZones || []).length < (isRegion ? 3 : 5)) {
      add(errors, `${mapId} 遇敌区域过少，当前 ${(map.encounterZones || []).length}`)
    }
    if (!isSpecialChallengeMap && signCount < (isRegion ? 4 : 6)) {
      add(warnings, `${mapId} 路牌/提示偏少，当前 ${signCount}`)
    }

    if (isEliteDojo) {
      if (normalTrainers.length > 0) add(errors, `${mapId} 道馆不应混入普通训练师，当前 ${normalTrainers.length}`)
      if (lieutenants.length !== 3) add(errors, `${mapId} 道馆部下必须正好 3 个，当前 ${lieutenants.length}`)
      if (!boss) add(errors, `${mapId} 道馆缺少天王 Boss`)
      if (challenge) add(errors, `${mapId} 道馆不应使用普通区域试炼事件`)
      if ((map.encounterZones || []).length > 0) add(errors, `${mapId} 道馆不应出现野生遇敌区域`)
      if (healPoints.length !== 1) add(errors, `${mapId} 道馆整备点必须正好 1 个，当前 ${healPoints.length}`)
      if (fastTravelEvents.length !== 1) add(errors, `${mapId} 道馆快速传送台必须正好 1 个，当前 ${fastTravelEvents.length}`)
      if (signCount < 1) add(errors, `${mapId} 道馆至少需要 1 个路线/规则提示`)
      ;[...lieutenants, boss].filter(Boolean).forEach((event) => {
        validateEventTeam({ errors, warnings, mapId, event, monsters: MONSTERS, isLevelValidForSpecies })
      })
    } else if (isChampionTower) {
      if (normalTrainers.length > 0 || lieutenants.length > 0 || boss) {
        add(errors, `${mapId} 应由动态楼层挑战驱动，不应写入固定训练师或 Boss`)
      }
      if (!challenge || eventProps(challenge).towerChallenge !== true) {
        add(errors, `${mapId} 缺少动态冠军塔挑战事件`)
      }
      if ((map.encounterZones || []).length > 0) add(errors, `${mapId} 不应出现野生遇敌区域`)
      if (healPoints.length !== 1) add(errors, `${mapId} 大厅整备点必须正好 1 个，当前 ${healPoints.length}`)
      if (fastTravelEvents.length !== 1) add(errors, `${mapId} 大厅快速传送台必须正好 1 个，当前 ${fastTravelEvents.length}`)
      if (signCount < 1) add(errors, `${mapId} 至少需要 1 个挑战规则提示`)
      if (challenge) {
        validateEventTeam({ errors, warnings, mapId, event: challenge, monsters: MONSTERS, isLevelValidForSpecies })
      }
    } else if (mapId === 'GodotMap') {
      healPoints.forEach((event) => {
        validateFixedLandmarkSpacing({ errors, warnings, map, mapId, event, npcs: [], events })
      })
      if (normalTrainers.length < 3) add(errors, `新手山谷普通训练师少于 3 个，当前 ${normalTrainers.length}`)
      if (lieutenants.length > 0) add(errors, `新手山谷不应出现部下训练师，当前 ${lieutenants.length}`)
      if (boss) add(errors, '新手山谷不应出现 Boss 事件')
      if (challenge) add(errors, '新手山谷不应出现区域试炼事件')
      if (items.length < 5) add(errors, `新手山谷补给少于 5 个，当前 ${items.length}`)
      validateNpcSpacing({ errors, mapId, npcs: npcEvents })
      normalTrainers.forEach((event) => {
        validateEventTeam({ errors, warnings, mapId, event, monsters: MONSTERS, isLevelValidForSpecies })
      })
      items.forEach((event) => {
        validateRewardItems({
          errors,
          mapId,
          eventId: event.id,
          rewardItems: [eventProps(event)],
          defs: { POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS }
        })
      })
      const forwardWarp = warps.find((event) => event.target?.mapName === 'GodotMapV2')
      if (!forwardWarp) add(errors, '新手山谷缺少进入星音草径的传送点')
      if (forwardWarp) {
        const forwardWarpProps = eventProps(forwardWarp)
        const requiredAverageLevel = Math.trunc(Number(forwardWarpProps.requiredAverageLevel) || 0)
        const requiredTrainerIds = Array.isArray(forwardWarpProps.requiredTrainerIds)
          ? forwardWarpProps.requiredTrainerIds
          : []
        if (requiredAverageLevel < 6) {
          add(errors, `新手山谷进入星音草径的传送点门槛过低，requiredAverageLevel=${requiredAverageLevel}`)
        }
        if (requiredTrainerIds.length > 0) {
          add(errors, `新手山谷进入星音草径应只保留等级门槛，不应再要求训练师前置，当前 ${requiredTrainerIds.length} 个`)
        }
      }
      if ((config.maxLevel || 0) < 8) add(errors, '新手山谷最高野生等级应覆盖到 Lv.8，保证去下一张图前可练级')
    } else {
      if (normalTrainers.length < 4) add(errors, `${mapId} 普通训练师少于 4 个，当前 ${normalTrainers.length}`)
      if (lieutenants.length !== 3) add(errors, `${mapId} 部下训练师必须正好 3 个，当前 ${lieutenants.length}`)
      if (!boss) add(errors, `${mapId} 缺少 Boss 事件`)
      if (!challenge) add(errors, `${mapId} 缺少试炼挑战事件`)
      if (items.length < 8) add(errors, `${mapId} 道具/隐藏补给少于 8 个，当前 ${items.length}`)
      if (healPoints.length !== 1) add(errors, `${mapId} 恢复泉水必须正好 1 个，当前 ${healPoints.length}`)

      validateNpcSpacing({ errors, mapId, npcs: npcEvents })
      ;[...healPoints, challenge].filter(Boolean).forEach((event) => {
        validateFixedLandmarkSpacing({ errors, warnings, map, mapId, event, npcs: npcEvents, events })
      })

      const roadDistance = (event) => distanceToNearestTile(
        map,
        {
          x: Math.trunc(Number(event.position?.x)),
          y: Math.trunc(Number(event.position?.y))
        },
        (tile) => tile === ROAD_TILE || tile === BRIDGE_TILE
      )
      const explorationEvents = [...normalTrainers, ...lieutenants, challenge, ...items].filter(Boolean)
      const distantExplorationEvents = explorationEvents.filter((event) => roadDistance(event) >= 3)
      const distantRewards = items.filter((event) => roadDistance(event) >= 4)
      const distantBattles = [...normalTrainers, ...lieutenants, challenge].filter(Boolean).filter((event) => roadDistance(event) >= 3)
      if (distantExplorationEvents.length < 5) {
        add(warnings, `${mapId} 支路/死胡同事件偏少：距离主路 >=3 的探索事件只有 ${distantExplorationEvents.length}`)
      }
      if (distantRewards.length < 2) {
        add(warnings, `${mapId} 特殊位置补给偏少：距离主路 >=4 的补给只有 ${distantRewards.length}`)
      }
      if (distantBattles.length < 2) {
        add(warnings, `${mapId} 支路训练师/试炼偏少：距离主路 >=3 的战斗事件只有 ${distantBattles.length}`)
      }

      ;[...normalTrainers, ...lieutenants, boss, challenge].filter(Boolean).forEach((event) => {
        validateEventTeam({ errors, warnings, mapId, event, monsters: MONSTERS, isLevelValidForSpecies })
      })

      if (boss) {
        const requiredIds = Array.isArray(eventProps(boss).requiredTrainerIds) ? eventProps(boss).requiredTrainerIds : []
        const lieutenantIds = new Set(lieutenants.map((event) => event.id))
        if (requiredIds.length !== 3) add(errors, `${mapId}/${boss.id} Boss 解锁依赖必须是 3 个部下，当前 ${requiredIds.length}`)
        requiredIds.forEach((id) => {
          if (!lieutenantIds.has(id)) add(errors, `${mapId}/${boss.id} requiredTrainerIds 包含不存在或非部下 ID: ${id}`)
        })
        validateRewardItems({
          errors,
          mapId,
          eventId: boss.id,
          rewardItems: eventProps(boss).rewardItems,
          defs: { POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS }
        })
        if (!eventProps(boss).rareUnlockText) {
          add(errors, `${mapId}/${boss.id} 缺少 Boss 后稀有生态提示 rareUnlockText`)
        }

        const baseSpecies = new Set(
          (map.encounterZones || [])
            .flatMap((zone) => ENCOUNTER_TABLES[zone.encounterTableId]?.pokemon || [])
            .map((entry) => Number(entry.id))
        )
        const bossSpecies = getConfiguredSpecies(eventProps(boss).team)
        const bossRareId = Math.trunc(Number(eventProps(boss).bossRarePokemon?.pokemonId ?? eventProps(boss).bossRarePokemon?.id))
        const tier1Candidates = bossSpecies.slice(0, 2)
        const tier2Candidates = bossSpecies.slice(0, 4)
        const tier3Candidates = Number.isInteger(bossRareId) ? [bossRareId] : []
        const legalTier3 = tier3Candidates.filter((id) => hasLegalLevelForSpecies(getSpeciesLevelBounds, id, config.minLevel, config.maxLevel))
        const newRareSpecies = legalTier3.filter((id) => !baseSpecies.has(id))
        if (!Number.isInteger(bossRareId)) {
          add(errors, `${mapId}/${boss.id} 缺少 Boss 专属稀有 bossRarePokemon`)
        } else if (!bossSpecies.includes(bossRareId)) {
          add(errors, `${mapId}/${boss.id} Boss 队伍没有带出专属稀有 ID: ${bossRareId}`)
        }
        if (tier1Candidates.length === 0 || tier2Candidates.length < 2) {
          add(errors, `${mapId}/${boss.id} Boss 队伍不足以派生 tier_1/tier_2 野生生态`)
        }
        if (legalTier3.length === 0) {
          add(errors, `${mapId}/${boss.id} Boss 后稀有候选没有合法等级`)
        }
        if (newRareSpecies.length === 0) {
          add(warnings, `${mapId}/${boss.id} Boss 后稀有候选都已在基础遇敌表中出现，稀有奖励感会偏弱`)
        }
      }

      if (challenge) {
        validateRewardItems({
          errors,
          mapId,
          eventId: challenge.id,
          rewardItems: eventProps(challenge).rewardItems,
          defs: { POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS }
        })
      }

      items.forEach((event) => {
        validateRewardItems({
          errors,
          mapId,
          eventId: event.id,
          rewardItems: [eventProps(event)],
          defs: { POKEBALLS, POTIONS, EXP_POTIONS, STAT_BOOST_ITEMS }
        })
      })
    }

    rows.push({
      mapId,
      displayName: map.displayName || mapId,
      levelRange: `${config.minLevel}-${config.maxLevel}`,
      warps: warps.length,
      heal: healPoints.length,
      signs: signCount,
      zones: (map.encounterZones || []).length,
      normalTrainers: normalTrainers.length,
      lieutenants: lieutenants.length,
      boss: boss ? 1 : 0,
      challenge: challenge ? 1 : 0,
      items: items.length
    })
  }

  console.log('Map gameplay flow audit')
  rows.forEach((row) => {
    console.log(
      `- ${row.displayName} (${row.mapId}) Lv.${row.levelRange}: ` +
      `warps=${row.warps}, spring=${row.heal}, signs=${row.signs}, zones=${row.zones}, ` +
      `trainers=${row.normalTrainers}+${row.lieutenants}, boss=${row.boss}, challenge=${row.challenge}, items=${row.items}`
    )
  })

  if (warnings.length > 0) {
    console.warn('\nWarnings:')
    warnings.forEach((warning) => console.warn(`- ${warning}`))
  }

  if (errors.length > 0) {
    console.error('\nErrors:')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('\nMap gameplay flow audit passed.')
})
