import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MONSTERS } from '../src/utils/gameData.js'
import { isLevelValidForSpecies } from '../src/utils/wildEncounterRules.js'
import {
  POKEMON_BREEDER_MAP_ID,
  createPokemonBreederState,
  getPokemonBreederOfferPrice,
  getPokemonBreederRefreshPrice,
  getPokemonBreederState,
  isPokemonBreederSpeciesUnlocked,
  refreshPokemonBreederDailyState,
  setPokemonBreederOfferLock
} from '../src/utils/pokemonBreeder.js'
import { withViteAuditServer } from './load-vite-module.mjs'
import { saveCloudGameWithLock } from '../src/utils/cloudSaveLock.js'

const today = '2026-09-30'
const state = createPokemonBreederState(today, MONSTERS, 0, () => 0.5)
assert.equal(state.offers.length, 3)
assert.equal(new Set(state.offers.map((offer) => offer.pokemonId)).size, 3)
for (const offer of state.offers) {
  assert.ok(offer.level >= 75 && offer.level <= 85)
  assert.ok(isLevelValidForSpecies(offer.pokemonId, offer.level))
  assert.ok(offer.price >= 50000 && offer.price <= 100000)
  assert.ok(Math.abs(offer.price - getPokemonBreederOfferPrice(offer.level, () => 0.5)) <= 2000)
  assert.equal(offer.purchased, false)
  assert.equal(offer.locked, false)
}
assert.ok(getPokemonBreederOfferPrice(75, () => 0.5) < getPokemonBreederOfferPrice(80, () => 0.5))
assert.ok(getPokemonBreederOfferPrice(80, () => 0.5) < getPokemonBreederOfferPrice(85, () => 0.5))
assert.equal(getPokemonBreederOfferPrice(80, () => 0), 73000)
assert.equal(getPokemonBreederOfferPrice(80, () => 0.9999), 77000)
assert.equal(getPokemonBreederState({ pokemonBreeder: state }, today), state)
assert.equal(getPokemonBreederState({ pokemonBreeder: state }, '2026-10-01'), null)
assert.equal(getPokemonBreederRefreshPrice(state), 200)
assert.equal(getPokemonBreederRefreshPrice({ refreshCount: 1 }), 400)
assert.equal(getPokemonBreederRefreshPrice({ refreshCount: 2 }), 800)
assert.equal(getPokemonBreederRefreshPrice({ refreshCount: 24 }), null)

const tomorrow = createPokemonBreederState('2026-10-01', MONSTERS, 0, () => 0.75)
assert.equal(getPokemonBreederRefreshPrice(tomorrow), 200)
assert.notDeepEqual(tomorrow.offers, state.offers)

const unlockedDex = { registeredSpeciesKeys: [`dex:${MONSTERS[0].dexNo}`] }
const filteredState = createPokemonBreederState('2026-10-01', MONSTERS, 0, () => 0, [], unlockedDex)
assert.equal(filteredState, null, 'Fewer than three unlocked species cannot create a full offer list')
const threeUnlockedDex = { registeredSpeciesKeys: state.offers.map((offer) => `dex:${MONSTERS.find((monster) => monster.id === offer.pokemonId).dexNo}`) }
const threeUnlockedState = createPokemonBreederState('2026-10-01', MONSTERS, 0, () => 0, [], threeUnlockedDex)
assert.equal(threeUnlockedState.offers.length, 3)
assert(threeUnlockedState.offers.every((offer) => isPokemonBreederSpeciesUnlocked(MONSTERS.find((monster) => monster.id === offer.pokemonId), threeUnlockedDex)))

const source = fs.readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const between = (startText, endText) => {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start + startText.length)
  assert(start >= 0 && end > start, startText)
  return source.slice(start, end)
}
const lockedState = setPokemonBreederOfferLock(state, state.offers[0].id, true)
assert.equal(state.offers[0].locked, false, 'No optimistic or in-place lock mutation')
assert.equal(setPokemonBreederOfferLock(state, 'missing', true), null)
assert.equal(setPokemonBreederOfferLock(state, state.offers[0].id, 'true'), null)
assert.equal(setPokemonBreederOfferLock({ ...state, offers: [{ ...state.offers[0], purchased: true }] }, state.offers[0].id, true), null)
assert.equal(refreshPokemonBreederDailyState(lockedState, today, MONSTERS), lockedState)

let persisted = JSON.parse(JSON.stringify(lockedState))
for (const dayKey of ['2026-10-01', '2026-10-02', '2026-10-08']) {
  persisted = refreshPokemonBreederDailyState(persisted, dayKey, MONSTERS, () => 0.75)
  assert.deepEqual(persisted.offers[0], lockedState.offers[0], 'Keep locked species, level, price and ID through multiple days')
  assert(persisted.offers.slice(1).every((offer) => offer.id.startsWith(dayKey) && !offer.locked && !offer.purchased))
  assert.equal(new Set(persisted.offers.map((offer) => offer.pokemonId)).size, 3, 'Daily replacements must not duplicate a locked species')
  assert.equal(persisted.refreshCount, 0)
  assert.equal(getPokemonBreederRefreshPrice(persisted), 200)
}
const allLocked = { ...state, refreshCount: 5, offers: state.offers.map((offer) => ({ ...offer, locked: true })) }
const allKept = refreshPokemonBreederDailyState(allLocked, tomorrow.dayKey, MONSTERS, () => 0.75)
assert.deepEqual(allKept.offers, allLocked.offers)
assert.equal(allKept.refreshCount, 0, 'Even all-locked days reset daily refresh prices')
const unlocked = setPokemonBreederOfferLock(persisted, persisted.offers[0].id, false)
assert(refreshPokemonBreederDailyState(unlocked, '2026-10-09', MONSTERS).offers.every((offer) => !offer.locked && offer.id.startsWith('2026-10-09')))
const soldLock = { ...lockedState, offers: lockedState.offers.map((offer) => ({ ...offer, purchased: true })) }
assert(refreshPokemonBreederDailyState(soldLock, tomorrow.dayKey, MONSTERS).offers.every((offer) => !offer.locked && !offer.purchased))
const legacyState = { ...state, offers: state.offers.map(({ locked, ...offer }) => offer) }
assert(refreshPokemonBreederDailyState(legacyState, tomorrow.dayKey, MONSTERS).offers.every((offer) => !offer.locked))
assert.equal(refreshPokemonBreederDailyState(null, tomorrow.dayKey, MONSTERS).offers.length, 3)

// Execute the production callbacks against a serialized save and atomic resource boundary.
const runMutation = async (action, { initial = lockedState, dayKey = today, gold = 300000, fail = false, busy = false, bossCompleted = true, offerId = initial.offers[0].id, locked = true, rpcBoundary = false, online = true } = {}) => {
  let snapshot = { world: { pokemonBreeder: initial, dexProgress: { registeredSpeciesKeys: MONSTERS.map((monster) => `dex:${monster.dexNo}`) }, unrelatedProgress: ['kept'] }, playerTeam: [], storageBox: [], logs: [], nextPlayerMonsterId: 100 }
  let balance = gold
  let writes = 0
  const notifications = []
  const rpcCalls = []
  const original = JSON.stringify(snapshot)
  const commit = async ({ buildSnapshot, goldDelta = 0 }) => {
    const next = buildSnapshot(JSON.parse(JSON.stringify(snapshot)))
    assert.equal(JSON.stringify(snapshot), original, 'Unaccepted operation cannot alter the saved state')
    if (next.__cloudSnapshotCommitAborted) return { success: false, ...next }
    const delta = typeof goldDelta === 'function' ? goldDelta(next) : goldDelta
    if (fail || balance + delta < 0) return { success: false, message: 'audit backend rejected' }
    snapshot = JSON.parse(JSON.stringify(next))
    balance += delta
    writes += 1
    return { success: true }
  }
  const context = {
    MONSTERS, POKEMON_BREEDER_MAP_ID, createPokemonBreederState, getPokemonBreederState,
    getPokemonBreederRefreshPrice, isPokemonBreederSpeciesUnlocked, refreshPokemonBreederDailyState, setPokemonBreederOfferLock,
    useCallback: (fn) => fn, hasLoadedCloudSave: true, user: { id: 'audit' },
    breederMutationInFlightRef: { current: busy }, worldRef: { current: snapshot.world },
    hasCompletedBossEvent: () => bossCompleted, getCurrentDailyRefreshKey: () => dayKey,
    commitCloudSnapshot: commit, commitCloudSnapshotWithResources: commit, setBreederBusy() {},
    addNotification: (...args) => notifications.push(args), gameAudio: { playUiConfirm() {}, playItemUse() {} },
    appendSnapshotLogs: (base, logs) => [...base.logs, ...logs],
    createMonsterInstance: (base, level, id) => ({ ...base, level, id }),
    acquireMonster: (roster, monster) => ({ ...roster, playerTeam: [...roster.playerTeam, monster], success: true, outcome: 'team' }),
    addToStorage: () => { throw new Error('Unexpected storage fallback') }
  }
  if (rpcBoundary) {
    Object.assign(context, {
      navigator: { onLine: online }, saveCloudGameWithLock,
      requiresCloudReloadRef: { current: false }, cloudMutationGenerationRef: { current: 1 },
      cloudSaveRevisionRef: { current: 7 }, cloudSaveSessionIdRef: { current: 'audit-session' },
      playtimeSessionIdRef: { current: 'audit-lease' }, playtimeLastSessionIdRef: { current: null },
      cloudSaveInFlightRef: { current: false }, lastSavedSnapshotRef: { current: original },
      latestCloudSnapshotRef: { current: JSON.parse(original) }, currentGameData: JSON.parse(original),
      CLOUD_SAVE_SYNC_META_KEY: '_sync', CLOUD_SYNC_CONFLICT_MESSAGE: 'revision conflict',
      readCloudSnapshotFromString: JSON.parse,
      mergeMonotonicSnapshotProgress: (saved, latest) => latest,
      trackTimberLeagueTransition: (base, next) => next,
      createCloudSnapshot: (next) => JSON.parse(JSON.stringify(next)),
      runCloudRequestWithRetry: (request) => request(),
      setIsOnline() {}, setSyncError() {}, setSaveStatus() {}, setRequiresCloudReload() {},
      markCloudSaveConflict() {}, markPlaytimeExpiredFromServer() {}, markPlaytimeSessionUnavailable() {},
      isPlaytimeLimitError: () => false, isPlaytimeSessionError: () => false,
      isCloudSyncConflict: () => false, waitForCloudSaveIdle() {},
      applyLocalCommittedCloudSnapshot() { throw new Error('Unexpected local fallback') },
      markSnapshotCommitted() { throw new Error('Unexpected callback fallback') },
      applyCommittedCloudState: (row) => {
        snapshot = JSON.parse(JSON.stringify(row.game_data))
        context.cloudSaveRevisionRef.current = row.save_revision
        context.latestCloudSnapshotRef.current = snapshot
        context.lastSavedSnapshotRef.current = JSON.stringify(snapshot)
      },
      supabase: { rpc: async (name, params) => {
        rpcCalls.push({ name, params: JSON.parse(JSON.stringify(params)) })
        assert.equal(JSON.stringify(snapshot), original, 'Local state stays unchanged before server acceptance')
        assert.equal(params.p_user_id, 'audit')
        assert.equal(params.p_game_data._sync.revision, 8)
        assert.equal(params.p_game_data._sync.playtimeSessionId, 'audit-lease')
        const delta = name === 'save_cloud_game_state_with_resources' ? params.p_gold_delta : 0
        if (fail || balance + delta < 0) {
          return { data: [{ accepted: false, error_message: 'audit backend rejected' }], error: null }
        }
        balance += delta
        writes += 1
        return { data: [{ accepted: true, game_data: params.p_game_data, save_revision: 8 }], error: null }
      } }
    })
  }
  const handlers = vm.runInNewContext([
    between('const abortCloudSnapshotCommit =', 'const isAbortedCloudSnapshotCommit ='),
    ...(rpcBoundary ? [
      between('const isAbortedCloudSnapshotCommit =', 'const '),
      between('const withCloudSaveMeta =', 'const normalizePlayerPositionDraft ='),
      between('  const commitCloudSnapshotWithResources =', '  const claimLongTermProgressionReward =')
    ] : []),
    between('  const ensurePokemonBreederOffers =', '  useEffect(() => {\n    if (view !== \'pokemonBreeder\''),
    '({ ensurePokemonBreederOffers, handlePokemonBreederLock, handlePokemonBreederRefresh, handlePokemonBreederPurchase })'
  ].join('\n'), context)
  if (action === 'daily') await handlers.ensurePokemonBreederOffers()
  if (action === 'lock') await handlers.handlePokemonBreederLock(offerId, locked)
  if (action === 'refresh') await handlers.handlePokemonBreederRefresh()
  if (action === 'purchase') await handlers.handlePokemonBreederPurchase(offerId)
  assert.deepEqual(snapshot.world.unrelatedProgress, ['kept'])
  assert.equal(context.breederMutationInFlightRef.current, busy)
  return { snapshot, balance, writes, notifications, rpcCalls }
}

const dailyResult = await runMutation('daily', { dayKey: tomorrow.dayKey })
assert.deepEqual(dailyResult.snapshot.world.pokemonBreeder.offers[0], lockedState.offers[0])
assert.equal(dailyResult.writes, 1)
assert.equal((await runMutation('daily')).writes, 0, 'Reopening on the same day must not reroll offers')
const lockResult = await runMutation('lock', { initial: legacyState })
assert.equal(lockResult.snapshot.world.pokemonBreeder.offers[0].locked, true)
assert.equal(lockResult.balance, 300000, 'Locking costs no resources')
const unlockedResult = await runMutation('lock', { locked: false })
assert.equal(unlockedResult.snapshot.world.pokemonBreeder.offers[0].locked, false)
assert.equal((await runMutation('lock', { dayKey: tomorrow.dayKey })).snapshot.world.pokemonBreeder.offers[0].locked, true, 'Locked IDs remain actionable at midnight')
assert.equal((await runMutation('lock', { initial: state, dayKey: tomorrow.dayKey })).writes, 0, 'Old unlocked IDs cannot lock replacements')
assert.equal((await runMutation('lock', { offerId: 'missing' })).writes, 0)
const refreshed = await runMutation('refresh')
assert(refreshed.snapshot.world.pokemonBreeder.offers.every((offer) => !offer.locked))
assert.equal(refreshed.balance, 299800)
assert.equal(refreshed.snapshot.world.pokemonBreeder.refreshCount, 1)
const midnightRefresh = await runMutation('refresh', { initial: allLocked, dayKey: tomorrow.dayKey })
assert.equal(midnightRefresh.balance, 299800, 'Midnight refresh uses the new day\'s price')
assert(midnightRefresh.snapshot.world.pokemonBreeder.offers.every((offer) => !offer.locked))
const purchased = await runMutation('purchase', { dayKey: tomorrow.dayKey })
assert.equal(purchased.snapshot.world.pokemonBreeder.offers[0].purchased, true)
assert.equal(purchased.snapshot.world.pokemonBreeder.offers[0].locked, false)
assert.equal(purchased.snapshot.playerTeam[0].level, lockedState.offers[0].level)
assert.equal(purchased.balance, 300000 - lockedState.offers[0].price)
for (const action of ['lock', 'daily', 'refresh', 'purchase']) {
  for (const options of [{ fail: true, dayKey: tomorrow.dayKey }, { busy: true }, { bossCompleted: false, dayKey: tomorrow.dayKey }]) {
    const result = await runMutation(action, options)
    assert.equal(result.writes, 0, `${action}: rejected operation must not persist changes`)
    assert.deepEqual(result.snapshot.world.pokemonBreeder, lockedState)
    assert.equal(result.balance, 300000)
  }
}
for (const action of ['refresh', 'purchase']) {
  const result = await runMutation(action, { gold: 0 })
  assert.equal(result.writes, 0)
  assert.deepEqual(result.snapshot.world.pokemonBreeder, lockedState, 'Insufficient gold keeps locks and inventory')
}

// Follow the real committers to the RPC boundary without touching any account.
const rpcLocked = await runMutation('lock', { initial: legacyState, rpcBoundary: true })
assert.equal(rpcLocked.rpcCalls[0].name, 'save_cloud_game_save')
assert.equal(rpcLocked.rpcCalls[0].params.p_game_data.world.pokemonBreeder.offers[0].locked, true)
assert.equal(rpcLocked.snapshot.world.pokemonBreeder.offers[0].locked, true)
const rpcDaily = await runMutation('daily', { dayKey: tomorrow.dayKey, rpcBoundary: true })
assert.deepEqual(rpcDaily.snapshot.world.pokemonBreeder.offers[0], lockedState.offers[0])
for (const action of ['refresh', 'purchase']) {
  const result = await runMutation(action, { rpcBoundary: true })
  assert.equal(result.rpcCalls[0].name, 'save_cloud_game_state_with_resources')
  assert.equal(result.rpcCalls[0].params.p_gold_delta, action === 'refresh' ? -200 : -lockedState.offers[0].price)
  assert.equal(result.rpcCalls[0].params.p_energy_delta, 0)
  assert.equal(result.snapshot.world.pokemonBreeder.offers[0].locked, false)
}
for (const action of ['lock', 'daily', 'refresh', 'purchase']) {
  for (const options of [{ fail: true }, { online: false }]) {
    const result = await runMutation(action, { ...options, dayKey: tomorrow.dayKey, rpcBoundary: true })
    assert.equal(result.writes, 0)
    assert.deepEqual(result.snapshot.world.pokemonBreeder, lockedState)
    assert.equal(result.balance, 300000)
    if (!options.online && !options.fail) assert.equal(result.rpcCalls.length, 0)
  }
}
const rpcPoor = await runMutation('refresh', { gold: 0, rpcBoundary: true })
assert.equal(rpcPoor.writes, 0)
assert.deepEqual(rpcPoor.snapshot.world.pokemonBreeder, lockedState)

await withViteAuditServer(async ({ loadModule }) => {
  const { GODOT_REGION_MAPS } = await loadModule('/src/game/data/godotMaps/godot_region_maps.js')
  const event = GODOT_REGION_MAPS[POKEMON_BREEDER_MAP_ID].runtimeEvents.find((entry) => entry.id === 'npc_peak_pokemon_breeder')
  assert.equal(event?.type, 'merchant')
  assert.equal(event?.properties?.shopMode, 'pokemon_breeder')
  const { default: PokemonBreederScreen } = await loadModule('/src/components/Game/PokemonBreederScreen.jsx')
  const html = renderToStaticMarkup(React.createElement(PokemonBreederScreen, { state: lockedState, playerGold: 300000 }))
  assert(html.includes('只会出现已解锁的宝可梦'))
  assert(html.includes('价格只看宝可梦等级，不看你的金币数量'))
  assert(html.includes('每天只换未锁定的，手动刷新会全部换新并解除锁定。'))
  assert(html.includes('aria-pressed="true"'))
  assert(html.includes('已锁定'))
  assert(html.includes('全部刷新'))
  const busyHtml = renderToStaticMarkup(React.createElement(PokemonBreederScreen, { state: lockedState, playerGold: 300000, busy: 'refresh' }))
  assert.match(busyHtml, /<button[^>]*disabled=""[^>]*aria-pressed="true"/)
})

console.log('Pokemon breeder audit passed.')
