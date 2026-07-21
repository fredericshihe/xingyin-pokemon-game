import { FAST_TRAVEL_COST, FAST_TRAVEL_EVENT_TYPE, getFastTravelStation, getFastTravelStationMeta } from '../fastTravel.js'
import {
  buildGodotRegionMap,
  buildThemedPickupDecorations,
  cleanupRoadSurfaceDecorations,
  REGION_MAP_TILE as TILE
} from './godot_region_maps.js'

const STARTER_THEME = 'kenney-newbie-valley-v2'
const NPC_SCALE = 0.62
const NPC_HEIGHT = 0.16

function event(type, id, x, y, extra = {}) {
  return {
    id,
    type,
    position: { x, y },
    ...extra
  }
}

function warp(id, x, y, targetMapName, targetPosition, label, extraProperties = {}) {
  return event('warp', id, x, y, {
    target: { mapName: targetMapName, position: targetPosition },
    properties: { label, ...extraProperties }
  })
}

function heal(id, x, y, label) {
  return event('heal', id, x, y, {
    properties: {
      goldCost: 1,
      fullRestore: true,
      reusable: true,
      label
    }
  })
}

function sign(id, x, y, message) {
  return event('sign', id, x, y, {
    properties: {
      message,
      label: '路牌'
    }
  })
}

function trainer(id, x, y, {
  name,
  title = '新手山谷训练师',
  team,
  beforeBattleText,
  defeatedText,
  dailyDefeatedText,
  facing = 'down'
}) {
  return event('trainer', id, x, y, {
    properties: {
      role: 'normal',
      facing,
      name,
      title,
      team,
      beforeBattleText,
      defeatedText,
      dailyDefeatedText
    }
  })
}

function pickup(id, x, y, itemType, itemKey, quantity, text) {
  return event('item', id, x, y, {
    properties: {
      visible: true,
      itemType,
      itemKey,
      quantity,
      text
    }
  })
}

function fastTravel(id, mapId, label) {
  const station = getFastTravelStation(mapId)
  const meta = getFastTravelStationMeta(mapId)
  if (!station) return null

  return event(FAST_TRAVEL_EVENT_TYPE, id, station.x, station.y, {
    properties: {
      label,
      goldCost: FAST_TRAVEL_COST,
      stationTitle: meta?.title,
      placement: meta?.placement,
      landmark: meta?.landmark,
      routeTone: meta?.routeTone,
      terrain: meta?.terrain
    }
  })
}

export const ROAD_PATHS = [
  {
    id: 'starter_main_valley_route',
    points: [[3, 28], [8, 28], [8, 20], [11, 20]],
    width: 3,
    paintRadius: 0.78,
    visualRadius: 0.78,
    edgeRadius: 0.94
  },
  {
    id: 'starter_camp_station_spur',
    points: [[6, 29], [6, 28]],
    width: 3,
    paintRadius: 0.72,
    visualRadius: 0.72,
    edgeRadius: 0.88
  },
  {
    id: 'starter_safe_meadow_branch',
    points: [[11, 20], [11, 10], [17, 10]],
    width: 3,
    paintRadius: 0.7,
    visualRadius: 0.7,
    edgeRadius: 0.86
  },
  {
    id: 'starter_flower_hill_branch',
    points: [[17, 10], [17, 14], [24, 14]],
    width: 3,
    paintRadius: 0.68,
    visualRadius: 0.68,
    edgeRadius: 0.84
  },
  {
    id: 'starter_upper_exit_route',
    points: [[24, 14], [38, 14]],
    width: 3,
    paintRadius: 0.68,
    visualRadius: 0.68,
    edgeRadius: 0.84
  },
  {
    id: 'starter_lake_bridge_route',
    points: [[31, 14], [31, 25], [35, 25], [35, 28]],
    width: 3,
    paintRadius: 0.68,
    visualRadius: 0.68,
    edgeRadius: 0.84
  },
  {
    id: 'starter_spring_dead_end',
    points: [[31, 25], [24, 25], [24, 28]],
    width: 3,
    paintRadius: 0.66,
    visualRadius: 0.66,
    edgeRadius: 0.82
  },
  {
    id: 'starter_grove_branch',
    points: [[17, 10], [17, 23]],
    width: 3,
    paintRadius: 0.64,
    visualRadius: 0.64,
    edgeRadius: 0.8
  }
]

const roadPaths = ROAD_PATHS.map((path) => ({
  ...path,
  radius: path.visualRadius
}))

const fastTravelEvent = fastTravel(
  'fast_travel_newbie_valley',
  'GodotMap',
  '新手山谷快速传送台'
)

const STARTER_SIGNS = [
  sign(
    'sign_valley_camp',
    6,
    24,
    '营地入口：先沿土路往上去阳光草坡，熟悉第一场野外遭遇。'
  ),
  sign(
    'sign_valley_safe_meadow',
    9,
    12,
    '阳光草坡 Lv.2-4：适合初战。受伤回泉水。'
  ),
  sign(
    'sign_valley_grove_warning',
    10,
    22,
    '密林 Lv.4-6：先练到Lv.5再进。'
  ),
  sign(
    'sign_valley_fork',
    19,
    18,
    '山谷岔路：上去花丘与湖岸，南密林需先经阳光草坡。'
  ),
  sign(
    'sign_valley_flower_hill',
    24,
    12,
    '花丘 Lv.3-5：可遇皮卡丘、伊布。'
  ),
  sign(
    'sign_valley_lake',
    31,
    12,
    '湖岸 Lv.3-6：水边多水系。'
  ),
  sign(
    'sign_valley_southeast',
    37,
    26,
    '东南草坡 Lv.5-8：练级后去右上出口。'
  ),
  sign(
    'sign_valley_exit',
    35,
    12,
    '东出口：队伍平均等级达到 Lv.6 后前往星音草径。'
  )
]

const STARTER_TRAINERS = [
  trainer('valley_trainer_camp_path', 13, 15, {
    name: '营地练习生',
    title: '第一次对战练习',
    team: [
      { pokemonId: 114, level: 2 },
      { pokemonId: 1, level: 3 }
    ],
    beforeBattleText: '营地练习生：先来一场基础练习吧。',
    defeatedText: '营地练习生：很稳，受伤了记得去泉水恢复。',
    dailyDefeatedText: '营地练习生：今天已经练过了，明天再来。'
  }),
  trainer('valley_trainer_grove_guard', 11, 23, {
    name: '密林守卫',
    title: '密林入口守卫',
    team: [
      { pokemonId: 16, level: 3 },
      { pokemonId: 39, level: 3 }
    ],
    beforeBattleText: '密林守卫：先过我这关，再进密林。',
    defeatedText: '密林守卫：可以，密林通道交给你了。',
    dailyDefeatedText: '密林守卫：密林已经开放，明天再来。',
    facing: 'down'
  }),
  trainer('valley_trainer_flower_hill', 20, 12, {
    name: '花丘学员',
    title: '花丘捕捉练习',
    team: [
      { pokemonId: 13, level: 2 },
      { pokemonId: 4, level: 3 }
    ],
    beforeBattleText: '花丘学员：来练练属性判断吧。',
    defeatedText: '花丘学员：这片花丘，你已经应付得很好了。',
    dailyDefeatedText: '花丘学员：我今天练完了，明天继续。'
  }),
  trainer('valley_trainer_lake_path', 36, 23, {
    name: '湖畔观察员',
    title: '湖岸进阶练习',
    team: [
      { pokemonId: 14, level: 5 },
      { pokemonId: 5, level: 5 }
    ],
    beforeBattleText: '湖畔观察员：水边更考验准备，来一场吧。',
    defeatedText: '湖畔观察员：准备得不错，继续往前走吧。',
    dailyDefeatedText: '湖畔观察员：今天的记录做完了，明天再来。'
  })
]

const STARTER_PICKUPS = [
  pickup('valley_pickup_camp_balls', 4, 24, 'pokeball', 'pokeball_basic', 2, '你找到了营地补给：精灵球 x2。'),
  pickup('valley_pickup_meadow_potion', 16, 11, 'potion', 'potion', 1, '你在阳光草坡边发现了一瓶伤药。'),
  pickup('valley_pickup_flower_supply', 26, 7, 'pokeball', 'pokeball_basic', 1, '你在花丘草地发现了一颗备用精灵球。'),
  pickup('valley_pickup_lake_ball', 29, 24, 'pokeball', 'pokeball_basic', 1, '你在湖畔石头旁找到了一颗精灵球。'),
  pickup('valley_pickup_spring_potion', 20, 29, 'potion', 'potion', 1, '你在泉水支路尽头找到了一瓶备用伤药。')
]

const STARTER_TRAINER_DECORATIONS = STARTER_TRAINERS.map((entry, index) => ({
  type: ['blocky_character_a', 'blocky_character_b', 'blocky_character_c', 'blocky_character_a'][index % 4],
  x: entry.position.x,
  y: entry.position.y,
  scale: NPC_SCALE,
  height: NPC_HEIGHT,
  rotation: 0,
  npcRole: 'normal',
  sourceId: `${entry.id}_npc`,
  eventId: entry.id,
  eventType: 'trainer'
}))

const STARTER_PICKUP_DECORATIONS = STARTER_PICKUPS.flatMap((entry, index) => (
  buildThemedPickupDecorations({ id: 'GodotMap' }, entry, index)
))

const STARTER_DEFINITION = {
  id: 'GodotMap',
  displayName: '新手山谷',
  regionOrder: 0,
  recommendedLevel: 5,
  levelRange: [2, 8],
  tallGrassRate: 0.16,
  startPosition: { x: 4, y: 27, direction: 'up' },
  clearings: [
    { shape: 'rect', x1: 2, y1: 23, x2: 10, y2: 30 },
    { shape: 'rect', x1: 7, y1: 18, x2: 13, y2: 22 },
    { shape: 'rect', x1: 3, y1: 4, x2: 19, y2: 11 },
    { shape: 'rect', x1: 18, y1: 5, x2: 28, y2: 12 },
    { shape: 'rect', x1: 26, y1: 8, x2: 38, y2: 17 },
    { shape: 'rect', x1: 26, y1: 20, x2: 38, y2: 30 },
    { shape: 'rect', x1: 14, y1: 23, x2: 20, y2: 30 },
    { shape: 'rect', x1: 22, y1: 24, x2: 26, y2: 30 }
  ],
  waterTiles: [
    { x: 31.2, y: 19.4, rx: 4.7, ry: 4.15, rotation: -0.04 },
    { x: 26.7, y: 29.1, rx: 2.2, ry: 1.45, rotation: 0.08 }
  ],
  waterBodies: [
    { type: 'lake', x: 31.2, y: 19.4, rx: 5.0, ry: 4.35, rotation: -0.04, salt: 10 },
    { type: 'pond', x: 26.7, y: 29.1, rx: 2.35, ry: 1.6, rotation: 0.08, salt: 22 }
  ],
  roadPaths,
  roadJunctions: [
    { x: 8, y: 28, rx: 1.12, ry: 1.12 },
    { x: 8, y: 20, rx: 1.08, ry: 1.08 },
    { x: 11, y: 20, rx: 1.16, ry: 1.16 },
    { x: 17, y: 10, rx: 1.12, ry: 1.12 },
    { x: 17, y: 14, rx: 1.08, ry: 1.08 },
    { x: 24, y: 14, rx: 1.08, ry: 1.08 },
    { x: 31, y: 25, rx: 1.0, ry: 1.0 },
    { x: 24, y: 25, rx: 0.96, ry: 0.96 },
    { x: 35, y: 25, rx: 1.0, ry: 1.0 }
  ],
  tallGrass: [
    { shape: 'rect', x1: 4, y1: 5, x2: 17, y2: 11 },
    { shape: 'rect', x1: 20, y1: 5, x2: 28, y2: 11 },
    { shape: 'rect', x1: 12, y1: 24, x2: 20, y2: 30 },
    { shape: 'rect', x1: 31, y1: 9, x2: 38, y2: 13 },
    { shape: 'rect', x1: 27, y1: 23, x2: 38, y2: 29 }
  ],
  runtimeEvents: [
    ...(fastTravelEvent ? [fastTravelEvent] : []),
    warp(
      'warp_valley_to_region_chain',
      38,
      14,
      'GodotMapV2',
      { x: 3, y: 16, direction: 'right' },
      '前往星音草径',
      {
        requiredAverageLevel: 6,
        lockedText: '队伍平均等级达到 Lv.6 后，才能前往星音草径。'
      }
    ),
    heal('heal_valley_spring', 24, 29, '营地尽头泉水'),
    ...STARTER_TRAINERS,
    ...STARTER_PICKUPS,
    ...STARTER_SIGNS
  ],
  encounterZones: [
    { id: 'sunny_meadow', name: '阳光草坡 Lv.2-3', x: 4, y: 5, width: 14, height: 7, encounterTableId: 'valley_safe_grass', tallGrassRate: 0.14 },
    { id: 'upper_flower_grass', name: '花丘草地 Lv.3-5', x: 20, y: 5, width: 9, height: 7, encounterTableId: 'valley_flower_meadow', tallGrassRate: 0.16 },
    { id: 'grove_grass', name: '密林草丛 Lv.4-6', x: 12, y: 24, width: 9, height: 7, encounterTableId: 'valley_training_thicket', tallGrassRate: 0.16 },
    { id: 'lake_north_reeds', name: '湖北浅滩 Lv.3-4', x: 31, y: 9, width: 8, height: 5, encounterTableId: 'valley_lake_shallows', tallGrassRate: 0.15 },
    { id: 'lake_south_reeds', name: '湖南苇丛 Lv.4-5', x: 27, y: 23, width: 12, height: 7, encounterTableId: 'valley_lake_reeds', tallGrassRate: 0.17 },
    { id: 'southeast_meadow', name: '东南草坡 Lv.5-8', x: 31, y: 26, width: 8, height: 5, encounterTableId: 'valley_southeast_clearing', tallGrassRate: 0.18 }
  ],
  decorativeObjects: [
    { type: 'tent', x: 3.7, y: 28.3, scale: 2.25, rotation: 0.28 },
    { type: 'campfire', x: 5.8, y: 28.9, scale: 1.58, rotation: 0.1 },
    ...STARTER_TRAINER_DECORATIONS,
    ...STARTER_PICKUP_DECORATIONS,
    { type: 'town_lantern', x: 6.15, y: 25.2, scale: 0.86, rotation: -0.18 },
    { type: 'town_lantern', x: 8.35, y: 27.7, scale: 0.78, rotation: 0.18 },
    { type: 'nature_flower_yellow_b', x: 9.7, y: 29.4, scale: 0.82 },
    { type: 'nature_flower_purple_a', x: 9.1, y: 29.45, scale: 0.78 },
    { type: 'nature_stone_flat_a', x: 13.8, y: 6.4, scale: 0.86, rotation: 0.5 },
    { type: 'stone-large', x: 16.2, y: 8.2, scale: 0.84, rotation: -0.4 },
    { type: 'nature_flower_yellow', x: 12.4, y: 7.2, scale: 1.04 },
    { type: 'nature_flower_red', x: 17.1, y: 6.6, scale: 1.02 },
    { type: 'nature_mushroom_red', x: 26.6, y: 10.4, scale: 1.06 },
    { type: 'bush-large', x: 20.4, y: 11.4, scale: 1.12, rotation: -0.2 },
    { type: 'tree-default', x: 15.2, y: 18.1, scale: 1.18 },
    { type: 'tree-pine', x: 22.4, y: 18.2, scale: 1.28 },
    { type: 'rock-large', x: 21.6, y: 19.3, scale: 1.0, rotation: 0.35 },
    { type: 'nature_canoe', x: 32.4, y: 17.2, scale: 1.12, rotation: 0.32 },
    { type: 'nature_lily_large', x: 28.9, y: 21.7, scale: 0.72, rotation: 0.2 },
    { type: 'nature_lily_large', x: 33.7, y: 20.8, scale: 0.62, rotation: -0.2 },
    { type: 'wetland_reed_clump', x: 36.1, y: 16.9, scale: 0.9, rotation: 0.24 },
    { type: 'nature_stone_flat_c', x: 16.2, y: 25.0, scale: 0.82, rotation: 0.7 },
    { type: 'nature_mushroom_red', x: 13.7, y: 28.7, scale: 0.95 },
    { type: 'survival_patch_grass_large', x: 19.3, y: 27.3, scale: 0.95, rotation: -0.3 },
    { type: 'rock-large', x: 34.6, y: 29.2, scale: 1.0, rotation: 0.4 },
    { type: 'nature_stone_flat_b', x: 29.2, y: 28.8, scale: 0.78, rotation: -0.2 }
  ],
  scatter: [
    {
      idPrefix: 'valley_tree_edges',
      types: ['tree-default', 'tree-pine', 'tree-oak', 'nature_bush_large'],
      count: 76,
      allowedTiles: [TILE.wall],
      salt: 40,
      scale: [0.92, 1.28],
      height: 0.2
    },
    {
      idPrefix: 'valley_meadow_details',
      types: ['nature_flower_yellow', 'nature_flower_red', 'nature_flower_purple_a', 'platformer_flowers', 'nature_grass_large'],
      count: 52,
      allowedTiles: [TILE.grass, TILE.tallGrass],
      salt: 48,
      scale: [0.66, 0.96],
      height: 0.16
    },
    {
      idPrefix: 'valley_lake_bank',
      types: ['wetland_reed_clump', 'nature_lily_large', 'nature_stone_flat_a', 'nature_stone_flat_c'],
      count: 38,
      area: { x1: 25, y1: 13, x2: 38, y2: 30 },
      allowedTiles: [TILE.grass, TILE.tallGrass],
      salt: 56,
      scale: [0.64, 0.94],
      height: 0.16
    }
  ]
}

const STARTER_VISUAL_BLOCKER_TILES = new Set([TILE.wall, TILE.objectBlocker])
const STARTER_WALKABLE_TILES = new Set([
  TILE.grass,
  TILE.exit,
  TILE.tallGrass,
  TILE.road,
  TILE.sand,
  TILE.bridge,
  TILE.flowers,
  TILE.paleGrass
])
const STARTER_STEP_ON_EVENT_TYPES = new Set(['item', 'pickup', FAST_TRAVEL_EVENT_TYPE])
const STARTER_ADJACENT_EVENT_TYPES = new Set(['warp', 'heal', 'sign', 'info', 'trainer', 'boss', 'challenge'])
const STARTER_CONNECTOR_BLOCKED_TILES = new Set([TILE.wall, TILE.heal, TILE.sign, TILE.water, TILE.objectBlocker])
const STARTER_BLOCKER_PROTECTED_TILES = new Set([
  TILE.exit,
  TILE.heal,
  TILE.sign,
  TILE.tallGrass,
  TILE.water,
  TILE.road,
  TILE.bridge
])
const STARTER_TIGHT_CRITICAL_ROAD_DISTANCE = 1.5
const STARTER_TIGHT_CRITICAL_EVENT_DISTANCE = 1.75
const STARTER_NEAR_CRITICAL_ROAD_DISTANCE = 2.25
const STARTER_NEAR_CRITICAL_EVENT_DISTANCE = 3
const STARTER_BOUNDARY_BLOCKER_FOOTPRINTS = {
  'bush-large': { width: 2, height: 2 },
  nature_bush_large: { width: 2, height: 2 },
  'tree-default': { width: 2, height: 2 },
  nature_tree_default: { width: 2, height: 2 },
  'tree-pine': { width: 2, height: 2 },
  nature_tree_pine: { width: 2, height: 2 },
  'tree-oak': { width: 2, height: 2 },
  nature_tree_oak: { width: 2, height: 2 },
  'rock-large': { width: 2, height: 2 },
  nature_rock_large: { width: 2, height: 2 },
  'stone-large': { width: 1, height: 1 },
  nature_stone_large: { width: 1, height: 1 }
}
const STARTER_BOUNDARY_BLOCKER_TYPE_GROUPS = {
  camp: ['bush-large', 'stone-large', 'rock-large'],
  choke: ['rock-large', 'bush-large', 'stone-large'],
  forest: ['tree-default', 'tree-pine', 'rock-large', 'bush-large'],
  lakeside: ['rock-large', 'bush-large', 'tree-default', 'stone-large']
}
const STARTER_SOFTENABLE_BOUNDARY_BLOCKER_TYPES = new Set(['stone-large', 'rock-large', 'nature_stone_large', 'nature_rock_large'])
const STARTER_BOUNDARY_FLAT_DECOR_TYPES = ['nature_stone_flat_a', 'nature_stone_flat_b', 'nature_stone_flat_c']
const STARTER_LOW_VEGETATION_TYPES = new Set([
  'grass-small',
  'grass-large',
  'nature_grass_small',
  'nature_grass_large',
  'flower-yellow',
  'flower-red',
  'nature_flower_yellow',
  'nature_flower_yellow_b',
  'nature_flower_red',
  'nature_flower_purple_a',
  'nature_mushroom_red',
  'mushroom-red',
  'platformer_flowers',
  'wetland_reed_clump'
])

function starterSeededRandom(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 2246822519
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

function starterKey(x, y) {
  return `${x},${y}`
}

function starterInBounds(map, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < map.width && y < map.height
}

function starterNeighbors(point) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ]
}

function starterEventPosition(entry) {
  return {
    x: Math.round(Number(entry?.position?.x)),
    y: Math.round(Number(entry?.position?.y))
  }
}

function isStarterConnectorWalkable(tile) {
  return tile != null && !STARTER_CONNECTOR_BLOCKED_TILES.has(tile)
}

function isStarterWalkableTile(tile) {
  return STARTER_WALKABLE_TILES.has(tile)
}

function hasStarterWalkableNeighbor(grid, x, y) {
  return (
    isStarterWalkableTile(grid[y - 1]?.[x]) ||
    isStarterWalkableTile(grid[y + 1]?.[x]) ||
    isStarterWalkableTile(grid[y]?.[x - 1]) ||
    isStarterWalkableTile(grid[y]?.[x + 1])
  )
}

function isStarterRuntimeDecoration(object) {
  return Boolean(object?.eventId || object?.eventType || object?.fixedSceneEventType)
}

function getStarterBoundaryBlockerFootprint(type, scale = 1) {
  const base = STARTER_BOUNDARY_BLOCKER_FOOTPRINTS[type] || { width: 1, height: 1 }
  const safeScale = Math.max(0.72, Number(scale) || 1)
  return {
    width: Math.max(0.72, base.width * safeScale),
    height: Math.max(0.72, base.height * safeScale)
  }
}

function isInsideStarterBoundaryBlocker(object, x, y, padding = 0) {
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
  const footprint = getStarterBoundaryBlockerFootprint(object.type, object.scale)

  return (
    Math.abs(localX) <= footprint.width / 2 + padding &&
    Math.abs(localY) <= footprint.height / 2 + padding
  )
}

function isCoveredByStarterBoundaryBlocker(decorations, x, y, padding = 0.12) {
  return decorations.some((object) => (
    !isStarterRuntimeDecoration(object) &&
    STARTER_BOUNDARY_BLOCKER_FOOTPRINTS[object?.type] &&
    isInsideStarterBoundaryBlocker(object, x, y, padding)
  ))
}

function collectStarterRoadTiles(map) {
  const roadTiles = []
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.mapGrid[y]?.[x]
      if (tile === TILE.road || tile === TILE.bridge) {
        roadTiles.push({ x, y })
      }
    }
  }
  return roadTiles
}

function buildStarterOrthogonalConnector(start, target, verticalFirst = false) {
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

function starterConnectorClear(map, connector) {
  return connector.every((point) => (
    starterInBounds(map, point.x, point.y) &&
    isStarterConnectorWalkable(map.mapGrid[point.y]?.[point.x]) &&
    map.mapGrid[point.y]?.[point.x] !== TILE.water
  ))
}

function getStarterEventAccessTarget(map, roadTiles, entry) {
  const position = starterEventPosition(entry)
  if (STARTER_STEP_ON_EVENT_TYPES.has(entry?.type)) return position

  const candidates = starterNeighbors(position)
    .filter((point) => (
      starterInBounds(map, point.x, point.y) &&
      isStarterConnectorWalkable(map.mapGrid[point.y]?.[point.x]) &&
      map.mapGrid[point.y]?.[point.x] !== TILE.water
    ))

  candidates.sort((left, right) => {
    const leftDistance = roadTiles.reduce((best, point) => (
      Math.min(best, Math.abs(point.x - left.x) + Math.abs(point.y - left.y))
    ), Infinity)
    const rightDistance = roadTiles.reduce((best, point) => (
      Math.min(best, Math.abs(point.x - right.x) + Math.abs(point.y - right.y))
    ), Infinity)
    return leftDistance - rightDistance
  })

  return candidates[0] || null
}

function collectStarterPathClearanceCells(map) {
  const cells = new Set()
  const roadTiles = collectStarterRoadTiles(map)
  const events = Array.isArray(map?.runtimeEvents) ? map.runtimeEvents : []

  events.forEach((entry) => {
    const position = starterEventPosition(entry)
    const targets = STARTER_ADJACENT_EVENT_TYPES.has(entry?.type)
      ? starterNeighbors(position).filter((point) => (
        starterInBounds(map, point.x, point.y) &&
        map.mapGrid[point.y]?.[point.x] !== TILE.water
      ))
      : [getStarterEventAccessTarget(map, roadTiles, entry)].filter(Boolean)

    targets.forEach((target) => {
      cells.add(starterKey(target.x, target.y))

      let best = null
      roadTiles.forEach((start) => {
        ;[false, true].forEach((verticalFirst) => {
          const connector = buildStarterOrthogonalConnector(start, target, verticalFirst)
          if (!starterConnectorClear(map, connector)) return
          const score = connector.length * 10 + (verticalFirst ? 1 : 0)
          if (!best || score < best.score) best = { connector, score }
        })
      })

      if (!best) return
      best.connector.forEach((point) => cells.add(starterKey(point.x, point.y)))
    })
  })

  events.forEach((entry) => {
    const position = starterEventPosition(entry)
    if (!starterInBounds(map, position.x, position.y)) return
    if (STARTER_STEP_ON_EVENT_TYPES.has(entry?.type) || STARTER_ADJACENT_EVENT_TYPES.has(entry?.type)) {
      cells.add(starterKey(position.x, position.y))
    }
    if (!STARTER_ADJACENT_EVENT_TYPES.has(entry?.type)) return

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const tileX = position.x + dx
        const tileY = position.y + dy
        if (!starterInBounds(map, tileX, tileY)) continue
        if (map.mapGrid[tileY]?.[tileX] === TILE.water) continue
        cells.add(starterKey(tileX, tileY))
      }
    }
  })

  return cells
}

function resolveStarterBoundaryBlockerGroup(x, y) {
  if (y >= 23 && x <= 12) return 'camp'
  if (x >= 29 || (x >= 24 && y >= 20)) return 'lakeside'
  if (x >= 12 && x <= 18 && y >= 12 && y <= 24) return 'choke'
  return 'forest'
}

function distanceToStarterRoadPaths(tileX, tileY) {
  return ROAD_PATHS.reduce((best, path) => {
    const points = Array.isArray(path?.points) ? path.points : []
    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      const dx = bx - ax
      const dy = by - ay
      const lenSq = dx * dx + dy * dy
      const t = lenSq <= 0 ? 0 : Math.max(0, Math.min(1, ((tileX - ax) * dx + (tileY - ay) * dy) / lenSq))
      const px = ax + dx * t
      const py = ay + dy * t
      best = Math.min(best, Math.hypot(tileX - px, tileY - py))
    }
    return best
  }, Infinity)
}

function distanceToStarterRuntimeEvents(map, tileX, tileY) {
  return (map?.runtimeEvents || []).reduce((best, event) => {
    const x = Number(event?.position?.x)
    const y = Number(event?.position?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return best
    return Math.min(best, Math.hypot(tileX - x, tileY - y))
  }, Infinity)
}

function resolveStarterBoundaryBlockerType(x, y, roadDistance, eventDistance) {
  if (
    roadDistance <= STARTER_NEAR_CRITICAL_ROAD_DISTANCE ||
    eventDistance <= STARTER_NEAR_CRITICAL_EVENT_DISTANCE
  ) return 'stone-large'
  const group = STARTER_BOUNDARY_BLOCKER_TYPE_GROUPS[resolveStarterBoundaryBlockerGroup(x, y)]
  const index = Math.floor(starterSeededRandom(x, y, 91) * group.length) % group.length
  return group[index]
}

function resolveStarterBoundaryBlockerScale(type, x, y, roadDistance, eventDistance) {
  if (
    type === 'stone-large' &&
    (
      roadDistance <= STARTER_NEAR_CRITICAL_ROAD_DISTANCE ||
      eventDistance <= STARTER_NEAR_CRITICAL_EVENT_DISTANCE
    )
  ) {
    return Number((0.72 + starterSeededRandom(x, y, 117) * 0.08).toFixed(2))
  }
  const base = {
    'bush-large': 0.84,
    'tree-default': 0.88,
    'tree-pine': 0.84,
    'tree-oak': 0.84,
    'rock-large': 0.8,
    'stone-large': 0.92
  }[type] || 0.86
  return Number((base + starterSeededRandom(x, y, 123) * 0.12).toFixed(2))
}

function resolveStarterBoundaryOffset(grid, x, y, depth = 0.28) {
  const vectors = []
  if (isStarterWalkableTile(grid[y - 1]?.[x])) vectors.push({ x: 0, y: 1 })
  if (isStarterWalkableTile(grid[y + 1]?.[x])) vectors.push({ x: 0, y: -1 })
  if (isStarterWalkableTile(grid[y]?.[x - 1])) vectors.push({ x: 1, y: 0 })
  if (isStarterWalkableTile(grid[y]?.[x + 1])) vectors.push({ x: -1, y: 0 })
  if (vectors.length === 0) return { x: 0, y: 0 }

  const total = vectors.reduce((sum, vector) => ({
    x: sum.x + vector.x,
    y: sum.y + vector.y
  }), { x: 0, y: 0 })
  const length = Math.hypot(total.x, total.y) || 1

  return {
    x: Number(((total.x / length) * depth).toFixed(2)),
    y: Number(((total.y / length) * depth).toFixed(2))
  }
}

function createStarterBoundaryBlockerCandidate(grid, x, y, {
  type,
  scale,
  depth,
  jitterRange,
  saltBase = 0
}) {
  const offset = resolveStarterBoundaryOffset(grid, x, y, depth)
  const jitterX = (starterSeededRandom(x, y, 151 + saltBase) - 0.5) * jitterRange
  const jitterY = (starterSeededRandom(x, y, 167 + saltBase) - 0.5) * jitterRange

  return {
    type,
    x: Number((x + offset.x + jitterX).toFixed(2)),
    y: Number((y + offset.y + jitterY).toFixed(2)),
    scale,
    rotation: Number((starterSeededRandom(x, y, 183 + saltBase) * Math.PI * 2).toFixed(4)),
    sourceId: `starter_boundary_blocker_${x}_${y}`
  }
}

function getStarterBoundaryCandidateCells(map, object, padding = 0.28) {
  const centerX = Number(object?.x)
  const centerY = Number(object?.y)
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return []

  const footprint = getStarterBoundaryBlockerFootprint(object.type, object.scale)
  const radius = Math.ceil(Math.max(footprint.width, footprint.height) / 2 + padding + 1)
  const cells = []
  const seen = new Set()

  for (let tileY = Math.floor(centerY) - radius; tileY <= Math.ceil(centerY) + radius; tileY += 1) {
    for (let tileX = Math.floor(centerX) - radius; tileX <= Math.ceil(centerX) + radius; tileX += 1) {
      if (!starterInBounds(map, tileX, tileY)) continue
      if (!isInsideStarterBoundaryBlocker(object, tileX, tileY, padding)) continue
      const cellKey = starterKey(tileX, tileY)
      if (seen.has(cellKey)) continue
      seen.add(cellKey)
      cells.push({ x: tileX, y: tileY })
    }
  }

  return cells
}

function overlapsStarterPathClearance(map, object, clearanceCells, padding = 0.28) {
  return getStarterBoundaryCandidateCells(map, object, padding)
    .some((cell) => clearanceCells.has(starterKey(cell.x, cell.y)))
}

function paintStarterBoundaryBlockerFootprints(map, grid, decorations) {
  const eventKeys = new Set(
    (map?.runtimeEvents || [])
      .map((event) => {
        const position = starterEventPosition(event)
        return starterInBounds(map, position.x, position.y) ? starterKey(position.x, position.y) : null
      })
      .filter(Boolean)
  )

  ;(decorations || []).forEach((object) => {
    if (isStarterRuntimeDecoration(object)) return
    if (!STARTER_BOUNDARY_BLOCKER_FOOTPRINTS[object?.type]) return

    getStarterBoundaryCandidateCells(map, object, 0.08).forEach((cell) => {
      if (eventKeys.has(starterKey(cell.x, cell.y))) return
      const tile = grid[cell.y]?.[cell.x]
      if (STARTER_BLOCKER_PROTECTED_TILES.has(tile)) return
      grid[cell.y][cell.x] = TILE.objectBlocker
    })
  })
}

function starterBoundaryTouchesBlockedTiles(grid, map, object, padding = 0) {
  return getStarterBoundaryCandidateCells(map, object, padding)
    .some((cell) => !isStarterWalkableTile(grid[cell.y]?.[cell.x]))
}

function softenStarterBoundaryBlockerObject(object) {
  const x = Math.round(Number(object?.x) || 0)
  const y = Math.round(Number(object?.y) || 0)
  const variantIndex = Math.floor(starterSeededRandom(x, y, 247) * STARTER_BOUNDARY_FLAT_DECOR_TYPES.length) % STARTER_BOUNDARY_FLAT_DECOR_TYPES.length
  const nextType = STARTER_BOUNDARY_FLAT_DECOR_TYPES[variantIndex]
  const scaleFactor = object?.type === 'rock-large' || object?.type === 'nature_rock_large' ? 0.72 : 0.84

  return {
    ...object,
    type: nextType,
    scale: Number((Math.max(0.58, Number(object?.scale) || 0.8) * scaleFactor).toFixed(2)),
    softenedFrom: object?.type || nextType
  }
}

function splitStarterBoundaryBlockersByCollision(map, grid, decorations) {
  const blocking = []
  const visual = []

  ;(decorations || []).forEach((object) => {
    const isSoftenableBoundaryBlocker = (
      typeof object?.sourceId === 'string' &&
      object.sourceId.startsWith('starter_boundary_blocker_') &&
      STARTER_SOFTENABLE_BOUNDARY_BLOCKER_TYPES.has(object?.type)
    )

    if (isSoftenableBoundaryBlocker && !starterBoundaryTouchesBlockedTiles(grid, map, object, 0)) {
      visual.push(softenStarterBoundaryBlockerObject(object))
      return
    }

    blocking.push(object)
    visual.push(object)
  })

  return { blocking, visual }
}

function isStarterLowVegetationDecoration(object) {
  return STARTER_LOW_VEGETATION_TYPES.has(object?.type)
}

function filterStarterBlockedLowVegetationDecorations(decorations, grid, map) {
  return (decorations || []).filter((object) => {
    if (isStarterRuntimeDecoration(object)) return true
    if (!isStarterLowVegetationDecoration(object)) return true

    const x = Math.round(Number(object.x))
    const y = Math.round(Number(object.y))
    if (!starterInBounds(map, x, y)) return true
    if (isStarterWalkableTile(grid[y]?.[x])) return true
    return !hasStarterWalkableNeighbor(grid, x, y)
  })
}

function buildStarterBoundaryBlockers(map) {
  const grid = map?.mapGrid || []
  const baseDecorations = Array.isArray(map?.decorativeObjects) ? map.decorativeObjects : []
  const clearanceCells = collectStarterPathClearanceCells(map)
  const added = []

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = grid[y]?.[x]
      if (!STARTER_VISUAL_BLOCKER_TILES.has(tile)) continue
      if (!hasStarterWalkableNeighbor(grid, x, y)) continue
      if (isCoveredByStarterBoundaryBlocker([...baseDecorations, ...added], x, y)) continue

      const roadDistance = distanceToStarterRoadPaths(x, y)
      const eventDistance = distanceToStarterRuntimeEvents(map, x, y)
      const type = resolveStarterBoundaryBlockerType(x, y, roadDistance, eventDistance)
      const scale = resolveStarterBoundaryBlockerScale(type, x, y, roadDistance, eventDistance)
      const isNearCriticalPath = (
        roadDistance <= STARTER_NEAR_CRITICAL_ROAD_DISTANCE ||
        eventDistance <= STARTER_NEAR_CRITICAL_EVENT_DISTANCE
      )
      const isTightCriticalPath = (
        roadDistance <= STARTER_TIGHT_CRITICAL_ROAD_DISTANCE ||
        eventDistance <= STARTER_TIGHT_CRITICAL_EVENT_DISTANCE
      )
      const attempts = [
        createStarterBoundaryBlockerCandidate(grid, x, y, {
          type,
          scale,
          depth: isTightCriticalPath ? 0.42 : isNearCriticalPath ? 0.5 : 0.28,
          jitterRange: isNearCriticalPath ? 0.04 : 0.14
        }),
        createStarterBoundaryBlockerCandidate(grid, x, y, {
          type: 'stone-large',
          scale: Number((0.68 + starterSeededRandom(x, y, 211) * 0.08).toFixed(2)),
          depth: isTightCriticalPath ? 0.56 : isNearCriticalPath ? 0.6 : 0.48,
          jitterRange: 0.03,
          saltBase: 32
        }),
        createStarterBoundaryBlockerCandidate(grid, x, y, {
          type: 'stone-large',
          scale: Number((0.62 + starterSeededRandom(x, y, 227) * 0.06).toFixed(2)),
          depth: isTightCriticalPath ? 0.66 : isNearCriticalPath ? 0.72 : 0.56,
          jitterRange: 0.01,
          saltBase: 64
        })
      ]

      const candidate = attempts.find((entry) => !overlapsStarterPathClearance(map, entry, clearanceCells))
      if (!candidate) continue

      added.push(candidate)
    }
  }

  return added
}

const generatedStarterMap = buildGodotRegionMap(STARTER_DEFINITION)
const starterBoundaryBlockers = buildStarterBoundaryBlockers(generatedStarterMap)
const {
  visual: starterBoundaryVisualDecorations
} = splitStarterBoundaryBlockersByCollision(generatedStarterMap, generatedStarterMap.mapGrid, starterBoundaryBlockers)
const starterDecorativeObjectsBase = [
  ...(generatedStarterMap.decorativeObjects || []).map((object) => (
    object?.sourceId === 'fast_travel_newbie_valley_flower_w'
      ? { ...object, x: 5.05, y: 29.78 }
      : object
  )),
  ...starterBoundaryVisualDecorations
]
const starterMapGridWithBoundaryBlockers = generatedStarterMap.mapGrid.map((row) => [...row])
const starterDecorativeObjectsPreCollision = cleanupRoadSurfaceDecorations(
  starterDecorativeObjectsBase,
  starterMapGridWithBoundaryBlockers,
  generatedStarterMap.runtimeEvents
)
paintStarterBoundaryBlockerFootprints(generatedStarterMap, starterMapGridWithBoundaryBlockers, starterDecorativeObjectsPreCollision)
const starterDecorativeObjects = filterStarterBlockedLowVegetationDecorations(
  starterDecorativeObjectsPreCollision,
  starterMapGridWithBoundaryBlockers,
  generatedStarterMap
)

const newbieValleyMap = {
  ...generatedStarterMap,
  name: 'GodotMap',
  theme: STARTER_THEME,
  mapGrid: starterMapGridWithBoundaryBlockers,
  decorativeObjects: starterDecorativeObjects,
  generationNotes: {
    ...generatedStarterMap.generationNotes,
    generatedFrom: 'src/game/data/godotMaps/my_first_map.js',
    roadSingleSource: true,
    design: 'Starter valley now uses the same definition-driven map format as the region chain. Roads, bridges, events, grass zones, and visible paths are generated from one schema.'
  }
}

export default newbieValleyMap
