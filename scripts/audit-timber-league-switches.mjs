#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import { withViteAuditServer } from './load-vite-module.mjs'

const traverse = traverseModule.default || traverseModule
const source = readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
let switchCallback
traverse(parse(source, { sourceType: 'module', plugins: ['jsx'] }), {
  VariableDeclarator(path) {
    if (path.node.id.name === 'runEnemyTrainerSwitch') switchCallback = path.node.init.arguments[0]
  },
})
assert(switchCallback, 'Use the production switch transaction')

await withViteAuditServer(async ({ loadModule }) => {
  const { recordTimberLeagueEnemySwitch, normalizeTimberLeagueBattle,
    canTimberLeagueEnemySwitch, trackTimberLeagueTransition } = await loadModule('/src/game/timberLeague.js')
  const makeHarness = (environment, logs = []) => {
    let snapshot = {
      view: 'battle', battlePhase: 'active', turn: 'resolving', activeEnemyId: 'a',
      battleEnvironment: environment, logs,
      enemyTeam: ['a', 'b'].map(id => ({ id, name: id, currentHp: 100 })),
    }
    const logsRef = { current: [...logs] }
    let failNext = false
    let writes = 0
    const context = {
      battleKind: 'trainer', battleEnvironment: environment, user: { id: 'audit' }, hasLoadedCloudSave: true,
      logsRef, recordTimberLeagueEnemySwitch, hasBattleHp: mon => mon.currentHp > 0,
      addLog: message => logsRef.current.push(message), addNotification() {}, setSwitchVisualEvent() {},
      setActiveEnemyId() {}, setBattlePhase() {}, setBattlePhaseData() {},
      BATTLE_SWITCH_RECALL_MS: 0, BATTLE_SWITCH_SEND_MS: 0, wait: async () => {},
      withBattleRuntimeDefaults: mon => mon, resolveTrackedActiveBattleEnergyCost: () => 2,
      abortCloudSnapshotCommit: message => ({ aborted: true, message }),
      hydrateCommittedBattleSnapshot: input => ({ snapshot: input, battleEnvironment: input.battleEnvironment }),
      commitCloudSnapshot: async ({ buildSnapshot }) => {
        const next = buildSnapshot(snapshot)
        if (next.aborted) return { success: false, message: next.message }
        if (failNext) { failNext = false; return { success: false, message: '模拟保存失败' } }
        snapshot = JSON.parse(JSON.stringify(trackTimberLeagueTransition(snapshot, next)))
        if (snapshot.battleEnvironment.timberLeague) {
          snapshot.battleEnvironment.timberLeague = normalizeTimberLeagueBattle(snapshot.battleEnvironment.timberLeague)
        }
        logsRef.current = [...snapshot.logs]
        writes++
        return { success: true }
      },
    }
    const switchEnemy = vm.runInNewContext(`(${source.slice(switchCallback.start, switchCallback.end)})`, context)
    return {
      snapshot: () => snapshot, writes: () => writes, logs: () => logsRef.current,
      fail: () => { failNext = true },
      switch: (from = snapshot.activeEnemyId) => switchEnemy({
        enemyMon: snapshot.enemyTeam.find(mon => mon.id === from),
        nextEnemy: snapshot.enemyTeam.find(mon => mon.id !== from), playerMon: { id: 'player' },
      }),
    }
  }
  const league = { timberLeague: { runId: 'audit', routeKey: 'training', stage: 1, enemySwitches: 0 } }
  const current = makeHarness(league)
  assert.equal((await current.switch()).switched, true)
  assert.equal(current.snapshot().battleEnvironment.timberLeague.enemySwitches, 1)
  // Retry from the old actor must not add a second switch or another recall.
  assert.equal((await current.switch('a')).commitFailed, true)
  assert.equal(current.writes(), 1)
  current.fail()
  assert.equal((await current.switch()).commitFailed, true)
  assert.equal(current.logs().filter(log => log.startsWith('对手收回了 ')).length, 1)
  assert.equal(current.snapshot().battleEnvironment.timberLeague.enemySwitches, 1)
  assert.equal((await current.switch()).switched, true)
  assert.equal(current.snapshot().battleEnvironment.timberLeague.enemySwitches, 2)
  assert.equal((await current.switch()).commitFailed, true)
  assert.equal(current.writes(), 2)
  assert.equal(current.logs().filter(log => log.startsWith('对手收回了 ')).length, 2)

  const old = makeHarness({ timberLeague: { runId: 'legacy', routeKey: 'training', stage: 1 } }, [
    '对手收回了 前任！', '对手派出了 a！',
  ])
  old.fail()
  await old.switch()
  assert.equal(canTimberLeagueEnemySwitch(old.snapshot().battleEnvironment, old.logs()), true)
  assert.equal((await old.switch()).switched, true)
  assert.equal(old.snapshot().battleEnvironment.timberLeague.enemySwitches, 2)
  assert.equal(canTimberLeagueEnemySwitch(old.snapshot().battleEnvironment, []), false)

  const ordinary = makeHarness({ eventRole: 'boss' })
  for (let i = 0; i < 3; i++) assert.equal((await ordinary.switch()).switched, true)
  assert.equal(ordinary.writes(), 3)
  console.log(JSON.stringify({ ok: true, checked: [
    'production callback persists exactly two switches', 'stale actor replay rejected',
    'failed cloud writes add neither budget nor recall logs', 'legacy counter migration survives reload',
    'ordinary trainer switching is unaffected',
  ] }, null, 2))
})
