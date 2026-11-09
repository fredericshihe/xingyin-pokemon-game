// Visual-footprint collision for the overworld tile grid.
//
// The authored grid marks forest/wall (1) and decoration (20) tiles with
// generous padding, and the renderer then decorates those tiles sparsely (and
// on boundary-themed maps skips procedural stones/rocks entirely). That left
// many blocked tiles with no model in them: invisible walls. This module
// derives which blocked tiles are really occupied by a solid model, using the
// measured GLB bounds × render scale at the position the renderer actually
// uses (tile jitter, forest-edge nudges, offsetX/offsetZ), and re-opens the
// rest without touching gameplay gates.
//
// The procedural placement below MUST mirror ThreeLowPolyMap.jsx
// (placeForestUndergrowth / getForestEdgeNudge / the legacy === 1 / 20 tile
// loop). Keep both in sync when either changes; the audit
// scripts/audit-decoration-gap-walkability.mjs re-checks the result.
import { MAP_ASSET_CATALOG } from './data/mapAssetCatalog.js'
import { ENVIRONMENT_ORIGINAL_MEASUREMENTS } from './data/environmentOriginalMeasurements.generated.js'
import { ENVIRONMENT_SCENERY_MEASUREMENTS } from './data/environmentSceneryMeasurements.generated.js'
import { MAP_EXCLUSIVE_MEASUREMENTS } from './data/mapExclusiveAssets.generated.js'
import { MAP_BOUNDARY_MEASUREMENTS } from './data/mapBoundaryAssets.generated.js'
import { ENVIRONMENT_MODEL_FOOTPRINTS } from './data/environmentModelFootprints.generated.js'
import { BLOCKED_LEGACY_TILES } from './world/constants.js'
import { isEliteRouteBlockerEvent } from './eliteRouteBlocker.js'
import { getProceduralModelScale } from './proceduralModelScales.js'
import { FOREST_WALL_TREE_HEIGHT_SCALE, getForestWallTreeChance, getForestWallTreeKey, isForestWallExitClearance } from './forestWallScenery.js'

export const VISUAL_COLLISION_CELL = 1.55
export const CHARACTER_BODY_RADIUS_WORLD = 0.28
export const CHARACTER_BODY_RADIUS_TILES = CHARACTER_BODY_RADIUS_WORLD / VISUAL_COLLISION_CELL

// The nine adventure maps whose collision follows visible models.
export const VISUAL_COLLISION_MAP_IDS = new Set([
  'GodotMap',
  'GodotMapV2',
  'GodotMapV2_MistLake',
  'GodotMapV2_FarmTown',
  'GodotMapV2_PirateShore',
  'GodotMapV2_Graveyard',
  'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge',
  'GodotMapV2_BossHighland'
])

const WALL_TILE = 1
const OBJECT_BLOCKER_TILE = 20
const WATER_TILE = 11
const OPENABLE_TILES = new Set([WALL_TILE, OBJECT_BLOCKER_TILE])
const OPEN_GROUND_TILES = [0, 13, 17]
// Mirrors OriginalGame buildEncounterZoneLocks: zones that can refuse entry.
const LOCKABLE_ENCOUNTER_ZONE_IDS = { GodotMap: ['grove_grass'] }
const HIDDEN_ZONE_GATE_KIND = 'hidden_zone_unlock'
const BLOCKING_EVENT_TYPES = new Set(['warp', 'heal', 'trainer', 'boss', 'challenge', 'objective', 'info', 'sign', 'merchant'])
// Buildings stay solid on their authored footprint even where the mesh is narrower.
const BUILDING_TYPE_PATTERN = /building|windmill|watermill|tent|house|tower|ship_wreck|structure_canvas/
const LOW_VEGETATION_TYPES = new Set(['grass-small', 'grass-large', 'flower-yellow', 'flower-red', 'mushroom-red', 'wetland_reed_clump'])
const LOW_VEGETATION_TAGS = new Set(['grass', 'flower', 'mushroom', 'reed'])
const LOW_VEGETATION_NAME = /(^|_)(grass|flowers?|mushrooms?|reeds?|lily|wheat|clover|patch)(_|$)/
const LOW_PROFILE_HEIGHT = 0.12
const LEGACY_ASSET_ALIASES = {
  'grass-small': 'nature_grass_small',
  'grass-large': 'nature_grass_large',
  'flower-yellow': 'nature_flower_yellow',
  'flower-red': 'nature_flower_red',
  'mushroom-red': 'nature_mushroom_red'
}
// ThreeLowPolyMap ROAD_CLEAR_DECOR_TYPES are hidden inside road clearance.
const ROAD_CLEAR_DECOR_TYPES = new Set(['tree-oak', 'tree-default', 'tree-pine', 'bush-large', 'rock-large', 'stone-large', 'grass-small', 'grass-large', 'flower-yellow', 'flower-red', 'mushroom-red'])
// Procedural model keys used by the forest renderer, measured through their decoration type.
const PROCEDURAL_MEASUREMENT_TYPES = {
  bush: 'bush-large', stone: 'stone-large', rock: 'rock-large',
  treeOak: 'tree-oak', treeDefault: 'tree-default', treePine: 'tree-pine',
  grass: 'nature_grass_small', grassLarge: 'nature_grass_large',
  flowerYellow: 'nature_flower_yellow', flowerRed: 'nature_flower_red', mushroom: 'nature_mushroom_red'
}
const PROCEDURAL_SOLID_KEYS = new Set(['bush', 'stone', 'rock', 'treeOak', 'treeDefault', 'treePine'])
const SCENERY_EXCLUSION_TYPES = /building|windmill|watermill|tent|house|tower|ship_wreck|structure_canvas|timber_bank|stall_(green|red)|(^|_)(cart|bench|table|workbench|fountain|well|crate|box|barrel|chest)(_|$)/
const SCENERY_EXCLUSION_ROLES = new Set(['building', 'machine', 'furniture', 'monument'])

const tileKey = (x, y) => `${x},${y}`
const isWalkableTile = (tile) => tile != null && !BLOCKED_LEGACY_TILES.has(tile)

// --- renderer mirrors -------------------------------------------------------
function seededRandom(x, y, salt = 0) {
  let n = x * 374761393 + y * 668265263 + salt * 2246822519
  n = (n ^ (n >>> 13)) * 1274126177
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy
  if (lenSq <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function isInRoadClearance(mapInfo, x, y, padding) {
  const nearPath = (mapInfo.visualPaths || []).some((path) => {
    const points = Array.isArray(path.points) ? path.points : []
    const radius = path.radius ?? 0.7
    for (let i = 0; i < points.length - 1; i += 1) {
      if (distanceToSegment(x, y, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]) <= radius + padding) return true
    }
    return false
  })
  if (nearPath) return true
  return (mapInfo.bridges || []).some((bridge) => {
    const rotation = bridge.rotation ?? 0
    const visualWidth = clamp(Number(bridge.width) || 1.12, 0.84, 1.16)
    const dx = x - bridge.x, dy = y - bridge.y
    const cos = Math.cos(rotation), sin = Math.sin(rotation)
    return Math.abs(dx * cos + dy * sin) <= (bridge.length ?? 3) / 2 + padding &&
      Math.abs(-dx * sin + dy * cos) <= visualWidth / 2 + padding
  })
}

function getAsset(type) {
  return MAP_ASSET_CATALOG[type] || MAP_ASSET_CATALOG[LEGACY_ASSET_ALIASES[type]] || null
}

export function getMeasuredModel(type, object = null) {
  const original = ENVIRONMENT_ORIGINAL_MEASUREMENTS[type]
  const scenery = ENVIRONMENT_SCENERY_MEASUREMENTS[type] || MAP_EXCLUSIVE_MEASUREMENTS[type] || MAP_BOUNDARY_MEASUREMENTS[type]
  const footprint = original?.footprint || object?.footprint || scenery?.footprint || ENVIRONMENT_MODEL_FOOTPRINTS[type] || getAsset(type)?.footprint || null
  const height = original?.height ?? scenery?.height ?? null
  return footprint ? { footprint, height, measured: Boolean(original || scenery || ENVIRONMENT_MODEL_FOOTPRINTS[type]) } : null
}

function isBuildLowVegetation(type) {
  if (LOW_VEGETATION_TYPES.has(type)) return true
  const asset = getAsset(type)
  return Boolean(asset?.decorativeOnly && (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag)))
}

export function isLowVegetationType(type) {
  if (LOW_VEGETATION_TYPES.has(type)) return true
  const asset = getAsset(type)
  if (asset?.decorativeOnly && (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag))) return true
  // Forest tiles/units are dense canopy, not ground cover.
  if (/forest|unit_tree/.test(type)) return false
  return LOW_VEGETATION_NAME.test(String(type || ''))
}

// --- footprint geometry (tile units) -----------------------------------------
function makeFootprint(x, y, width, height, scale, rotation, source) {
  return { x, y, hw: width * scale / 2, hh: height * scale / 2, cos: Math.cos(rotation), sin: Math.sin(rotation), source }
}

export function footprintsOverlap(a, b, gap = 0) {
  const axes = [[a.cos, -a.sin], [a.sin, a.cos], [b.cos, -b.sin], [b.sin, b.cos]]
  return axes.every(([ax, ay]) => {
    const reach = (footprint) => footprint.hw * Math.abs(ax * footprint.cos - ay * footprint.sin)
      + footprint.hh * Math.abs(ax * footprint.sin + ay * footprint.cos)
    return Math.abs((b.x - a.x) * ax + (b.y - a.y) * ay) < reach(a) + reach(b) + gap
  })
}

export function collectSceneryExclusionFootprints(mapInfo) {
  const footprints = (mapInfo.decorativeObjects || []).filter((object) =>
    !object.environmentHiddenBoundary && (SCENERY_EXCLUSION_TYPES.test(object.type)
      || SCENERY_EXCLUSION_ROLES.has(object.environmentRole)))
    .map((object) => decorationFootprint(object, mapInfo)).filter(Boolean)
  for (const bridge of mapInfo.bridges || []) {
    footprints.push(makeFootprint(bridge.x, bridge.y, bridge.length || 3, bridge.width || 1.12,
      1, bridge.rotation || 0, 'bridge'))
  }
  return footprints
}

// Object-blocker tiles can already contain a stall or another solid facility.
// Both rendering and collision use this measured clearance before adding foliage.
export function createProceduralSceneryClearance(mapInfo) {
  const reserved = collectSceneryExclusionFootprints(mapInfo)
  return (key, x, y, scale, rotation = 0, offsetX = 0, offsetZ = 0) => {
    const type = PROCEDURAL_MEASUREMENT_TYPES[key]
    const model = type && getMeasuredModel(type)
    if (!model) return true
    const footprint = makeFootprint(x + offsetX / VISUAL_COLLISION_CELL, y + offsetZ / VISUAL_COLLISION_CELL,
      model.footprint.width, model.footprint.height, scale, rotation, `procedural:${key}`)
    return !reserved.some((other) => footprintsOverlap(footprint, other, .12))
  }
}

// Three.js rotation.y maps model +X to world (cos, -sin) and model +Z to (sin, cos).
export function distanceToFootprint(footprint, px, py) {
  const dx = px - footprint.x, dy = py - footprint.y
  const lu = dx * footprint.cos - dy * footprint.sin
  const lv = dx * footprint.sin + dy * footprint.cos
  return Math.hypot(Math.max(Math.abs(lu) - footprint.hw, 0), Math.max(Math.abs(lv) - footprint.hh, 0))
}

function decorationFootprint(object, mapInfo) {
  if (object.environmentHiddenBoundary) return null
  const type = object.type
  if (!type || isLowVegetationType(type)) return null
  if (ROAD_CLEAR_DECOR_TYPES.has(type) && isInRoadClearance(mapInfo, object.x, object.y, object.roadClearance ?? 0.65)) return null
  const model = getMeasuredModel(type, object)
  if (!model) return null
  const scale = Number(object.environmentRenderScale ?? object.scale ?? getAsset(type)?.defaultScale ?? 1) || 1
  if (model.height != null && model.height * scale < LOW_PROFILE_HEIGHT && !object.eventId && !object.npcRole) return null
  const x = Number(object.x) + (Number(object.offsetX) || 0) / VISUAL_COLLISION_CELL
  const y = Number(object.y) + (Number(object.offsetZ) || 0) / VISUAL_COLLISION_CELL
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const rotation = object.rotation ?? Math.PI / 6
  return makeFootprint(x, y, model.footprint.width, model.footprint.height, scale, rotation, `decoration:${type}`)
}

function proceduralFootprint(key, tileX, tileY, scale, rotation, offsetX, offsetZ) {
  if (!PROCEDURAL_SOLID_KEYS.has(key)) return null
  const model = getMeasuredModel(PROCEDURAL_MEASUREMENT_TYPES[key])
  if (!model) return null
  return makeFootprint(tileX + offsetX / VISUAL_COLLISION_CELL, tileY + offsetZ / VISUAL_COLLISION_CELL,
    model.footprint.width, model.footprint.height, scale, rotation, `procedural:${key}`)
}

// Mirrors the ThreeLowPolyMap forest tile loop for playable tiles.
export function collectProceduralForestFootprints(mapInfo, grid) {
  const out = []
  const canPlace = createProceduralSceneryClearance(mapInfo)
  const height = grid.length, width = grid[0]?.length || 0
  const sourceGrid = mapInfo.forestWallSourceGrid || grid
  const CELL = VISUAL_COLLISION_CELL
  const clampIndex = (v, max) => Math.max(0, Math.min(max, v))
  const rendered = (x, y) => (x >= 0 && x < width && y >= 0 && y < height)
    ? sourceGrid[y][x]
    : sourceGrid[clampIndex(y, height - 1)][clampIndex(x, width - 1)]
  const hasWalkableCardinalNeighbor = (x, y) => (
    isWalkableTile(sourceGrid[y - 1]?.[x]) || isWalkableTile(sourceGrid[y + 1]?.[x]) ||
    isWalkableTile(sourceGrid[y]?.[x - 1]) || isWalkableTile(sourceGrid[y]?.[x + 1])
  )
  const isForestEdge = (x, y) => {
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      if ((ox || oy) && rendered(x + ox, y + oy) !== WALL_TILE) return true
    }
    return false
  }
  const edgeNudge = (x, y) => {
    let nx = 0, nz = 0
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = rendered(x + ox, y + oy)
      if (neighbor !== WALL_TILE && neighbor !== WATER_TILE) { nx += ox; nz += oy }
    }
    const length = Math.hypot(nx, nz)
    return length <= 0 ? { x: 0, z: 0 } : { x: nx / length * CELL * 0.32, z: nz / length * CELL * 0.32 }
  }
  const place = (key, x, y, scale, rotation, ox, oz) => {
    if (mapInfo.environmentBoundaryTheme && (key === 'stone' || key === 'rock')) return
    if (!canPlace(key, x, y, scale, rotation, ox, oz)) return
    const footprint = proceduralFootprint(key, x, y, scale, rotation, ox, oz)
    if (footprint) out.push(footprint)
  }
  const undergrowth = (x, y, { edge = false, heavy = false, force = false, preferClearance = false } = {}) => {
    const onBlockedTile = !isWalkableTile(rendered(x, y))
    const blockedEdgeTile = onBlockedTile && hasWalkableCardinalNeighbor(x, y)
    const chance = onBlockedTile ? heavy ? 0.52 : edge ? 0.26 : 0.1 : heavy ? 0.58 : edge ? 0.34 : 0.14
    if (!force && seededRandom(x, y, 121) > chance) return
    const count = force ? 1 : heavy && seededRandom(x, y, 122) > 0.72 ? 2 : 1
    const choices = force
      ? preferClearance ? ['stone', 'stone', 'rock'] : ['bush', 'stone', 'rock']
      : onBlockedTile
        ? (edge ? ['bush', 'bush', 'stone', 'rock'] : ['bush', 'stone', 'rock'])
        : edge ? ['bush', 'grassLarge', 'stone', 'mushroom', 'flowerYellow'] : ['bush', 'grassLarge', 'stone', 'mushroom']
    const nudge = blockedEdgeTile ? edgeNudge(x, y) : { x: 0, z: 0 }
    const spread = force ? preferClearance ? 0.12 : 0.22 : heavy ? 0.72 : 0.58
    for (let i = 0; i < count; i += 1) {
      const key = choices[Math.floor(seededRandom(x, y, 125 + i) * choices.length) % choices.length]
      const ox = nudge.x * (force ? 0.45 : 0.2) + (seededRandom(x, y, 132 + i) - 0.5) * CELL * spread
      const oz = nudge.z * (force ? 0.45 : 0.2) + (seededRandom(x, y, 139 + i) - 0.5) * CELL * spread
      const rotation = seededRandom(x, y, 146 + i) * Math.PI * 2
      place(key, x, y, getProceduralModelScale(key, x, y, 153 + i), rotation, ox, oz)
    }
  }
  const undergrowthEnabled = mapInfo.renderForestWallUndergrowth !== false
  const treesEnabled = mapInfo.renderForestWallTrees !== false
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const legacy = grid[y][x]
    if (isForestWallExitClearance(mapInfo, x, y)) continue
    const blockedEdgeTile = !isWalkableTile(legacy) && hasWalkableCardinalNeighbor(x, y)
    if (legacy === WALL_TILE && undergrowthEnabled) {
      if (isInRoadClearance(mapInfo, x, y, 0.7)) {
        if (blockedEdgeTile) undergrowth(x, y, { edge: true, heavy: true, force: true, preferClearance: true })
      } else if (!treesEnabled) {
        if (blockedEdgeTile || seededRandom(x, y, 12) < 0.42) {
          undergrowth(x, y, { edge: isForestEdge(x, y), heavy: true, force: blockedEdgeTile })
        }
      } else {
        const edge = isForestEdge(x, y)
        if (!(seededRandom(x, y, 12) < getForestWallTreeChance(mapInfo.id, edge))) {
          undergrowth(x, y, { edge, heavy: true, force: blockedEdgeTile })
        } else {
          const key = getForestWallTreeKey(mapInfo.id, x, y)
          const scale = getProceduralModelScale(key, x, y, 14) * FOREST_WALL_TREE_HEIGHT_SCALE
          const nudge = edge ? edgeNudge(x, y) : { x: 0, z: 0 }
          place(key, x, y, scale, ((x * 5 + y * 9) % 12) * Math.PI / 6,
            nudge.x + (seededRandom(x, y, 15) - 0.5) * CELL * 0.16,
            nudge.z + (seededRandom(x, y, 16) - 0.5) * CELL * 0.16)
          if (seededRandom(x, y, 8) > (edge ? 0.78 : 0.9)) undergrowth(x, y, { edge, heavy: false })
        }
      }
    }
    if (legacy === OBJECT_BLOCKER_TILE && blockedEdgeTile && undergrowthEnabled) {
      undergrowth(x, y, { edge: true, heavy: true, force: true, preferClearance: isInRoadClearance(mapInfo, x, y, 0.68) })
    }
  }
  return out
}

export function collectDecorationFootprints(mapInfo) {
  return (mapInfo.decorativeObjects || []).map((object) => decorationFootprint(object, mapInfo)).filter(Boolean)
}

// Tiles whose centre-standing body circle touches a solid footprint.
export function buildCoveredTileSet(footprints, width, height, radius = CHARACTER_BODY_RADIUS_TILES) {
  const covered = new Map()
  for (const footprint of footprints) {
    const reach = Math.hypot(footprint.hw, footprint.hh) + radius
    for (let y = Math.max(0, Math.floor(footprint.y - reach)); y <= Math.min(height - 1, Math.ceil(footprint.y + reach)); y += 1) {
      for (let x = Math.max(0, Math.floor(footprint.x - reach)); x <= Math.min(width - 1, Math.ceil(footprint.x + reach)); x += 1) {
        if (distanceToFootprint(footprint, x, y) < radius) {
          const key = tileKey(x, y)
          if (!covered.has(key)) covered.set(key, footprint.source)
        }
      }
    }
  }
  return covered
}

function rectTiles(zone) {
  const keys = []
  for (let y = zone.y; y < zone.y + zone.height; y += 1) for (let x = zone.x; x < zone.x + zone.width; x += 1) keys.push(tileKey(x, y))
  return keys
}

// Gate tiles: stepping onto them is refused by progression (locked zones,
// blocking NPCs/signs/warps). Opening must never join areas they separate.
export function collectProgressionGateTiles(mapInfo) {
  const gates = new Set()
  const hiddenZoneIds = new Set((mapInfo.runtimeEvents || [])
    .filter((event) => event?.properties?.interactionKind === HIDDEN_ZONE_GATE_KIND && event.properties.hiddenZoneId)
    .map((event) => event.properties.hiddenZoneId))
  ;(LOCKABLE_ENCOUNTER_ZONE_IDS[mapInfo.id] || []).forEach((id) => hiddenZoneIds.add(id))
  ;(mapInfo.encounterZones || []).forEach((zone) => {
    if (hiddenZoneIds.has(zone.id) || zone.depth === 'deep') rectTiles(zone).forEach((key) => gates.add(key))
  })
  ;(mapInfo.runtimeEvents || []).forEach((event) => {
    if (!BLOCKING_EVENT_TYPES.has(event?.type) && !isEliteRouteBlockerEvent(event)) return
    const x = Math.trunc(Number(event.position?.x)), y = Math.trunc(Number(event.position?.y))
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y)) gates.add(tileKey(x, y))
  })
  return gates
}

// Tiles that stay exactly as authored (key -> reason): map rim, hidden-zone
// perimeter seals, bridges, buildings and event tiles.
export function collectProtectedBlockedTiles(mapInfo) {
  const grid = mapInfo.mapGrid, height = grid.length, width = grid[0].length
  const keep = new Map()
  const mark = (reason) => (key) => { if (!keep.has(key)) keep.set(key, reason) }
  const rim = mark('map-rim')
  for (let x = 0; x < width; x += 1) { rim(tileKey(x, 0)); rim(tileKey(x, height - 1)) }
  for (let y = 0; y < height; y += 1) { rim(tileKey(0, y)); rim(tileKey(width - 1, y)) }
  const seal = mark('hidden-zone-perimeter')
  ;(mapInfo.encounterZones || []).filter((zone) => zone.depth === 'deep').forEach((zone) => {
    for (let x = zone.x - 1; x <= zone.x + zone.width; x += 1) { seal(tileKey(x, zone.y - 1)); seal(tileKey(x, zone.y + zone.height)) }
    for (let y = zone.y - 1; y <= zone.y + zone.height; y += 1) { seal(tileKey(zone.x - 1, y)); seal(tileKey(zone.x + zone.width, y)) }
  })
  ;(mapInfo.bridges || []).forEach((bridge) => {
    const reach = Math.max(Number(bridge.length) || 1, Number(bridge.width) || 1) / 2 + 1
    for (let y = Math.floor(bridge.y - reach); y <= Math.ceil(bridge.y + reach); y += 1) for (let x = Math.floor(bridge.x - reach); x <= Math.ceil(bridge.x + reach); x += 1) {
      const rotation = Number(bridge.rotation) || 0, dx = x - bridge.x, dy = y - bridge.y
      const lu = dx * Math.cos(rotation) + dy * Math.sin(rotation), lv = -dx * Math.sin(rotation) + dy * Math.cos(rotation)
      if (Math.abs(lu) <= (Number(bridge.length) || 1) / 2 + 0.6 && Math.abs(lv) <= (Number(bridge.width) || 1) / 2 + 0.6) mark('bridge')(tileKey(x, y))
    }
  })
  ;(mapInfo.decorativeObjects || []).forEach((object) => {
    if (!BUILDING_TYPE_PATTERN.test(String(object.type || '')) || object.environmentHiddenBoundary) return
    const model = getMeasuredModel(object.type, object)
    if (!model) return
    const scale = Number(object.environmentRenderScale ?? object.scale ?? 1) || 1
    const footprint = makeFootprint(Number(object.x), Number(object.y), model.footprint.width, model.footprint.height, scale, object.rotation ?? 0, 'building')
    const reach = Math.hypot(footprint.hw, footprint.hh) + 1
    for (let y = Math.floor(footprint.y - reach); y <= Math.ceil(footprint.y + reach); y += 1) for (let x = Math.floor(footprint.x - reach); x <= Math.ceil(footprint.x + reach); x += 1) {
      if (distanceToFootprint(footprint, x, y) <= 0.5) mark(`building:${object.type}`)(tileKey(x, y))
    }
  })
  ;(mapInfo.runtimeEvents || []).forEach((event) => {
    const x = Math.trunc(Number(event.position?.x)), y = Math.trunc(Number(event.position?.y))
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y)) mark(`event:${event.type}`)(tileKey(x, y))
  })
  return keep
}

export function collectVisualSolidFootprints(mapInfo, grid = mapInfo.mapGrid) {
  return [...collectDecorationFootprints(mapInfo), ...collectProceduralForestFootprints(mapInfo, grid)]
}

// Blocked tiles (grid wall/object blocker or scenery mask) with no solid model
// within the body radius. `protectedTiles` are reported separately.
export function findUnsupportedBlockedTiles(mapInfo, { grid = mapInfo.mapGrid, radius = CHARACTER_BODY_RADIUS_TILES } = {}) {
  const height = grid.length, width = grid[0].length
  const covered = buildCoveredTileSet(collectVisualSolidFootprints(mapInfo, grid), width, height, radius)
  const keep = collectProtectedBlockedTiles({ ...mapInfo, mapGrid: grid })
  const unsupported = []
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const key = tileKey(x, y)
    const tile = grid[y][x]
    const envBlocked = mapInfo.environmentBlockedTiles?.has?.(key) === true
    if (!OPENABLE_TILES.has(tile) && !envBlocked) continue
    if (covered.has(key)) continue
    unsupported.push({ x, y, key, tile, envBlocked, protected: keep.get(key) || null })
  }
  return { unsupported, covered }
}

function chooseOpenGroundTile(grid, x, y) {
  const counts = new Map()
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const tile = grid[y + dy]?.[x + dx]
    if (OPEN_GROUND_TILES.includes(tile)) counts.set(tile, (counts.get(tile) || 0) + 1)
  }
  let best = 0, bestCount = 0
  counts.forEach((count, tile) => { if (count > bestCount) { best = tile; bestCount = count } })
  return best
}

export const SIGNIFICANT_REGION_TILES = 6

export function getEventTilePositions(mapInfo) {
  return (mapInfo.runtimeEvents || []).map((event) => ({ x: Math.trunc(Number(event.position?.x)), y: Math.trunc(Number(event.position?.y)) }))
    .filter(({ x, y }) => Number.isSafeInteger(x) && Number.isSafeInteger(y))
}

// Union-find over walkable tiles minus gate tiles; each original area gets a
// label and an opened tile may never join two different labelled areas.
function createRegionGuard(grid, gates, eventPositions = []) {
  const height = grid.length, width = grid[0].length
  const parent = new Int32Array(width * height).fill(-1)
  const label = new Int32Array(width * height).fill(-1)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const passable = (x, y) => x >= 0 && y >= 0 && x < width && y < height && parent[y * width + x] !== -1
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (isWalkableTile(grid[y][x]) && !gates.has(tileKey(x, y))) parent[y * width + x] = y * width + x
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    if (!passable(x, y)) continue
    for (const [dx, dy] of [[1, 0], [0, 1]]) if (passable(x + dx, y + dy)) {
      const a = find(y * width + x), b = find((y + dy) * width + x + dx)
      if (a !== b) parent[b] = a
    }
  }
  // Tiny empty pockets (no encounter grass, no event, < 6 tiles) are leftover
  // gaps, not areas; joining them to the map is the point of re-opening.
  const size = new Map(), content = new Set()
  const eventTiles = new Set(eventPositions.map(({ x, y }) => y * width + x))
  for (let i = 0; i < parent.length; i += 1) {
    if (parent[i] === -1) continue
    const root = find(i)
    size.set(root, (size.get(root) || 0) + 1)
    if (grid[Math.floor(i / width)][i % width] === 8 || eventTiles.has(i)) content.add(root)
  }
  size.forEach((count, root) => { if (count >= SIGNIFICANT_REGION_TILES || content.has(root)) label[root] = root })
  return {
    tryOpen(x, y) {
      const i = y * width + x
      const roots = new Set()
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (passable(x + dx, y + dy)) roots.add(find((y + dy) * width + x + dx))
      const labels = new Set([...roots].map((root) => label[root]).filter((value) => value !== -1))
      if (labels.size > 1) return false
      parent[i] = i
      const [only] = labels
      label[i] = only ?? -1
      roots.forEach((root) => {
        const a = find(i), b = find(root)
        if (a === b) return
        const merged = label[a] !== -1 ? label[a] : label[b]
        parent[b] = a
        label[a] = merged
      })
      return true
    }
  }
}

// Re-open blocked tiles that no visible solid model occupies. Openings grow
// only from reachable ground, and never join areas separated by a gate.
export function alignMapCollisionToVisibleModels(mapInfo) {
  if (!mapInfo?.mapGrid?.length || !VISUAL_COLLISION_MAP_IDS.has(mapInfo.id)) return mapInfo
  const grid = mapInfo.mapGrid.map((row) => [...row])
  const forestWallSourceGrid = mapInfo.forestWallSourceGrid || mapInfo.mapGrid
  const placementMap = { ...mapInfo, forestWallSourceGrid }
  const height = grid.length, width = grid[0].length
  const gates = collectProgressionGateTiles(mapInfo)
  const keep = collectProtectedBlockedTiles(mapInfo)
  const guard = createRegionGuard(grid, gates, getEventTilePositions(mapInfo))
  const decorations = collectDecorationFootprints(mapInfo)
  const opened = [], gateKept = new Set()
  const blockedBefore = mapInfo.environmentBlockedTiles instanceof Set ? mapInfo.environmentBlockedTiles : new Set()
  for (let pass = 0; pass < 24; pass += 1) {
    const covered = buildCoveredTileSet([...decorations, ...collectProceduralForestFootprints(placementMap, grid)], width, height)
    const batch = []
    for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      const key = tileKey(x, y)
      if (!OPENABLE_TILES.has(grid[y][x]) || covered.has(key) || keep.has(key)) continue
      // Grow only from ground the player can already stand on (outside the scenery mask).
      const frontier = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => (
        isWalkableTile(grid[y + dy]?.[x + dx]) && !(blockedBefore.has(tileKey(x + dx, y + dy)) && covered.has(tileKey(x + dx, y + dy)))
      ))
      if (frontier) batch.push({ x, y, key })
    }
    let changed = 0
    for (const tile of batch) {
      if (!guard.tryOpen(tile.x, tile.y)) { gateKept.add(tile.key); continue }
      opened.push({ x: tile.x, y: tile.y, from: grid[tile.y][tile.x] })
      grid[tile.y][tile.x] = chooseOpenGroundTile(grid, tile.x, tile.y)
      changed += 1
    }
    if (!changed) break
  }
  // The scenery mask only keeps tiles that a solid model really occupies.
  const finalCovered = buildCoveredTileSet([...decorations, ...collectProceduralForestFootprints(placementMap, grid)], width, height)
  const environmentBlockedTiles = new Set([...blockedBefore].filter((key) => finalCovered.has(key)))
  // Same rule as the region build (filterBlockedLowVegetationDecorations): low
  // vegetation on a blocked tile next to open ground reads as walkable, so it
  // is dropped (the renderer already hides it there).
  const decorativeObjects = (mapInfo.decorativeObjects || []).filter((object) => {
    if (object.eventId || object.eventType || object.fixedSceneEventType) return true
    if (object.hiddenZonePerimeter || object.hiddenZoneCorner || object.hiddenGateEntranceBlocker) return true
    if (!isBuildLowVegetation(object.type)) return true
    const x = Math.round(Number(object.x)), y = Math.round(Number(object.y))
    if (grid[y]?.[x] == null || isWalkableTile(grid[y][x])) return true
    return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isWalkableTile(grid[y + dy]?.[x + dx]))
  })
  return {
    ...mapInfo,
    mapGrid: grid,
    forestWallSourceGrid,
    decorativeObjects,
    environmentBlockedTiles,
    generationNotes: {
      ...mapInfo.generationNotes,
      visualCollision: {
        characterRadius: CHARACTER_BODY_RADIUS_WORLD,
        openedTiles: opened.length,
        // Clear of models but kept: opening would join areas split by a gate.
        gateKeptTiles: [...gateKept].filter((key) => { const [x, y] = key.split(',').map(Number); return OPENABLE_TILES.has(grid[y][x]) }),
        prunedSceneryTiles: blockedBefore.size - environmentBlockedTiles.size
      }
    }
  }
}
