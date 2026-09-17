import { MAP_ASSET_CATALOG } from './mapAssetCatalog.js'
import { ENVIRONMENT_MODEL_FOOTPRINTS } from './environmentModelFootprints.generated.js'
import { MAP_ENVIRONMENT_VIGNETTES } from './mapEnvironmentVignettes.js'
import { ENVIRONMENT_SCENERY_MEASUREMENTS as LEGACY_MEASUREMENTS } from './environmentSceneryMeasurements.generated.js'
import { MAP_EXCLUSIVE_MEASUREMENTS } from './mapExclusiveAssets.generated.js'
const ENVIRONMENT_SCENERY_MEASUREMENTS = { ...LEGACY_MEASUREMENTS, ...MAP_EXCLUSIVE_MEASUREMENTS }

export const ENVIRONMENT_COMPOSITION_REVISION = 'environment-20260917-additive-v4'

const roadPointCache = new WeakMap()
const BLOCKED_BACKGROUND = new Set([1, 20])
const isInWater = (map, x, y, padding = 0) => (map.waterBodies || []).some(body => {
  const cos = Math.cos(body.rotation || 0), sin = Math.sin(body.rotation || 0)
  const dx = x - body.x, dy = y - body.y
  return ((dx * cos + dy * sin) / (body.rx + padding)) ** 2 + ((-dx * sin + dy * cos) / (body.ry + padding)) ** 2 < 1
})

export function getEnvironmentRoadFacing(map, x, y) {
  let nearest = null, distance = Infinity
  if (!roadPointCache.has(map)) {
    const roads = []
    map.mapGrid.forEach((row, ty) => row.forEach((tile, tx) => {
      if (tile === 12 || tile === 15) roads.push({ x: tx, y: ty })
    }))
    roadPointCache.set(map, roads)
  }
  for (const point of roadPointCache.get(map)) {
    const d = Math.hypot(point.x - x, point.y - y)
    if (d < distance) { distance = d; nearest = point }
  }
  const target = nearest || { x: map.width / 2, y: map.height / 2 }
  // Blender fronts are -Y, exported as glTF +Z. Cardinal working fronts align
  // with roads; natural scenery can retain a small authored angle.
  return Math.round(Math.atan2(target.x - x, target.y - y) / (Math.PI / 2)) * Math.PI / 2
}

export function isProtectedEnvironmentObject(object) {
  return Boolean(object.eventId || object.eventType || object.fixedSceneEventType ||
    object.dynamicTileVisibility || object.hiddenZoneId || object.hiddenZonePerimeter ||
    object.hiddenZoneCorner || object.hiddenGateEntranceBlocker || object.preserveRoadPosition || object.sourceId?.startsWith('farm_wheat_'))
}

export function getEnvironmentObjectBounds(object, padding = 0) {
  const asset = MAP_ASSET_CATALOG[object.type]
  const footprint = object.footprint || ENVIRONMENT_SCENERY_MEASUREMENTS[object.type]?.footprint || ENVIRONMENT_MODEL_FOOTPRINTS[object.type] || asset?.footprint || { width: 1, height: 1 }
  const scale = object.scale ?? asset?.defaultScale ?? 1
  const angle = object.rotation ?? 0
  const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
  // Rotated AABB deliberately encloses the entire canopy, not just the trunk.
  const rx = (footprint.width * cos + footprint.height * sin) * scale / 2 + padding
  const ry = (footprint.width * sin + footprint.height * cos) * scale / 2 + padding
  return { x1: object.x - rx, x2: object.x + rx, y1: object.y - ry, y2: object.y + ry }
}

const overlaps = (a, b, gap = 0) => a.x1 < b.x2 + gap && a.x2 > b.x1 - gap && a.y1 < b.y2 + gap && a.y2 > b.y1 - gap
const pointDistance = (bounds, x, y) => Math.hypot(Math.max(bounds.x1 - x, 0, x - bounds.x2), Math.max(bounds.y1 - y, 0, y - bounds.y2))

// Visual-only composition runs AFTER the gameplay layout is final. It cannot
// change a road, grass tile, collision, event position or access corridor.
export function isSafeEnvironmentBackground(map, object, padding = .18) {
  const bounds = getEnvironmentObjectBounds(object, padding)
  const rim = object.environmentBackdrop ? 4.5 : 0
  const waterProp = object.surface === 'water'
  const corners = [[bounds.x1,bounds.y1],[bounds.x2,bounds.y1],[bounds.x1,bounds.y2],[bounds.x2,bounds.y2]]
  if (waterProp && !corners.every(([x,y]) => isInWater(map,x,y,-.15))) return false
  if (object.environmentHabitat === 'shore' && !isInWater(map,object.x,object.y,3)) return false
  if (bounds.x1 < -.3 - rim || bounds.y1 < -.3 - rim || bounds.x2 > map.width - .7 + rim || bounds.y2 > map.height - .7 + rim) return false
  // Include tile area, not just tile centres, so models cannot clip path edges.
  for (let y = Math.ceil(bounds.y1 - .5); y <= Math.floor(bounds.y2 + .5); y++) {
    for (let x = Math.ceil(bounds.x1 - .5); x <= Math.floor(bounds.x2 + .5); x++) {
      const outside = x < 0 || y < 0 || x >= map.width || y >= map.height
      if (outside && object.environmentBackdrop) continue
      if (waterProp ? map.mapGrid[y]?.[x] !== 11 : !BLOCKED_BACKGROUND.has(map.mapGrid[y]?.[x])) return false
    }
  }
  const asset = MAP_ASSET_CATALOG[object.type]
  if (asset?.decorativeOnly && asset.themeTags.some(tag => ['grass', 'flower', 'mushroom', 'reed'].includes(tag))) {
    const x = Math.round(object.x), y = Math.round(object.y)
    if ([[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => {
      const tile = map.mapGrid[y + dy]?.[x + dx]
      return tile != null && ![1, 5, 6, 11, 20].includes(tile)
    })) return false
  }
  if ((map.runtimeEvents || []).some(event => pointDistance(bounds, event.position.x, event.position.y) < 2.0)) return false
  const modelHeight = (ENVIRONMENT_SCENERY_MEASUREMENTS[object.type]?.height || 0) * (object.scale || 1)
  const screenReach = modelHeight * .82 / 1.55
  if ((map.runtimeEvents || []).some(({ position }) =>
    position.x >= bounds.x1 - .6 && position.x <= bounds.x2 + .6 &&
    position.y >= bounds.y1 - screenReach - .6 && position.y <= bounds.y2 + .6)) return false
  if ((map.encounterZones || []).some(zone => overlaps(bounds, {
    x1: zone.x - .55, y1: zone.y - .55, x2: zone.x + zone.width - .45, y2: zone.y + zone.height - .45
  }))) return false
  if (!waterProp && (map.waterBodies || []).some(body => {
    const cos = Math.cos(body.rotation || 0), sin = Math.sin(body.rotation || 0)
    // Corners and centre catch shore overlap even where the painted water grid is smaller.
    return [[bounds.x1, bounds.y1], [bounds.x2, bounds.y1], [bounds.x1, bounds.y2], [bounds.x2, bounds.y2], [object.x, object.y]].some(([x, y]) => {
      const dx = x - body.x, dy = y - body.y
      return ((dx * cos + dy * sin) / (body.rx + .3)) ** 2 + ((-dx * sin + dy * cos) / (body.ry + .3)) ** 2 < 1
    })
  })) return false
  return true
}

// Hand-authored scenes are searched locally as a unit. A missing safe pocket is
// allowed to omit a secondary prop; no density target can spawn more copies.
export function composeMapEnvironment(map) {
  const scenes = MAP_ENVIRONMENT_VIGNETTES[map.id]
  if (!scenes) return map
  // Preserve every original object, including its position, size and rotation.
  // New scenery fits around that composition; it never clears room for itself.
  const originals = map.decorativeObjects || []
  const originalBounds = originals.map(o => getEnvironmentObjectBounds(o, .16))
  const placed = [], occupied = [], sceneNotes = []
  const counts = new Map()
  const localOffsets = []
  for (let dy = -6; dy <= 6; dy += .5) for (let dx = -6; dx <= 6; dx += .5) {
    if (Math.hypot(dx, dy) <= 6) localOffsets.push({ dx, dy, distance: Math.hypot(dx, dy) })
  }
  localOffsets.sort((a, b) => a.distance - b.distance)
  for (const scene of scenes) {
    const originX = scene.x * (map.width - 1), originY = scene.y * (map.height - 1)
    let primary = null, added = 0
    const sceneRotation = getEnvironmentRoadFacing(map, originX, originY)
    const cos = Math.cos(sceneRotation), sin = Math.sin(sceneRotation)
    for (const [index, prop] of scene.props.entries()) {
      const measured = ENVIRONMENT_SCENERY_MEASUREMENTS[prop.type]
      const asset = MAP_ASSET_CATALOG[prop.type]
      if (!asset || !measured || asset.ownerMap !== map.id) continue
      const cap = 1
      if ((counts.get(prop.type) || 0) >= cap) continue
      const footprint = measured.footprint
      // Work in visible tile widths. Old Kenney miniatures and new metre-sized
      // GLBs then share the same art direction without arbitrary global scaling.
      const requested = prop.span / Math.max(footprint.width, footprint.height)
      const detailHeight = prop.maxHeight ?? 5.5
      const scale = Math.min(prop.scale, requested, detailHeight / measured.height)
      const anchorX = primary ? primary.x : originX
      const anchorY = primary ? primary.y : originY
      let selected = null
      for (const offset of localOffsets) {
        if (index > 0 && offset.distance > 3) continue
        const x = Number((anchorX + prop.dx * cos + prop.dy * sin + offset.dx).toFixed(2))
        const y = Number((anchorY - prop.dx * sin + prop.dy * cos + offset.dy).toFixed(2))
        const rotation = prop.facing === 'road' ? getEnvironmentRoadFacing(map,x,y)
          : sceneRotation + (prop.facing === 'natural' ? prop.rotation : 0)
        const object = {
          type: prop.type,
          x, y, scale: Number(scale.toFixed(3)), rotation,
          footprint, surface: prop.habitat === 'water' ? 'water' : 'ground', blocksPath: false,
          environmentRole: prop.role, environmentFacing: prop.facing, environmentHabitat: prop.habitat,
          environmentComposition: true, environmentBackdrop: true,
          environmentScene: scene.id,
          sourceId: `environment_scene_${scene.id}_${index}`
        }
        const bounds = getEnvironmentObjectBounds(object)
        if (!isSafeEnvironmentBackground(map, object)) continue
        if (occupied.some(other => overlaps(bounds, other, .12))) continue
        if (originalBounds.some(other => overlaps(bounds, other, .2))) continue
        selected = object
        break
      }
      if (!selected) {
        if (index === 0) break // A workstation needs its main facility, not orphaned tools.
        continue
      }
      if (!primary) primary = { x: selected.x, y: selected.y }
      placed.push(selected)
      occupied.push(getEnvironmentObjectBounds(selected))
      counts.set(prop.type, (counts.get(prop.type) || 0) + 1)
      added++
    }
    sceneNotes.push({ id: scene.id, name: scene.name, placed: added })
  }
  const groundPatches = scenes.flatMap(scene => {
    const objects = placed.filter(object => object.environmentScene === scene.id && object.surface !== 'water')
    if (!objects.length) return []
    const bounds = objects.map(object => getEnvironmentObjectBounds(object))
    const x1 = Math.min(...bounds.map(b => b.x1)), x2 = Math.max(...bounds.map(b => b.x2))
    const y1 = Math.min(...bounds.map(b => b.y1)), y2 = Math.max(...bounds.map(b => b.y2))
    return [{ x: (x1 + x2) / 2, y: (y1 + y2) / 2, rx: (x2 - x1) / 2 + 2, ry: (y2 - y1) / 2 + 2 }]
  })
  return {
    ...map,
    environmentGroundPatches: groundPatches,
    decorativeObjects: [...originals, ...placed],
    generationNotes: {
      ...map.generationNotes,
      environmentRevision: ENVIRONMENT_COMPOSITION_REVISION,
      environmentComposition: { preserved: originals.length, added: placed.length, replaced: 0, scenes: sceneNotes, modelCounts: Object.fromEntries(counts) }
    }
  }
}
