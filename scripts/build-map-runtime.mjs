import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import oldMap from '../src/game/data/godotMaps/my_first_map.js'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourcePath = path.join(repoRoot, 'src/game/data/mapSources/godotMapV2.source.json')
const outputPath = path.join(repoRoot, 'src/game/data/godotMaps/godot_map_v2.generated.js')

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))

const TILE = {
  grass: 0,
  wall: 1,
  sign: 6,
  tallGrass: 8,
  water: 11,
  road: 12,
  bridge: 15
}

const RUNTIME_TYPE_BY_ASSET = {
  nature_grass_small: 'grass-small',
  nature_grass_large: 'grass-large',
  nature_bush_large: 'bush-large',
  nature_tree_oak: 'tree-oak',
  nature_tree_default: 'tree-default',
  nature_tree_pine: 'tree-pine',
  nature_rock_large: 'rock-large',
  nature_stone_large: 'stone-large',
  nature_flower_yellow: 'flower-yellow',
  nature_flower_red: 'flower-red',
  nature_mushroom_red: 'mushroom-red',
  camp_tent_open: 'tent',
  campfire_stone_ring: 'campfire',
  trail_sign: 'sign',
  player_child_adventurer: 'sign',
  wetland_reed_clump: 'wetland_reed_clump',
  ridge_block_grass_edge: 'ridge_block_grass_edge',
  shore_dock_small: 'shore_dock_small',
  shore_rowboat: 'shore_rowboat',
  town_stall_green: 'town_stall_green',
  town_fence_low: 'town_fence_low',
  farm_cart_high: 'farm_cart_high',
  grave_lantern_glass: 'grave_lantern_glass',
  grave_iron_fence_broken: 'grave_iron_fence_broken',
  mine_crate_strong: 'mine_crate_strong',
  mine_control_lever: 'mine_control_lever'
}

const RUNTIME_TABLE_BY_SOURCE_TABLE = {
  mist_slope_grass: 'route102_meadow',
  mist_ridge_meadow: 'route102_pass',
  mist_ridge_rock: 'route102_pass',
  mist_wetland_water: 'route102_lake',
  mist_logging_highland: 'route102_clearing',
  mist_mushroom_ruin: 'route102_thicket',
  mist_farm_edge: 'route102_clearing',
  mist_delta_water: 'route102_lake',
  mist_mine_rock: 'route102_pass',
  mist_mine_metal: 'route102_pass',
  mist_ridge_rare: 'route102_pass',
  mist_shore_water: 'route102_lake',
  mist_farm_rare: 'route102_clearing',
  mist_mine_rare: 'route102_pass'
}

const WATER_EDGE_ASSETS = new Set([
  'shore_dock_small',
  'shore_rowboat',
  'nature_canoe',
  'nature_lily_large',
  'pirate_boat_row_large',
  'pirate_ship_wreck',
  'hex_water_rocks',
  'hex_bridge'
])

const RULE_ASSET_WEIGHTS = {
  ridge_stone_line: {
    nature_rock_large: 3,
    nature_stone_large: 5,
    ridge_block_grass_edge: 2
  },
  slope_flower_transition: {
    nature_flower_yellow: 5,
    nature_flower_red: 4,
    nature_stone_large: 2
  },
  wetland_reed_waterline: {
    nature_grass_large: 4,
    wetland_reed_clump: 7,
    nature_stone_large: 2
  },
  shore_life_band: {
    shore_dock_small: 1,
    shore_rowboat: 2,
    nature_stone_large: 8
  },
  outpost_outer_ring: {
    town_fence_low: 8,
    town_stall_green: 2,
    camp_tent_open: 1,
    trail_sign: 1
  },
  logging_work_line: {
    nature_tree_pine: 4,
    nature_bush_large: 3,
    nature_rock_large: 2
  },
  mushroom_ruin_hint_line: {
    nature_mushroom_red: 7,
    grave_lantern_glass: 2,
    grave_iron_fence_broken: 2
  },
  farm_boundary_order: {
    town_fence_low: 7,
    farm_cart_high: 1,
    nature_flower_yellow: 5
  },
  delta_camp_water_edge: {
    shore_rowboat: 2,
    camp_tent_open: 1,
    campfire_stone_ring: 1,
    nature_stone_large: 7
  },
  mine_pressure_gradient: {
    mine_crate_strong: 4,
    mine_control_lever: 1,
    nature_rock_large: 5,
    ridge_block_grass_edge: 4
  },
  open_grass_micro_detail: {
    nature_grass_leafs: 6,
    nature_path_stone: 4,
    nature_stone_flat_a: 4,
    nature_stone_flat_b: 4,
    nature_flower_yellow_b: 5,
    nature_flower_red_b: 5,
    nature_flower_purple_a: 2,
    survival_patch_grass: 5,
    platformer_flowers: 3,
    pirate_grass_patch: 2
  },
  outpost_work_supplies: {
    survival_box: 5,
    survival_barrel: 4,
    survival_resource_wood: 4,
    survival_resource_planks: 4,
    survival_bedroll_packed: 3,
    survival_workbench: 2,
    town_stall_bench: 3,
    town_lantern: 3
  },
  shore_pirate_detail: {
    pirate_barrel: 5,
    pirate_crate: 5,
    pirate_rocks_sand_a: 4,
    pirate_rocks_sand_b: 4,
    pirate_patch_sand_foliage: 4,
    pirate_bottle: 4,
    pirate_flag_pennant: 2,
    pirate_chest: 2,
    pirate_mast: 1,
    pirate_ship_wreck: 1
  },
  farm_village_detail: {
    nature_wheat_stage_a: 5,
    nature_wheat_stage_b: 5,
    nature_crop_carrot: 4,
    nature_crop_pumpkin: 4,
    town_hedge: 4,
    town_stall_stool: 2,
    town_cart: 2,
    town_lantern: 2,
    hex_building_farm: 1
  },
  graveyard_ruin_detail: {
    grave_gravestone_round: 4,
    grave_gravestone_broken: 4,
    grave_cross_wood: 3,
    grave_pumpkin: 4,
    grave_candle: 3,
    grave_urn_round: 2,
    grave_rocks: 4,
    grave_bench_damaged: 1,
    grave_coffin_old: 1,
    grave_character_ghost: 1
  },
  mine_platformer_detail: {
    platformer_rocks: 5,
    platformer_stones: 5,
    platformer_crate: 4,
    platformer_barrel: 4,
    survival_metal_panel: 3,
    survival_tool_pickaxe: 2,
    platformer_fence_low_straight: 3,
    hex_building_mine: 1,
    pirate_cannon: 1
  },
  hex_landmark_detail: {
    hex_unit_tree: 4,
    hex_stone_rocks: 4,
    hex_stone_hill: 3,
    hex_grass_forest: 4,
    hex_building_cabin: 1,
    hex_building_dock: 1,
    hex_building_watermill: 1,
    hex_building_market: 1,
    hex_building_port: 1
  },
  blocky_npc_marks: {
    blocky_character_a: 1,
    blocky_character_b: 1,
    blocky_character_c: 1,
    blocky_character_d: 1,
    blocky_character_e: 1,
    blocky_character_f: 1
  }
}

const RULE_ASSET_CAPS = {
  shore_life_band: {
    shore_dock_small: 2,
    shore_rowboat: 4
  },
  outpost_outer_ring: {
    town_stall_green: 4,
    camp_tent_open: 2,
    trail_sign: 2
  },
  mushroom_ruin_hint_line: {
    grave_lantern_glass: 6,
    grave_iron_fence_broken: 6
  },
  farm_boundary_order: {
    farm_cart_high: 3
  },
  delta_camp_water_edge: {
    shore_rowboat: 3,
    camp_tent_open: 2,
    campfire_stone_ring: 2
  },
  mine_pressure_gradient: {
    mine_control_lever: 3
  },
  outpost_work_supplies: {
    survival_workbench: 3,
    town_stall_bench: 4,
    town_lantern: 5
  },
  shore_pirate_detail: {
    pirate_chest: 4,
    pirate_flag: 3,
    pirate_flag_pennant: 5,
    pirate_mast: 3,
    pirate_ship_wreck: 1,
    pirate_cannon: 2,
    pirate_boat_row_large: 3
  },
  farm_village_detail: {
    town_cart: 4,
    town_lantern: 5,
    hex_building_farm: 2,
    town_windmill: 1,
    town_watermill: 1
  },
  graveyard_ruin_detail: {
    grave_bench_damaged: 3,
    grave_coffin_old: 3,
    grave_character_ghost: 2
  },
  mine_platformer_detail: {
    hex_building_mine: 2,
    pirate_cannon: 2,
    survival_tool_pickaxe: 4,
    survival_workbench: 2
  },
  hex_landmark_detail: {
    hex_building_cabin: 2,
    hex_building_dock: 2,
    hex_building_watermill: 1,
    hex_building_market: 1,
    hex_building_port: 1,
    hex_building_mine: 1
  },
  blocky_npc_marks: {
    blocky_character_a: 2,
    blocky_character_b: 2,
    blocky_character_c: 2,
    blocky_character_d: 2,
    blocky_character_e: 2,
    blocky_character_f: 2
  }
}

const grid = Array.from({ length: source.dimensions.height }, (_, y) =>
  Array.from({ length: source.dimensions.width }, (_, x) =>
    x === 0 ||
    y === 0 ||
    x === source.dimensions.width - 1 ||
    y === source.dimensions.height - 1
      ? TILE.wall
      : TILE.grass
  )
)

const preserve = source.preserveRegion
for (let y = 0; y < preserve.height; y += 1) {
  for (let x = 0; x < preserve.width; x += 1) {
    const oldTile = oldMap.mapGrid[y]?.[x]
    if (oldTile == null) continue
    grid[preserve.y + y][preserve.x + x] = oldTile
  }
}

const runtimeRoadRoutes = source.routes.filter((route) => route.role === 'main')

function inMap(x, y) {
  return x >= 0 && y >= 0 && x < source.dimensions.width && y < source.dimensions.height
}

function insidePreserve(x, y) {
  return (
    x >= preserve.x &&
    x < preserve.x + preserve.width &&
    y >= preserve.y &&
    y < preserve.y + preserve.height
  )
}

function canPaintConnectorCell(x, y) {
  if (!insidePreserve(x, y)) return true
  const nearEastExit = x >= preserve.x + preserve.width - 5 && y >= 13 && y <= 22
  const nearSouthExit = y >= preserve.y + preserve.height - 3 && x >= 16 && x <= 24
  return nearEastExit || nearSouthExit
}

function restorePreservedRegionExceptConnectors() {
  for (let y = 0; y < preserve.height; y += 1) {
    for (let x = 0; x < preserve.width; x += 1) {
      const worldX = preserve.x + x
      const worldY = preserve.y + y
      if (canPaintConnectorCell(worldX, worldY)) continue
      const oldTile = oldMap.mapGrid[y]?.[x]
      if (oldTile == null) continue
      grid[worldY][worldX] = oldTile
    }
  }
}

function isOnlyGrassAllowed(x, y, onlyGrass) {
  if (!onlyGrass) return true
  return grid[y]?.[x] === TILE.grass
}

function paintRect(x1, y1, x2, y2, tile, { onlyGrass = false } = {}) {
  for (let y = Math.max(0, y1); y <= Math.min(source.dimensions.height - 1, y2); y += 1) {
    for (let x = Math.max(0, x1); x <= Math.min(source.dimensions.width - 1, x2); x += 1) {
      if (!isOnlyGrassAllowed(x, y, onlyGrass)) continue
      grid[y][x] = tile
    }
  }
}

function paintEllipse(cx, cy, rx, ry, tile, { onlyGrass = false, skipProtected = false, protectedCells = new Set() } = {}) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      if (!inMap(x, y)) continue
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy > 1) continue
      if (skipProtected && protectedCells.has(`${x},${y}`)) continue
      if (!isOnlyGrassAllowed(x, y, onlyGrass)) continue
      grid[y][x] = tile
    }
  }
}

function paintLine(x1, y1, x2, y2, tile, radius, options = {}) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 3
  const painted = new Set()
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps
    const cx = x1 + (x2 - x1) * t
    const cy = y1 + (y2 - y1) * t
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if (!inMap(x, y)) continue
        if (options.respectPreserve && !canPaintConnectorCell(x, y)) continue
        const dist = Math.hypot(x - cx, y - cy)
        if (dist > radius) continue
        grid[y][x] = tile
        painted.add(`${x},${y}`)
      }
    }
  }
  return painted
}

function paintRoute(route, { collectOnly = false } = {}) {
  const radius = Math.max(0.7, route.width / 2)
  const cells = new Set()
  for (let i = 0; i < route.anchors.length - 1; i += 1) {
    const a = route.anchors[i]
    const b = route.anchors[i + 1]
    if (collectOnly) {
      paintLineCollect(a.x, a.y, b.x, b.y, radius).forEach((key) => cells.add(key))
    } else {
      paintLine(a.x, a.y, b.x, b.y, TILE.road, radius, { respectPreserve: true }).forEach((key) => cells.add(key))
    }
  }
  return cells
}

function paintLineCollect(x1, y1, x2, y2, radius) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 3
  const cells = new Set()
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps
    const cx = x1 + (x2 - x1) * t
    const cy = y1 + (y2 - y1) * t
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if (!inMap(x, y)) continue
        if (Math.hypot(x - cx, y - cy) <= radius) cells.add(`${x},${y}`)
      }
    }
  }
  return cells
}

function protectedCircleCells(clearings, bridges) {
  const cells = new Set()
  const addCircle = (x, y, radius) => {
    for (let cy = Math.floor(y - radius); cy <= Math.ceil(y + radius); cy += 1) {
      for (let cx = Math.floor(x - radius); cx <= Math.ceil(x + radius); cx += 1) {
        if (!inMap(cx, cy)) continue
        if (Math.hypot(cx - x, cy - y) <= radius) cells.add(`${cx},${cy}`)
      }
    }
  }
  clearings.forEach((clearing) => addCircle(clearing.x, clearing.y, clearing.radius))
  bridges.forEach((bridge) => addCircle(bridge.x, bridge.y, bridge.clearanceRadius || 3))
  return cells
}

function paintWater(body) {
  if (body.type === 'rect') {
    paintRect(body.x, body.y, body.x + body.width - 1, body.y + body.height - 1, TILE.water)
    return
  }
  paintEllipse(body.x, body.y, body.rx, body.ry, TILE.water)
}

function isInsideSourceWater(x, y, padding = 0) {
  return source.waterBodies.some((body) => {
    if (body.type === 'rect') {
      return (
        x >= body.x - padding &&
        x <= body.x + body.width - 1 + padding &&
        y >= body.y - padding &&
        y <= body.y + body.height - 1 + padding
      )
    }

    const rx = Number(body.rx) + padding
    const ry = Number(body.ry) + padding
    if (rx <= 0 || ry <= 0) return false
    const rotation = Number(body.rotation) || 0
    const dx = x - body.x
    const dy = y - body.y
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const localX = dx * cos + dy * sin
    const localY = -dx * sin + dy * cos
    return (localX * localX) / (rx * rx) + (localY * localY) / (ry * ry) <= 1
  })
}

function paintBridgeFootprints(bridges) {
  bridges.forEach((bridge) => {
    const rotation = Number(bridge.rotation) || 0
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    const length = Number(bridge.length) || 0
    const width = Number(bridge.width) || 1
    const footprint = Math.max(length, width)
    const minX = Math.floor(Number(bridge.x) - footprint / 2 - 1)
    const maxX = Math.ceil(Number(bridge.x) + footprint / 2 + 1)
    const minY = Math.floor(Number(bridge.y) - footprint / 2 - 1)
    const maxY = Math.ceil(Number(bridge.y) + footprint / 2 + 1)

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!inMap(x, y)) continue
        const dx = x - bridge.x
        const dy = y - bridge.y
        const localX = dx * cos + dy * sin
        const localY = -dx * sin + dy * cos
        if (Math.abs(localX) > length / 2 + 0.05) continue
        if (Math.abs(localY) > width / 2 + 0.05) continue
        if (!isInsideSourceWater(x, y)) continue
        if (grid[y][x] !== TILE.road && grid[y][x] !== TILE.water && grid[y][x] !== TILE.bridge) continue
        grid[y][x] = TILE.bridge
      }
    }
  })
}

function isInsideBridgeFootprint(bridge, x, y, padding = 0.35) {
  const rotation = Number(bridge.rotation) || 0
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const dx = x - Number(bridge.x)
  const dy = y - Number(bridge.y)
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos
  return (
    Math.abs(localX) <= (Number(bridge.length) || 1) / 2 + padding &&
    Math.abs(localY) <= (Number(bridge.width) || 1) / 2 + padding
  )
}

function filterBridgeSurfaceDecorations(decorations) {
  if (!Array.isArray(source.bridges) || source.bridges.length === 0) return decorations
  return decorations.filter((object) => !source.bridges.some((bridge) => (
    isInsideBridgeFootprint(bridge, Number(object.x), Number(object.y))
  )))
}

source.waterBodies.forEach(paintWater)

const routeCells = new Set()
runtimeRoadRoutes.forEach((route) => {
  paintRoute(route).forEach((key) => routeCells.add(key))
})

const protectedCells = protectedCircleCells(source.safeClearings, source.bridges)
routeCells.forEach((key) => protectedCells.add(key))

// Strong but sparse boundary masses. They give the generated map readable edges without replacing art-directed props.
paintRect(44, 1, 98, 3, TILE.wall, { onlyGrass: true })
paintRect(1, 97, 34, 98, TILE.wall, { onlyGrass: true })
paintRect(96, 58, 98, 98, TILE.wall, { onlyGrass: true })
paintEllipse(7, 91, 6, 5, TILE.wall, { onlyGrass: true, skipProtected: true, protectedCells })
paintEllipse(14, 68, 5, 4, TILE.wall, { onlyGrass: true, skipProtected: true, protectedCells })
paintEllipse(94, 91, 5, 6, TILE.wall, { onlyGrass: true, skipProtected: true, protectedCells })
paintEllipse(90, 9, 5, 4, TILE.wall, { onlyGrass: true, skipProtected: true, protectedCells })

// Repaint routes after walls so the main playable graph remains open.
runtimeRoadRoutes.forEach((route) => paintRoute(route))
paintBridgeFootprints(source.bridges)

source.encounterZones.forEach((zone) => {
  const { x, y, width, height } = zone.bounds
  for (let ty = y; ty < y + height; ty += 1) {
    for (let tx = x; tx < x + width; tx += 1) {
      if (!inMap(tx, ty)) continue
      const key = `${tx},${ty}`
      if (protectedCells.has(key)) continue
      if (grid[ty][tx] === TILE.grass) grid[ty][tx] = TILE.tallGrass
    }
  }
})

restorePreservedRegionExceptConnectors()

function convertWaterBody(body, index) {
  if (body.type === 'rect') {
    return {
      type: 'lake',
      x: body.x + body.width / 2,
      y: body.y + body.height / 2,
      rx: body.width / 2,
      ry: body.height / 2,
      rotation: 0,
      salt: 300 + index * 17,
      sourceId: body.id
    }
  }
  return {
    type: body.type === 'ellipse' ? 'lake' : body.type,
    x: body.x,
    y: body.y,
    rx: body.rx,
    ry: body.ry,
    rotation: body.rotation || 0,
    salt: 300 + index * 17,
    sourceId: body.id
  }
}

function convertPlacement(placement) {
  const asset = MAP_ASSET_CATALOG[placement.assetId]
  const runtimeType = RUNTIME_TYPE_BY_ASSET[placement.assetId] || placement.assetId
  if (!asset || !runtimeType) return null
  if (placement.areaId === source.preserveRegion.id || placement.areaId === 'A') return null
  return {
    type: runtimeType,
    x: placement.x,
    y: placement.y,
    scale: placement.scale ?? asset.defaultScale ?? 1,
    rotation: placement.rotation ?? 0,
    sourceId: placement.id,
    sourceAssetId: placement.assetId,
    sourceAssetStatus: asset.status,
    areaId: placement.areaId
  }
}

function convertEvent(event) {
  const typeMap = {
    pickup: 'item',
    secret: 'secret',
    heal: 'heal',
    challenge: 'challenge',
    trainer: 'trainer',
    boss: 'boss',
    warp: 'warp'
  }
  return {
    id: event.id,
    type: typeMap[event.type] || event.type,
    position: event.position,
    properties: {
      ...(event.properties || {}),
      areaId: event.areaId,
      role: event.role,
      requiredForBoss: event.requiredForBoss,
      unlock: event.unlock,
      minEncounterTier: event.minEncounterTier
    }
  }
}

function hashString(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededUnit(seed) {
  let value = seed >>> 0
  value += 0x6D2B79F5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function decorationNoise(...parts) {
  return seededUnit(hashString(parts.join(':')))
}

function pointKey(x, y) {
  return `${Math.round(x)},${Math.round(y)}`
}

function findArea(areaId) {
  return source.areas.find((area) => area.id === areaId) || null
}

function boundsContains(bounds, x, y) {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
}

function distanceToPoint(x, y, point) {
  return Math.hypot(x - point.x, y - point.y)
}

function distanceToCells(x, y, cells, maxDistance = 10) {
  let best = Infinity
  const limit = Math.ceil(maxDistance)
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const distance = Math.hypot(dx, dy)
      if (distance >= best || distance > maxDistance) continue
      if (cells.has(`${x + dx},${y + dy}`)) best = distance
    }
  }
  return best
}

const routeReferenceCellCache = new Map()

function routeReferenceCellsForRule(rule) {
  const shouldUseExplorationRoutes = [
    'tree_line_to_worksite',
    'hidden_path_hint_line',
    'ruin_detail_scatter'
  ].includes(rule.placement)
  if (!shouldUseExplorationRoutes) return routeCells
  if (routeReferenceCellCache.has('exploration')) return routeReferenceCellCache.get('exploration')

  const cells = new Set(routeCells)
  source.routes
    .filter((route) => route.role !== 'main')
    .forEach((route) => {
      paintRoute(route, { collectOnly: true }).forEach((key) => cells.add(key))
    })
  routeReferenceCellCache.set('exploration', cells)
  return cells
}

function distanceToTile(x, y, tile, maxDistance = 8) {
  let best = Infinity
  const limit = Math.ceil(maxDistance)
  for (let dy = -limit; dy <= limit; dy += 1) {
    for (let dx = -limit; dx <= limit; dx += 1) {
      const tx = x + dx
      const ty = y + dy
      if (!inMap(tx, ty)) continue
      const distance = Math.hypot(dx, dy)
      if (distance >= best || distance > maxDistance) continue
      if (grid[ty][tx] === tile) best = distance
    }
  }
  return best
}

function distanceToAreaSafeClearing(x, y, areaId) {
  let best = Infinity
  source.safeClearings
    .filter((clearing) => clearing.areaId === areaId)
    .forEach((clearing) => {
      best = Math.min(best, distanceToPoint(x, y, clearing) - clearing.radius)
    })
  return best
}

function addCircleCells(cells, x, y, radius) {
  for (let cy = Math.floor(y - radius); cy <= Math.ceil(y + radius); cy += 1) {
    for (let cx = Math.floor(x - radius); cx <= Math.ceil(x + radius); cx += 1) {
      if (!inMap(cx, cy)) continue
      if (Math.hypot(cx - x, cy - y) <= radius) cells.add(`${cx},${cy}`)
    }
  }
}

function footprintCellsAt(x, y, asset) {
  const width = Math.max(1, Math.ceil(asset.footprint?.width || 1))
  const height = Math.max(1, Math.ceil(asset.footprint?.height || 1))
  const startX = Math.floor(x - (width - 1) / 2)
  const startY = Math.floor(y - (height - 1) / 2)
  const cells = []
  for (let cy = startY; cy < startY + height; cy += 1) {
    for (let cx = startX; cx < startX + width; cx += 1) cells.push([cx, cy])
  }
  return cells
}

function terrainAllowsAsset(x, y, assetId) {
  const tile = grid[y]?.[x]
  if (tile === TILE.water) return WATER_EDGE_ASSETS.has(assetId)
  return tile === TILE.grass || tile === TILE.tallGrass
}

function decorationTargetCount(rule) {
  const [min, max] = rule.countRange || [0, 0]
  return Math.round(min + (max - min) * 0.55)
}

function modDistance(value, size) {
  const normalized = ((value % size) + size) % size
  return Math.min(normalized, size - normalized)
}

function scoreRuleCandidate(rule, x, y, area) {
  const routeDist = distanceToCells(x, y, routeReferenceCellsForRule(rule), 10)
  const minRouteDist = rule.minDistanceFromRoute ?? 0
  if (routeDist < minRouteDist) return null

  const waterDist = distanceToTile(x, y, TILE.water, 8)
  const safeRingDist = distanceToAreaSafeClearing(x, y, area.id)

  switch (rule.placement) {
    case 'along_slope_foot': {
      if (routeDist > 7.5 || y > area.bounds.y + area.bounds.height - 2) return null
      return 5 - Math.abs(routeDist - 3.8) + (area.bounds.y + area.bounds.height - y) * 0.035 + (x > 70 ? 0.35 : 0)
    }
    case 'road_outer_edge': {
      if (routeDist > 4.5) return null
      return 4 - Math.abs(routeDist - 2.2) + (y > area.bounds.y + 4 ? 0.3 : 0)
    }
    case 'waterline_clusters': {
      if (waterDist < 0.9 || waterDist > 3.4) return null
      return 5 - Math.abs(waterDist - 1.6) - Math.max(0, routeDist - 5) * 0.14
    }
    case 'shoreline_story_band': {
      if (waterDist > 2.8 || x < area.bounds.x + 4) return null
      return 4.8 - waterDist + (x > 90 ? 0.45 : 0) + (routeDist > 4 ? 0.25 : 0)
    }
    case 'safe_clearing_outer_ring': {
      if (!Number.isFinite(safeRingDist) || safeRingDist < 1.1 || safeRingDist > 6.2) return null
      return 4.5 - Math.abs(safeRingDist - 3.1) + (routeDist > 3 ? 0.25 : 0)
    }
    case 'tree_line_to_worksite': {
      if (routeDist > 6.5 || y < area.bounds.y + 5) return null
      return 4 - Math.abs(routeDist - 3.5) + (x < area.bounds.x + area.bounds.width - 5 ? 0.3 : 0)
    }
    case 'hidden_path_hint_line': {
      if (routeDist > 5.8 || y < area.bounds.y + 6) return null
      return 4.2 - Math.abs(routeDist - 2.4) + (x < area.bounds.x + area.bounds.width - 6 ? 0.25 : 0)
    }
    case 'field_boundary_grid': {
      const gridLineScore = Math.min(modDistance(x - area.bounds.x, 5), modDistance(y - area.bounds.y, 5))
      if (gridLineScore > 1.1 || routeDist < minRouteDist) return null
      return 4 - gridLineScore + (y > area.bounds.y + 6 ? 0.25 : 0)
    }
    case 'camp_outer_water_edge': {
      const goodWaterline = waterDist >= 1 && waterDist <= 4.6
      const goodCampRing = Number.isFinite(safeRingDist) && safeRingDist >= 1.2 && safeRingDist <= 7
      if (!goodWaterline && !goodCampRing) return null
      return (goodWaterline ? 3.4 - Math.abs(waterDist - 2.1) : 0) + (goodCampRing ? 3 - Math.abs(safeRingDist - 3.5) : 0)
    }
    case 'toward_boss_density_gradient': {
      const bossDist = distanceToPoint(x, y, { x: 88, y: 72 })
      if (bossDist < 5.3 || bossDist > 25 || routeDist > 8) return null
      return 3.2 + x * 0.018 + y * 0.026 - Math.abs(routeDist - 3.6) * 0.25 - bossDist * 0.035
    }
    case 'open_field_detail': {
      if (routeDist < 3.2 || routeDist > 13.5) return null
      if (waterDist < 1.6) return null
      if (Number.isFinite(safeRingDist) && safeRingDist < 1.3) return null
      return 2.2 + Math.min(routeDist, 9) * 0.08 + decorationNoise(rule.id, x, y, 'open') * 1.1
    }
    case 'camp_work_scatter': {
      const nearCamp = Number.isFinite(safeRingDist) && safeRingDist >= 1.1 && safeRingDist <= 8.8
      if (!nearCamp && (routeDist < 2.2 || routeDist > 7.5)) return null
      return 3.4 + (nearCamp ? 1.1 - Math.abs(safeRingDist - 4.2) * 0.16 : 0) - Math.abs(routeDist - 4.2) * 0.08
    }
    case 'shore_cargo_scatter': {
      if (waterDist > 4.8 || routeDist < 1.8) return null
      return 4.2 - Math.abs(waterDist - 2.2) * 0.35 + decorationNoise(rule.id, x, y, 'shore') * 0.8
    }
    case 'farm_rows_detail': {
      const gridLineScore = Math.min(modDistance(x - area.bounds.x, 4), modDistance(y - area.bounds.y, 4))
      if (gridLineScore > 1.4 || routeDist < 1.3) return null
      return 4.2 - gridLineScore * 0.45 + decorationNoise(rule.id, x, y, 'farm') * 0.6
    }
    case 'ruin_detail_scatter': {
      if (routeDist < 1.4 || routeDist > 8.5) return null
      return 4.1 - Math.abs(routeDist - 3.2) * 0.16 + (y > area.bounds.y + 9 ? 0.5 : 0)
    }
    case 'life_near_route': {
      if (routeDist < 2.1 || routeDist > 5.8) return null
      if (Number.isFinite(safeRingDist) && safeRingDist < 0.8) return null
      return 4 - Math.abs(routeDist - 3.6) + decorationNoise(rule.id, x, y, 'life')
    }
    default:
      return 1
  }
}

function makeDecorationBlockCells() {
  const cells = new Set(protectedCells)
  source.events.forEach((event) => {
    if (!event.position) return
    addCircleCells(cells, event.position.x, event.position.y, event.type === 'boss' ? 2 : 1.25)
  })
  return cells
}

function collectRuleCandidates(rule, blockCells) {
  const candidates = []
  rule.areaIds.forEach((areaId) => {
    const area = findArea(areaId)
    if (!area) return

    for (let y = area.bounds.y; y < area.bounds.y + area.bounds.height; y += 1) {
      for (let x = area.bounds.x; x < area.bounds.x + area.bounds.width; x += 1) {
        if (!inMap(x, y)) continue
        const key = `${x},${y}`
        if (blockCells.has(key)) continue

        const tile = grid[y][x]
        const hasWaterEdgeAsset = rule.assetIds.some((assetId) => WATER_EDGE_ASSETS.has(assetId))
        if (tile === TILE.wall || tile === TILE.road) continue
        if (tile === TILE.water && !hasWaterEdgeAsset) continue

        if (rule.avoidSafeClearings && source.safeClearings.some((clearing) =>
          distanceToPoint(x, y, clearing) <= clearing.radius + 0.35
        )) continue

        const score = scoreRuleCandidate(rule, x, y, area)
        if (score == null || !Number.isFinite(score)) continue

        candidates.push({
          x,
          y,
          areaId,
          score: score + decorationNoise(rule.id, x, y, 'candidate') * 0.42
        })
      }
    }
  })

  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

function orderedRuleAssets(rule, candidate, assetCounts, placedIndex) {
  const weights = RULE_ASSET_WEIGHTS[rule.id] || {}
  const caps = RULE_ASSET_CAPS[rule.id] || {}
  return rule.assetIds
    .filter((assetId) => {
      const asset = MAP_ASSET_CATALOG[assetId]
      if (!asset) return false
      if (!RUNTIME_TYPE_BY_ASSET[assetId] && !asset.assetPath) return false
      if (!asset.allowedAreas.includes(candidate.areaId)) return false
      if (Number.isFinite(caps[assetId]) && (assetCounts[assetId] || 0) >= caps[assetId]) return false
      return true
    })
    .map((assetId) => ({
      assetId,
      score: (weights[assetId] || 1) + decorationNoise(rule.id, candidate.x, candidate.y, placedIndex, assetId) * 1.25
    }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.assetId)
}

function canPlaceRuleDecoration(rule, assetId, candidate, occupiedCells, blockCells) {
  const asset = MAP_ASSET_CATALOG[assetId]
  if (!asset || !terrainAllowsAsset(candidate.x, candidate.y, assetId)) return false

  const cells = footprintCellsAt(candidate.x, candidate.y, asset)
  for (const [x, y] of cells) {
    if (!inMap(x, y)) return false
    const key = `${x},${y}`
    if (occupiedCells.has(key) || blockCells.has(key)) return false
    if (!terrainAllowsAsset(x, y, assetId)) return false
  }

  return true
}

function rememberDecorationFootprint(decoration, occupiedCells) {
  const asset = MAP_ASSET_CATALOG[decoration.sourceAssetId]
  if (!asset) return
  footprintCellsAt(decoration.x, decoration.y, asset).forEach(([x, y]) => {
    if (inMap(x, y)) occupiedCells.add(`${x},${y}`)
  })
}

function makeRuleDecoration(rule, assetId, candidate, index) {
  const asset = MAP_ASSET_CATALOG[assetId]
  const runtimeType = RUNTIME_TYPE_BY_ASSET[assetId] || assetId
  const jitter = asset.defaultBlocking ? 0.2 : 0.42
  const xJitter = (decorationNoise(rule.id, index, assetId, 'x') - 0.5) * jitter
  const yJitter = (decorationNoise(rule.id, index, assetId, 'y') - 0.5) * jitter
  const scale = (asset.defaultScale ?? 1) * (0.88 + decorationNoise(rule.id, index, assetId, 'scale') * 0.24)

  return {
    type: runtimeType,
    x: Number((candidate.x + xJitter).toFixed(2)),
    y: Number((candidate.y + yJitter).toFixed(2)),
    scale: Number(scale.toFixed(3)),
    rotation: Number((decorationNoise(rule.id, index, assetId, 'rotation') * Math.PI * 2).toFixed(4)),
    sourceId: `${rule.id}_${String(index + 1).padStart(2, '0')}`,
    sourceRuleId: rule.id,
    sourceAssetId: assetId,
    sourceAssetStatus: asset.status,
    areaId: candidate.areaId
  }
}

function generateRuleDecorations(sourceDecorations) {
  const blockCells = makeDecorationBlockCells()
  const occupiedCells = new Set()
  const generated = []

  source.assetPlacements.forEach((placement) => {
    const asset = MAP_ASSET_CATALOG[placement.assetId]
    if (!asset) return
    footprintCellsAt(placement.x, placement.y, asset).forEach(([x, y]) => {
      if (inMap(x, y)) occupiedCells.add(`${x},${y}`)
    })
  })
  sourceDecorations.forEach((decoration) => rememberDecorationFootprint(decoration, occupiedCells))

  source.decorationRules.forEach((rule) => {
    const targetCount = decorationTargetCount(rule)
    const candidates = collectRuleCandidates(rule, blockCells)
    const assetCounts = {}
    let placedForRule = 0

    for (const candidate of candidates) {
      if (placedForRule >= targetCount) break
      const assetOrder = orderedRuleAssets(rule, candidate, assetCounts, placedForRule)
      const assetId = assetOrder.find((candidateAssetId) =>
        canPlaceRuleDecoration(rule, candidateAssetId, candidate, occupiedCells, blockCells)
      )
      if (!assetId) continue

      const decoration = makeRuleDecoration(rule, assetId, candidate, placedForRule)
      generated.push(decoration)
      assetCounts[assetId] = (assetCounts[assetId] || 0) + 1
      rememberDecorationFootprint(decoration, occupiedCells)
      placedForRule += 1
    }
  })

  return generated
}

const sourceDecorations = source.assetPlacements.map(convertPlacement).filter(Boolean)
const generatedRuleDecorations = generateRuleDecorations(sourceDecorations)
const decorativeObjects = filterBridgeSurfaceDecorations([
  ...(oldMap.decorativeObjects || []),
  ...sourceDecorations,
  ...generatedRuleDecorations
])

const encounterZones = source.encounterZones.map((zone) => ({
  id: zone.id,
  name: zone.name,
  areaId: zone.areaId,
  x: zone.bounds.x,
  y: zone.bounds.y,
  width: zone.bounds.width,
  height: zone.bounds.height,
  encounterTableId: RUNTIME_TABLE_BY_SOURCE_TABLE[zone.encounterTableId] || zone.encounterTableId,
  sourceEncounterTableId: zone.encounterTableId,
  tallGrassRate: zone.tallGrassRate,
  minEncounterTier: zone.minEncounterTier
}))

const visualPaths = runtimeRoadRoutes.map((route) => ({
  id: route.id,
  role: route.role,
  points: route.anchors.map((anchor) => [anchor.x, anchor.y]),
  radius: Math.max(0.7, route.width / 2),
  edgeRadius: Math.max(0.9, route.width / 2 + 0.18)
}))

const roadJunctions = runtimeRoadRoutes.flatMap((route) =>
  route.anchors
    .filter((anchor) => anchor.id)
    .filter((anchor) => !source.bridges.some((bridge) => isInsideBridgeFootprint(bridge, anchor.x, anchor.y, 0.9)))
    .map((anchor) => ({ id: anchor.id, x: anchor.x, y: anchor.y, rx: 1.2, ry: 1 }))
)

const signs = {
  ...(oldMap.signs || {}),
  '44,21': '新世界入口：石路外延伸出新的森林试炼区。主路宽阔明亮，支路会用素材和地形暗示。',
  '94,86': '废场控制台：这些装置目前只是线索，真正的机关会在后续地图系统中接入。',
  '8,32': '营地外圈可以摆放道具，但出生点中心必须保持清爽。'
}

grid[21][44] = TILE.sign
grid[86][94] = TILE.sign

const generatedMap = {
  id: source.id,
  name: source.id,
  displayName: source.displayName,
  width: source.dimensions.width,
  height: source.dimensions.height,
  renderMode: 'three-lowpoly',
  theme: 'kenney-nature-valley-v2',
  roadRenderStyle: 'organic',
  tallGrassRate: 0.22,
  startPosition: source.defaultStart,
  preserveRegion: source.preserveRegion,
  sourceVersion: source.version,
  mapGrid: grid,
  visualPaths,
  forestTrails: [],
  roadJunctions,
  waterBodies: source.waterBodies.map(convertWaterBody),
  bridges: source.bridges.map((bridge) => ({
    id: bridge.id,
    x: bridge.x,
    y: bridge.y,
    length: bridge.length,
    width: bridge.width,
    rotation: bridge.rotation
  })),
  decorativeObjects,
  encounterZones,
  runtimeEvents: source.events.map(convertEvent),
  signs,
  generationNotes: {
    generatedFrom: 'src/game/data/mapSources/godotMapV2.source.json',
    oldMapPreservedFrom: 'src/game/data/godotMaps/my_first_map.js',
    generatedRuleDecorationCount: generatedRuleDecorations.length,
    generatedRuleDecorationCounts: source.decorationRules.reduce((counts, rule) => {
      counts[rule.id] = generatedRuleDecorations.filter((object) => object.sourceRuleId === rule.id).length
      return counts
    }, {}),
    plannedAssetFallbacks: [...sourceDecorations, ...generatedRuleDecorations]
      .filter((object) => object.sourceAssetStatus === 'planned')
      .map((object) => object.sourceAssetId)
  }
}

const output = `// AUTO-GENERATED by scripts/build-map-runtime.mjs. Do not edit by hand.
// Edit src/game/data/mapSources/godotMapV2.source.json and run npm run map:build instead.

const godotMapV2 = ${JSON.stringify(generatedMap, null, 2)}

export default godotMapV2
`

fs.writeFileSync(outputPath, output)
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`)
console.log(`- grid: ${source.dimensions.width}x${source.dimensions.height}`)
console.log(`- decorations: ${decorativeObjects.length}`)
console.log(`- generated rule decorations: ${generatedRuleDecorations.length}`)
console.log(`- encounter zones: ${encounterZones.length}`)
console.log(`- runtime events: ${generatedMap.runtimeEvents.length}`)
