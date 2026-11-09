import {
  FISHING_BAITS, FISHING_BAIT_IDS, FISHING_CATCHES, FISHING_CATEGORY_IDS,
  FISHING_SPOTS, FISHING_TIER_IDS, FISHING_TIERS
} from './fishingCatalog.js'
import { FISHING_APPRAISAL_GRADES } from './fishingRewards.js'

const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const count = (value) => Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(Number(value) || 0)))
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const cleanCounts = (input, allowed) => Object.fromEntries(allowed.flatMap((id) => {
  const amount = count(input?.[id])
  return amount > 0 ? [[id, amount]] : []
}))

/** Bait inventory stores remaining uses; complete packs and the open remainder are derived. */
export function getFishingBaitStock(baitId, remainingUses) {
  const bait = FISHING_BAITS[baitId]
  if (!bait) return { packs: 0, remainder: 0, uses: 0 }
  const uses = count(remainingUses)
  return { packs: Math.floor(uses / bait.uses), remainder: uses % bait.uses, uses }
}

/** Older saves have no fishing fields. Unknown IDs and malformed counters never become items. */
export function normalizeFishingState(input) {
  const source = isObject(input) ? input : {}
  const catchIds = Object.keys(FISHING_CATCHES)
  const catches = cleanCounts(source.catches, catchIds)
  const seenTreasures = new Set()
  const treasures = (Array.isArray(source.treasures) ? source.treasures : []).flatMap((raw) => {
    if (!isObject(raw) || typeof raw.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(raw.id) || seenTreasures.has(raw.id) || FISHING_CATCHES[raw.catchId]?.kind !== 'treasure') return []
    seenTreasures.add(raw.id)
    const price = Number(raw.price)
    const appraised = Number.isSafeInteger(price) && price > 0 && price <= 21900 && Object.hasOwn(FISHING_APPRAISAL_GRADES,raw.appraisalGrade)
    return [{ id: raw.id, catchId: raw.catchId, caughtAt: typeof raw.caughtAt === 'string' ? raw.caughtAt : null,
      ...(appraised ? { price, appraisalGrade: raw.appraisalGrade, appraisedAt: raw.appraisedAt } : {}) }]
  })
  if (source.fishingVersion === 2 || (Array.isArray(source.treasures) && source.fishingVersion !== 1)) {
    for (const item of Object.values(FISHING_CATCHES).filter((item) => item.kind === 'treasure')) {
      const owned = treasures.filter((treasure) => treasure.catchId === item.id).length
      if (owned) catches[item.id] = owned
      else delete catches[item.id]
    }
  }
  const records = Object.fromEntries(catchIds.flatMap((id) => {
    const raw = source.records?.[id]
    if (!isObject(raw)) return []
    const firstCaughtAt = typeof raw.firstCaughtAt === 'string' ? raw.firstCaughtAt : null
    const amount = count(raw.count)
    if (!amount && !firstCaughtAt) return []
    const item = FISHING_CATCHES[id]
    return [[id, { firstCaughtAt, count: amount,
      maxWeight: Math.min(item.weightMax, Math.max(0, finite(raw.maxWeight))),
      perfectCount: Math.min(amount, count(raw.perfectCount)) }]]
  }))
  return {
    hasRod: source.hasRod === true,
    baitUses: cleanCounts(source.baitUses, FISHING_BAIT_IDS), catches, records,
    treasures, hitStreak: count(source.hitStreak ?? source.perfectStreak), perfectStreak: count(source.hitStreak ?? source.perfectStreak), fishingVersion: source.fishingVersion === 2 ? 2 : 1,
    totals: Object.fromEntries(['casts', 'caught', 'perfect', 'sold', 'earned', 'comboEarned'].map((key) => [key, count(source.totals?.[key])])),
    activeSession: isObject(source.activeSession) ? { ...source.activeSession } : null
  }
}

/** Group pending pieces and identically appraised pieces without losing their individual identities. */
export function getFishingBasketRows(state) {
  const rows = Object.values(FISHING_CATCHES).filter((item) => item.kind !== 'treasure' && state.catches[item.id] > 0)
    .map((item) => ({ ...item, key: item.id, quantity: state.catches[item.id] }))
  const groups = new Map()
  for (const treasure of state.treasures) {
    const item = FISHING_CATCHES[treasure.catchId]
    const key = `${item.id}:${treasure.appraisalGrade || 'pending'}:${treasure.price || 'pending'}`
    if (!groups.has(key)) groups.set(key, { ...item, key, price: treasure.price ?? null, appraisalGrade: treasure.appraisalGrade,
      quantity: 0, treasureIds: [] })
    const row = groups.get(key)
    row.quantity++; row.treasureIds.push(treasure.id)
  }
  return [...rows, ...groups.values()]
}

export function getFishingSaleTotals(rows, merchant) {
  return rows.reduce((totals, item) => {
    if (item.kind === 'treasure' && (!item.price || !merchant?.treasureIds.includes(item.id))) return totals
    return { quantity: totals.quantity + item.quantity, gold: totals.gold + item.quantity * item.price }
  }, { quantity: 0, gold: 0 })
}

const BOSS_IDS = { GodotMapV2: 'region_boss', GodotMapV2_MistLake: 'mistlake_boss',
  GodotMapV2_FarmTown: 'farmtown_boss', GodotMapV2_PirateShore: 'pirateshore_boss' }
const MAP_ORDER = ['GodotMap', ...Object.keys(BOSS_IDS), 'GodotMapV2_Graveyard', 'GodotMapV2_HexRuins',
  'GodotMapV2_SurvivalRidge', 'GodotMapV2_BossHighland', 'GodotMapV2_FrostDojo',
  'GodotMapV2_TideDojo', 'GodotMapV2_IronDojo', 'GodotMapV2_DragonDojo', 'GodotMapV2_ChampionTower']

export function hasFishingBossCompleted(world, mapId) {
  const bossId = BOSS_IDS[mapId]
  if (!bossId) return false
  const completed = Array.isArray(world?.defeatedBossIds) ? world.defeatedBossIds : []
  return completed.includes(`${mapId}:${bossId}`) || completed.includes(bossId)
}

function hasReachedMap(world, mapId, currentMapId) {
  const current = currentMapId || world?.currentMapName || world?.currentMapId
  if (current === mapId || mapId === 'GodotMap') return true
  const targetIndex = MAP_ORDER.indexOf(mapId)
  const currentIndex = MAP_ORDER.indexOf(current)
  if (targetIndex > 0 && currentIndex >= targetIndex) return true
  // Earlier chapters can be revisited; their permanent predecessor victories keep items unlocked.
  if (targetIndex > 1) return MAP_ORDER.slice(1, targetIndex).every((id) => hasFishingBossCompleted(world, id))
  return false
}

export function isFishingBaitUnlocked(bait, world, currentMapId) {
  const item = typeof bait === 'string' ? FISHING_BAITS[bait] : bait
  if (!item || !FISHING_BAITS[item.id]) return false
  if (item.requiredBossMapId && !hasFishingBossCompleted(world, item.requiredBossMapId)) return false
  return !item.requiredMapId || hasReachedMap(world, item.requiredMapId, currentMapId)
}

export function isFishingSpotUnlocked(spot, world) {
  const item = typeof spot === 'string' ? FISHING_SPOTS[spot] : spot
  if (!item || !FISHING_SPOTS[item.id]) return false
  return (!item.requiredBossMapId || hasFishingBossCompleted(world, item.requiredBossMapId)) && hasReachedMap(world, item.mapId)
}

/** Probabilities are percentages; tier arrays contain actual catalogue objects, not only IDs. */
export function getFishingPool(spotId, baitId) {
  const spot = FISHING_SPOTS[spotId]
  const bait = FISHING_BAITS[baitId]
  if (!spot || !bait) return null
  const baitRank = FISHING_BAIT_IDS.indexOf(baitId)
  const groups = Object.fromEntries(FISHING_CATEGORY_IDS.map((id) => [id, []]))
  for (const item of Object.values(FISHING_CATCHES)) {
    if (!item.spotIds.includes(spotId)) continue
    if (item.kind === 'treasure') {
      if (baitRank >= FISHING_BAIT_IDS.indexOf(item.minimumBaitId)) groups.treasure.push(item)
    } else if (item.kind === 'junk') groups.junk.push(item)
    else if (FISHING_TIER_IDS.indexOf(item.tier) <= FISHING_TIER_IDS.indexOf(spot.maxTier)) groups[item.tier].push(item)
  }
  const probabilities = [...bait.probabilities]
  for (let index = 4; index >= 0; index--) {
    if (groups[FISHING_CATEGORY_IDS[index]].length) continue
    let lower = index - 1
    while (lower >= 0 && groups[FISHING_TIER_IDS[lower]].length === 0) lower--
    if (lower >= 0) probabilities[lower] += probabilities[index]
    probabilities[index] = 0
  }
  return { spot, bait, probabilities, groups, catches: Object.values(groups).flat(), maxTier: spot.maxTier }
}

export function getFishingPosition(elapsedMs, seconds) {
  const duration = Math.max(1, finite(seconds, FISHING_TIERS.common.seconds) * 1000)
  const phase = (Math.max(0, finite(elapsedMs)) / duration) % 2
  return phase <= 1 ? phase : 2 - phase
}

/** Three passes, starting at the left edge. The right edge of pass three ends the session. */
export function getFishingDeadlineMs(width, seconds, targetCenter) {
  const zoneWidth = Math.min(1, Math.max(0, finite(width, FISHING_TIERS.common.width)))
  const center = Math.min(1 - zoneWidth / 2, Math.max(zoneWidth / 2, finite(targetCenter, .5)))
  return Math.min(10000, Math.max(1, finite(seconds, FISHING_TIERS.common.seconds) * 1000) * (2 + center + zoneWidth / 2))
}

export function evaluateFishingReel({ elapsedMs, width, seconds, targetCenter }) {
  const zoneWidth = Math.min(1, Math.max(0, finite(width, FISHING_TIERS.common.width)))
  const center = Math.min(1 - zoneWidth / 2, Math.max(zoneWidth / 2, finite(targetCenter, .5)))
  const elapsed = finite(elapsedMs, -1)
  const position = getFishingPosition(elapsed, seconds)
  const deadlineMs = getFishingDeadlineMs(zoneWidth, seconds, center)
  const timedOut = elapsed > deadlineMs || elapsed < 0
  const distance = Math.abs(position - center)
  const success = !timedOut && distance <= zoneWidth / 2 + 1e-9
  return { success, perfect: success && distance <= zoneWidth / 6 + 1e-9, position,
    timedOut, deadlineMs, lower: center - zoneWidth / 2, upper: center + zoneWidth / 2 }
}

export function getFishingCatchDifficulty(catchId) {
  return FISHING_TIERS[FISHING_CATCHES[catchId]?.tier] || FISHING_TIERS.common
}
