// Environment composition is authored independently of encounters, rewards and routes.
// Coordinates and measured footprints are in map tiles; exported models are in metres.
import { ENVIRONMENT_MODEL_FOOTPRINTS } from './environmentModelFootprints.generated.js'
export const ENVIRONMENT_REVISION = 'environment-20260917-v1'
export const WATER_DECORATION_TYPES = new Set(['nature_canoe', 'nature_lily_large', 'pirate_boat_row_large', 'shore_rowboat', 'pirate_ship_wreck'])

export function environmentDecorationRotation(type, angle) {
  return /fence|hedge|resource_wood|resource_planks/.test(type)
    ? Math.round(angle / (Math.PI / 2)) * (Math.PI / 2)
    : angle
}

const anchor = (type, x, y, scale, extra = {}) => ({
  type, x, y, scale, rotation: 0, environmentAnchor: true, landmark: true,
  footprint: ENVIRONMENT_MODEL_FOOTPRINTS[type], surface: 'ground', ...extra
})

export const MAP_ENVIRONMENT_ANCHORS = {
  GodotMapV2: [
    anchor('nature_tree_oak', 18, 11, 3.6),
    anchor('nature_tent_detailed_open', 17, 27, 2.6),
    anchor('nature_log_stack', 15, 27, 1.45),
    anchor('nature_tree_oak', 35, 6, 2.5)
  ],
  GodotMapV2_MistLake: [
    anchor('pirate_boat_row_large', 24, 19.5, 1.4, { surface: 'water', rotation: .3 }),
    anchor('nature_canoe', 32, 13, 1.7, { surface: 'water', rotation: -.3 }),
    anchor('nature_lily_large', 20, 18, 1.05, { surface: 'water' }),
    anchor('nature_lily_large', 26, 20, .9, { surface: 'water' }),
    anchor('nature_rock_large', 18, 20, 1.8)
  ],
  GodotMapV2_FarmTown: [
    anchor('environment_farm_windmill', 24, 9, 1.25),
    anchor('town_stall_red', 17, 19, 1.7),
    anchor('town_stall_green', 14, 19, 1.7),
    anchor('town_cart', 24, 19, 1.5, { rotation: Math.PI / 2 }),
    anchor('town_stall_bench', 11, 19, 1.5)
  ],
  GodotMapV2_PirateShore: [
    anchor('pirate_ship_wreck', 33, 8, .42, { surface: 'water', rotation: Math.PI / 2 }),
    anchor('pirate_boat_row_large', 34, 12.5, 1.3, { surface: 'water', rotation: .2 }),
    anchor('pirate_crate', 24, 19, 1.2),
    anchor('pirate_barrel', 25.2, 19, 1.2),
    anchor('pirate_mast', 36, 24, 1.0)
  ],
  GodotMapV2_Graveyard: [
    anchor('environment_ruin_arch', 24, 11, 1.2),
    anchor('grave_bench_damaged', 32, 20, 1.5),
    anchor('grave_lantern_glass', 30, 20, 1.15),
    anchor('grave_lantern_glass', 34, 20, 1.15)
  ],
  GodotMapV2_HexRuins: [
    anchor('environment_ruin_arch', 23, 12, 1.45),
    anchor('environment_ruin_arch', 7, 19, .95, { rotation: Math.PI / 2 }),
    anchor('hex_building_mine', 16, 19, 2.2),
    anchor('nature_rock_large', 24, 19, 1.7)
  ],
  GodotMapV2_SurvivalRidge: [
    anchor('survival_tent', 23, 12, 3.3),
    anchor('survival_workbench', 26, 12, 3.2),
    anchor('survival_tree_log', 26, 10, 1.4),
    anchor('survival_barrel', 27.5, 12, 1.5)
  ],
  GodotMapV2_BossHighland: [
    anchor('environment_starwatch_marker', 25, 13, 1.5),
    anchor('environment_starwatch_marker', 6, 7, 1),
    anchor('platformer_rocks', 26, 18, 1.6),
    anchor('platformer_flag', 33, 8, 1.3)
  ]
}

export function isEnvironmentPointInWater(definition, x, y, padding = 0) {
  return (definition.waterBodies || []).some(body => {
    if (!body.rx || !body.ry) return false
    const dx = x - body.x, dy = y - body.y
    const cos = Math.cos(body.rotation || 0), sin = Math.sin(body.rotation || 0)
    return ((dx * cos + dy * sin) / (body.rx + padding)) ** 2 +
      ((-dx * sin + dy * cos) / (body.ry + padding)) ** 2 <= 1
  })
}

export function refineMapEnvironmentDefinition(raw) {
  const anchors = MAP_ENVIRONMENT_ANCHORS[raw.id]
  const scatter = (raw.scatter || []).map(group => {
    let result = { ...group }
    if (group.idPrefix === 'farm_wheat') result = { ...result, count: 110, allowedTiles: [8], rotation: 0, jitter: .06, scale: [.9, 1.05] }
    if (group.idPrefix === 'farm_edges') result = { ...result, types: ['nature_bush_large'], count: 32, scale: [1.8, 2.4] }
    if (group.idPrefix === 'grave_stones') result = { ...result, count: 32, allowedTiles: [0, 1, 17], rotation: 0, jitter: 0, scale: [1.7, 1.9], rowSpacing: 3,
      footprintsByType: ENVIRONMENT_MODEL_FOOTPRINTS }
    if (group.idPrefix === 'grave_mood') result = { ...result, count: 24, types: ['grave_candle', 'grave_urn_round'], scale: [.6, .85] }
    if (group.idPrefix === 'ridge_training_marks') result = { ...result, types: ['survival_patch_grass', 'survival_patch_grass_large'], count: 28 }
    if (group.idPrefix === 'ridge_camp') result = { ...result, types: ['survival_box', 'survival_barrel', 'survival_resource_wood'], count: 16, allowedTiles: [0], area: { x1: 21, y1: 11, x2: 30, y2: 20 }, rotation: 0 }
    if (group.idPrefix === 'shore_cargo') result = { ...result, types: ['pirate_barrel', 'pirate_crate'], count: 20, area: { x1: 21, y1: 18, x2: 27, y2: 22 }, rotation: 0 }
    if (group.idPrefix === 'lake_reeds') result = { ...result, types: ['wetland_reed_clump'], count: 64, shoreDistance: 3 }
    if (group.idPrefix === 'valley_lake_bank') result = { ...result, types: ['wetland_reed_clump', 'nature_stone_flat_a'], shoreDistance: 2.5 }
    if (raw.id === 'GodotMapV2_BossHighland') result.types = result.types.map(type => type === 'ridge_block_grass_edge' ? 'platformer_rocks' : type)
    // Gates remain authored landmarks; random fragments use the supporting columns only.
    if (group.idPrefix === 'tide_sanctum_edges') result.types = ['elite_tide_pillar']
    return result
  })
  if (['GodotMap', 'GodotMapV2', 'GodotMapV2_MistLake', 'GodotMapV2_FarmTown', 'GodotMapV2_HexRuins', 'GodotMapV2_SurvivalRidge'].includes(raw.id)) {
    const type = raw.id === 'GodotMapV2_SurvivalRidge' ? 'nature_tree_pine' : 'nature_tree_oak'
    scatter.push({ idPrefix: 'environment_grove', types: [type], count: 28, allowedTiles: [1], salt: 20260917,
      scale: [2.6, 3.5], minRoadDistance: 3.5, minEventDistance: 3, height: 0,
      footprint: ENVIRONMENT_MODEL_FOOTPRINTS[type], respectSampledScale: true })
  }
  return {
    ...raw, scatter,
    corridorScatterCount: raw.corridorScatterCount === 0 ? 0 : 100,
    corridorScatterLayers: 1,
    decorativeObjects: anchors
      ? anchors.map((object, index) => ({ ...object, sourceId: `environment_${raw.id}_${index}` }))
      : raw.decorativeObjects
  }
}

// Keep event bindings; only their tiny environmental accents may change species.
export function finishEnvironmentDecorations(objects, definition) {
  return objects.flatMap(object => {
    const water = isEnvironmentPointInWater(definition, object.x, object.y, -.15)
    if (object.type === 'nature_lily_large' && !water) {
      // Springs and reward markers used to put water lilies directly on dry ground.
      return [{ ...object, type: 'nature_stone_flat_a', surface: object.eventType ? undefined : 'ground' }]
    }
    if (WATER_DECORATION_TYPES.has(object.type) && !water) return []
    const protectedPlacement = object.eventId || object.eventType || object.fixedSceneEventType || object.dynamicTileVisibility || object.hiddenZoneId || object.preserveRoadPosition
    return [{
      ...object,
      surface: protectedPlacement ? object.surface : (WATER_DECORATION_TYPES.has(object.type) ? 'water' : 'ground')
    }]
  })
}
