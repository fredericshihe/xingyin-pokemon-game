import starterMap from './godotMaps/my_first_map.js'
import {
  GODOT_REGION_MAP_CONFIGS,
  GODOT_REGION_MAP_IDS,
  GODOT_REGION_MAPS
} from './godotMaps/godot_region_maps.js'

const DEFAULT_MAP_ID = 'GodotMap'
const DEFAULT_RENDER_MODE = 'three-lowpoly'
const REGION_RUNTIME_SOURCE = 'src/game/data/godotMaps/godot_region_maps.js'
const REGION_LEGACY_SNAPSHOT_SOURCE = 'src/game/data/godotMaps/godot_map_v2.generated.js'
const REGION_LEGACY_AUTHORING_SOURCE = 'src/game/data/mapSources/godotMapV2.source.json'
const STARTER_RUNTIME_SOURCE = 'src/game/data/godotMaps/my_first_map.js'

const cloneGrid = (grid) => grid.map((row) => [...row])

const REGION_WILD_POKEMON = {
  GodotMapV2: [
    { id: 1, weight: 24 },
    { id: 13, weight: 22 },
    { id: 39, weight: 18 },
    { id: 98, weight: 18 },
    { id: 114, weight: 10 },
    { id: 119, weight: 8 }
  ],
  GodotMapV2_MistLake: [
    { id: 14, weight: 30 },
    { id: 16, weight: 26 },
    { id: 77, weight: 16 },
    { id: 78, weight: 12 },
    { id: 80, weight: 10 },
    { id: 13, weight: 6 }
  ],
  GodotMapV2_FarmTown: [
    { id: 87, weight: 24 },
    { id: 88, weight: 18 },
    { id: 119, weight: 18 },
    { id: 106, weight: 16 },
    { id: 96, weight: 14 },
    { id: 102, weight: 10 }
  ],
  GodotMapV2_PirateShore: [
    { id: 79, weight: 24 },
    { id: 77, weight: 20 },
    { id: 80, weight: 18 },
    { id: 82, weight: 14 },
    { id: 81, weight: 12 },
    { id: 44, weight: 12 },
    { id: 5, weight: 6 }
  ],
  GodotMapV2_Graveyard: [
    { id: 21, weight: 26 },
    { id: 6, weight: 22 },
    { id: 43, weight: 18 },
    { id: 100, weight: 16 },
    { id: 101, weight: 12 },
    { id: 137, weight: 6 }
  ],
  GodotMapV2_HexRuins: [
    { id: 38, weight: 22 },
    { id: 45, weight: 20 },
    { id: 108, weight: 16 },
    { id: 11, weight: 14 },
    { id: 103, weight: 14 },
    { id: 105, weight: 14 },
    { id: 135, weight: 14 }
  ],
  GodotMapV2_SurvivalRidge: [
    { id: 34, weight: 22 },
    { id: 35, weight: 20 },
    { id: 51, weight: 18 },
    { id: 131, weight: 16 },
    { id: 109, weight: 14 },
    { id: 139, weight: 10 }
  ],
  GodotMapV2_BossHighland: [
    { id: 72, weight: 18 },
    { id: 74, weight: 18 },
    { id: 76, weight: 18 },
    { id: 129, weight: 16 },
    { id: 131, weight: 16 },
    { id: 143, weight: 14 }
  ]
}

const REGION_ENCOUNTER_TABLE_IDS = {
  GodotMapV2: 'region_meadow_5_12',
  GodotMapV2_MistLake: 'region_lake_11_18',
  GodotMapV2_FarmTown: 'region_farm_17_24',
  GodotMapV2_PirateShore: 'region_shore_23_30',
  GodotMapV2_Graveyard: 'region_grave_29_36',
  GodotMapV2_HexRuins: 'region_ruin_35_42',
  GodotMapV2_SurvivalRidge: 'region_ridge_41_47',
  GodotMapV2_BossHighland: 'region_peak_52_60'
}

const STARTER_MAP_CONFIG = {
  displayName: '新手山谷',
  description: '营地、低级草坡、花丘、密林、湖畔、恢复泉水、教学训练师和补给点组成的新手探索地图。',
  difficulty: 1,
  recommendedLevel: 5,
  minLevel: 2,
  maxLevel: 8,
  wildPokemon: [
    { id: 1, weight: 30 },
    { id: 13, weight: 24 },
    { id: 39, weight: 18 },
    { id: 98, weight: 16 },
    { id: 114, weight: 8 },
    { id: 14, weight: 8 },
    { id: 16, weight: 6 },
    { id: 119, weight: 6 },
    { id: 4, weight: 5 },
    { id: 110, weight: 4 }
  ],
  encounterRate: 0.08,
  tallGrassRate: 0.14
}

function normalizeStartPosition(startPosition) {
  return {
    ...(startPosition || { x: 1, y: 1 }),
    direction: startPosition?.direction || 'down'
  }
}

const ENCOUNTER_ZONE_DEPTH_PRIORITY = {
  deep: 2
}

function isPointInsideEncounterZone(zone, tileX, tileY) {
  if (!zone) return false
  return (
    tileX >= zone.x &&
    tileX < zone.x + zone.width &&
    tileY >= zone.y &&
    tileY < zone.y + zone.height
  )
}

function getEncounterZonePriority(zone, index) {
  const width = Math.max(1, Math.trunc(Number(zone?.width)) || 1)
  const height = Math.max(1, Math.trunc(Number(zone?.height)) || 1)
  return {
    depth: ENCOUNTER_ZONE_DEPTH_PRIORITY[zone?.depth] || 0,
    area: width * height,
    index
  }
}

function buildSourceMeta({
  runtimeSource,
  authoringSource = runtimeSource,
  generatedFrom = null,
  legacySnapshotSource = null,
  legacyAuthoringSource = null,
  family = 'adventure'
}) {
  return {
    runtimeSource,
    authoringSource,
    generatedFrom,
    legacySnapshotSource,
    legacyAuthoringSource,
    family
  }
}

function buildCatalogEntry({
  id,
  mapInfo,
  encounterTableId,
  config,
  sources,
  chainOrder
}) {
  const normalizedMapInfo = {
    ...mapInfo,
    id,
    name: id,
    renderMode: mapInfo.renderMode || DEFAULT_RENDER_MODE
  }
  const normalizedStartPosition = normalizeStartPosition(normalizedMapInfo.startPosition)
  const displayName = config.displayName || normalizedMapInfo.displayName || normalizedMapInfo.name || id
  const normalizedConfig = {
    ...config,
    displayName
  }

  return {
    id,
    chainOrder,
    mapInfo: normalizedMapInfo,
    config: normalizedConfig,
    registry: {
      id,
      name: displayName,
      encounterTableId,
      defaultSpawn: normalizedStartPosition,
      useLegacyData: true,
      renderMode: normalizedMapInfo.renderMode,
      recommendedLevel: normalizedConfig.recommendedLevel,
      minLevel: normalizedConfig.minLevel,
      maxLevel: normalizedConfig.maxLevel,
      regionOrder: normalizedConfig.regionOrder ?? normalizedMapInfo.regionOrder ?? null
    },
    sources
  }
}

const regionCatalogEntries = GODOT_REGION_MAP_IDS.map((mapId, index) => {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  const config = {
    ...GODOT_REGION_MAP_CONFIGS[mapId],
    wildPokemon: REGION_WILD_POKEMON[mapId] || REGION_WILD_POKEMON.GodotMapV2
  }
  return buildCatalogEntry({
    id: mapId,
    mapInfo,
    encounterTableId: REGION_ENCOUNTER_TABLE_IDS[mapId],
    config,
    sources: buildSourceMeta({
      runtimeSource: REGION_RUNTIME_SOURCE,
      authoringSource: REGION_RUNTIME_SOURCE,
      generatedFrom: mapInfo?.generationNotes?.generatedFrom || REGION_RUNTIME_SOURCE,
      legacySnapshotSource: REGION_LEGACY_SNAPSHOT_SOURCE,
      legacyAuthoringSource: REGION_LEGACY_AUTHORING_SOURCE,
      family: 'region-chain'
    }),
    chainOrder: index + 1
  })
})

const starterCatalogEntry = buildCatalogEntry({
  id: DEFAULT_MAP_ID,
  mapInfo: {
    ...starterMap,
    displayName: STARTER_MAP_CONFIG.displayName
  },
  encounterTableId: 'route102_grass',
  config: STARTER_MAP_CONFIG,
  sources: buildSourceMeta({
    runtimeSource: STARTER_RUNTIME_SOURCE,
    authoringSource: STARTER_RUNTIME_SOURCE,
    family: 'starter'
  }),
  chainOrder: 0
})

const catalogEntries = [starterCatalogEntry, ...regionCatalogEntries]

export const MAP_CHAIN = catalogEntries
  .slice()
  .sort((left, right) => left.chainOrder - right.chainOrder)
  .map((entry) => entry.id)

export const MAP_IDS = [...MAP_CHAIN]

export const MAP_CATALOG = Object.fromEntries(
  catalogEntries.map((entry) => [entry.id, entry])
)

export function hasMap(mapId) {
  return Boolean(MAP_CATALOG[mapId])
}

export function getMapCatalogEntry(mapId) {
  return MAP_CATALOG[mapId] || MAP_CATALOG[DEFAULT_MAP_ID]
}

export function getMapInfo(mapId) {
  return getMapCatalogEntry(mapId).mapInfo
}

export function loadMapGrid(mapId) {
  return cloneGrid(getMapInfo(mapId).mapGrid)
}

export function getMapConfigData(mapId) {
  return getMapCatalogEntry(mapId).config
}

export function getMapRegistryData(mapId) {
  return getMapCatalogEntry(mapId).registry
}

export function getMapSourceData(mapId) {
  return getMapCatalogEntry(mapId).sources
}

export function getMapStartPositionData(mapId) {
  return {
    ...normalizeStartPosition(getMapInfo(mapId).startPosition)
  }
}

export function getMapRuntimeEvents(mapId) {
  return getMapInfo(mapId)?.runtimeEvents || []
}

export function getMapEncounterZoneAt(mapId, tileX, tileY) {
  const info = getMapInfo(mapId)
  if (!info?.encounterZones) return null
  const matches = info.encounterZones
    .map((zone, index) => ({ zone, priority: getEncounterZonePriority(zone, index) }))
    .filter(({ zone }) => isPointInsideEncounterZone(zone, tileX, tileY))

  if (matches.length === 0) return null

  matches.sort((left, right) => (
    right.priority.depth - left.priority.depth ||
    left.priority.area - right.priority.area ||
    right.priority.index - left.priority.index
  ))

  return matches[0]?.zone || null
}

export function getMapSignText(mapId, tileX, tileY) {
  const info = getMapInfo(mapId)
  if (!info?.signs) return null
  return info.signs[`${tileX},${tileY}`] || null
}

export function resolveMapEncounterTableId(mapId) {
  return getMapRegistryData(mapId).encounterTableId || 'route102_grass'
}

export function isMapRenderMode(mapId, renderMode) {
  return getMapInfo(mapId)?.renderMode === renderMode
}

export {
  DEFAULT_MAP_ID,
  REGION_ENCOUNTER_TABLE_IDS,
  REGION_WILD_POKEMON,
  STARTER_MAP_CONFIG
}
