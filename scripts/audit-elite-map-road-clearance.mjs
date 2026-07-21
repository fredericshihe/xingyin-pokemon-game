import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import {
  GODOT_REGION_MAPS,
  REGION_MAP_TILE,
  collectRoadSurfaceDecorationOverlapEntries
} from '../src/game/data/godotMaps/godot_region_maps.js'

const CELL_SIZE = 1.55
const ROAD_CLEARANCE_MARGIN_TILES = 0.08
const PLAYER_CLEARANCE_HEIGHT = 1.65
const ELITE_MAP_IDS = [
  'GodotMapV2_FrostDojo',
  'GodotMapV2_TideDojo',
  'GodotMapV2_IronDojo',
  'GodotMapV2_DragonDojo'
]
const ELITE_GATE_SIGN_REQUIREMENTS = {
  GodotMapV2_FrostDojo: {
    signId: 'sign_frost_gate',
    requiredNames: ['霜纹哨兵', '镜湖术士', '白雾守卫', '霜镜天王']
  },
  GodotMapV2_TideDojo: {
    signId: 'sign_tide_gate',
    requiredNames: ['潮汐潜员', '深海猎手', '漩涡祭司', '深潮天王']
  },
  GodotMapV2_IronDojo: {
    signId: 'sign_iron_gate',
    requiredNames: ['铸盾工匠', '磁轨技师', '王座禁卫', '铁壁天王']
  },
  GodotMapV2_DragonDojo: {
    signId: 'sign_dragon_gate',
    requiredNames: ['龙牙试炼官', '天穹追猎者', '终焉守门人', '龙穹天王']
  }
}

const failures = []

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared <= 0.0001) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function getRoadWidthAt(mapInfo, x, y) {
  let width = 0
  for (const path of mapInfo.visualPaths || []) {
    const radius = Number(path?.radius) || 0
    const points = Array.isArray(path?.points) ? path.points : []
    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      if (distanceToSegment(x, y, ax, ay, bx, by) <= radius + 0.08) {
        width = Math.max(width, radius * 2)
      }
    }
  }
  if (width > 0) return width
  return Math.max(0, ...(mapInfo.visualPaths || []).map((path) => (Number(path?.radius) || 0) * 2))
}

function findDecoration(mapInfo, overlap) {
  return (mapInfo.decorativeObjects || []).find((object) => {
    if (overlap.sourceId && object.sourceId === overlap.sourceId) return true
    return (
      !overlap.sourceId &&
      object.type === overlap.type &&
      Math.abs(Number(object.x) - overlap.x) < 0.001 &&
      Math.abs(Number(object.y) - overlap.y) < 0.001
    )
  })
}

function isPointOnVisualRoad(mapInfo, x, y) {
  return (mapInfo.visualPaths || []).some((path) => {
    const points = Array.isArray(path?.points) ? path.points : []
    const radius = Number(path?.edgeRadius ?? path?.radius) || 0
    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      if (distanceToSegment(x, y, ax, ay, bx, by) <= radius + 0.02) return true
    }
    return false
  })
}

function hasAdjacentRoadTile(mapInfo, x, y) {
  return [[0, 1], [0, -1], [-1, 0], [1, 0]].some(([dx, dy]) => {
    const tile = mapInfo.mapGrid?.[y + dy]?.[x + dx]
    return tile === REGION_MAP_TILE.road || tile === REGION_MAP_TILE.bridge || tile === REGION_MAP_TILE.exit
  })
}

for (const mapId of ELITE_MAP_IDS) {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  if (!mapInfo) {
    failures.push(`${mapId}: map is missing.`)
    continue
  }

  const overlaps = collectRoadSurfaceDecorationOverlapEntries(mapInfo)
  for (const overlap of overlaps) {
    const object = findDecoration(mapInfo, overlap)
    const asset = MAP_ASSET_CATALOG[overlap.type]
    if (!object) {
      failures.push(`${mapId}: cannot resolve road overlap ${JSON.stringify(overlap)}.`)
      continue
    }
    if (object.preserveRoadPosition !== true) {
      failures.push(`${mapId}: ${overlap.type} at ${overlap.x},${overlap.y} overlaps a road without preserveRoadPosition.`)
      continue
    }

    const rawOpening = Number(asset?.passThroughClearance)
    if (!Number.isFinite(rawOpening) || rawOpening <= 0) {
      failures.push(`${mapId}: ${overlap.type} at ${overlap.x},${overlap.y} has no pass-through clearance metadata.`)
      continue
    }

    const scale = Number(object.scale ?? asset.defaultScale ?? 1)
    const openingTiles = rawOpening * scale / CELL_SIZE
    const openingHeight = Number(asset?.passThroughHeight) * scale
    const roadWidth = getRoadWidthAt(mapInfo, overlap.x, overlap.y)
    const requiredOpening = roadWidth + ROAD_CLEARANCE_MARGIN_TILES
    if (openingTiles + 0.001 < requiredOpening) {
      failures.push(
        `${mapId}: ${overlap.type} opening ${openingTiles.toFixed(2)} tiles is narrower than road requirement ${requiredOpening.toFixed(2)} tiles.`
      )
    }
    if (!Number.isFinite(openingHeight) || openingHeight + 0.001 < PLAYER_CLEARANCE_HEIGHT) {
      failures.push(
        `${mapId}: ${overlap.type} opening height ${Number.isFinite(openingHeight) ? openingHeight.toFixed(2) : 'missing'} is below player clearance ${PLAYER_CLEARANCE_HEIGHT.toFixed(2)}.`
      )
    }
  }

  for (const warpEvent of (mapInfo.runtimeEvents || []).filter((event) => event.type === 'warp')) {
    const core = (mapInfo.decorativeObjects || []).find((object) => (
      object.eventId === warpEvent.id && object.sourceId?.endsWith('_elite_route_core')
    ))
    if (!core || !core.type?.endsWith('_portal')) {
      failures.push(`${mapId}: warp ${warpEvent.id} must use a themed pass-through portal core.`)
    }
  }

  const signRequirement = ELITE_GATE_SIGN_REQUIREMENTS[mapId]
  const gateSign = (mapInfo.runtimeEvents || []).find((event) => event.id === signRequirement?.signId)
  if (!gateSign) {
    failures.push(`${mapId}: entrance challenge sign is missing.`)
    continue
  }

  const signX = Math.trunc(Number(gateSign.position?.x))
  const signY = Math.trunc(Number(gateSign.position?.y))
  if (isPointOnVisualRoad(mapInfo, signX, signY)) {
    failures.push(`${mapId}: entrance challenge sign ${gateSign.id} is placed on the visible road.`)
  }
  if (!hasAdjacentRoadTile(mapInfo, signX, signY)) {
    failures.push(`${mapId}: entrance challenge sign ${gateSign.id} is not reachable from an adjacent road tile.`)
  }

  const message = gateSign.properties?.message || ''
  const missingNames = (signRequirement?.requiredNames || []).filter((name) => !message.includes(name))
  if (missingNames.length > 0) {
    failures.push(`${mapId}: entrance challenge sign omits ${missingNames.join(', ')}.`)
  }
}

if (failures.length > 0) {
  console.error('[audit-elite-map-road-clearance] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('[audit-elite-map-road-clearance] OK: Elite Four pass-through structures and roadside challenge signs keep every route clear.')
