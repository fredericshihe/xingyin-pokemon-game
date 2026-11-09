#!/usr/bin/env node
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  FISHING_BAITS, FISHING_BASKET_SPRITE, FISHING_CATCHES, FISHING_ROD, FISHING_SPOTS,
  FISHING_TIER_IDS, FISHING_TIERS
} from '../src/game/fishingCatalog.js'
import {
  evaluateFishingReel, getFishingBaitStock, getFishingDeadlineMs, getFishingPool, getFishingPosition,
  isFishingBaitUnlocked, isFishingSpotUnlocked, normalizeFishingState
} from '../src/game/fishingRules.js'

const checks = []
const check = async (name, fn) => { await fn(); checks.push(name) }
const asset = (id) => resolve('public/assets/fishing', `${id}.svg`)
await check('catalog has 40 biology catches, 8 treasures and 3 junk', () => {
  const entries = Object.values(FISHING_CATCHES)
  assert.equal(entries.filter((x) => ['fish', 'shrimp', 'crab'].includes(x.kind)).length, 40)
  assert.equal(entries.filter((x) => x.kind === 'treasure').length, 8)
  assert.equal(entries.filter((x) => x.kind === 'junk').length, 3)
  assert.equal(entries.filter((x) => x.kind === 'fish').length, 24)
  assert.equal(entries.filter((x) => x.kind === 'shrimp' || x.kind === 'crab').length, 16)
  assert.ok(entries.every((item) => typeof item.englishName === 'string' && item.englishName.length > 0))
  assert.equal(new Set(entries.map((item) => item.englishName)).size, 51)
})
await check('every item has a real independent local SVG and bounded weight', async () => {
  const entries = [...Object.values(FISHING_CATCHES), FISHING_ROD, ...Object.values(FISHING_BAITS), { sprite: FISHING_BASKET_SPRITE }]
  for (const item of entries) {
    const svgPath = resolve('public', item.sprite.replace(/^\//, ''))
    await access(svgPath)
    const text = await readFile(svgPath, 'utf8')
    assert.match(text, /<svg\b/)
    for (const match of text.matchAll(/<path d="([^"]+)"/g)) assert.match(match[1], /^[MmLlHhVvCcSsQqTtAaZz0-9eE., +\-]+$/, `${svgPath} has invalid path commands`)
    for (const match of text.matchAll(/(?:fill|stroke|stop-color)="(#[^"]+)"/g)) assert.match(match[1], /^#(?:[\da-f]{3}|[\da-f]{6})$/i, `${svgPath} has invalid colour`)
    if ('weightMin' in item) assert.ok(item.weightMax >= item.weightMin)
  }
  const fishBodies = await Promise.all(Object.values(FISHING_CATCHES).map((x) => readFile(asset(x.id), 'utf8')))
  const anatomy = (svg) => Array.from(svg.matchAll(/<path d="([^"]+)"/g), (match) => match[1]).join('|')
  assert.equal(new Set(fishBodies.map(anatomy)).size, 51, 'all catches need different shapes, not only colour or titles')
})
await check('bait probabilities are complete and sum to 100', () => {
  for (const bait of Object.values(FISHING_BAITS)) {
    assert.equal(bait.probabilities.length, 7)
    assert.ok(Math.abs(bait.probabilities.reduce((sum, value) => sum + value, 0) - 100) < 1e-8)
  }
})
await check('every spot and bait produces a non-empty legal pool at 100%', () => {
  const reachable = new Set()
  for (const spot of Object.values(FISHING_SPOTS)) for (const bait of Object.values(FISHING_BAITS)) {
    const pool = getFishingPool(spot.id, bait.id)
    assert.ok(pool)
    assert.ok(pool.catches.length, `${spot.id}/${bait.id} empty`)
    assert.ok(Math.abs(pool.probabilities.reduce((sum, value) => sum + value, 0) - 100) < 1e-8, `${spot.id}/${bait.id} probabilities`)
    for (const item of pool.catches) {
      assert.ok(item.spotIds.includes(spot.id))
      reachable.add(item.id)
      if (['fish','shrimp','crab'].includes(item.kind)) assert.equal(new Set(item.spotIds.map((id) => FISHING_SPOTS[id].waterType)).size, 1, `${item.id} mixes sea and freshwater`)
    }
    for (let i = 0; i < 5; i++) if (pool.probabilities[i] > 0) assert.ok(pool.groups[FISHING_TIER_IDS[i]].length, `${spot.id}/${bait.id} tier ${FISHING_TIER_IDS[i]}`)
  }
  assert.equal(reachable.size, 51, 'every catalogue catch must have a reachable pool')
})
await check('chapter unlocks are permanent and deep waters require their actual boss', () => {
  const fresh = { currentMapName:'GodotMap', defeatedBossIds:[] }
  assert.equal(isFishingBaitUnlocked('common', fresh), true)
  assert.equal(isFishingBaitUnlocked('aroma', fresh), false)
  assert.equal(isFishingBaitUnlocked('secret', fresh), false)
  assert.equal(isFishingSpotUnlocked('valley_shallows', fresh), true)
  assert.equal(isFishingSpotUnlocked('lake_deep', { currentMapName:'GodotMapV2_MistLake' }), false)
  const lakeCleared = { ...fresh, defeatedBossIds:['GodotMapV2:region_boss','GodotMapV2_MistLake:mistlake_boss'] }
  assert.equal(isFishingBaitUnlocked('aroma', lakeCleared), true)
  assert.equal(isFishingBaitUnlocked('pearl', lakeCleared), true)
  assert.equal(isFishingBaitUnlocked('starlight', lakeCleared), false)
  assert.equal(isFishingSpotUnlocked('lake_deep', lakeCleared), true)
})
await check('reel boundaries, perfect centre and third pass deadline match time-based position', () => {
  for (const tier of Object.values(FISHING_TIERS)) for (const center of [.35,.5,.65]) {
    const seconds = tier.seconds, width = tier.width, duration = seconds*1000
    const args = { width, seconds, targetCenter:center }
    assert.equal(getFishingPosition(0,seconds), 0)
    assert.equal(getFishingPosition(duration,seconds), 1)
    assert.equal(getFishingPosition(duration*2,seconds), 0)
    for(const elapsedMs of [(center-width/2)*duration,center*duration,(2-center)*duration,(2+center)*duration]) {
      const result=evaluateFishingReel({...args,elapsedMs})
      assert.equal(result.success, true)
    }
    assert.equal(evaluateFishingReel({...args,elapsedMs:center*duration}).perfect, true)
    assert.equal(evaluateFishingReel({...args,elapsedMs:0}).success, false)
    const deadline=getFishingDeadlineMs(width,seconds,center)
    assert.equal(evaluateFishingReel({...args,elapsedMs:deadline}).success, true)
    assert.equal(evaluateFishingReel({...args,elapsedMs:deadline+1}).timedOut, true)
  }
})
await check('state normalization drops unknown fields and preserves no daily limit', () => {
  const state = normalizeFishingState({ castsToday: 999, baitUses: { common: 2, unknown: 4 }, catches: { c01: 3, bad: 5 }, locked: { c01: 8 }, totals: { casts: 3 } })
  assert.deepEqual(state.baitUses, { common: 2 })
  assert.deepEqual(state.catches, { c01: 3 })
  assert.equal('locked' in state, false)
  assert.equal('castsToday' in state, false)
})
await check('remaining bait splits into complete packs and open uses', () => {
  assert.deepEqual(getFishingBaitStock('common',25), { packs:2,remainder:5,uses:25 })
  assert.deepEqual(getFishingBaitStock('common',5), { packs:0,remainder:5,uses:5 })
  assert.deepEqual(getFishingBaitStock('secret',7), { packs:1,remainder:1,uses:7 })
  assert.deepEqual(getFishingBaitStock('common',0), { packs:0,remainder:0,uses:0 })
})
for (const tier of Object.values(FISHING_TIERS)) {
  assert.ok(tier.width > 0 && tier.width <= 1)
  assert.ok(tier.seconds > 0)
}
console.log(`fishing catalog audit passed (${checks.length} checks; ${Object.keys(FISHING_CATCHES).length} catches; ${Object.keys(FISHING_SPOTS).length} spots)`)
