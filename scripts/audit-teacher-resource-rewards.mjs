import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import {
  TEACHER_UPDATE_EVENTS,
  broadcastStudentTeacherUpdate,
  createTeacherResourceRewardUpdate,
  getStudentTeacherUpdateChannelName,
  normalizeTeacherResourceRewardUpdate,
} from '../src/utils/teacherRewardUpdates.js'

const gameSource = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const teacherSource = readFileSync(new URL('../src/components/Teacher/Dashboard.jsx', import.meta.url), 'utf8')
const between = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert(start >= 0 && end > start, `Missing source boundary: ${startMarker}`)
  return source.slice(start, end)
}

const invalidRewards = [
  undefined, null, {}, { source: 'battle', id: 'battle', goldDelta: 4080 },
  { source: 'teacher', id: '', goldDelta: 500 },
  { source: 'teacher', id: 'zero', goldDelta: 0 },
  { source: 'teacher', id: 'negative', goldDelta: -1 },
  { source: 'teacher', id: 'string', goldDelta: '500' },
  { source: 'teacher', id: 'fraction', maxEnergyDelta: 0.5 },
  { source: 'teacher', id: 'unsafe', goldDelta: Number.MAX_SAFE_INTEGER + 1 },
]
for (const value of invalidRewards) assert.equal(normalizeTeacherResourceRewardUpdate(value), null)

const teacherGold = createTeacherResourceRewardUpdate({ goldDelta: 500 })
assert.equal(teacherGold.source, 'teacher')
assert.equal(teacherGold.goldDelta, 500)
assert.equal(teacherGold.maxEnergyDelta, 0)

// Run the actual resource refresh, queue, and subscription callbacks with isolated RPCs and timers.
let resources = { gold: 1000, energy: 8, max_energy: 10 }
let balances = { gold: 1000, energy: 8, maxEnergy: 10 }
let queue = []
let refreshCalls = 0
let refreshError = null
let cleanup
const timers = new Map()
const listeners = new Map()
const criticalCloudSaveRequestedRef = { current: false }
const latestPlayerResourcesRef = { current: { ...balances } }
const context = {
  useCallback: (fn) => fn,
  useEffect: (fn) => { cleanup = fn() },
  user: { id: 'audit-student' },
  playerGold: balances.gold, playerEnergy: balances.energy, maxEnergy: balances.maxEnergy,
  hasLoadedCloudSave: true, cloudLoading: false, cloudError: null, showLaunchScreen: false,
  DEFAULT_STARTING_ENERGY: 10, DEFAULT_MAX_ENERGY: 10,
  setPlayerGold: (value) => { balances.gold = value },
  setPlayerEnergy: (value) => { balances.energy = value },
  setMaxEnergy: (value) => { balances.maxEnergy = value },
  setPendingTeacherRewardCeremonies: (update) => { queue = update(queue) },
  criticalCloudSaveRequestedRef, latestPlayerResourcesRef,
  normalizeTeacherResourceRewardUpdate, TEACHER_UPDATE_EVENTS, getStudentTeacherUpdateChannelName,
  runCloudRequestWithRetry: (request) => request(),
  addLog() {},
  console: { error() {} },
  beginStudentPlaytimeSession() {}, loadStudentPlaytimeStatus() {},
  beginTeacherRewardClaimRef: { current() {} },
  window: {
    setTimeout: (fn) => { const id = Symbol('timer'); timers.set(id, fn); return id },
    clearTimeout: (id) => timers.delete(id),
  },
  supabase: {
    rpc: async (name, args) => {
      assert.equal(name, 'get_user_resources')
      assert.equal(args.p_user_id, 'audit-student')
      refreshCalls++
      return { data: [{ ...resources }], error: refreshError }
    },
    channel: (name) => {
      assert.equal(name, getStudentTeacherUpdateChannelName('audit-student'))
      const channel = {
        on: (type, { event }, fn) => { assert.equal(type, 'broadcast'); listeners.set(event, fn); return channel },
        subscribe() {},
      }
      return channel
    },
    removeChannel() {},
  },
}
const { refreshPlayerResources } = vm.runInNewContext([
  between(gameSource, 'const TEACHER_REWARD_CEREMONY_MAX_QUEUE =', 'const buildTeacherItemRewardCeremonyItem ='),
  between(gameSource, 'const buildTeacherResourceRewardCeremony =', 'const normalizeLegacyTeacherRewardRecovery ='),
  between(gameSource, '  const queueTeacherRewardCeremonies =', '  const handleTeacherRewardCeremonyComplete ='),
  between(gameSource, '  const refreshPlayerResources =', '  const refreshPlayerResourcesRef ='),
  'const refreshPlayerResourcesRef = { current: refreshPlayerResources };',
  between(gameSource, "  useEffect(() => {\n    if (!hasLoadedCloudSave || cloudLoading || cloudError || showLaunchScreen || !user?.id) return undefined;\n\n    const channel =", "  useEffect(() => {\n    if (!hasLoadedCloudSave || cloudLoading || cloudError || showLaunchScreen || !user?.id) return undefined;\n    refreshPlayerResources();"),
  '({ refreshPlayerResources })',
].join('\n'), context)

const deliver = (resourceReward) => listeners.get(TEACHER_UPDATE_EVENTS.resourcesChanged)({
  payload: { sentAt: new Date().toISOString(), resourceReward },
})
const flushTimers = async () => {
  const pending = [...timers.values()]
  timers.clear()
  for (const run of pending) run()
  await Promise.resolve()
  await Promise.resolve()
}

resources.gold += 4080
await refreshPlayerResources()
assert.equal(balances.gold, 5080, 'Training gold arrives directly')
assert.equal(latestPlayerResourcesRef.current.gold, 5080)
assert.equal(queue.length, 0, 'Training wins must not open teacher gifts')
assert.equal(criticalCloudSaveRequestedRef.current, false)

resources.gold += 1200
resources.max_energy = 12
await refreshPlayerResources()
assert.equal(balances.gold, 6280, 'Other ordinary income also synchronizes')
assert.equal(balances.maxEnergy, 12)
assert.equal(queue.length, 0, 'Balance or cap differences do not identify a teacher reward')
for (const reward of invalidRewards) deliver(reward)
assert.equal(queue.length, 0)
assert.equal(timers.size, 1, 'Legacy and invalid notices still debounce resource refresh')
await flushTimers()

// A teacher grant and a training victory can arrive together; the gift shows only the grant.
resources.gold += teacherGold.goldDelta + 4080
deliver(teacherGold)
deliver(teacherGold)
assert.equal(queue.length, 1, 'Duplicate event IDs must not duplicate pending gifts')
assert.equal(queue[0].id, teacherGold.id)
assert.equal(queue[0].rewards[0].quantity, 500)
await flushTimers()
assert.equal(balances.gold, 10860)
assert.equal(queue[0].rewards[0].quantity, 500)
assert.equal(criticalCloudSaveRequestedRef.current, true)

const secondGold = createTeacherResourceRewardUpdate({ goldDelta: 250 })
const energyCap = createTeacherResourceRewardUpdate({ maxEnergyDelta: 3 })
resources.gold += 250
resources.max_energy += 3
const beforeRefreshCalls = refreshCalls
deliver(secondGold)
deliver(energyCap)
assert.equal(queue.length, 3, 'Distinct teacher gifts survive refresh debouncing')
assert.equal(queue[1].rewards[0].quantity, 250)
assert.equal(queue[2].rewards[0].type, 'energy')
assert.equal(queue[2].rewards[0].quantity, 3)
await flushTimers()
assert.equal(refreshCalls, beforeRefreshCalls + 1)
assert.equal(balances.gold, 11110)
assert.equal(balances.maxEnergy, 15)

const beforeFailureBalances = { ...balances }
refreshError = { message: 'Simulated refresh failure' }
resources.gold += 999
await refreshPlayerResources()
assert.deepEqual(balances, beforeFailureBalances)
assert.equal(queue.length, 3)
refreshError = null

const sent = []
let removedChannels = 0
const makeBroadcaster = (status = 'SUBSCRIBED') => ({
  channel: (name) => {
    assert.equal(name, getStudentTeacherUpdateChannelName('audit-student'))
    return {
      subscribe: (fn) => fn(status),
      send: async (message) => {
        sent.push(message)
        listeners.get(message.event)?.(message)
        return 'ok'
      },
    }
  },
  removeChannel: async () => { removedChannels++ },
})

// Exercise the teacher's real success and failure branches and their broadcast payloads.
let grantResult
const teacherMessages = []
const teacherContext = {
  useCallback: (fn) => fn,
  selectedStudent: { id: 'audit-student' }, profile: { id: 'audit-teacher' },
  goldAmount: '500', reason: '', energyAmount: '', energyMax: '18', energyReason: '', energyFillToMax: false,
  getGoldRewardWarning: () => null, getEnergyRewardWarning: () => null, getMaxEnergyWarning: () => null,
  setLoading() {}, setGoldAmount() {}, setReason() {}, setEnergyAmount() {}, setEnergyMax() {},
  setEnergyReason() {}, setEnergyFillToMax() {}, patchStudent() {},
  setMessage: (message) => teacherMessages.push(message),
  loadStudents: async () => {}, loadGoldLogs: async () => {}, loadEnergyLogs: async () => {},
  TEACHER_UPDATE_EVENTS, createTeacherResourceRewardUpdate, broadcastStudentTeacherUpdate,
  client: { ...makeBroadcaster(), rpc: async () => ({ data: grantResult, error: null }) },
  console: { error() {} },
}
const { handleGrantGold, handleGrantEnergy } = vm.runInNewContext([
  between(teacherSource, '  const notifyStudentTeacherUpdate =', '  const filteredStudents ='),
  between(teacherSource, '  const handleGrantGold =', '  const handleUpdatePlaytimeLimit ='),
  '({ handleGrantGold, handleGrantEnergy })',
].join('\n'), teacherContext)

grantResult = { success: true, goldBefore: 1000, goldAfter: 1500, message: 'Granted' }
await handleGrantGold()
assert.equal(sent.at(-1).payload.resourceReward.goldDelta, 500)
assert.equal(queue.length, 4)
grantResult = { success: true, maxEnergyBefore: 15, maxEnergyAfter: 18, message: 'Granted' }
await handleGrantEnergy()
assert.equal(sent.at(-1).payload.resourceReward.maxEnergyDelta, 3)
assert.equal(queue.length, 5)
grantResult = { success: true, maxEnergyBefore: 18, maxEnergyAfter: 8, message: 'Cap lowered' }
await handleGrantEnergy()
assert.equal(sent.at(-1).payload.resourceReward, undefined, 'Lowering the cap does not award a gift')
assert.equal(queue.length, 5)

const sentBeforeFailedGrant = sent.length
grantResult = { success: false, error: 'Grant rejected' }
await handleGrantGold()
await handleGrantEnergy()
assert.equal(sent.length, sentBeforeFailedGrant, 'Rejected grants must not broadcast rewards')
assert.equal(teacherMessages.at(-1).type, 'error')
assert.equal(queue.length, 5)

assert.equal(await broadcastStudentTeacherUpdate(makeBroadcaster('CHANNEL_ERROR'), 'audit-student', TEACHER_UPDATE_EVENTS.resourcesChanged, teacherGold), false)
assert.equal(sent.length, sentBeforeFailedGrant)
assert.equal(await broadcastStudentTeacherUpdate(makeBroadcaster(), 'audit-student', TEACHER_UPDATE_EVENTS.rewardsChanged, teacherGold), true)
assert.equal(sent.at(-1).payload.resourceReward, undefined, 'Resource grants must not leak into other event types')
assert.equal(removedChannels, sent.length + 1)
cleanup()
assert.equal(timers.size, 0, 'Subscription teardown clears deferred refreshes')

console.log(JSON.stringify({
  ok: true,
  checked: [
    'training and ordinary income without teacher gifts',
    'legacy, malformed, and missing resource notices',
    'teacher amount isolated from simultaneous training gold',
    'duplicate and consecutive teacher grants',
    'teacher gold and energy-cap grant handlers',
    'failed grants, refreshes, and broadcasts',
    'broadcast channel and timer cleanup',
  ],
}, null, 2))
