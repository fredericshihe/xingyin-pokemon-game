import { FAST_TRAVEL_COST, FAST_TRAVEL_EVENT_TYPE, getFastTravelStation, getFastTravelStationMeta } from '../fastTravel.js'
import { buildGodotRegionMap, buildThemedPickupDecorations, REGION_MAP_TILE as TILE } from './godot_region_maps.js'

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
    points: [[4, 26], [11, 26], [11, 20], [18, 20], [18, 16], [26, 16], [26, 14], [38, 14]],
    width: 3,
    paintRadius: 0.78,
    visualRadius: 0.78,
    edgeRadius: 0.94
  },
  {
    id: 'starter_camp_station_spur',
    points: [[7, 28], [7, 26]],
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
    points: [[18, 16], [18, 9], [24, 9]],
    width: 3,
    paintRadius: 0.68,
    visualRadius: 0.68,
    edgeRadius: 0.84
  },
  {
    id: 'starter_lake_bridge_route',
    points: [[26, 14], [31, 14], [31, 25], [35, 25], [35, 28]],
    width: 3,
    paintRadius: 0.68,
    visualRadius: 0.68,
    edgeRadius: 0.84
  },
  {
    id: 'starter_spring_dead_end',
    points: [[18, 20], [18, 26], [22, 26], [22, 29]],
    width: 3,
    paintRadius: 0.66,
    visualRadius: 0.66,
    edgeRadius: 0.82
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
    5,
    24,
    '营地入口：沿土路去草坡。草丛才会遇敌。'
  ),
  sign(
    'sign_valley_safe_meadow',
    9,
    14,
    '阳光草坡 Lv.2-4：适合初战。受伤回泉水。'
  ),
  sign(
    'sign_valley_fork',
    20,
    18,
    '山谷岔路：北花丘，东湖岸，南密林。'
  ),
  sign(
    'sign_valley_flower_hill',
    24,
    7,
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
    '东侧出口：星音草径 Lv.5-12。带好药水。'
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
    beforeBattleText: '营地练习生举起精灵球：我会用最基础的节奏和你练一场！',
    defeatedText: '营地练习生笑着点头：很稳，记得受伤后去泉水恢复。',
    dailyDefeatedText: '营地练习生：今天已经练过啦，明天我再陪你对战。'
  }),
  trainer('valley_trainer_flower_hill', 20, 14, {
    name: '花丘学员',
    title: '花丘捕捉练习',
    team: [
      { pokemonId: 13, level: 4 },
      { pokemonId: 4, level: 4 }
    ],
    beforeBattleText: '花丘学员整理好背包：这里适合练习属性判断，我们来试试吧！',
    defeatedText: '花丘学员收起伙伴：你已经能应对花丘的节奏了。',
    dailyDefeatedText: '花丘学员：我今天的练习结束了，明天再继续。'
  }),
  trainer('valley_trainer_lake_path', 36, 23, {
    name: '湖畔观察员',
    title: '湖岸进阶练习',
    team: [
      { pokemonId: 16, level: 5 },
      { pokemonId: 14, level: 5 }
    ],
    beforeBattleText: '湖畔观察员指向芦草：水边的对战更考验准备，来一场吧！',
    defeatedText: '湖畔观察员把路线让开：去东南草坡前，你已经准备得不错了。',
    dailyDefeatedText: '湖畔观察员：湖边记录已经完成，明天再来挑战我吧。'
  })
]

const STARTER_PICKUPS = [
  pickup('valley_pickup_camp_balls', 4, 24, 'pokeball', 'pokeball_basic', 2, '你找到了营地补给：精灵球 x2。'),
  pickup('valley_pickup_meadow_potion', 16, 12, 'potion', 'potion', 1, '你在阳光草坡边发现了一瓶伤药。'),
  pickup('valley_pickup_flower_exp', 26, 7, 'expPotion', 'exp_potion_small', 1, '你在花丘草地发现了一瓶小经验药水。'),
  pickup('valley_pickup_lake_ball', 29, 24, 'pokeball', 'pokeball_basic', 1, '你在湖畔石头旁找到了一颗精灵球。'),
  pickup('valley_pickup_spring_potion', 20, 29, 'potion', 'potion', 1, '你在泉水支路尽头找到了一瓶备用伤药。')
]

const STARTER_TRAINER_DECORATIONS = STARTER_TRAINERS.map((entry, index) => ({
  type: ['blocky_character_a', 'blocky_character_b', 'blocky_character_c'][index % 3],
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
  startPosition: { x: 5, y: 26, direction: 'right' },
  clearings: [
    { shape: 'rect', x1: 2, y1: 23, x2: 12, y2: 30 },
    { shape: 'rect', x1: 8, y1: 14, x2: 26, y2: 27 },
    { shape: 'rect', x1: 3, y1: 4, x2: 19, y2: 13 },
    { shape: 'rect', x1: 18, y1: 5, x2: 28, y2: 12 },
    { shape: 'rect', x1: 26, y1: 8, x2: 38, y2: 17 },
    { shape: 'rect', x1: 26, y1: 20, x2: 38, y2: 30 },
    { shape: 'rect', x1: 10, y1: 22, x2: 25, y2: 30 }
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
    { x: 11, y: 26, rx: 1.15, ry: 1.15 },
    { x: 11, y: 20, rx: 1.16, ry: 1.16 },
    { x: 18, y: 20, rx: 1.12, ry: 1.12 },
    { x: 18, y: 16, rx: 1.12, ry: 1.12 },
    { x: 26, y: 14, rx: 1.1, ry: 1.1 },
    { x: 31, y: 25, rx: 1.0, ry: 1.0 },
    { x: 35, y: 25, rx: 1.0, ry: 1.0 }
  ],
  tallGrass: [
    { shape: 'rect', x1: 4, y1: 5, x2: 17, y2: 11 },
    { shape: 'rect', x1: 20, y1: 5, x2: 28, y2: 11 },
    { shape: 'rect', x1: 10, y1: 23, x2: 20, y2: 30 },
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
      { requiredAverageLevel: 5 }
    ),
    heal('heal_valley_spring', 24, 29, '营地尽头泉水'),
    ...STARTER_TRAINERS,
    ...STARTER_PICKUPS,
    ...STARTER_SIGNS
  ],
  encounterZones: [
    { id: 'sunny_meadow', name: '阳光草坡 Lv.2-4', x: 4, y: 5, width: 14, height: 7, encounterTableId: 'valley_safe_grass', tallGrassRate: 0.14 },
    { id: 'upper_flower_grass', name: '花丘草地 Lv.3-5', x: 20, y: 5, width: 9, height: 7, encounterTableId: 'valley_flower_meadow', tallGrassRate: 0.16 },
    { id: 'grove_grass', name: '密林草丛 Lv.4-7', x: 10, y: 23, width: 11, height: 8, encounterTableId: 'valley_training_thicket', tallGrassRate: 0.18 },
    { id: 'lake_north_reeds', name: '湖北芦草 Lv.3-6', x: 31, y: 9, width: 8, height: 5, encounterTableId: 'valley_lake_reeds', tallGrassRate: 0.16 },
    { id: 'lake_south_reeds', name: '湖南苇丛 Lv.3-6', x: 27, y: 23, width: 12, height: 7, encounterTableId: 'valley_lake_reeds', tallGrassRate: 0.17 },
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
    { type: 'rock-large', x: 13.8, y: 6.4, scale: 0.95, rotation: 0.5 },
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
    { type: 'stone-large', x: 16.2, y: 25.0, scale: 0.9, rotation: 0.7 },
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

const generatedStarterMap = buildGodotRegionMap(STARTER_DEFINITION)

const newbieValleyMap = {
  ...generatedStarterMap,
  name: 'GodotMap',
  theme: STARTER_THEME,
  generationNotes: {
    ...generatedStarterMap.generationNotes,
    generatedFrom: 'src/game/data/godotMaps/my_first_map.js',
    roadSingleSource: true,
    design: 'Starter valley now uses the same definition-driven map format as the region chain. Roads, bridges, events, grass zones, and visible paths are generated from one schema.'
  }
}

export default newbieValleyMap
