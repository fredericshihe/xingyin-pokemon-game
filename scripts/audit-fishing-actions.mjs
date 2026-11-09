#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { randomUUID } from 'node:crypto'
import { normalizeFishingState } from '../src/game/fishingRules.js'

// Exercise the actual integration callback without mounting the whole game or
// sending requests to real accounts.
const source = await readFile(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const start = source.indexOf('  const runFishingAction = useCallback(')
const end = source.indexOf('  const loadFishing = useCallback(', start)
assert.ok(start > 0 && end > start)
const script = new vm.Script(`${source.slice(start, end)}; runFishingAction`)
const fresh = () => {
  const updates = [], calls = [], notifications = [], account = { id: 'student-a' }
  let time = 0
  const context = {
    useCallback: fn => fn, user: account, userRef: { current: account }, hasLoadedCloudSave: true,
    fishingInFlightRef: { current: false }, cloudMutationGenerationRef: { current: 0 },
    requiresCloudReloadRef: { current: false }, currentMapName: 'GodotMap', currentMapNameRef: { current: 'GodotMap' },
    playtimeStatusRef: { current: { remainingSeconds: 300 } }, PLAYTIME_SAVE_REJECTED_MESSAGE: '今日游玩时间已用完。',
    latestPlayerResourcesRef: { current: { gold: 500, energy: 0 } }, crypto: { randomUUID },
    performance: { now: () => time }, normalizeFishingState,
    setFishingBusy: value => updates.push(['busy', value]), setFishingError: value => updates.push(['error', value]),
    setFishingState: value => updates.push(['state', value]), setPlayerGold: value => updates.push(['gold', value]),
    ensureTimberBankPlaytimeSession: async () => 'session-a', waitForCloudSaveIdle: async () => {},
    saveGameToCloud: async () => true, saveCloudGameWithLock: fn => fn(), runCloudRequestWithRetry: fn => fn(),
    gameAudio: { playItemUse() {} }, recordGameLog() {},
    addNotification: (...args) => notifications.push(args),
    isPlaytimeLimitError: () => false, isPlaytimeSessionError: () => false,
    markPlaytimeExpiredFromServer() {}, markPlaytimeSessionUnavailable() {},
  }
  context.supabase = { rpc: async (name, params) => {
    calls.push(params)
    return { data: { success: true, walletGold: 512, state: { hasRod: true }, result: { totalGold: 12 } } }
  } }
  const run = script.runInNewContext(context)
  return { context, run, calls, updates, notifications, advance: ms => { time += ms } }
}

let test = fresh()
await test.run('sell', { merchantId: 'valley', catchId: 'c01', quantity: 1 })
assert.ok(test.notifications[0][0].includes('12'))
assert.equal(test.context.latestPlayerResourcesRef.current.energy, 0)
assert.equal(test.context.latestPlayerResourcesRef.current.gold, 512)

test = fresh()
let releaseSession
test.context.ensureTimberBankPlaytimeSession = () => new Promise(resolve => { releaseSession = resolve })
const first = test.run('state')
const purchaseAfterRead = test.run('purchase', { itemId: 'fishing_rod', quantity: 1 })
test.context.ensureTimberBankPlaytimeSession = async () => 'session-a'
releaseSession('session-a'); await first
assert.equal((await purchaseAfterRead).success, true)
assert.deepEqual(test.calls.map(call => call.p_action), ['state', 'purchase'])
assert.equal(test.calls[1].p_payload.itemId, 'fishing_rod')

test = fresh()
test.context.ensureTimberBankPlaytimeSession = () => new Promise(resolve => { releaseSession = resolve })
const purchaseInFlight = test.run('purchase', { itemId: 'fishing_rod', quantity: 1 })
assert.equal((await test.run('purchase', { itemId: 'fishing_rod', quantity: 1 })).success, false)
releaseSession('session-a'); await purchaseInFlight
assert.equal(test.calls.length, 1)

test = fresh()
test.context.runCloudRequestWithRetry = async fn => {
  await fn(); test.context.currentMapNameRef.current = 'GodotMapV2_MistLake'; return fn()
}
await test.run('start', { spotId: 'valley_pond', baitId: 'common' })
assert.equal(test.calls.length, 2)
assert.equal(test.calls[0].p_request_id, test.calls[1].p_request_id)
assert.equal(test.calls[0].p_payload.mapId, test.calls[1].p_payload.mapId)

test = fresh()
let releaseRpc
test.context.supabase.rpc = () => new Promise(resolve => { releaseRpc = resolve })
const pending = test.run('state')
while (!releaseRpc) await new Promise(resolve => setImmediate(resolve))
test.context.userRef.current = { id: 'student-b' }
test.context.cloudMutationGenerationRef.current++
const newOperation = { studentId: 'student-b' }
test.context.fishingInFlightRef.current = newOperation
releaseRpc({ data: { success: true, walletGold: 900, state: { hasRod: true } } })
assert.equal((await pending).success, false)
assert.equal(test.updates.some(([kind]) => kind === 'state' || kind === 'gold'), false)
assert.equal(test.context.fishingInFlightRef.current, newOperation)

for (const slowAgain of [false, true]) {
  test = fresh()
  test.context.supabase.rpc = async (name, params) => {
    test.calls.push(params)
    test.advance(test.calls.length === 1 || slowAgain ? 2500 : 100)
    return { data: { success: true, walletGold: 500,
      state: { hasRod: true, activeSession: { id: 'fixed-cast', spotId: 'valley_pond', elapsedMs: 1000, waitMs: 1500 } } } }
  }
  const response = await test.run('start', { spotId: 'valley_pond', baitId: 'common' })
  assert.deepEqual(test.calls.map(call => call.p_action), ['start', 'state'])
  assert.equal(response.session.clockUncertain, slowAgain)
  assert.ok(response.session.elapsedMs <= 1080)
  assert.equal(response.session.id, 'fixed-cast')
}

// A slow login or map transition is not a rejected server lease. Readiness can
// legitimately arrive after the session helper's short polling window.
for (const action of ['state', 'purchase']) {
  test = fresh()
  let locked = 0
  test.context.ensureTimberBankPlaytimeSession = async () => null
  test.context.isPlaytimeSessionError = message => message.includes('游玩会话')
  test.context.markPlaytimeSessionUnavailable = () => { locked++ }
  const deferred = await test.run(action, { itemId: 'fishing_rod', quantity: 1 })
  assert.equal(locked, 0, `${action} initialization must not invalidate the game's playtime session`)
  assert.equal(deferred.deferred, true)
  assert.equal(test.calls.length, 0)
  assert.equal(test.context.fishingInFlightRef.current, false)
  assert.equal(test.updates.some(([kind, value]) => kind === 'error' && value), action !== 'state')
  test.context.ensureTimberBankPlaytimeSession = async () => 'session-a'
  assert.equal((await test.run(action)).success, true, 'Ready session must still load inventory or purchase')
}

// Genuine server rejection and authoritative expiry must keep their guards.
for (const message of ['无法确认当前游玩会话，请重新校验时长。', '今日游玩时间已用完。']) {
  test = fresh()
  let invalid = 0, expired = 0
  test.context.isPlaytimeSessionError = text => text.includes('游玩会话')
  test.context.isPlaytimeLimitError = text => text.includes('游玩时间') && text.includes('用完')
  test.context.markPlaytimeSessionUnavailable = () => { invalid++ }
  test.context.markPlaytimeExpiredFromServer = () => { expired++ }
  test.context.supabase.rpc = async () => ({ error: { message } })
  assert.equal((await test.run('state')).success, false)
  assert.equal(invalid, message.includes('游玩会话') ? 1 : 0)
  assert.equal(expired, message.includes('用完') ? 1 : 0)
}

// Execute the real automatic inventory effect as readiness changes. Startup
// stays silent; scene/session completion schedules a load, and a transition
// cancels the previous timer instead of starting an obsolete request.
const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('  const loadFishingRef =', end))
const effectEnd = source.indexOf('\n  useEffect(() => {\n    setFishingState(null)', effectStart)
assert.ok(effectStart > 0 && effectEnd > effectStart)
const scheduled = new Map()
let timerId = 0, loaded = 0, cleanup
const effectContext = {
  hasLoadedCloudSave: true, canAccruePlaytime: false, view: 'map', pendingFishingSpot: null,
  loadFishingRef: { current: () => { loaded++ } },
  useEffect: fn => { cleanup = fn() },
  window: { setTimeout: fn => { scheduled.set(++timerId, fn); return timerId }, clearTimeout: id => scheduled.delete(id) }
}
const inventoryEffect = new vm.Script(source.slice(effectStart, effectEnd))
inventoryEffect.runInNewContext(effectContext)
assert.equal(scheduled.size, 0, 'Cold login must not schedule fishing while map/session is still preparing')
effectContext.canAccruePlaytime = true
inventoryEffect.runInNewContext(effectContext)
assert.equal(scheduled.size, 1)
cleanup()
assert.equal(scheduled.size, 0, 'Losing readiness must cancel the background load')
inventoryEffect.runInNewContext(effectContext)
for (const fn of scheduled.values()) fn()
assert.equal(loaded, 1)
scheduled.clear()
effectContext.canAccruePlaytime = false
inventoryEffect.runInNewContext(effectContext)
assert.equal(scheduled.size, 0, 'Hidden or expired playtime must not trigger inventory requests')
console.log('fishing action audit passed (wallet, concurrency, retries, slow clock, deferred login, background readiness and server lease guards)')
