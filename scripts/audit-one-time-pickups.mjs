#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const PICKUP_EVENT_TYPES = new Set(['item', 'pickup'])
const BLOCKED_TILES = new Set([1, 11, 20])

const sample = (items, limit = 12) => items.slice(0, limit)
const isSafeTile = (value) => Number.isSafeInteger(value) && !BLOCKED_TILES.has(value)

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const [
    { MAP_IDS, getMapInfo },
    { getMapEventTile },
  ] = await Promise.all([
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/game/data/mapEventTypes.js'),
  ])

  const issues = []
  const pickupEvents = []

  for (const mapId of MAP_IDS) {
    const mapInfo = getMapInfo(mapId)
    const mapEvents = Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []
    const pickupDecorations = new Set(
      (Array.isArray(mapInfo?.decorativeObjects) ? mapInfo.decorativeObjects : [])
        .filter((object) => PICKUP_EVENT_TYPES.has(object?.eventType) && typeof object.eventId === 'string')
        .map((object) => object.eventId)
    )
    const idsInMap = new Set()

    for (const event of mapEvents) {
      if (!PICKUP_EVENT_TYPES.has(event?.type)) continue
      pickupEvents.push({ mapId, event })

      if (typeof event.id !== 'string' || event.id.length === 0) {
        issues.push({ mapId, issue: 'pickup_missing_id', event })
        continue
      }
      if (idsInMap.has(event.id)) {
        issues.push({ mapId, eventId: event.id, issue: 'duplicate_pickup_id_in_map' })
      }
      idsInMap.add(event.id)

      const x = Math.trunc(Number(event.position?.x))
      const y = Math.trunc(Number(event.position?.y))
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        issues.push({ mapId, eventId: event.id, issue: 'pickup_invalid_position', position: event.position })
        continue
      }
      if (x < 0 || y < 0 || x >= mapInfo.width || y >= mapInfo.height) {
        issues.push({ mapId, eventId: event.id, issue: 'pickup_out_of_bounds', position: { x, y } })
        continue
      }

      const tile = mapInfo.mapGrid?.[y]?.[x]
      if (!isSafeTile(tile)) {
        issues.push({ mapId, eventId: event.id, issue: 'pickup_on_blocked_tile', position: { x, y }, tile })
      }

      const eventTile = getMapEventTile(event.type)
      if (eventTile && tile !== eventTile) {
        issues.push({ mapId, eventId: event.id, issue: 'pickup_tile_not_painted', position: { x, y }, tile, expected: eventTile })
      }

      if (!pickupDecorations.has(event.id)) {
        issues.push({ mapId, eventId: event.id, issue: 'pickup_missing_visible_decoration' })
      }
    }
  }

  const originalGameSource = fs.readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const threeMapSource = fs.readFileSync(path.join(rootDir, 'src/game/ThreeLowPolyMap.jsx'), 'utf8')

  if (originalGameSource.includes('collectedEventIds: shouldResetDailyEvents ? []')) {
    issues.push({ issue: 'collected_pickups_reset_on_daily_refresh' })
  }
  if (/collectedEventIds:\s*sameDailyRefresh\s*\?/.test(originalGameSource)) {
    issues.push({ issue: 'collected_pickups_merge_depends_on_daily_refresh_key' })
  }
  if (!originalGameSource.includes('hasCollectedMapEvent(world, mapName, event.id)')) {
    issues.push({ issue: 'grid_filter_does_not_use_scoped_collected_pickup_guard' })
  }
  if (!originalGameSource.includes('appendCollectedMapEvent(worldPositionPatch.world || baseSnapshot.world, currentMapName, eventId)')) {
    issues.push({ issue: 'pickup_commit_does_not_store_scoped_collected_id' })
  }
  if (!threeMapSource.includes('isCollectedMapEventId(collectedEventIdSet, currentMapName, event.id)')) {
    issues.push({ issue: 'runtime_pickup_signal_not_hidden_after_collection' })
  }

  if (issues.length > 0) {
    console.error('[audit-one-time-pickups] FAILED')
    console.error(JSON.stringify(sample(issues), null, 2))
    if (issues.length > 12) console.error(`...and ${issues.length - 12} more issue(s)`)
    process.exitCode = 1
    return
  }

  console.log(`[audit-one-time-pickups] OK: ${pickupEvents.length} pickup/item event(s) are one-time, visible before collection, and guarded after collection.`)
})
