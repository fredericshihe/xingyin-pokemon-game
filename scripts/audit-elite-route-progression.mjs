#!/usr/bin/env node

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import { BLOCKED_LEGACY_TILES } from '../src/game/world/constants.js'
import {
  getEliteRouteBlockerInteractionTile,
  getEliteRouteStepAsideTile,
  isEliteRouteBlockerCleared,
  isEliteRouteBlockerEvent
} from '../src/game/eliteRouteBlocker.js'
import { getEliteUnlockTasksForMap } from '../src/game/data/longTermProgression.js'

const ELITE_ROUTE_CONFIGS = {
  GodotMapV2_FrostDojo: { goalEventId: 'warp_frost_to_tide', style: '折镜阶梯' },
  GodotMapV2_TideDojo: { goalEventId: 'warp_tide_to_iron', style: '环池回廊' },
  GodotMapV2_IronDojo: { goalEventId: 'warp_iron_to_dragon', style: '多层折返' },
  GodotMapV2_DragonDojo: { goal: { x: 14, y: 1 }, style: '直线天桥' }
}

const CARDINAL_OFFSETS = [
  { x: 0, y: -1, direction: 'U' },
  { x: 1, y: 0, direction: 'R' },
  { x: 0, y: 1, direction: 'D' },
  { x: -1, y: 0, direction: 'L' }
]
const failures = []
const reports = []
let objectiveTaskCount = 0
let objectiveStepCount = 0

function pointKey(x, y) {
  return `${x},${y}`
}

function isGridWalkable(mapGrid, x, y) {
  if (!Array.isArray(mapGrid) || !Array.isArray(mapGrid[0])) return false
  if (y < 0 || y >= mapGrid.length || x < 0 || x >= mapGrid[0].length) return false
  return !BLOCKED_LEGACY_TILES.has(mapGrid[y][x])
}

function getRouteBlockers(mapInfo) {
  const events = (mapInfo.runtimeEvents || []).filter((mapEvent) => isEliteRouteBlockerEvent(mapEvent))
  return events.sort((left, right) => {
    const leftBoss = left.type === 'boss' ? 1 : 0
    const rightBoss = right.type === 'boss' ? 1 : 0
    if (leftBoss !== rightBoss) return leftBoss - rightBoss
    return Number(left.properties?.sequenceOrder || 0) - Number(right.properties?.sequenceOrder || 0)
  })
}

function getGoal(mapInfo, config) {
  if (config.goal) return config.goal
  const goalEvent = (mapInfo.runtimeEvents || []).find((event) => event.id === config.goalEventId)
  return goalEvent?.position || null
}

function findPath(mapInfo, goal, blockedEventIds = new Set()) {
  const start = mapInfo.startPosition
  if (!start || !goal) return null
  const blockersByTile = new Map(
    getRouteBlockers(mapInfo).map((event) => [pointKey(event.position.x, event.position.y), event.id])
  )
  const startKey = pointKey(start.x, start.y)
  const goalKey = pointKey(goal.x, goal.y)
  const queue = [{ x: start.x, y: start.y }]
  const parents = new Map([[startKey, null]])

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    if (pointKey(current.x, current.y) === goalKey) break
    for (const offset of CARDINAL_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }
      const nextKey = pointKey(next.x, next.y)
      if (parents.has(nextKey) || !isGridWalkable(mapInfo.mapGrid, next.x, next.y)) continue
      const blockerId = blockersByTile.get(nextKey)
      if (blockerId && blockedEventIds.has(blockerId)) continue
      parents.set(nextKey, { key: pointKey(current.x, current.y), direction: offset.direction })
      queue.push(next)
    }
  }

  if (!parents.has(goalKey)) return null
  const path = []
  let currentKey = goalKey
  while (currentKey) {
    const [x, y] = currentKey.split(',').map(Number)
    const parent = parents.get(currentKey)
    path.push({ x, y, direction: parent?.direction || null })
    currentKey = parent?.key || null
  }
  return path.reverse()
}

function getReachableTiles(mapInfo, blockedEventIds) {
  const start = mapInfo.startPosition
  const blockersByTile = new Map(
    getRouteBlockers(mapInfo).map((event) => [pointKey(event.position.x, event.position.y), event.id])
  )
  const reachable = new Set([pointKey(start.x, start.y)])
  const queue = [{ x: start.x, y: start.y }]
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]
    for (const offset of CARDINAL_OFFSETS) {
      const next = { x: current.x + offset.x, y: current.y + offset.y }
      const nextKey = pointKey(next.x, next.y)
      if (reachable.has(nextKey) || !isGridWalkable(mapInfo.mapGrid, next.x, next.y)) continue
      const blockerId = blockersByTile.get(nextKey)
      if (blockerId && blockedEventIds.has(blockerId)) continue
      reachable.add(nextKey)
      queue.push(next)
    }
  }
  return reachable
}

function hasReachableApproach(event, reachable) {
  return CARDINAL_OFFSETS.some((offset) => (
    reachable.has(pointKey(event.position.x + offset.x, event.position.y + offset.y))
  ))
}

function summarizeRoute(path) {
  const runs = []
  for (let index = 1; index < path.length; index += 1) {
    const direction = path[index].direction
    const previous = runs[runs.length - 1]
    if (previous?.direction === direction) previous.length += 1
    else runs.push({ direction, length: 1 })
  }
  return {
    distance: Math.max(0, path.length - 1),
    turnCount: Math.max(0, runs.length - 1),
    signature: runs.map((run) => `${run.direction}${run.length}`).join('-')
  }
}

function isPointOnVisualRoad(mapInfo, x, y) {
  return (mapInfo.visualPaths || []).some((path) => {
    const points = Array.isArray(path?.points) ? path.points : []
    const radius = Number(path?.edgeRadius ?? path?.radius) || 0
    for (let index = 0; index < points.length - 1; index += 1) {
      const [ax, ay] = points[index]
      const [bx, by] = points[index + 1]
      const dx = bx - ax
      const dy = by - ay
      const lengthSquared = dx * dx + dy * dy
      const t = lengthSquared > 0
        ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared))
        : 0
      const distance = Math.hypot(x - (ax + dx * t), y - (ay + dy * t))
      if (distance <= radius + 0.02) return true
    }
    return false
  })
}

function isPointOnBridgeModel(mapInfo, x, y) {
  return (mapInfo.bridges || []).some((bridge) => {
    const rotation = Number(bridge.rotation) || 0
    const dx = x - Number(bridge.x)
    const dy = y - Number(bridge.y)
    const localX = dx * Math.cos(rotation) + dy * Math.sin(rotation)
    const localY = -dx * Math.sin(rotation) + dy * Math.cos(rotation)
    return (
      Math.abs(localX) <= (Number(bridge.length) || 1) / 2 + 0.08 &&
      Math.abs(localY) <= (Number(bridge.width) || 1) / 2 + 0.08
    )
  })
}

for (const [mapId, config] of Object.entries(ELITE_ROUTE_CONFIGS)) {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  if (!mapInfo) {
    failures.push(`${mapId}: 地图不存在。`)
    continue
  }
  const blockers = getRouteBlockers(mapInfo)
  const goal = getGoal(mapInfo, config)
  const label = mapInfo.displayName || mapId
  if (blockers.length !== 4) failures.push(`${label}: 应有 4 名封路角色，实际为 ${blockers.length}。`)
  if (!goal) failures.push(`${label}: 找不到路线终点。`)

  blockers.forEach((event, index) => {
    const eventName = event.properties?.name || event.id
    const asideTile = getEliteRouteStepAsideTile(event)
    const expectedRequiredIds = blockers.slice(0, index).filter((entry) => entry.type === 'trainer').map((entry) => entry.id)
    const configuredRequiredIds = Array.isArray(event.properties?.requiredTrainerIds)
      ? event.properties.requiredTrainerIds
      : []
    if (JSON.stringify(configuredRequiredIds) !== JSON.stringify(expectedRequiredIds)) {
      failures.push(`${label} · ${eventName}: 前置守关顺序配置不连续。`)
    }
    if (!isPointOnVisualRoad(mapInfo, event.position.x, event.position.y)) {
      failures.push(`${label} · ${eventName}: 没有站在可见主路上。`)
    }
    if (!asideTile || !isGridWalkable(mapInfo.mapGrid, asideTile.x, asideTile.y)) {
      failures.push(`${label} · ${eventName}: 击败后的旁侧站位不可用。`)
    }
    const decoration = (mapInfo.decorativeObjects || []).find((object) => (
      object.eventId === event.id && object.npcRole === event.properties?.role
    ))
    if (!decoration || decoration.preserveRoadPosition !== true || decoration.blocksRouteUntilDefeated !== true) {
      failures.push(`${label} · ${eventName}: 角色模型没有保留在封路位置。`)
    }
    if (decoration && (decoration.x !== event.position.x || decoration.y !== event.position.y)) {
      failures.push(`${label} · ${eventName}: 角色模型与碰撞事件坐标不一致。`)
    }
    if (isEliteRouteBlockerCleared(event, 'available') || isEliteRouteBlockerCleared(event, 'locked')) {
      failures.push(`${label} · ${eventName}: 未击败状态被错误判定为已让路。`)
    }
    const clearedState = event.type === 'boss' ? 'completed' : 'cleared'
    if (!isEliteRouteBlockerCleared(event, clearedState)) {
      failures.push(`${label} · ${eventName}: 击败状态未判定为已让路。`)
    }
    const availableInteractionTile = getEliteRouteBlockerInteractionTile(event, 'available')
    const clearedInteractionTile = getEliteRouteBlockerInteractionTile(event, clearedState)
    if (availableInteractionTile?.x !== event.position.x || availableInteractionTile?.y !== event.position.y) {
      failures.push(`${label} · ${eventName}: 未击败时交互碰撞没有留在原始封路格。`)
    }
    if (clearedInteractionTile?.x !== asideTile?.x || clearedInteractionTile?.y !== asideTile?.y) {
      failures.push(`${label} · ${eventName}: 击败后交互碰撞没有跟随角色移动到旁侧。`)
    }
  })

  const blockedIds = new Set(blockers.map((event) => event.id))
  for (let stage = 0; stage < blockers.length; stage += 1) {
    const current = blockers[stage]
    const reachable = getReachableTiles(mapInfo, blockedIds)
    const unlockTask = getEliteUnlockTasksForMap(mapId).find((task) => task.targetEventId === current.id)
    if (unlockTask) {
      objectiveTaskCount += 1
      unlockTask.steps.forEach((step) => {
        objectiveStepCount += 1
        const objectiveEvent = (mapInfo.runtimeEvents || []).find((event) => event.id === step.eventId)
        if (!objectiveEvent || objectiveEvent.type !== 'objective') {
          failures.push(`${label} · ${unlockTask.title}: 找不到地图机关 ${step.name}。`)
          return
        }
        if (!hasReachableApproach(objectiveEvent, reachable)) {
          failures.push(`${label} · ${unlockTask.title}: 当前阶段无法从主路线接近 ${step.name}。`)
        }
        if (isPointOnVisualRoad(mapInfo, objectiveEvent.position.x, objectiveEvent.position.y)) {
          failures.push(`${label} · ${unlockTask.title}: ${step.name} 占用了可见主路，必须放到路侧。`)
        }
      })
    }
    if (!hasReachableApproach(current, reachable)) {
      failures.push(`${label}: 击败 ${stage} 人后无法走到 ${current.properties?.name || current.id} 面前。`)
    }
    for (const later of blockers.slice(stage + 1)) {
      if (hasReachableApproach(later, reachable)) {
        failures.push(`${label}: 未击败 ${current.properties?.name || current.id} 就能绕到 ${later.properties?.name || later.id}。`)
      }
    }
    if (goal && reachable.has(pointKey(goal.x, goal.y))) {
      failures.push(`${label}: 仅击败 ${stage} 人时已经能够抵达路线终点。`)
    }
    blockedIds.delete(current.id)
  }

  const completedPath = goal ? findPath(mapInfo, goal, new Set()) : null
  if (!completedPath) {
    failures.push(`${label}: 四人全部击败后路线终点仍不可达。`)
    continue
  }
  let lastBlockerIndex = -1
  blockers.forEach((event) => {
    const routeIndex = completedPath.findIndex((point) => point.x === event.position.x && point.y === event.position.y)
    if (routeIndex <= lastBlockerIndex) {
      failures.push(`${label}: 最短主路线没有按顺序经过 ${event.properties?.name || event.id}。`)
    }
    lastBlockerIndex = routeIndex
  })

  const invisibleRouteTiles = completedPath.filter((point) => (
    !isPointOnVisualRoad(mapInfo, point.x, point.y) &&
    !isPointOnBridgeModel(mapInfo, point.x, point.y)
  ))
  if (invisibleRouteTiles.length > 0) {
    failures.push(`${label}: 主路线存在不可见断点 ${invisibleRouteTiles.map((point) => `${point.x},${point.y}`).join('、')}。`)
  }

  const summary = summarizeRoute(completedPath)
  reports.push({
    map: label,
    style: config.style,
    blockers: blockers.map((event) => event.properties?.name || event.id),
    ...summary
  })
}

const uniqueSignatures = new Set(reports.map((report) => report.signature))
const uniqueTurnCounts = new Set(reports.map((report) => report.turnCount))
if (uniqueSignatures.size !== reports.length) {
  failures.push('四张天王地图存在重复的最短路线签名。')
}
if (uniqueTurnCounts.size !== reports.length) {
  failures.push('四张天王地图的转弯数量不够鲜明，必须四图各不相同。')
}

const threeMapPath = fileURLToPath(new URL('../src/game/ThreeLowPolyMap.jsx', import.meta.url))
const threeMapSource = fs.readFileSync(threeMapPath, 'utf8')
for (const runtimeHook of [
  'getEliteRouteBlockerInteractionTile(',
  'isEliteRouteBlockerCleared(',
  'syncRouteBlockerState(',
  'interactionTileX',
  'npcFacingController?.addCompanions?.([signal, npcRoleEffect])',
  'return { interaction: null, mapEvent: null }'
]) {
  if (!threeMapSource.includes(runtimeHook)) {
    failures.push(`ThreeLowPolyMap 缺少封路运行时链路: ${runtimeHook}`)
  }
}

if (failures.length > 0) {
  console.error('[audit-elite-route-progression] FAILED')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(JSON.stringify({
  summary: {
    maps: reports.length,
    blockers: reports.reduce((total, report) => total + report.blockers.length, 0),
    objectiveTasks: objectiveTaskCount,
    objectiveSteps: objectiveStepCount,
    uniqueRouteSignatures: uniqueSignatures.size,
    uniqueTurnCounts: uniqueTurnCounts.size
  },
  routes: reports
}, null, 2))
console.log('[audit-elite-route-progression] OK: every Elite Four gate blocks progression until defeated and all four routes are distinct.')
