import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import vm from 'node:vm'
import { retryPlaytimeTransport, isPlaytimeTransportError } from '../src/utils/playtimeRecovery.js'

let calls = 0, waits = 0
const result = await retryPlaytimeTransport(async () => { if (++calls === 1) throw new Error('游玩时长校验超时，请检查网络后重试。'); return { remainingSeconds: 300 } },
  { retry: true, wait: async ms => { assert.equal(ms, 400); waits++ } })
assert.equal(result.remainingSeconds, 300); assert.equal(calls, 2); assert.equal(waits, 1)
for (const error of [{ code: '42501', message: 'permission denied' }, { code: 'P0001', message: 'invalid playtime lease' }]) {
  calls = 0
  await assert.rejects(retryPlaytimeTransport(async () => { calls++; throw error }, { retry: true }))
  assert.equal(calls, 1)
}
calls = 0
await assert.rejects(retryPlaytimeTransport(async () => { calls++; throw new Error('Failed to fetch') }, { retry: true, wait: async () => {} }))
assert.equal(calls, 2, 'retries must be bounded')
assert.equal(isPlaytimeTransportError({ status: 503 }), true)

// Run the actual heartbeat callback with synthetic refs, without an account or RPC.
const source = await fs.readFile('src/components/Game/OriginalGame.jsx', 'utf8')
const start = source.indexOf('const heartbeatStudentPlaytime = useCallback(async () => {')
const end = source.indexOf('\n  const endStudentPlaytimeSession', start)
const callback = source.slice(start, end).replace('const heartbeatStudentPlaytime = useCallback(', '(').replace(/, \[applyStudentPlaytimeStatus,[\s\S]*$/, ')')
for (const scenario of ['timeout', 'permission', 'expiry', 'stale', 'lease']) {
  const ref = current => ({ current })
  let recovered = 0, failed = 0
  const context = {
    user: { id: 'synthetic-student' }, playtimeSessionIdRef: ref('synthetic-session'), playtimeLifecycleEpochRef: ref(1),
    playtimePageVisibleRef: ref(true), playtimeSessionStartedRef: ref(true), playtimeHeartbeatInFlightRef: ref(null),
    playtimeStatusRef: ref({ remainingSeconds: 10 }), playtimeExpiredRef: ref(false), isPlaytimeTransportError,
    runStudentPlaytimeRpc: async () => {
      if (scenario === 'stale') context.playtimeLifecycleEpochRef.current = 2
      if (scenario === 'lease') return []
      if (scenario !== 'expiry') throw new Error(scenario === 'permission' ? 'permission denied' : 'Failed to fetch')
      return [{ remainingSeconds: 0 }]
    },
    applyStudentPlaytimeStatus: row => row,
    beginStudentPlaytimeSession: async options => {
      assert.equal(context.playtimeExpiredRef.current, true, 'input must lock before recovery')
      assert.equal(context.playtimeSessionStartedRef.current, false)
      assert.deepEqual(JSON.parse(JSON.stringify(options)), { silent: true, retry: true })
      recovered++; return { remainingSeconds: 10 }
    },
    failStudentPlaytimeCheck: () => { failed++; return null }
  }
  await vm.runInNewContext(callback, context)()
  assert.equal(recovered, ['timeout', 'lease'].includes(scenario) ? 1 : 0)
  assert.equal(failed, scenario === 'permission' ? 1 : 0)
  assert.equal(context.playtimeHeartbeatInFlightRef.current, null)
  if (scenario === 'expiry') assert.equal(context.playtimeSessionStartedRef.current, false)
}

const callbackSource = (name, nextName) => {
  const start = source.indexOf(`const ${name} = useCallback(`)
  const end = source.indexOf(`\n  const ${nextName}`, start)
  const text = source.slice(start, end)
  assert.ok(start > 0 && end > start)
  return `(${text.slice(text.indexOf('useCallback(') + 12, text.lastIndexOf('}, [') + 1)})`
}
const ref = current => ({ current })

// Execute autosave preflight for both foreground and background/pagehide.
// A pending or restored ID must never submit a save before the server has
// confirmed a lease; a confirmed recent-end lease may still reach the network.
const saveCallback = callbackSource('saveGameToCloud', 'waitForCloudSaveIdle')
for (const scenario of [
  { confirmed: null, remaining: null, visible: false, expired: true, network: 0 },
  { confirmed: null, remaining: 300, visible: false, expired: false, network: 0 },
  { confirmed: 'confirmed', remaining: null, visible: false, expired: true, network: 0 },
  { confirmed: 'confirmed', remaining: 0, visible: false, expired: true, network: 0 },
  { confirmed: 'confirmed', remaining: 300, visible: true, expired: true, network: 0 },
  { confirmed: 'confirmed', remaining: 300, visible: false, expired: true, network: 1 },
  { confirmed: 'confirmed', remaining: 300, visible: true, expired: false, network: 1 },
]) {
  let network = 0
  const context = {
    user: { id: 'synthetic' },
    playtimeLastSessionIdRef: ref(scenario.confirmed),
    playtimeStatusRef: ref(scenario.remaining === null ? null : { remainingSeconds: scenario.remaining }),
    playtimeExpiredRef: ref(scenario.expired), playtimePageVisibleRef: ref(scenario.visible),
    navigator: { get onLine() { network++; return false } },
    setIsOnline() {}, setSyncError() {}, addNotification() {},
  }
  assert.equal(await vm.runInNewContext(saveCallback, context)({ force: true }), false)
  assert.equal(network, scenario.network, JSON.stringify(scenario))
}

// Confirmed lease identity must advance only after a current successful begin.
const beginCallback = callbackSource('beginStudentPlaytimeSession', 'retryStudentPlaytimeCheck')
for (const outcome of ['success', 'failure', 'stale']) {
  let resolve, reject, failed = 0
  const context = {
    user: { id: 'synthetic' }, playtimePageVisibleRef: ref(true), playtimeEnvironmentReadyRef: ref(true),
    playtimeSessionStartPromiseRef: ref(null), playtimeSessionIdRef: ref(null),
    playtimeLastSessionIdRef: ref(null), playtimeLifecycleEpochRef: ref(0),
    playtimeSessionStartedRef: ref(false), playtimeExpiredRef: ref(true),
    createCloudSaveSessionId: () => 'synthetic-session',
    setPlaytimeError() {}, setPlaytimeLoading() {},
    enqueueStudentPlaytimeLifecycleOperation: operation => Promise.resolve().then(operation),
    runStudentPlaytimeRpc: () => new Promise((res, rej) => { resolve = res; reject = rej }),
    applyStudentPlaytimeStatus: row => row,
    failStudentPlaytimeCheck: () => { failed++; return null },
    sendSupabaseRpcKeepalive: async () => null,
  }
  const pending = vm.runInNewContext(beginCallback, context)()
  await Promise.resolve()
  assert.equal(context.playtimeLastSessionIdRef.current, null, 'A pending start is not a confirmed lease')
  if (outcome === 'stale') context.playtimeLifecycleEpochRef.current++
  if (outcome === 'failure') reject(new Error('permission denied'))
  else resolve([{ remainingSeconds: 300 }])
  await pending
  assert.equal(context.playtimeLastSessionIdRef.current, outcome === 'success' ? 'playtime:synthetic-session' : null)
  assert.equal(failed, outcome === 'failure' ? 1 : 0)
}

// Retry during cold loading clears the failure, allowing the readiness effect
// to acquire a session later. It must not silently leave the error screen up.
const retryCallback = callbackSource('retryStudentPlaytimeCheck', 'heartbeatStudentPlaytime')
for (const ready of [false, true]) {
  let error = 'previous failure', loading = false, starts = 0
  vm.runInNewContext(retryCallback, {
    playtimeEnvironmentReadyRef: ref(ready),
    setPlaytimeError: value => { error = value }, setPlaytimeLoading: value => { loading = value },
    beginStudentPlaytimeSession: () => { starts++; return Promise.resolve() },
  })()
  assert.equal(error, null)
  assert.equal(loading, true)
  assert.equal(starts, ready ? 1 : 0)
}

// The battle watchdog must remain dormant throughout startup and resume when
// ready. Exercise the actual effect, rather than just looking for guard text.
const watchdogStart = source.indexOf('  useEffect(() => {', source.indexOf('// Effect to control body scrolling'))
const watchdogNext = source.indexOf('useEffect(() => {', watchdogStart + 20)
const watchdogEnd = source.indexOf('  const resolveEnemyTurn', watchdogNext)
const watchdog = source.slice(watchdogNext, watchdogEnd)
const effect = watchdog.slice(watchdog.indexOf('() => {'), watchdog.lastIndexOf('}, [') + 1)
let recoveryCalls = 0
vm.runInNewContext(`(${effect})`, {
  isActiveBattleContextView: () => true, view: 'battle', activeEnemyId: 'enemy',
  gameOver: false, battlePhase: 'active', user: { id: 'synthetic' }, hasLoadedCloudSave: true,
  fullPlayableScreenReady: false, isThrowingPokeball: true, captureSequenceData: null,
  commitCloudSnapshot: () => { recoveryCalls++ },
})()
assert.equal(recoveryCalls, 0)

console.log('PASS: bounded retries, heartbeat recovery, confirmed-lease autosaves, cold-loading retry, startup battle watchdog, permissions, expiry, and stale response isolation.')
