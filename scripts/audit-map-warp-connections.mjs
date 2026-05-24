import starterMap from '../src/game/data/godotMaps/my_first_map.js'
import {
  GODOT_REGION_MAP_IDS,
  GODOT_REGION_MAPS
} from '../src/game/data/godotMaps/godot_region_maps.js'

const maps = {
  GodotMap: starterMap,
  ...GODOT_REGION_MAPS
}

const mapIds = ['GodotMap', ...GODOT_REGION_MAP_IDS]
const errors = []

function getWarps(mapId) {
  return (maps[mapId]?.runtimeEvents || []).filter((event) => event.type === 'warp')
}

function getMapSize(mapId) {
  const map = maps[mapId]
  const width = Number(map?.width ?? map?.mapGrid?.[0]?.length)
  const height = Number(map?.height ?? map?.mapGrid?.length)
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0
  }
}

function normalizePoint(point) {
  const x = Number(point?.x)
  const y = Number(point?.y)
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x: Math.trunc(x), y: Math.trunc(y), direction: point?.direction || null }
    : null
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

function getReturnLandingForWarp(mapId, warp) {
  const position = normalizePoint(warp?.position)
  if (!position) return null
  const { width, height } = getMapSize(mapId)
  if (width <= 0 || height <= 0) return null

  if (position.x <= 1) return { x: position.x + 2, y: position.y, direction: 'right' }
  if (position.x >= width - 2) return { x: position.x - 2, y: position.y, direction: 'left' }
  if (position.y <= 1) return { x: position.x, y: position.y + 2, direction: 'down' }
  if (position.y >= height - 2) return { x: position.x, y: position.y - 2, direction: 'up' }

  return null
}

function describeWarp(mapId, warp) {
  const pos = normalizePoint(warp?.position)
  const target = normalizePoint(warp?.target?.position)
  return `${mapId}:${warp?.id || 'warp'}@${pos?.x},${pos?.y}->${warp?.target?.mapName}@${target?.x},${target?.y},${target?.direction || '-'}`
}

for (const mapId of mapIds) {
  for (const warp of getWarps(mapId)) {
    const targetMapId = warp?.target?.mapName
    const targetLanding = normalizePoint(warp?.target?.position)

    if (!maps[targetMapId]) {
      errors.push(`${describeWarp(mapId, warp)} 目标地图不存在。`)
      continue
    }
    if (!targetLanding) {
      errors.push(`${describeWarp(mapId, warp)} 缺少有效目标落点。`)
      continue
    }

    const reverseWarps = getWarps(targetMapId)
      .filter((candidate) => candidate?.target?.mapName === mapId)
      .map((candidate) => ({
        warp: candidate,
        expectedLanding: getReturnLandingForWarp(targetMapId, candidate)
      }))
      .filter((entry) => entry.expectedLanding)

    if (reverseWarps.length === 0) {
      errors.push(`${describeWarp(mapId, warp)} 在目标地图没有回到 ${mapId} 的反向出口。`)
      continue
    }

    const matchingReverse = reverseWarps.find((entry) => (
      manhattan(targetLanding, entry.expectedLanding) <= 1 &&
      (!entry.expectedLanding.direction || targetLanding.direction === entry.expectedLanding.direction)
    ))

    if (!matchingReverse) {
      const nearestReverse = reverseWarps
        .slice()
        .sort((left, right) => manhattan(targetLanding, left.expectedLanding) - manhattan(targetLanding, right.expectedLanding))[0]
      const nearestAnyWarp = getWarps(targetMapId)
        .map((candidate) => ({
          warp: candidate,
          expectedLanding: getReturnLandingForWarp(targetMapId, candidate)
        }))
        .filter((entry) => entry.expectedLanding)
        .sort((left, right) => manhattan(targetLanding, left.expectedLanding) - manhattan(targetLanding, right.expectedLanding))[0]

      errors.push([
        `${describeWarp(mapId, warp)} 的目标落点不在反向出口旁。`,
        `  应靠近: ${targetMapId}:${nearestReverse.warp.id}@${nearestReverse.expectedLanding.x},${nearestReverse.expectedLanding.y},${nearestReverse.expectedLanding.direction}`,
        nearestAnyWarp
          ? `  当前最近出口会导向: ${targetMapId}:${nearestAnyWarp.warp.id}->${nearestAnyWarp.warp.target.mapName}`
          : ''
      ].filter(Boolean).join('\n'))
    }
  }
}

if (errors.length > 0) {
  console.error('Map warp connection audit failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('Map warp connection audit passed.')
console.log(`Checked ${mapIds.reduce((sum, mapId) => sum + getWarps(mapId).length, 0)} warp connections across ${mapIds.length} maps.`)
