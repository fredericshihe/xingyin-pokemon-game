import { readFileSync } from 'node:fs'
import maps, {
  REGION_MAP_TILE as TILE,
  getHiddenEncounterGatePassageTiles,
  isInsideDecorationFootprint
} from '../src/game/data/godotMaps/godot_region_maps.js'
import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import {
  EXP_POTIONS,
  POKEBALLS,
  POTIONS,
  STAT_BOOST_ITEMS
} from '../src/utils/gameData.js'
import { MAP_MODEL_MANIFEST } from '../src/game/data/mapModelManifest.generated.js'

const TRAINER_EVENT_TYPES = new Set(['trainer', 'boss', 'challenge'])
const SHELL_COAST_MAP_ID = 'GodotMapV2_PirateShore'
const MIN_NORMAL_GRASS_SEPARATION = 2
const LOW_VEGETATION_TAGS = new Set(['grass', 'flower', 'mushroom', 'reed'])
const LOW_VEGETATION_TYPES = new Set([
  'grass-small',
  'grass-large',
  'flower-yellow',
  'flower-red',
  'mushroom-red',
  'wetland_reed_clump',
  'nature_grass_small',
  'nature_grass_large',
  'nature_flower_yellow',
  'nature_flower_red',
  'nature_flower_purple_a',
  'nature_flower_purple_b',
  'nature_mushroom_red',
  'nature_wheat_stage_a',
  'nature_wheat_stage_b',
  'nature_lily_large',
  'platformer_flowers',
  'platformer_flowers_tall'
])
const LOW_HIDDEN_PERIMETER_TYPES = new Set([
  ...LOW_VEGETATION_TYPES,
  'nature_grass_leafs',
  'nature_plant_bush',
  'wetland_reed_clump',
  'hex_water_rocks',
  'hex_stone_rocks',
  'pirate_rocks_sand_a',
  'pirate_rocks_sand_b',
  'pirate_rocks_sand_c',
  'platformer_rocks',
  'platformer_stones',
  'ridge_block_grass_edge',
  'survival_rock_a',
  'survival_rock_b',
  'survival_rock_c',
  'town_rock_small',
  'grave_rocks',
  'nature_rock_small_h',
  'nature_stone_flat_a',
  'nature_stone_flat_b',
  'nature_stone_flat_c'
])
const MIN_HIDDEN_PERIMETER_SCALE = 0.94
const SHORE_MIN_HIDDEN_PERIMETER_SCALE = 0.72
const HIDDEN_GATE_ENTRANCE_MARKER_TYPES = new Set([
  'trail_sign',
  'nature_tree_oak',
  'nature_tree_pine',
  'nature_tree_default',
  'pirate_palm_detailed_straight',
  'pirate_flag_pennant',
  'grave_lantern_glass',
  'hex_stone_hill',
  'ridge_block_grass_edge',
  'survival_signpost',
  'platformer_flag'
])
const SHELL_COAST_GATE_MARKER_TYPES = new Set([
  'pirate_flag',
  'pirate_flag_pennant'
])
const DECORATIVE_MODEL_KEY_ALIASES = {
  grave_lantern_glass: 'graveLanternGlass',
  nature_tree_oak: 'treeOak',
  nature_tree_default: 'treeDefault',
  nature_tree_pine: 'treePine',
  pirate_palm_detailed_straight: 'pirate_palm_detailed_straight',
  ridge_block_grass_edge: 'ridgeBlockGrassEdge',
  wetland_reed_clump: 'wetlandReedClump'
}

const key = (x, y) => `${x},${y}`
const perimeterKey = (cell) => `${cell.x},${cell.y}:${cell.side}`
const isDeepZone = (zone) => zone?.depth === 'deep'
const isHiddenGateBook = (object) => object?.type === 'hidden_gate_book' || object?.hiddenGateBook === true
const isHiddenPerimeter = (object) => object?.hiddenZonePerimeter === true
const isHiddenCorner = (object) => object?.hiddenZoneCorner === true
const isHiddenGateEntranceBlocker = (object) => object?.hiddenGateEntranceBlocker === true
const isHiddenRuleObject = (object) => isHiddenGateBook(object) || isHiddenPerimeter(object) || isHiddenCorner(object) || isHiddenGateEntranceBlocker(object)
const isRuntimeEventDecoration = (object) => Boolean(object?.eventId || object?.eventType || object?.fixedSceneEventType)
const getDecorativeModelKey = (type) => DECORATIVE_MODEL_KEY_ALIASES[type] || type

function getMinHiddenPerimeterScale(mapId, object) {
  if (mapId === SHELL_COAST_MAP_ID && object?.type === 'pirate_structure_fence') {
    return SHORE_MIN_HIDDEN_PERIMETER_SCALE
  }
  return MIN_HIDDEN_PERIMETER_SCALE
}

function inBounds(map, x, y) {
  return y >= 0 && y < map.height && x >= 0 && x < map.width
}

function isLowVegetationDecoration(object) {
  if (LOW_VEGETATION_TYPES.has(object?.type)) return true
  const asset = MAP_ASSET_CATALOG[object?.type]
  if (!asset?.decorativeOnly) return false
  return (asset.themeTags || []).some((tag) => LOW_VEGETATION_TAGS.has(tag))
}

function isLowHiddenPerimeterDecoration(object) {
  const type = object?.type
  if (LOW_HIDDEN_PERIMETER_TYPES.has(type)) return true
  const asset = MAP_ASSET_CATALOG[type]
  if (!asset?.decorativeOnly) return false
  const tags = asset.themeTags || []
  if (tags.some((tag) => LOW_VEGETATION_TAGS.has(tag))) return true
  return tags.includes('filler') && (tags.includes('rock') || tags.includes('stone'))
}

function centerDistance(left, right) {
  const leftX = Number(left?.x)
  const leftY = Number(left?.y)
  const rightX = Number(right?.x)
  const rightY = Number(right?.y)
  if (![leftX, leftY, rightX, rightY].every(Number.isFinite)) return Infinity
  return Math.hypot(leftX - rightX, leftY - rightY)
}

function decorationsOverlap(left, right, padding = 0.18) {
  const leftX = Number(left?.x)
  const leftY = Number(left?.y)
  const rightX = Number(right?.x)
  const rightY = Number(right?.y)
  if (![leftX, leftY, rightX, rightY].every(Number.isFinite)) return false
  return (
    centerDistance(left, right) < 0.72 ||
    isInsideDecorationFootprint(left, rightX, rightY, padding) ||
    isInsideDecorationFootprint(right, leftX, leftY, padding)
  )
}

function perimeterCells(map, zone) {
  const cells = []
  const add = (x, y, side) => {
    if (!inBounds(map, x, y)) return
    cells.push({ x, y, side })
  }

  for (let x = zone.x; x < zone.x + zone.width; x += 1) {
    add(x, zone.y - 1, 'north')
    add(x, zone.y + zone.height, 'south')
  }
  for (let y = zone.y; y < zone.y + zone.height; y += 1) {
    add(zone.x - 1, y, 'west')
    add(zone.x + zone.width, y, 'east')
  }

  return cells
}

function hiddenPerimeterObjects(map, zoneId) {
  return (map.decorativeObjects || [])
    .filter((object) => isHiddenPerimeter(object) && !isHiddenCorner(object) && object.hiddenZoneId === zoneId)
}

function hiddenCornerObjects(map, zoneId) {
  return (map.decorativeObjects || [])
    .filter((object) => isHiddenCorner(object) && object.hiddenZoneId === zoneId)
}

function normalizedPerimeterKey(object) {
  const x = Number.isFinite(Number(object.hiddenZoneCellX))
    ? Math.trunc(Number(object.hiddenZoneCellX))
    : Math.round(Number(object.x))
  const y = Number.isFinite(Number(object.hiddenZoneCellY))
    ? Math.trunc(Number(object.hiddenZoneCellY))
    : Math.round(Number(object.y))
  return `${x},${y}:${object.hiddenZoneSide || 'unknown'}`
}

function rectSeparation(left, right) {
  const leftMaxX = left.x + left.width - 1
  const rightMaxX = right.x + right.width - 1
  const leftMaxY = left.y + left.height - 1
  const rightMaxY = right.y + right.height - 1
  return {
    x: Math.max(right.x - leftMaxX - 1, left.x - rightMaxX - 1, 0),
    y: Math.max(right.y - leftMaxY - 1, left.y - rightMaxY - 1, 0)
  }
}

function outerRingKeys(map, zone) {
  const cells = new Set()
  perimeterCells(map, zone).forEach((cell) => cells.add(key(cell.x, cell.y)))
  return cells
}

function hiddenCornerCells(map, zone) {
  return [
    { id: 'north_west', x: zone.x - 1, y: zone.y - 1 },
    { id: 'north_east', x: zone.x + zone.width, y: zone.y - 1 },
    { id: 'south_west', x: zone.x - 1, y: zone.y + zone.height },
    { id: 'south_east', x: zone.x + zone.width, y: zone.y + zone.height }
  ].filter((cell) => inBounds(map, cell.x, cell.y))
}

function isInsideZone(zone, event) {
  const x = Math.trunc(Number(event?.position?.x))
  const y = Math.trunc(Number(event?.position?.y))
  return (
    Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    x >= zone.x &&
    x < zone.x + zone.width &&
    y >= zone.y &&
    y < zone.y + zone.height
  )
}

function getItemAuditValue(event) {
  const props = event?.properties || {}
  const itemKey = props.itemKey
  const itemType = props.itemType
  const quantity = Math.max(1, Math.trunc(Number(props.quantity)) || 1)
  const catalogs = [POTIONS, POKEBALLS, EXP_POTIONS, STAT_BOOST_ITEMS]
  const entry = catalogs.map((catalog) => catalog?.[itemKey]).find(Boolean)
  const price = Math.trunc(Number(entry?.price))
  if (Number.isFinite(price) && price > 0) return price * quantity
  if (itemType === 'statBoost' || STAT_BOOST_ITEMS[itemKey]) return 1200 * quantity
  if (itemKey === 'pokeball_master') return 3000 * quantity
  return 0
}

function hasRoadAccessToEntrance(map, zone, lockedTile) {
  const directions = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  return directions.some(([dx, dy]) => {
    const x = lockedTile.x + dx
    const y = lockedTile.y + dy
    if (!inBounds(map, x, y)) return false
    const inside = x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height
    if (inside) return false
    return [TILE.road, TILE.bridge, TILE.exit, TILE.sign, TILE.objectBlocker].includes(map.mapGrid[y]?.[x])
  })
}

const errors = []
const summary = []

const threeLowPolyMapSource = readFileSync(new URL('../src/game/ThreeLowPolyMap.jsx', import.meta.url), 'utf8')
const originalGameSource = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')

if (
  !/isHiddenEncounterGateMapEvent\(mapEvent\)/.test(threeLowPolyMapSource) ||
  !/activeTile\s*===\s*REGION_MAP_TILE\.objectBlocker/.test(threeLowPolyMapSource)
) {
  errors.push('runtime hidden gate sign must stay interactable while its locked tile is objectBlocker')
}

if (
  !/hidden_gate:\s*\{/.test(threeLowPolyMapSource) ||
  !/hiddenGateMarker[\s\S]*return\s+'hidden_gate'/.test(threeLowPolyMapSource)
) {
  errors.push('hidden gate entrance marker must use a dedicated high-visibility signal instead of the passive sign signal')
}

if (!/hiddenGateLockedScale/.test(threeLowPolyMapSource)) {
  errors.push('locked hidden gate entrance marker must receive a separate enlarged render scale')
}

if (!/state\.onBlockedMove\?\.\(\{[\s\S]*targetX:\s*nextX[\s\S]*targetY:\s*nextY/.test(threeLowPolyMapSource)) {
  errors.push('runtime blocked movement must report the blocked target tile for hidden edge notices')
}

if (!/const \{ lockedTiles, sealedTiles \} = getHiddenEncounterGatePassageTiles[\s\S]*touchesGateBlocker/.test(originalGameSource)) {
  errors.push('blocked hidden gate notice must check both entrance and sealed perimeter tiles')
}

if (!/sealedTiles\.forEach[\s\S]*REGION_MAP_TILE\.objectBlocker[\s\S]*lockedTiles\.forEach[\s\S]*REGION_MAP_TILE\.objectBlocker/.test(originalGameSource)) {
  errors.push('locked hidden gate grid sync must block both sealed perimeter and entrance tiles')
}

for (const [mapId, map] of Object.entries(maps)) {
  const deepZones = (map.encounterZones || []).filter(isDeepZone)
  if (deepZones.length === 0) continue

  for (const zone of deepZones) {
    const gateEvent = (map.runtimeEvents || []).find((event) => event?.properties?.hiddenZoneId === zone.id)
    if (!gateEvent) {
      errors.push(`${mapId}/${zone.id} missing hidden gate event`)
      continue
    }

    const books = (map.decorativeObjects || []).filter(isHiddenGateBook)
    if (books.length > 0) {
      errors.push(`${mapId}/${zone.id} must not render hidden gate books, got ${books.length}`)
    }

    const { lockedTiles, sealedTiles } = getHiddenEncounterGatePassageTiles(map, map.mapGrid, gateEvent, map.runtimeEvents)
    if (lockedTiles.length !== 1) {
      errors.push(`${mapId}/${zone.id} expected exactly one unlock entrance tile, got ${lockedTiles.length}`)
    }
    const lockedTile = lockedTiles[0] || null
    const gateX = Math.trunc(Number(gateEvent.position?.x))
    const gateY = Math.trunc(Number(gateEvent.position?.y))
    if (lockedTile && (lockedTile.x !== gateX || lockedTile.y !== gateY)) {
      errors.push(`${mapId}/${zone.id} gate event (${gateX},${gateY}) must match unlock tile (${lockedTile.x},${lockedTile.y})`)
    }

    const allPerimeterKeys = new Set(perimeterCells(map, zone).map(perimeterKey))
    if (lockedTile && !allPerimeterKeys.has(`${lockedTile.x},${lockedTile.y}:${perimeterCells(map, zone).find((cell) => cell.x === lockedTile.x && cell.y === lockedTile.y)?.side || 'unknown'}`)) {
      errors.push(`${mapId}/${zone.id} unlock tile is not on the hidden zone edge`)
    }
    if (lockedTile && !hasRoadAccessToEntrance(map, zone, lockedTile)) {
      errors.push(`${mapId}/${zone.id} unlock entrance has no road/bridge access from outside`)
    }

    const entranceBlockers = (map.decorativeObjects || []).filter((object) => (
      isHiddenGateEntranceBlocker(object) &&
      object.eventId === gateEvent.id &&
      object.hiddenZoneId === zone.id
    ))
    if (entranceBlockers.length !== 1) {
      errors.push(`${mapId}/${zone.id} expected exactly one hidden gate entrance blocker, got ${entranceBlockers.length}`)
    }

    for (const blocker of entranceBlockers) {
      const blockerX = Number(blocker.x)
      const blockerY = Number(blocker.y)
      if (lockedTile && (blockerX !== lockedTile.x || blockerY !== lockedTile.y)) {
        errors.push(`${mapId}/${zone.id} entrance blocker must sit on unlock tile, got (${blockerX},${blockerY})`)
      }
      if (blocker.eventType !== 'sign' || blocker.alwaysVisibleSignal !== true) {
        errors.push(`${mapId}/${zone.id} entrance blocker must carry the only visible unlock signal`)
      }
      if (!blocker.hiddenGateMarker || !HIDDEN_GATE_ENTRANCE_MARKER_TYPES.has(blocker.type)) {
        errors.push(`${mapId}/${zone.id} entrance blocker must use an explicit entrance marker model, got ${blocker.type}`)
      }
      if (mapId === SHELL_COAST_MAP_ID && !SHELL_COAST_GATE_MARKER_TYPES.has(blocker.type)) {
        errors.push(`${mapId}/${zone.id} shore hidden entrance must use a high-visibility pirate flag marker, got ${blocker.type}`)
      }
      const baseScale = Number(blocker.scale)
      const lockedScale = Number(blocker.hiddenGateLockedScale)
      if (!Number.isFinite(baseScale) || !Number.isFinite(lockedScale) || lockedScale <= baseScale) {
        errors.push(`${mapId}/${zone.id} entrance blocker must be separately enlarged while locked, got scale=${blocker.scale} lockedScale=${blocker.hiddenGateLockedScale}`)
      }
      const manifestKeys = new Set(MAP_MODEL_MANIFEST?.[mapId]?.modelKeys || [])
      const markerModelKey = getDecorativeModelKey(blocker.type)
      if (!manifestKeys.has(markerModelKey)) {
        errors.push(`${mapId}/${zone.id} entrance marker model ${blocker.type} (${markerModelKey}) is missing from manifest`)
      }
      const visibleTiles = Array.isArray(blocker.dynamicTileVisibleTiles) ? blocker.dynamicTileVisibleTiles : []
      if (!visibleTiles.includes(TILE.sign) || !visibleTiles.includes(TILE.objectBlocker)) {
        errors.push(`${mapId}/${zone.id} entrance blocker must stay visible while locked and hide after unlock`)
      }

      const overlaps = (map.decorativeObjects || [])
        .filter((object) => object !== blocker)
        .filter((object) => !isHiddenRuleObject(object))
        .filter((object) => !isRuntimeEventDecoration(object))
        .filter((object) => decorationsOverlap(blocker, object))
      if (overlaps.length > 0) {
        errors.push(`${mapId}/${zone.id} entrance blocker overlaps normal decoration: ${overlaps.slice(0, 6).map((object) => object.sourceId || object.type).join(', ')}`)
      }
    }

    const expectedKeys = new Set(sealedTiles.map((tile) => {
      const side = perimeterCells(map, zone).find((cell) => cell.x === tile.x && cell.y === tile.y)?.side || 'unknown'
      return `${tile.x},${tile.y}:${side}`
    }))
    const perimeterObjects = hiddenPerimeterObjects(map, zone.id)
    const coveredKeys = new Set(perimeterObjects.map(normalizedPerimeterKey))
    const missing = [...expectedKeys].filter((entry) => !coveredKeys.has(entry))
    const extra = perimeterObjects
      .map((object) => ({ object, key: normalizedPerimeterKey(object) }))
      .filter((entry) => !expectedKeys.has(entry.key))

    if (missing.length > 0) {
      errors.push(`${mapId}/${zone.id} missing perimeter models: ${missing.join(' ')}`)
    }
    if (extra.length > 0) {
      errors.push(`${mapId}/${zone.id} has perimeter models outside sealed edge: ${extra.slice(0, 8).map((entry) => entry.object.sourceId || entry.key).join(', ')}`)
    }

    perimeterObjects.forEach((object) => {
      const cellX = Math.trunc(Number(object.hiddenZoneCellX))
      const cellY = Math.trunc(Number(object.hiddenZoneCellY))
      if (Number(object.x) !== cellX || Number(object.y) !== cellY) {
        errors.push(`${mapId}/${zone.id} perimeter model ${object.sourceId || object.type} visual position does not match edge cell`)
      }
      if (isLowHiddenPerimeterDecoration(object)) {
        errors.push(`${mapId}/${zone.id} perimeter model ${object.sourceId || object.type} uses a low/stone filler model (${object.type})`)
      }
      const scale = Number(object.scale)
      const minScale = getMinHiddenPerimeterScale(mapId, object)
      if (!Number.isFinite(scale) || scale < minScale) {
        errors.push(`${mapId}/${zone.id} perimeter model ${object.sourceId || object.type} is too small for a hidden-zone boundary, scale=${object.scale}`)
      }
    })

    const cornerObjects = hiddenCornerObjects(map, zone.id)
    if (cornerObjects.length > 0) {
      const expectedCornerKeys = new Set(hiddenCornerCells(map, zone).map((cell) => key(cell.x, cell.y)))
      const seenCornerKeys = new Set()
      cornerObjects.forEach((object) => {
        const cellX = Math.trunc(Number(object.hiddenZoneCellX ?? object.x))
        const cellY = Math.trunc(Number(object.hiddenZoneCellY ?? object.y))
        const cornerKey = key(cellX, cellY)
        if (!expectedCornerKeys.has(cornerKey)) {
          errors.push(`${mapId}/${zone.id} corner cap ${object.sourceId || object.type} is outside legal corners at ${cornerKey}`)
        }
        if (seenCornerKeys.has(cornerKey)) {
          errors.push(`${mapId}/${zone.id} has duplicate corner cap at ${cornerKey}`)
        }
        seenCornerKeys.add(cornerKey)
        if (Number(object.x) !== cellX || Number(object.y) !== cellY) {
          errors.push(`${mapId}/${zone.id} corner cap ${object.sourceId || object.type} visual position does not match corner cell`)
        }
        if (isLowHiddenPerimeterDecoration(object)) {
          errors.push(`${mapId}/${zone.id} corner cap ${object.sourceId || object.type} uses a low/stone filler model (${object.type})`)
        }
      })
      const missingCorners = [...expectedCornerKeys].filter((cornerKey) => !seenCornerKeys.has(cornerKey))
      if (missingCorners.length > 0) {
        errors.push(`${mapId}/${zone.id} missing corner caps: ${missingCorners.join(' ')}`)
      }
    }


    const ringKeys = outerRingKeys(map, zone)
    const edgeTrainers = (map.runtimeEvents || [])
      .filter((event) => TRAINER_EVENT_TYPES.has(event.type))
      .filter((event) => ringKeys.has(key(Math.trunc(Number(event.position?.x)), Math.trunc(Number(event.position?.y)))))
    if (edgeTrainers.length > 0) {
      errors.push(`${mapId}/${zone.id} trainer overlaps hidden edge: ${edgeTrainers.map((event) => event.id).join(', ')}`)
    }

    const edgeLowVegetation = (map.decorativeObjects || [])
      .filter((object) => !isHiddenRuleObject(object))
      .filter((object) => !isRuntimeEventDecoration(object))
      .filter((object) => isLowVegetationDecoration(object))
      .filter((object) => {
        const x = Math.round(Number(object.x))
        const y = Math.round(Number(object.y))
        return ringKeys.has(key(x, y))
      })
    if (edgeLowVegetation.length > 0) {
      errors.push(`${mapId}/${zone.id} low vegetation touches hidden edge: ${edgeLowVegetation.slice(0, 8).map((object) => object.sourceId || object.type).join(', ')}`)
    }

    if (mapId !== SHELL_COAST_MAP_ID) {
      const nearbyGrassZones = (map.encounterZones || [])
        .filter((candidate) => !isDeepZone(candidate) && candidate.id !== zone.id)
        .filter((candidate) => {
          const separation = rectSeparation(zone, candidate)
          return separation.x < MIN_NORMAL_GRASS_SEPARATION && separation.y < MIN_NORMAL_GRASS_SEPARATION
        })
      if (nearbyGrassZones.length > 0) {
        errors.push(`${mapId}/${zone.id} is too close to normal grass zones: ${nearbyGrassZones.map((candidate) => candidate.id).join(', ')}`)
      }
    }

    const valuableTreasures = (map.runtimeEvents || [])
      .filter((event) => event?.type === 'item' || event?.type === 'pickup')
      .filter((event) => isInsideZone(zone, event))
      .map((event) => ({ event, value: getItemAuditValue(event) }))
      .filter((entry) => entry.value > 100)
    if (valuableTreasures.length === 0) {
      errors.push(`${mapId}/${zone.id} needs an internal treasure worth over 100 coins`)
    }

    summary.push({
      mapId,
      zoneId: zone.id,
      entrance: lockedTile ? `${lockedTile.x},${lockedTile.y}` : 'none',
      perimeterModels: coveredKeys.size,
      perimeterCells: expectedKeys.size,
      cornerCaps: cornerObjects.length,
      treasures: valuableTreasures.map((entry) => `${entry.event.id}:${entry.value}`)
    })
  }
}

console.log('=== 隐藏区视觉规则审计 ===')
summary.forEach((row) => {
  console.log(`${row.mapId}/${row.zoneId}: entrance=${row.entrance}, perimeter=${row.perimeterModels}/${row.perimeterCells}, corners=${row.cornerCaps}, treasure=${row.treasures.join(', ') || 'none'}`)
})

if (errors.length > 0) {
  console.error('\n发现问题:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nOK: 无发光书；每个隐藏区只有一个入口模型提示；每个封锁边缘都有对应围挡；锁定边缘碰撞会提示；内部宝箱价值超过100金币。')
