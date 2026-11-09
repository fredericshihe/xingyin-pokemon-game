#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import vm from 'node:vm'
import { parse } from '@babel/parser'
import traverseModule from '@babel/traverse'
import { withViteAuditServer } from './load-vite-module.mjs'

const traverse = traverseModule.default || traverseModule
const SAMPLES = Number(process.env.TIMBER_TACTICS_SAMPLES || 1000)
assert(Number.isInteger(SAMPLES) && SAMPLES > 0)
const OUTPUT = process.env.TIMBER_TACTICS_OUTPUT || 'reports/timber-league/tactical-lv80.json'
const LEVEL = 80
const SCENARIOS = [
  { key: 'random-no-potions', targeted: false, switching: false, potions: 0 },
  { key: 'targeted-no-potions', targeted: true, switching: false, potions: 0 },
  { key: 'targeted-switch-no-potions', targeted: true, switching: true, potions: 0 },
  { key: 'targeted-switch-one-max-potion', targeted: true, switching: true, potions: 1 },
  { key: 'targeted-switch-two-max-potions', targeted: true, switching: true, potions: 2 },
]
const makeRandom = (seed) => {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}
const mean = (values) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
const rounded = (value) => value == null ? null : Math.round(value * 100) / 100
const quantile = (values, portion) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * portion)] : null
}

// Execute production callbacks unchanged, replacing only animation, sound and persistence.
async function loadBattleRuntime(rootDir, loadModule, state) {
  const source = readFileSync(resolve(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] })
  const declarations = new Map()
  const imports = new Map()
  const overrides = {
    normalizeMonsterAssetSource: (mon) => mon,
    getMoveEffectConfig: () => ({}),
    getBattleCinematicProfile: () => ({ durationMs: 0 }),
    getBattleMovePhaseDuration: () => 0,
    getBattleMoveImpactDelay: () => 0,
    getBattleLogReadDelay: () => 0,
    buildBattleImpactFeedback: () => null,
    wait: async () => {},
    addBattleLogAndWait: async (addLog, message) => addLog(message),
    waitForBattleMoveVisual: async (key, side, phase, options) => options.onImpact?.(),
    addLog: (message) => state.logs.push(message),
    setPlayerTeam: (updater) => { state.party = updater(state.party) },
    setEnemyTeam: (updater) => { state.enemies = updater(state.enemies) },
    battleEnvironment: {},
    battleEscapeRule: { canRun: false, blockedReason: '训练赛不能逃跑' },
    gameAudio: { playBattleStatus() {}, playBattleImpact() {} },
  }
  traverse(ast, {
    VariableDeclarator(path) {
      if (path.node.id.type !== 'Identifier') return
      const { name } = path.node.id
      if (path.parentPath.parentPath.isProgram()) declarations.set(name, path)
      if (name === 'executeBattleMove') declarations.set(name, path.get('init.arguments.0'))
    },
    FunctionDeclaration(path) {
      if (path.parentPath.isProgram()) declarations.set(path.node.id.name, path)
    },
    ImportDeclaration(path) {
      for (const spec of path.node.specifiers) imports.set(spec.local.name, {
        from: path.node.source.value,
        member: spec.type === 'ImportSpecifier' ? spec.imported.name : 'default',
      })
    },
  })
  const selected = new Map()
  const importedNames = new Set()
  const select = (name) => {
    if (name in overrides || selected.has(name)) return
    if (imports.has(name)) { importedNames.add(name); return }
    const path = declarations.get(name)
    if (!path) return
    selected.set(name, path)
    path.traverse({ ReferencedIdentifier(ref) {
      const binding = ref.scope.getBinding(ref.node.name)
      if (binding && binding.path.node.start >= path.node.start && binding.path.node.end <= path.node.end) return
      select(ref.node.name)
    } })
  }
  const exports = ['executeBattleMove', 'resolveTurnStart', 'resolveTurnEnd', 'clearTemporaryBattleRuntime',
    'determineBattleActionOrder', 'determineBattleEndOfTurnSideOrder', 'getDynamicBattleMovePower', 'getMoveMpCost']
  exports.forEach(select)
  const context = { ...overrides, Math, console }
  for (const name of importedNames) {
    const entry = imports.get(name)
    const modulePath = resolve(rootDir, 'src/components/Game', entry.from)
    const moduleId = `/${modulePath.slice(rootDir.length + 1)}`
    const loaded = await loadModule(moduleId)
    assert(name in loaded || entry.member in loaded, `Missing import ${name}`)
    context[name] = loaded[entry.member]
  }
  const snippets = [...selected.entries()].sort((a, b) => a[1].node.start - b[1].node.start).map(([name, path]) => {
    if (path.isFunctionDeclaration()) return source.slice(path.node.start, path.node.end)
    const node = path.isVariableDeclarator() ? path.node.init : path.node
    return `const ${name} = ${source.slice(node.start, node.end)};`
  })
  const runtime = vm.runInNewContext(`${snippets.join('\n')}\n({${exports.join(',')}})`, context)
  return { runtime, sourceSha256: createHash('sha256').update(source).digest('hex') }
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const data = await loadModule('/src/utils/gameData.js')
  const { MONSTERS, MOVES, POTIONS, getBalancedMovesForLevel } = data
  const { calculateStatsForLevel } = await loadModule('/src/utils/pokemonStats.js')
  const { calculateBattleDamage, resolveBattleStat } = await loadModule('/src/utils/battleDamage.js')
  const { chooseTrainerBattleAction } = await loadModule('/src/utils/battleAi.js')
  const { getPotionRecoveryProfile, clearPotionCurableStatus } = await loadModule('/src/utils/inventoryItems.js')
  const { TIMBER_LEAGUE_ROUTES, getTimberLeagueNextTeam } = await loadModule('/src/game/timberLeague.js')
  const route = TIMBER_LEAGUE_ROUTES.training
  const variantCount = route.teamVariants[0].length
  const variants = Array.from({ length: variantCount }, (_, variant) => variant)
  const state = { party: [], enemies: [], logs: [] }
  const { runtime, sourceSha256 } = await loadBattleRuntime(rootDir, loadModule, state)
  const species = new Map(MONSTERS.map((mon) => [mon.id, mon]))
  const makeMonster = (id, instanceId) => {
    const base = species.get(id)
    assert(base, `Unknown species ${id}`)
    const stats = calculateStatsForLevel(base, LEVEL)
    return {
      ...base, ...stats, baseId: id, id: instanceId, level: LEVEL,
      currentHp: stats.maxHp, currentMp: stats.maxMp, status: null, statusTurns: 0,
      statStages: {}, volatileStatuses: {}, moves: getBalancedMovesForLevel(base, LEVEL),
    }
  }
  const pool = MONSTERS.filter((mon) => {
    const total = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd'].reduce((sum, key) => sum + Number(mon[key] || 0), 0)
    // These rare species fall inside the ordinary base-stat range.
    return !mon.evolvesTo && total >= 440 && total <= 560 && ![489, 718, 772].includes(Number(mon.dexNo ?? mon.pokedexId)) &&
      getBalancedMovesForLevel(mon, LEVEL).some((key) => MOVES[key]?.power > 0)
  }).map((mon) => makeMonster(mon.id, `candidate-${mon.id}`))
  assert(pool.length >= 6)
  const enemiesFor = (variant) => getTimberLeagueNextTeam('training', 1, {
    clearedStageIds: Array.from({ length: variant }, (_, i) => `training:1:tactics-${i}`),
  }, Array(6).fill(LEVEL)).map((entry, i) => {
    assert.equal(entry.level, LEVEL)
    return makeMonster(entry.pokemonId, `enemy-${i}`)
  })
  const expectedDamage = (attacker, defender, key) => {
    const move = MOVES[key]
    if (!move || move.category === 'status' || move.effect === 'mimic' ||
        (move.requiresUserStatus && move.requiresUserStatus !== attacker.status) ||
        (move.requiresTargetStatus && move.requiresTargetStatus !== defender.status)) return 0
    const power = runtime.getDynamicBattleMovePower(key, move, attacker, defender)
    if (power <= 0) return 0
    const stage = (attacker.statStages?.accuracy || 0) - (defender.statStages?.evasion || 0)
    const stageMultiplier = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)
    const accuracy = move.alwaysHits ? 1 : Math.min(1, Math.max(0.01, (move.accuracy ?? 100) * stageMultiplier / 100))
    const hits = move.multiHit ? (move.multiHit.min + move.multiHit.max) / 2 : 1
    return calculateBattleDamage(attacker, defender, { ...move, power }, { randomFactor: 0.925, allowCrit: false }).damage * accuracy * hits /
      (move.charge && attacker.volatileStatuses?.chargingMove !== key ? 2 : 1)
  }
  const bestAttack = (attacker, defender) => {
    const charging = attacker.volatileStatuses?.chargingMove
    const keys = charging && MOVES[charging] ? [charging] : attacker.moves.filter((key) => runtime.getMoveMpCost(MOVES[key]) <= attacker.currentMp)
    return keys
      .map((key) => ({ key, damage: expectedDamage(attacker, defender, key) }))
      .filter((entry) => entry.damage > 0)
      .sort((a, b) => b.damage - a.damage || runtime.getMoveMpCost(MOVES[a.key]) - runtime.getMoveMpCost(MOVES[b.key]))[0] || { key: null, damage: 0 }
  }
  const matchup = (mon, enemy, entryCost = false) => {
    const attack = bestAttack(mon, enemy).damage / Math.max(1, enemy.currentHp)
    const incoming = bestAttack(enemy, mon).damage
    const hp = mon.currentHp - (entryCost ? incoming : 0)
    if (hp <= 0 || attack === 0) return 0
    const endurance = Math.min(5, hp / Math.max(1, incoming))
    const speedBonus = resolveBattleStat(mon, 'spd') > resolveBattleStat(enemy, 'spd') ? 0.35 : 0
    const statusPenalty = ['sleep', 'freeze', 'paralysis'].includes(mon.status) ? 0.65 : 1
    return attack * (1 + endurance * 0.35 + speedBonus) * statusPenalty
  }
  const draftRankings = new Map()
  const draft = (enemies, random) => {
    const cacheKey = enemies.map((mon) => mon.baseId).join(',')
    if (!draftRankings.has(cacheKey)) draftRankings.set(cacheKey, enemies.map((enemy) => pool.map((mon) => ({
      id: mon.baseId, score: matchup(mon, enemy) + enemies.reduce((sum, other) => sum + Math.min(1, matchup(mon, other)) * 0.08, 0),
    })).sort((a, b) => b.score - a.score)))
    const chosen = []
    for (const ranking of draftRankings.get(cacheKey)) {
      const ranked = ranking.filter((entry) => !chosen.includes(entry.id))
      chosen.push(ranked[Math.floor(random() * Math.min(3, ranked.length))].id)
    }
    return chosen
  }
  const chooseReplacement = (party, enemy, tactical) => {
    const alive = party.map((mon, i) => ({ mon, i })).filter(({ mon }) => mon.currentHp > 0)
    return tactical ? alive.sort((a, b) => matchup(b.mon, enemy) - matchup(a.mon, enemy))[0]?.i : alive[0]?.i
  }
  const choosePlayerAction = (party, active, enemy, scenario, potions, turnsSinceSwitch) => {
    const mon = party[active]
    const attack = bestAttack(mon, enemy)
    const incoming = bestAttack(enemy, mon).damage
    const canFinishFirst = attack.damage >= enemy.currentHp &&
      (MOVES[attack.key]?.priority > 0 || resolveBattleStat(mon, 'spd') > resolveBattleStat(enemy, 'spd')) &&
      !['sleep', 'freeze'].includes(mon.status)
    const statusDanger = ['sleep', 'freeze', 'paralysis', 'burn'].includes(mon.status) || mon.volatileStatuses?.confusion
    const shouldHeal = potions > 0 && !canFinishFirst &&
      (mon.currentHp <= incoming * 1.1 || mon.currentHp < mon.maxHp * 0.35 || !attack.key || statusDanger) &&
      (mon.maxHp - mon.currentHp >= mon.maxHp * 0.25 || mon.currentMp < 15 || statusDanger) &&
      incoming < mon.maxHp * 0.8
    if (scenario.switching && !canFinishFirst && turnsSinceSwitch >= 2) {
      const candidates = party.map((other, i) => ({ i, score: matchup(runtime.clearTemporaryBattleRuntime(other), enemy, true) }))
        .filter(({ i }) => i !== active && party[i].currentHp > 0)
        .sort((a, b) => b.score - a.score)
      const better = candidates[0]
      const healedScore = shouldHeal ? matchup(heal(mon), enemy, true) : 0
      if (better && better.score > Math.max(0.15, matchup(mon, enemy) * 1.35) &&
          (!shouldHeal || better.score >= healedScore)) return { type: 'switch', index: better.i }
    }
    if (shouldHeal) return { type: 'potion' }
    return { type: 'move', key: attack.key }
  }
  const heal = (mon) => {
    const recovery = getPotionRecoveryProfile(POTIONS.max_potion)
    return clearPotionCurableStatus({ ...mon,
      currentHp: Math.min(mon.maxHp, mon.currentHp + recovery.hp),
      currentMp: Math.min(mon.maxMp, mon.currentMp + recovery.mp),
    })
  }
  const attack = async (side, actorIndex, targetIndex, key, canTargetStillAct = false) => {
    const actors = side === 'player' ? 'party' : 'enemies'
    const targets = side === 'player' ? 'enemies' : 'party'
    const actor = state[actors][actorIndex]
    const target = state[targets][targetIndex]
    if (!key || actor.currentHp <= 0 || target.currentHp <= 0) return
    const turnStart = runtime.resolveTurnStart(actor, key)
    state[actors][actorIndex] = turnStart.mon
    for (const event of turnStart.events) state.logs.push(event.message)
    if (!turnStart.canAct || turnStart.fainted) return
    const move = MOVES[key]
    if (move.requiresUserStatus && turnStart.mon.status !== move.requiresUserStatus) return
    const releasing = turnStart.mon.volatileStatuses?.chargingMove === key
    assert(releasing || turnStart.mon.currentMp >= runtime.getMoveMpCost(move), 'Illegal MP spend')
    const paid = { ...turnStart.mon, currentMp: releasing ? turnStart.mon.currentMp : turnStart.mon.currentMp - runtime.getMoveMpCost(move) }
    state.logs.push(`${side === 'enemy' ? '敌方 ' : ''}${actor.name} 使用了 ${move.name}！`)
    const result = await runtime.executeBattleMove({ attacker: paid, defender: target, moveKey: key, attackerSide: side, canTargetStillAct })
    state[actors][actorIndex] = result.attacker || paid
    state[targets][targetIndex] = result.defender || target
    assert(!result.escaped, 'Training battle must not escape')
  }
  const run = async (scenario, sample, record = false) => {
    const selectionRandom = makeRandom(sample * 2654435761 + 1013904223)
    const random = makeRandom(sample * 2246822519 + 3266489917)
    const variant = (sample - 1) % variantCount
    state.enemies = enemiesFor(variant)
    const ids = scenario.targeted ? draft(state.enemies, selectionRandom) : pool.map((mon) => ({ id: mon.baseId, sort: selectionRandom() }))
      .sort((a, b) => a.sort - b.sort).slice(0, 6).map((entry) => entry.id)
    state.party = ids.map((id, i) => makeMonster(id, `player-${i}`))
    assert.equal(new Set(ids).size, 6)
    state.logs = []
    let active = 0
    let enemyActive = 0
    let turns = 0
    let potions = scenario.potions
    let switches = 0
    let lastSwitchTurn = -10
    const trace = []
    const originalRandom = Math.random
    Math.random = random
    try {
      while (turns < 160 && state.party.some((mon) => mon.currentHp > 0) && state.enemies.some((mon) => mon.currentHp > 0)) {
        if (state.enemies[enemyActive].currentHp <= 0) enemyActive = state.enemies.findIndex((mon) => mon.currentHp > 0)
        if (state.party[active].currentHp <= 0) {
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          active = chooseReplacement(state.party, state.enemies[enemyActive], scenario.switching)
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          state.logs.push(`上吧，${state.party[active].name}！`)
        }
        const action = choosePlayerAction(state.party, active, state.enemies[enemyActive], scenario, potions, turns - lastSwitchTurn)
        if (!action.key && action.type === 'move') {
          const available = state.party.some((mon) => mon.currentHp > 0 && bestAttack(mon, state.enemies[enemyActive]).key)
          if (!available) break
          if (!scenario.switching) break
        }
        turns += 1
        if (record) trace.push({ turn: turns, player: state.party[active].name, enemy: state.enemies[enemyActive].name,
          hp: state.party[active].currentHp, action: action.type, move: MOVES[action.key]?.name, target: state.party[action.index]?.name })
        if (action.type === 'switch') {
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          active = action.index
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          state.logs.push(`上吧，${state.party[active].name}！`)
          switches += 1
          lastSwitchTurn = turns
        } else if (action.type === 'potion') {
          state.party[active] = heal(state.party[active])
          state.logs.push(`${state.party[active].name} 使用了 ${POTIONS.max_potion.name}！`)
          potions -= 1
        }
        const enemyAction = chooseTrainerBattleAction({
          enemyTeam: state.enemies, activeEnemyMon: state.enemies[enemyActive], targetMon: state.party[active],
          battleKind: 'trainer', trainerRole: 'minigame', battleLogs: state.logs,
          allowSwitch: state.logs.at(-1) !== `上吧，${state.party[active].name}！`, potionsRemaining: 0, random,
        })
        assert.notEqual(enemyAction.type, 'item')
        if (enemyAction.type === 'switch') {
          const next = state.enemies.findIndex((mon) => mon.id === enemyAction.target.id)
          assert(next >= 0 && next !== enemyActive)
          const oldName = state.enemies[enemyActive].name
          state.enemies[enemyActive] = runtime.clearTemporaryBattleRuntime(state.enemies[enemyActive])
          enemyActive = next
          state.enemies[enemyActive] = runtime.clearTemporaryBattleRuntime(state.enemies[enemyActive])
          state.logs.push(`对手收回了 ${oldName}！`, `对手派出了 ${state.enemies[enemyActive].name}！`)
          if (action.type === 'move') await attack('player', active, enemyActive, action.key)
        } else if (action.type !== 'move') {
          await attack('enemy', enemyActive, active, enemyAction.moveKey)
        } else {
          const order = runtime.determineBattleActionOrder(state.party[active], state.enemies[enemyActive], MOVES[action.key], MOVES[enemyAction.moveKey])
          for (const [index, side] of order.entries()) {
            if (state.party[active].currentHp <= 0 || state.enemies[enemyActive].currentHp <= 0) break
            await attack(side, side === 'player' ? active : enemyActive, side === 'player' ? enemyActive : active,
              side === 'player' ? action.key : enemyAction.moveKey, index === 0)
          }
        }
        // The enemy-only reply to a potion/switch does not run residual status ticks in production.
        if (action.type === 'move' || state.party[active].currentHp <= 0 || state.enemies[enemyActive].currentHp <= 0) {
          const order = runtime.determineBattleEndOfTurnSideOrder(state.party[active], state.enemies[enemyActive])
          for (const side of order) {
            const team = side === 'player' ? 'party' : 'enemies'
            const index = side === 'player' ? active : enemyActive
            if (state[team][index].currentHp > 0) state[team][index] = runtime.resolveTurnEnd(state[team][index]).mon
          }
        }
      }
    } finally { Math.random = originalRandom }
    const won = state.enemies.every((mon) => mon.currentHp <= 0) && state.party.some((mon) => mon.currentHp > 0)
    return { won, turns, variant, potionsUsed: scenario.potions - potions, switches,
      team: ids, timeout: turns >= 160, ...(record ? { trace } : {}) }
  }

  assert.equal(POTIONS.max_potion.name, '超级伤药')
  const testMon = { ...makeMonster(pool[0].baseId, 'test'), currentHp: 1, currentMp: 1,
    status: 'sleep', statusTurns: 3, volatileStatuses: { confusion: 3, flinch: 1 } }
  const restored = heal(testMon)
  assert.equal(restored.currentHp, restored.maxHp)
  assert.equal(restored.currentMp, restored.maxMp)
  assert.equal(restored.status, null)
  assert(!restored.volatileStatuses.confusion && !restored.volatileStatuses.flinch)
  assert.equal(testMon.currentHp, 1)
  const originalRandom = Math.random
  Math.random = makeRandom(8192)
  try {
    state.party = [makeMonster(pool[0].baseId, 'bench-test'), makeMonster(pool[0].baseId, 'replacement-test')]
    state.enemies = [makeMonster(pool[0].baseId, 'attacker-test')]
    state.logs = []
    const previousHp = state.party[0].currentHp
    const replacementHp = state.party[1].currentHp
    await attack('enemy', 0, 1, 'tackle')
    assert.equal(state.party[0].currentHp, previousHp, 'A switch must not damage the withdrawn member')
    assert(state.party[1].currentHp < replacementHp, 'The replacement must take the enemy reply')
    const asleep = { ...testMon, volatileStatuses: {} }
    const sleepStart = runtime.resolveTurnStart(asleep, 'tackle')
    assert.equal(sleepStart.canAct, false, 'Sleep must actually prevent the attack')
    assert.equal(sleepStart.mon.statusTurns, 2)
    const poisoned = { ...makeMonster(pool[0].baseId, 'poison-test'), status: 'poison' }
    assert.equal(runtime.resolveTurnEnd(poisoned).mon.currentHp, poisoned.maxHp - Math.floor(poisoned.maxHp / 8))
  } finally { Math.random = originalRandom }
  const repeated = await run(SCENARIOS[4], 37, true)
  assert.deepEqual(await run(SCENARIOS[4], 37, true), repeated, 'Seed must reproduce actions and outcome')
  assert.equal(repeated.trace.length, repeated.turns)
  assert.equal(repeated.trace.filter((entry) => entry.action === 'potion').length, repeated.potionsUsed)
  assert.equal(repeated.trace.filter((entry) => entry.action === 'switch').length, repeated.switches)
  let potionExample = null
  const results = []
  for (const scenario of SCENARIOS) {
    const runs = []
    for (let i = 1; i <= SAMPLES; i += 1) {
      const result = await run(scenario, i)
      runs.push(result)
      if (!potionExample && scenario.potions === 2 && result.won && result.potionsUsed === 2 && result.switches > 0) {
        potionExample = { sample: i, ...await run(scenario, i, true) }
      }
      if (i % 250 === 0) console.error(`[tactics] ${scenario.key}: ${i}/${SAMPLES}`)
    }
    const wins = runs.filter((run) => run.won)
    const summarize = (subset) => {
      const winning = subset.filter((run) => run.won)
      const medals = { gold: 0, silver: 0, bronze: 0 }
      winning.forEach((run) => medals[run.turns <= route.thresholds.gold ? 'gold' : run.turns <= route.thresholds.silver ? 'silver' : 'bronze'] += 1)
      return { runs: subset.length, wins: winning.length, winPercent: subset.length ? rounded(winning.length * 100 / subset.length) : null,
        medalCounts: medals, medalPercentPerAttempt: Object.fromEntries(Object.entries(medals).map(([key, n]) => [key, subset.length ? rounded(n * 100 / subset.length) : null])),
        averageWinningTurns: rounded(mean(winning.map((run) => run.turns))), medianWinningTurns: quantile(winning.map((run) => run.turns), 0.5),
        winningTurnsP25: quantile(winning.map((run) => run.turns), 0.25), winningTurnsP75: quantile(winning.map((run) => run.turns), 0.75),
        winningTurnsP90: quantile(winning.map((run) => run.turns), 0.9),
        averagePotionsPerAttempt: rounded(mean(subset.map((run) => run.potionsUsed))),
        averageSwitchesPerAttempt: rounded(mean(subset.map((run) => run.switches))),
        timeouts: subset.filter((run) => run.timeout).length,
      }
    }
    const result = { scenario: scenario.key, ...summarize(runs), byOpponent: variants.map((variant) => ({ variant, ...summarize(runs.filter((run) => run.variant === variant)) })),
      winningTurnCounts: wins.reduce((counts, run) => ({ ...counts, [run.turns]: (counts[run.turns] || 0) + 1 }), {}),
    }
    results.push(result)
    console.error(`[tactics] ${scenario.key}: ${result.winPercent}% wins, ${result.averageWinningTurns} winning turns`)
  }
  const report = {
    generatedAt: new Date().toISOString(), sourceSha256, level: LEVEL, poolSize: pool.length,
    sourceFiles: Object.fromEntries(['scripts/audit-timber-league-tactics.mjs', 'src/components/Game/OriginalGame.jsx',
      'src/utils/gameData.js', 'src/utils/pokemonStats.js', 'src/utils/battleDamage.js', 'src/utils/battleAi.js',
      'src/utils/inventoryItems.js', 'src/game/timberLeague.js'].map((file) => [file,
      createHash('sha256').update(readFileSync(resolve(rootDir, file))).digest('hex')])),
    thresholds: route.thresholds, potion: { key: 'max_potion', name: POTIONS.max_potion.name, price: POTIONS.max_potion.price },
    model: 'Production executeBattleMove, turn-start/end statuses, stat stages, charge, multi-hit, healing/drain, recoil, accuracy, speed order, damage and trainer AI. Animation/audio/cloud persistence are stubbed. All parties use six distinct ordinary final species, base stat totals 440-560, default level-80 moves, no permanent stat boosts. No mid-battle experience/level growth. Enemy variants sampled equally. Player decision policy uses current visible state and expected damage, never future actions or RNG. Targeted draft selects one of the top three counters for each visible opponent, with general coverage as tie-breaker. Active-only healing, capped at 0/1/2 full-restores; no fainted-member revival or bench healing. Voluntary switch consumes a turn, enemy responds against the replacement; forced switch costs none. Player policy does not plan multi-turn buffs/status combos, and is not optimal play.',
    validation: { deterministicReplay: true, potionFullRecoveryAndStatusCure: true, actionTurnAccounting: true,
      replacementTakesEnemyReply: true, sleepPreventsAction: true, poisonResidualDamage: true, opponentPotionsDisabled: true },
    opponents: variants.map((variant) => ({ variant, team: enemiesFor(variant).map((mon) => ({ name: mon.name, speciesId: mon.baseId, level: mon.level, moves: mon.moves })) })),
    example: { ...repeated, team: repeated.team.map((id) => ({ id, name: species.get(id).name })) }, results,
    potionExample: potionExample && { ...potionExample,
      team: potionExample.team.map((id) => ({ id, name: species.get(id).name })) },
  }
  mkdirSync(dirname(OUTPUT), { recursive: true })
  writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output: OUTPUT, poolSize: pool.length, results: results.map(({ byOpponent, winningTurnCounts, ...result }) => result) }, null, 2))
})
