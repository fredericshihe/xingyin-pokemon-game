#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { withViteAuditServer } from './load-vite-module.mjs'

const source = fs.readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const between = (start, end) => {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert(from >= 0 && to > from, `Missing runtime hook: ${start}`)
  return source.slice(from, to)
}
const handler = source.match(/const handleUseExpPotion = useCallback\((async [\s\S]*?\n  }), \[/)?.[1]
assert(handler, 'Use the actual cloud-backed item handler')

await withViteAuditServer(async ({ loadModule }) => {
  const [data, progress, experience, inventory, balance] = await Promise.all([
    loadModule('/src/utils/gameData.js'), loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/officialExperience.js'), loadModule('/src/utils/inventoryItems.js'),
    loadModule('/src/utils/gameBalance.js'),
  ])
  const { MONSTERS, EXP_POTIONS } = data
  const { getExpPotionExpAmount, simulateMonsterExpGain } = progress
  const superPotion = EXP_POTIONS.exp_potion_super
  const baseFor = (id) => MONSTERS.find((mon) => mon.id === Number(id))
  const makeMon = (base, level, currentExp = 0) => ({
    ...base, id: 'potion-target', baseId: base.id, level, currentExp,
    expToNextLevel: 1, moves: ['tackle'],
  })
  const groups = new Map(MONSTERS.map((mon) => [experience.getOfficialGrowthRate(mon), mon]))
  let levelCases = 0
  for (const [group, base] of groups) {
    for (let level = 1; level < 100; level++) {
      const threshold = experience.getOfficialExpToNextLevel(level, base)
      for (const currentExp of [0, Math.floor(threshold / 2), threshold - 1]) {
        const mon = makeMon(base, level, currentExp)
        const amount = getExpPotionExpAmount(mon, superPotion)
        assert.equal(amount, threshold - currentExp, `${group} Lv.${level}: canonical remaining EXP`)
        const result = simulateMonsterExpGain(mon, amount)
        assert.equal(result.updatedMon.level, level + 1)
        assert.equal(result.updatedMon.currentExp, 0)
        assert.equal(result.levelUps.length, 1)
        assert.equal(mon.level, level, 'Do not mutate the target before persistence succeeds')
        levelCases++
      }
    }
  }
  assert.equal(groups.size, 6, 'Cover all six official growth curves')
  const base = MONSTERS.find((mon) => mon.name === '皮卡丘')
  assert.equal(getExpPotionExpAmount(makeMon(base, 100), superPotion), 0)
  const overflow = makeMon(base, 30, experience.getOfficialExpToNextLevel(30, base) + 5)
  assert.equal(getExpPotionExpAmount(overflow, superPotion), 0, 'Repair existing overflow without consuming a potion')
  for (const potion of Object.values(EXP_POTIONS).filter((item) => item.expAmount)) {
    assert.equal(getExpPotionExpAmount(makeMon(base, 50, 300), potion), potion.expAmount)
  }
  for (const [name, level, eventType] of [['小火龙', 15, 'evolution'], ['伊布', 29, 'evolutionChoice']]) {
    const mon = makeMon(MONSTERS.find((entry) => entry.name === name), level)
    const amount = getExpPotionExpAmount(mon, superPotion)
    const result = simulateMonsterExpGain(mon, amount)
    assert(result.events.some((event) => event.type === eventType), `${name}: preserve evolution`)
    const repeated = simulateMonsterExpGain(mon, amount, null, result.events)
    assert.equal(repeated.events.length, 0, 'Do not duplicate queued evolution or move-learning events')
  }
  let moveLearningVerified = false
  for (let level = 5; level < 40 && !moveLearningVerified; level++) {
    const mon = makeMon(base, level)
    const result = simulateMonsterExpGain(mon, getExpPotionExpAmount(mon, superPotion))
    moveLearningVerified = result.events.some((event) => event.type === 'learnMove')
  }
  assert(moveLearningVerified, 'Direct level gain must still offer newly learned moves')

  // Exercise the real handler with stale UI state and an independently updated cloud snapshot.
  const runUse = async ({ uiLevel = 5, level = 50, currentExp = 123, quantity = 2,
    view = 'map', snapshotView = 'map', failSave = false, missing = false, ready = true,
    itemKey = 'exp_potion_super' } = {}) => {
    const snapshot = {
      playerTeam: missing ? [] : [makeMon(base, level, currentExp)],
      playerInventory: [{ itemType: 'expPotion', itemKey, quantity }],
      pendingGrowthEvents: [], logs: [], view: snapshotView,
    }
    const before = structuredClone(snapshot)
    let committed = snapshot
    let celebrations = 0
    let loggedUses = 0
    const context = {
      ...inventory, getExpPotionExpAmount, simulateMonsterExpGain, EXP_POTIONS,
      getBaseMonsterDefinition: baseFor,
      playerTeam: [makeMon(base, uiLevel)],
      playerInventory: [{ itemType: 'expPotion', itemKey, quantity: 2 }],
      view, user: { id: 'audit' }, hasLoadedCloudSave: ready,
      EXP_ANIMATION_DURATION_MS: 0,
      addNotification: () => {}, addLog: () => {},
      gameAudio: { playError() {}, playItemUse() {} },
      holdGrowthModalsForItemAnimation: () => () => {},
      appendSnapshotLogs: (state, logs) => [...state.logs, ...logs],
      recordGameLog: () => { loggedUses++ },
      scheduleLevelUpCelebration: () => { celebrations++ },
      commitCloudSnapshot: async ({ buildSnapshot }) => {
        const next = buildSnapshot(snapshot)
        assert.deepEqual(snapshot, before, 'Building a transaction must not mutate the current save')
        if (next.__cloudSnapshotCommitAborted) return { success: false, ...next }
        if (failSave) return { success: false, message: 'Simulated save failure' }
        committed = next
        return { success: true }
      },
    }
    const use = vm.runInNewContext([
      between('const buildEvolutionEventKey =', 'const CLOUD_SYNC_CONFLICT_MESSAGE ='),
      between('const abortCloudSnapshotCommit =', 'const isAbortedCloudSnapshotCommit ='),
      between('const consumeInventoryFromSnapshot =', 'const getDefaultWorldPosition ='),
      between('const normalizePendingGrowthEvents =', 'const resolvePendingGrowthEventHead ='),
      `(${handler})`,
    ].join('\n'), context)
    const result = await use('potion-target', itemKey)
    if (!result) {
      assert.equal(committed, snapshot)
      assert.equal(celebrations, 0)
      assert.equal(loggedUses, 0)
    }
    return { result, committed }
  }
  const fresh = await runUse()
  assert.equal(fresh.committed.playerTeam[0].level, 51, 'Calculate from cloud Lv.50, not UI Lv.5')
  assert.equal(fresh.result.expAmount, experience.getOfficialExpToNextLevel(50, base) - 123)
  assert.equal(inventory.getInventoryItemQuantity(fresh.committed.playerInventory, 'expPotion', 'exp_potion_super'), 1)
  const cap = await runUse({ level: 99 })
  assert.equal(cap.committed.playerTeam[0].level, 100)
  assert.equal(cap.committed.playerTeam[0].currentExp, 0)
  const blockedCases = [
    { level: 100 }, { uiLevel: 100 }, { quantity: 0 }, { missing: true },
    { view: 'battle' }, { snapshotView: 'battle' }, { ready: false }, { failSave: true },
    { level: 30, currentExp: experience.getOfficialExpToNextLevel(30, base) + 5 },
  ]
  for (const options of blockedCases) assert.equal((await runUse(options)).result, false)
  const ordinary = await runUse({ itemKey: 'exp_potion_small' })
  assert.equal(ordinary.result.expAmount, 90)
  assert.equal(ordinary.committed.playerTeam[0].currentExp, 213)
  assert.equal(inventory.getExpPotionEffectText(superPotion), '直接升1级')
  assert.equal(superPotion.price, 2000)
  assert.match(balance.getItemRewardWarning({ itemKey: 'exp_potion_super', quantity: 1 }), /直接提升1级/)
  console.log(JSON.stringify({ ok: true, growthCurves: groups.size, levelCases, blockedTransactions: blockedCases.length,
    checked: ['canonical EXP and exactly one level', 'max level', 'evolution and move learning', 'pending event deduplication',
      'ordinary potions', 'fresh cloud state', 'failed save and depleted stock', 'battle guards', 'teacher reward wording'] }, null, 2))
})
