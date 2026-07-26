#!/usr/bin/env node

import { MAP_ASSET_CATALOG } from '../src/game/data/mapAssetCatalog.js'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import { ELITE_UNLOCK_TASKS, getEliteUnlockObjectiveEvents } from '../src/game/data/longTermProgression.js'

const MAP_IDS = ['GodotMapV2_FrostDojo', 'GodotMapV2_TideDojo', 'GodotMapV2_IronDojo', 'GodotMapV2_DragonDojo']
const OBJECTIVE_RADIUS = 0.58
const OBJECTIVE_PAIR_CLEARANCE = 1.6
// 角色和机关的可见半径之和约 1.16 格；1.4 格额外保留了镜头角度净空。
const CHARACTER_CLEARANCE = 1.4
const FIXED_EVENT_CLEARANCE = 1.05
const LOW_DECORATION_CLEARANCE = 0.62
const failures = []
const reports = []

function distance(left, right) {
  return Math.hypot(Number(left.x) - Number(right.x), Number(left.y) - Number(right.y))
}

function isFinitePoint(value) {
  return Number.isFinite(Number(value?.x)) && Number.isFinite(Number(value?.y))
}

function assetFor(decoration) {
  return MAP_ASSET_CATALOG[decoration?.type] || null
}

function isLowDecoration(decoration, asset) {
  return asset?.heightClass === 'low' || asset?.decorativeOnly === true || decoration?.blocksPath === false && asset?.heightClass !== 'tall'
}

function decorationClearance(decoration, asset) {
  if (isLowDecoration(decoration, asset)) return LOW_DECORATION_CLEARANCE
  const scale = Number(decoration?.scale ?? asset?.defaultScale ?? 1) || 1
  const footprint = asset?.footprint || {}
  const footprintSize = Math.max(Number(footprint.width) || 1.25, Number(footprint.height) || 1.25)
  const decorationRadius = Math.min(1.25, Math.max(0.48, footprintSize * Math.min(scale, 1.5) * 0.34))
  return OBJECTIVE_RADIUS + decorationRadius + 0.12
}

function isCharacterEvent(event) {
  return ['trainer', 'boss', 'npc', 'challenge'].includes(event?.type)
}

for (const mapId of MAP_IDS) {
  const mapInfo = GODOT_REGION_MAPS[mapId]
  if (!mapInfo) {
    failures.push(`${mapId}: 地图不存在。`)
    continue
  }
  const objectives = getEliteUnlockObjectiveEvents(mapId)
  const runtimeObjectives = (mapInfo.runtimeEvents || []).filter((event) => event.type === 'objective')
  const otherEvents = (mapInfo.runtimeEvents || []).filter((event) => event.type !== 'objective' && isFinitePoint(event.position))
  const decorations = (mapInfo.decorativeObjects || []).filter((object) => isFinitePoint(object))
  const nearest = []

  if (runtimeObjectives.length !== objectives.length) {
    failures.push(`${mapInfo.displayName || mapId}: 配置 ${objectives.length} 个机关，实际地图只注入 ${runtimeObjectives.length} 个。`)
  }

  objectives.forEach((objective, objectiveIndex) => {
    const pairCandidates = objectives
      .filter((candidate) => candidate.id !== objective.id)
      .map((candidate) => ({ kind: '机关', id: candidate.id, distance: distance(objective.position, candidate.position), required: OBJECTIVE_PAIR_CLEARANCE }))
    const eventCandidates = otherEvents.map((event) => ({
      kind: '角色/固定事件',
      id: event.id,
      distance: distance(objective.position, event.position),
      required: isCharacterEvent(event) ? CHARACTER_CLEARANCE : FIXED_EVENT_CLEARANCE
    }))
    const decorationCandidates = decorations
      .filter((decoration) => decoration.eventId !== objective.id)
      .map((decoration, decorationIndex) => {
        const asset = assetFor(decoration)
        return {
          kind: '装饰',
          id: decoration.sourceId || decoration.id || `${decoration.type || 'unknown'}#${decorationIndex}`,
          type: decoration.type || 'unknown',
          distance: distance(objective.position, decoration),
          required: decorationClearance(decoration, asset),
          low: isLowDecoration(decoration, asset)
        }
      })
    const candidates = [...pairCandidates, ...eventCandidates, ...decorationCandidates]
      .sort((left, right) => left.distance - right.distance)
    const closest = candidates[0]
    nearest.push({
      objective: objective.properties?.stepName || objective.id,
      position: objective.position,
      nearest: closest ? `${closest.kind}:${closest.type || closest.id}` : null,
      distance: closest ? Number(closest.distance.toFixed(2)) : null
    })

    candidates.forEach((candidate) => {
      if (candidate.distance + 0.001 >= candidate.required) return
      failures.push(
        `${mapInfo.displayName || mapId} · ${objective.properties?.stepName || objective.id}(${objective.position.x},${objective.position.y}) ` +
        `与${candidate.kind}${candidate.type ? ` ${candidate.type}` : ''} ${candidate.id} 距离 ${candidate.distance.toFixed(2)}，` +
        `小于可见净空 ${candidate.required.toFixed(2)}。`
      )
    })

    const duplicateRuntimeEvent = runtimeObjectives.find((event) => event.id === objective.id)
    if (!duplicateRuntimeEvent || distance(duplicateRuntimeEvent.position, objective.position) > 0.001) {
      failures.push(`${mapInfo.displayName || mapId} · ${objective.id}: 运行时位置与任务定义不一致。`)
    }
    if (objectives.slice(objectiveIndex + 1).some((candidate) => distance(objective.position, candidate.position) < 0.001)) {
      failures.push(`${mapInfo.displayName || mapId} · ${objective.id}: 机关中心点重叠。`)
    }
  })

  reports.push({
    map: mapInfo.displayName || mapId,
    objectiveCount: objectives.length,
    nearest
  })
}

const expectedObjectiveCount = ELITE_UNLOCK_TASKS.reduce((sum, task) => sum + task.steps.length, 0)
const auditedObjectiveCount = reports.reduce((sum, report) => sum + report.objectiveCount, 0)
if (auditedObjectiveCount !== expectedObjectiveCount) {
  failures.push(`机关审计数量 ${auditedObjectiveCount} 与任务定义 ${expectedObjectiveCount} 不一致。`)
}

console.log(JSON.stringify({
  summary: {
    maps: reports.length,
    objectiveCount: auditedObjectiveCount,
    objectivePairClearance: OBJECTIVE_PAIR_CLEARANCE,
    characterClearance: CHARACTER_CLEARANCE,
    minimumDecorationClearance: LOW_DECORATION_CLEARANCE,
    failureCount: failures.length
  },
  reports,
  failures
}, null, 2))

if (failures.length > 0) {
  console.error(`\n[audit-elite-objective-visibility] FAILED: ${failures.length} 个机关遮挡或净空问题。`)
  process.exitCode = 1
} else {
  console.log(`\n[audit-elite-objective-visibility] OK: ${auditedObjectiveCount} 个机关均与人物、其他机关和地图装饰保持可见净空。`)
}
