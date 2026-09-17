import { MAP_BOUNDARY_SETS, MAP_BOUNDARY_MEASUREMENTS } from './mapBoundaryAssets.generated.js'
import { MAP_ENVIRONMENT_LAYOUTS } from './mapEnvironmentLayouts.generated.js'
import { MAP_ASSET_CATALOG } from './mapAssetCatalog.js'
import { ENVIRONMENT_MODEL_FOOTPRINTS } from './environmentModelFootprints.generated.js'
import { ENVIRONMENT_ORIGINAL_MEASUREMENTS } from './environmentOriginalMeasurements.generated.js'
import { createEnvironmentConnectivityGuard, getEnvironmentBlockedCells } from '../environmentNavigation.js'
import { MAP_ENVIRONMENT_VIGNETTES } from './mapEnvironmentVignettes.js'
import { ENVIRONMENT_SCENERY_MEASUREMENTS as LEGACY_MEASUREMENTS } from './environmentSceneryMeasurements.generated.js'
import { MAP_EXCLUSIVE_MEASUREMENTS } from './mapExclusiveAssets.generated.js'
const ENVIRONMENT_SCENERY_MEASUREMENTS = { ...LEGACY_MEASUREMENTS, ...MAP_EXCLUSIVE_MEASUREMENTS, ...MAP_BOUNDARY_MEASUREMENTS, ...ENVIRONMENT_ORIGINAL_MEASUREMENTS }

export const ENVIRONMENT_COMPOSITION_REVISION = 'environment-20260918-interior-v5'

const roadPointCache = new WeakMap()
const SCENERY_GROUND = new Set([0, 1, 13, 17, 20])
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
  const footprint = ENVIRONMENT_ORIGINAL_MEASUREMENTS[object.type]?.footprint || object.footprint || ENVIRONMENT_SCENERY_MEASUREMENTS[object.type]?.footprint || ENVIRONMENT_MODEL_FOOTPRINTS[object.type] || asset?.footprint || { width: 1, height: 1 }
  const scale = object.environmentRenderScale ?? object.scale ?? asset?.defaultScale ?? 1
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
// change a road, grass tile, event position or access corridor.
export function isSafeEnvironmentBackground(map, object, padding = .18) {
  const bounds = getEnvironmentObjectBounds(object, padding)
  const rim = 0
  const waterProp = object.surface === 'water'
  const corners = [[bounds.x1,bounds.y1],[bounds.x2,bounds.y1],[bounds.x1,bounds.y2],[bounds.x2,bounds.y2]]
  if (waterProp && !corners.every(([x,y]) => isInWater(map,x,y,-.15))) return false
  if (object.environmentHabitat === 'shore' && !isInWater(map,object.x,object.y,3)) return false
  if (bounds.x1 < -.3 - rim || bounds.y1 < -.3 - rim || bounds.x2 > map.width - .7 + rim || bounds.y2 > map.height - .7 + rim) return false
  // Include tile area, not just tile centres, so models cannot clip path edges.
  for (let y = Math.ceil(bounds.y1 - .5); y <= Math.floor(bounds.y2 + .5); y++) {
    for (let x = Math.ceil(bounds.x1 - .5); x <= Math.floor(bounds.x2 + .5); x++) {
      if (waterProp ? map.mapGrid[y]?.[x] !== 11 : !SCENERY_GROUND.has(map.mapGrid[y]?.[x])) return false
    }
  }
  if ((map.runtimeEvents || []).some(event => pointDistance(bounds, event.position.x, event.position.y) < 1.3)) return false
  if ((map.runtimeEvents || []).some(event => ['heal', 'challenge'].includes(event.type) &&
    Math.hypot(object.x - event.position.x, object.y - event.position.y) < 2.25)) return false
  const modelHeight = (ENVIRONMENT_SCENERY_MEASUREMENTS[object.type]?.height || 0) * (object.environmentRenderScale ?? object.scale ?? 1)
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
  if (map.startPosition && pointDistance(bounds, map.startPosition.x, map.startPosition.y) < 1.3) return false
  return true
}

export function isGenericEnvironmentBoundary(object) {
  return !isProtectedEnvironmentObject(object) &&
    (/^nature_stone_flat_[abc]$/.test(object.type) ||
      (/boundary_blocker|boundary_visual_blocker/.test(object.sourceId || '') &&
        ['nature_rock_large','nature_stone_large','rock-large','stone-large'].includes(object.type)))
}

export function isEnvironmentInterior(map, object) {
  const b = getEnvironmentObjectBounds(object)
  return b.x1 >= map.width * .15 && b.x2 <= map.width * .85 &&
    b.y1 >= map.height * .15 && b.y2 <= map.height * .85
}

function enlargeNaturalScenery(map, originals, connectivity, blocked) {
  const result = [...originals]
  for (let index = 0; index < result.length; index++) {
    const object = result[index], measured = ENVIRONMENT_ORIGINAL_MEASUREMENTS[object.type]
    const natural = /tree|rock|stone-large|nature_stone_large/.test(object.type) && !/tree_log|water/.test(object.type)
    if (!natural || !measured || object.environmentHiddenBoundary || isProtectedEnvironmentObject(object)) continue
    const isTree = object.type.includes('tree')
    const current = object.scale ?? MAP_ASSET_CATALOG[object.type]?.defaultScale ?? 1
    const targetHeight = isTree ? 4.6 + ((index * 7) % 5) * .25 : 1.65 + ((index * 3) % 4) * .22
    const target = Math.min(targetHeight / measured.height, 3.4 / Math.max(measured.footprint.width, measured.footprint.height), current * (isTree ? 3.6 : 4.0))
    if (target < current * 1.08) continue
    for (let step = 0; step < 10; step++) {
      const scale = target - (target - current) * step / 10
      const candidate = { ...object, environmentRenderScale: Number(scale.toFixed(3)) }
      if (scale < current * 1.08 || !isSafeEnvironmentBackground(map, candidate, .1)) continue
      const bounds = getEnvironmentObjectBounds(candidate)
      if (result.some((other, j) => j !== index && !other.environmentHiddenBoundary && overlaps(bounds, getEnvironmentObjectBounds(other), .06))) continue
      const cells = getEnvironmentBlockedCells(map, bounds)
      const next = new Set([...blocked, ...cells])
      if (cells.length && !connectivity(next)) continue
      cells.forEach(key => blocked.add(key))
      result[index] = candidate
      break
    }
  }
  return result
}

// Hand-authored scenes are searched locally as a unit. A missing safe pocket is
// allowed to omit a secondary prop; no density target can spawn more copies.
export function planMapEnvironment(map) {
  const scenes = MAP_ENVIRONMENT_VIGNETTES[map.id]
  if (!scenes) return map
  // Keep original transforms and interactions. Only generic boundary stones
  // receive a visibility override; selected natural props get a render scale.
  const blocked = new Set()
  const connectivity = createEnvironmentConnectivityGuard(map)
  const boundaryTheme = Boolean(MAP_BOUNDARY_SETS[map.id])
  const originals = (map.decorativeObjects || []).map(o => boundaryTheme && isGenericEnvironmentBoundary(o) ? { ...o, environmentHiddenBoundary: true } : o)
  const originalBounds = originals.filter(o => !o.environmentHiddenBoundary).map(o => getEnvironmentObjectBounds(o, .16))
  const placed = [], occupied = [], sceneNotes = []
  const localOffsets = []
  for (let dy = -4; dy <= 4; dy += .5) for (let dx = -4; dx <= 4; dx += .5) {
    if (Math.hypot(dx, dy) <= 4) localOffsets.push({ dx, dy, distance: Math.hypot(dx, dy) })
  }
  localOffsets.sort((a, b) => a.distance - b.distance)
  const makeObject = (scene, prop, index, x, y, sceneRotation) => {
    const measured = ENVIRONMENT_SCENERY_MEASUREMENTS[prop.type]
    const scale = Math.min(prop.scale, prop.span / Math.max(measured.footprint.width, measured.footprint.height), prop.maxHeight / measured.height)
    return {
      type: prop.type, x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), scale: Number(scale.toFixed(3)),
      rotation: prop.facing === 'road' ? getEnvironmentRoadFacing(map,x,y) : sceneRotation + (prop.facing === 'natural' ? prop.rotation : 0),
      footprint: measured.footprint, surface: prop.habitat === 'water' ? 'water' : 'ground',
      environmentRole: prop.role, environmentFacing: prop.facing, environmentHabitat: prop.habitat,
      environmentComposition: true, environmentBackdrop: false, environmentScene: scene.id,
      sourceId: `environment_scene_${scene.id}_${index}`
    }
  }
  const fits = (object, bounds, neighbours) => isSafeEnvironmentBackground(map, object) &&
    !originalBounds.some(other => overlaps(bounds, other, .12)) &&
    !occupied.some(other => overlaps(bounds, other, .12)) &&
    !neighbours.some(other => overlaps(bounds, other, .12))
  for (const scene of scenes) {
    const originX = scene.x * (map.width - 1), originY = scene.y * (map.height - 1)
    const origins = []
    // Search actual interior ground across the map, with authored locations as
    // preferences. Evaluate a whole scene before claiming its main prop's site.
    for (let y = 1; y < map.height - 1; y += .5) for (let x = 1; x < map.width - 1; x += .5) {
      const edge = Math.min(x, y, map.width - 1 - x, map.height - 1 - y)
      origins.push({ x, y, score: Math.hypot(x-originX, y-originY) + Math.max(0, 5-edge) * 5 })
    }
    origins.sort((a,b) => a.score-b.score)
    let best = null, viable = 0
    for (const origin of origins) {
      const rotation = getEnvironmentRoadFacing(map, origin.x, origin.y)
      const primary = makeObject(scene, scene.props[0], 0, origin.x, origin.y, rotation)
      const primaryBounds = getEnvironmentObjectBounds(primary)
      if (!fits(primary, primaryBounds, [])) continue
      const primaryCells = getEnvironmentBlockedCells(map, primaryBounds)
      const nextBlocked = new Set([...blocked, ...primaryCells])
      if (primaryCells.length && !connectivity(nextBlocked)) continue
      primary.blocksPath = primaryCells.length > 0
      const objects = [primary], bounds = [primaryBounds]
      const cos = Math.cos(rotation), sin = Math.sin(rotation)
      for (let index = 1; index < scene.props.length; index++) {
        const prop = scene.props[index]
        for (const offset of localOffsets) {
          const object = makeObject(scene, prop, index,
            primary.x + prop.dx * cos + prop.dy * sin + offset.dx,
            primary.y - prop.dx * sin + prop.dy * cos + offset.dy, rotation)
          if (Math.hypot(object.x-primary.x, object.y-primary.y) > 6.5) continue
          const box = getEnvironmentObjectBounds(object)
          if (!fits(object, box, bounds)) continue
          const cells = getEnvironmentBlockedCells(map, box)
          if (cells.length && !connectivity(new Set([...nextBlocked, ...cells]))) continue
          object.blocksPath = cells.length > 0
          cells.forEach(key => nextBlocked.add(key))
          objects.push(object); bounds.push(box)
          break
        }
      }
      const interior = objects.filter(o => isEnvironmentInterior(map,o)).length
      const score = objects.length * 15 + interior * 18 - origin.score * .6
      if (!best || score > best.score) best = { objects, bounds, blocked: nextBlocked, score }
      if (++viable >= 36) break
    }
    if (best) {
      placed.push(...best.objects); occupied.push(...best.bounds)
      best.blocked.forEach(key => blocked.add(key))
    }
    sceneNotes.push({ id: scene.id, name: scene.name, placed: best?.objects.length || 0 })
  }
  const counts = new Map(placed.map(o => [o.type, 1]))
  const boundaries = []
  if (boundaryTheme) {
    const candidates = []
    for (let y = 1; y < map.height-1; y += .5) for (let x = 1; x < map.width-1; x += .5) {
      const tx = Math.round(x), ty = Math.round(y)
      if (![1,20].includes(map.mapGrid[ty]?.[tx])) continue
      let distance = 9
      for (let dy=-4;dy<=4;dy++) for (let dx=-4;dx<=4;dx++) {
        if ([0,8,12,13,15,17].includes(map.mapGrid[ty+dy]?.[tx+dx])) distance=Math.min(distance,Math.hypot(dx,dy))
      }
      if (distance <= 4) candidates.push({ x,y,distance })
    }
    for (const [index,type] of MAP_BOUNDARY_SETS[map.id].entries()) {
      const measured = MAP_BOUNDARY_MEASUREMENTS[type]
      const targetHeight = measured.height > 2.2 ? 4.8 + (index%3)*.45 : 2.1 + (index%4)*.38
      const targetScale = Math.min(targetHeight/measured.height, (3.0 + (index%3)*.3)/Math.max(measured.footprint.width,measured.footprint.height))
      let best=null
      // Start with a strong landform silhouette; narrower pockets may take a
      // compact variant while preserving a substantial silhouette.
      for (const fitScale of [1, .85, .7]) {
        for (const point of candidates) {
          const rotation = Math.sin(index*7.1+point.x*2.3+point.y)*.65
          const object={type,x:point.x,y:point.y,scale:Number((targetScale*fitScale).toFixed(3)),rotation,footprint:measured.footprint,
            surface:'ground',environmentBoundary:true,environmentBackdrop:false,sourceId:`environment_boundary_${map.id}_${index}`}
          const box=getEnvironmentObjectBounds(object)
          if (!fits(object,box,[])) continue
          // Group with the landform, never draw a uniform dotted outline.
          const separation=boundaries.length ? Math.min(...boundaries.map(o=>Math.hypot(o.x-point.x,o.y-point.y))) : 9
          if (separation < 2.6) continue
          const score=Math.min(separation,9)*1.3-Math.abs(point.distance-2)*.75+
            (isEnvironmentInterior(map,object)?1.4:0)+Math.sin(point.x*1.31+point.y*2.17+index)*.6
          if (!best||score>best.score) best={object,box,score}
        }
        if (best) break
      }
      if (!best) continue
      const cells=getEnvironmentBlockedCells(map,best.box)
      if(cells.length&&!connectivity(new Set([...blocked,...cells])))continue
      best.object.blocksPath=cells.length>0;cells.forEach(key=>blocked.add(key))
      boundaries.push(best.object);occupied.push(best.box)
    }
  }
  const enhancedOriginals = enlargeNaturalScenery(map, [...originals, ...placed, ...boundaries], connectivity, blocked).slice(0, originals.length)
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
    environmentBlockedTiles: blocked,
    environmentBoundaryTheme: boundaryTheme,
    decorativeObjects: [...enhancedOriginals, ...placed, ...boundaries],
    generationNotes: {
      ...map.generationNotes,
      environmentRevision: ENVIRONMENT_COMPOSITION_REVISION,
      environmentComposition: { preserved: originals.length, added: placed.length, replaced: originals.filter(o=>o.environmentHiddenBoundary).length, boundaryModels: boundaries.length, resized: enhancedOriginals.filter(o => o.environmentRenderScale).length, interior: placed.filter(o => isEnvironmentInterior(map, o)).length, scenes: sceneNotes, modelCounts: Object.fromEntries(counts) }
    }
  }
}

// Packing, sightline and connectivity searches run at authoring time. Gameplay
// only applies the verified placements, so entering a map never runs the solver.
export function composeMapEnvironment(map) {
  const layout = MAP_ENVIRONMENT_LAYOUTS[map.id]
  if (!layout) return map
  return {
    ...map,
    decorativeObjects: [
      ...(map.decorativeObjects || []).map((object,index) => ({ ...object,
        ...(layout.renderScales[index] ? { environmentRenderScale: layout.renderScales[index] } : {}),
        ...(layout.hiddenOriginals.includes(index) ? { environmentHiddenBoundary: true } : {})
      })),
      ...layout.additions, ...layout.boundaries
    ],
    environmentGroundPatches: layout.groundPatches,
    environmentBoundaryTheme: layout.boundaryTheme,
    environmentBlockedTiles: new Set(layout.blockedTiles),
    generationNotes: { ...map.generationNotes, environmentRevision: layout.revision, environmentComposition: layout.notes }
  }
}
