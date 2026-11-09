#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { withViteAuditServer } from './load-vite-module.mjs'
import { loadBattleRuntime } from './timber-league-runtime.mjs'

const SAMPLES = Number(process.env.TIMBER_REALISTIC_SAMPLES || 1008)
assert(Number.isInteger(SAMPLES) && SAMPLES > 0)
const OUTPUT_DIR = process.env.TIMBER_REALISTIC_OUTPUT || 'reports/timber-league/realistic'
const MAX_TURNS = 160
const BASE_SEED = Number(process.env.TIMBER_REALISTIC_SEED || 20261001) >>> 0
const TEAMS = [
  { key: 'starter-coverage', label: '御三家与常见伙伴', species: [74, 76, 72, 28, 35, 153] },
  { key: 'route-coverage', label: '道路常见伙伴', species: [7, 70, 30, 58, 161, 157] },
  { key: 'mixed-coverage', label: '混合属性伙伴', species: [29, 182, 180, 38, 164, 43] },
]
const LEVELS = [
  { key: 'all-80', levels: [80, 80, 80, 80, 80, 80] },
  { key: 'mixed', levels: [100, 85, 80, 70, 65, 60] },
  { key: 'one-high', levels: [100, 30, 30, 30, 30, 30] },
]
const THRESHOLDS = [[16, 21], [18, 24], [20, 26], [22, 28]]
const SCENARIOS = TEAMS.flatMap(team => LEVELS.flatMap(level => ['type', 'damage'].flatMap(policy =>
  [0, 2].map(potions => ({ key: `${team.key}/${level.key}/${policy}/p${potions}/cap2`, team, level, policy, potions, enemySwitchLimit: 2 })))))
// Paired counterfactual at the common Lv.80 baseline; everything except the cap uses the same seed.
SCENARIOS.push(...SCENARIOS.filter(s => s.level.key === 'all-80').map(s => ({
  ...s, key: s.key.replace('cap2', 'unlimited'), enemySwitchLimit: null,
})))
const makeRandom = seed => {
  let state = seed >>> 0 || 1
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296 }
}
const rounded = value => value == null ? null : Math.round(value * 100) / 100
const mean = values => values.length ? rounded(values.reduce((a, b) => a + b, 0) / values.length) : null
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null
}
const histogram = values => values.reduce((counts, value) => { counts[value] = (counts[value] || 0) + 1; return counts }, {})
const turnSummary = runs => ({ count: runs.length, mean: mean(runs.map(r => r.turns)),
  p25: percentile(runs.map(r => r.turns), 0.25), p50: percentile(runs.map(r => r.turns), 0.5),
  p75: percentile(runs.map(r => r.turns), 0.75), p90: percentile(runs.map(r => r.turns), 0.9),
  histogram: histogram(runs.map(r => r.turns)),
})
const summarize = runs => {
  const wins = runs.filter(r => r.outcome === 'win')
  const losses = runs.filter(r => r.outcome === 'loss')
  const outcomes = histogram(runs.map(r => r.outcome))
  const percent = (n, denominator) => denominator ? rounded(n * 100 / denominator) : null
  const winRate = wins.length / Math.max(1, runs.length)
  const denominator = 1 + 1.96 ** 2 / Math.max(1, runs.length)
  const center = (winRate + 1.96 ** 2 / (2 * Math.max(1, runs.length))) / denominator
  const error = 1.96 * Math.sqrt((winRate * (1 - winRate) + 1.96 ** 2 / (4 * Math.max(1, runs.length))) / Math.max(1, runs.length)) / denominator
  return { attempts: runs.length, outcomes, winPercent: percent(wins.length, runs.length),
    winPercentWilson95: [rounded((center - error) * 100), rounded((center + error) * 100)],
    turns: { wins: turnSummary(wins), losses: turnSummary(losses), all: turnSummary(runs),
      unresolved: turnSummary(runs.filter(r => !['win', 'loss'].includes(r.outcome))) },
    actions: Object.fromEntries(['potionsUsed', 'playerSwitches', 'playerForcedSwitches', 'enemySwitches', 'enemyForcedSwitches',
      'enemyNoMoveTurns', 'playerBlockedActions', 'enemyBlockedActions', 'residualDamagePlayer', 'residualDamageEnemy'].map(key =>
      [key, { mean: mean(runs.map(r => r[key])), max: runs.length ? Math.max(...runs.map(r => r[key])) : null, histogram: histogram(runs.map(r => r[key])) }])),
    medals: Object.fromEntries(THRESHOLDS.map(([gold, silver]) => {
      const counts = { gold: 0, silver: 0, bronze: 0 }
      wins.forEach(r => counts[r.turns <= gold ? 'gold' : r.turns <= silver ? 'silver' : 'bronze']++)
      return [`${gold}/${silver}`, { counts,
        percentPerAttempt: Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, percent(n, runs.length)])),
        percentPerWin: Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, percent(n, wins.length)])),
      }]
    })),
  }
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const { MONSTERS, MOVES, POTIONS, getBalancedMovesForLevel } = await loadModule('/src/utils/gameData.js')
  const { TYPE_NAMES_CN } = await loadModule('/src/utils/constants.js')
  const { calculateStatsForLevel } = await loadModule('/src/utils/pokemonStats.js')
  const { calculateBattleDamage, resolveBattleStat, getTypeEffectiveness, getStabMultiplier } = await loadModule('/src/utils/battleDamage.js')
  const { chooseTrainerBattleAction } = await loadModule('/src/utils/battleAi.js')
  const { getPotionRecoveryProfile, clearPotionCurableStatus } = await loadModule('/src/utils/inventoryItems.js')
  const { getTimberLeagueNextTeam, TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT, canTimberLeagueEnemySwitch,
    getTimberLeagueEnemySwitchCount, recordTimberLeagueEnemySwitch, trackTimberLeagueTransition } = await loadModule('/src/game/timberLeague.js')
  assert.equal(TIMBER_LEAGUE_ENEMY_SWITCH_LIMIT, 2, 'Production enemy switch cap must be present before calibration')
  const { getMapInfo } = await loadModule('/src/game/data/mapCatalog.js')
  const trainer = getMapInfo('GodotMapV2_SurvivalRidge').runtimeEvents.find(e => e.id === 'npc_ridge_coin_sprint')
  assert(trainer)
  const trainerStyle = trainer.properties.battleStyle || null
  const state = { party: [], enemies: [], logs: [], environment: { eventRole: 'minigame', trainerStyle, timberLeague: {} }, metrics: {} }
  const { runtime, sourceSha256 } = await loadBattleRuntime(rootDir, loadModule, state)
  const species = new Map(MONSTERS.map(mon => [mon.id, mon]))
  const makeMonster = (id, level, instanceId) => {
    const base = species.get(id)
    assert(base, `Unknown species ${id}`)
    const stats = calculateStatsForLevel(base, level)
    return { ...base, ...stats, baseId: id, id: instanceId, level,
      currentHp: stats.maxHp, currentMp: stats.maxMp, status: null, statusTurns: 0,
      statStages: {}, volatileStatuses: {}, moves: getBalancedMovesForLevel(base, level) }
  }
  const lineup = (variant, levels) => getTimberLeagueNextTeam('training', 1, {
    clearedStageIds: Array.from({ length: variant }, (_, i) => `training:1:realistic-${i}`),
  }, levels)
  const enemiesFor = (variant, levels) => lineup(variant, levels).map((entry, i) => makeMonster(entry.pokemonId, entry.level, `enemy-${i}`))
  const expectedDamage = (attacker, defender, key) => {
    const move = MOVES[key]
    if (!move || move.category === 'status' || move.effect === 'mimic' ||
      (move.requiresUserStatus && move.requiresUserStatus !== attacker.status) ||
      (move.requiresTargetStatus && move.requiresTargetStatus !== defender.status)) return 0
    const power = runtime.getDynamicBattleMovePower(key, move, attacker, defender)
    if (power <= 0) return 0
    const stage = (attacker.statStages?.accuracy || 0) - (defender.statStages?.evasion || 0)
    const multiplier = stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage)
    const accuracy = move.alwaysHits ? 1 : Math.min(1, Math.max(0.01, (move.accuracy ?? 100) * multiplier / 100))
    const hits = move.multiHit ? (move.multiHit.min + move.multiHit.max) / 2 : 1
    return calculateBattleDamage(attacker, defender, { ...move, power }, { randomFactor: 0.925, allowCrit: false }).damage * accuracy * hits /
      (move.charge && attacker.volatileStatuses?.chargingMove !== key ? 2 : 1)
  }
  const attackOptions = (attacker, defender) => {
    const charging = attacker.volatileStatuses?.chargingMove
    const keys = charging && MOVES[charging] ? [charging] : attacker.moves.filter(key => runtime.getMoveMpCost(MOVES[key]) <= attacker.currentMp)
    return keys.map(key => ({ key, damage: expectedDamage(attacker, defender, key),
      typeScore: getTypeEffectiveness(MOVES[key]?.type, defender) * getStabMultiplier(attacker, MOVES[key]?.type),
    })).filter(entry => entry.damage > 0)
  }
  const bestAttack = (attacker, defender, policy = 'damage') => attackOptions(attacker, defender)
    .sort((a, b) => policy === 'type'
      ? b.typeScore - a.typeScore || Number(MOVES[b.key].power || 0) - Number(MOVES[a.key].power || 0) || runtime.getMoveMpCost(MOVES[a.key]) - runtime.getMoveMpCost(MOVES[b.key])
      : b.damage - a.damage || runtime.getMoveMpCost(MOVES[a.key]) - runtime.getMoveMpCost(MOVES[b.key]))[0] || { key: null, damage: 0, typeScore: 0 }
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
  const simpleMatchup = (mon, enemy) => {
    const outgoing = bestAttack(mon, enemy, 'type').typeScore
    const enemyTypes = [enemy.type, enemy.type2].filter(Boolean)
    const incoming = Math.max(...enemyTypes.map(type => getTypeEffectiveness(type, mon)), 0.25)
    // A casual player can see levels: do not send Lv.30 into Lv.100 solely for a type edge.
    const levelRatio = Math.min(2, mon.level / Math.max(1, enemy.level))
    return outgoing / incoming * levelRatio ** 2 * (0.6 + 0.4 * mon.currentHp / mon.maxHp)
  }
  const replacement = (party, enemy, policy, entryCost = false) => party.map((mon, i) => ({ mon, i,
    score: policy === 'damage' ? matchup(runtime.clearTemporaryBattleRuntime(mon), enemy, entryCost) : simpleMatchup(mon, enemy),
  })).filter(({ mon }) => mon.currentHp > 0).sort((a, b) => b.score - a.score)[0]?.i
  const heal = mon => {
    const recovery = getPotionRecoveryProfile(POTIONS.max_potion)
    return clearPotionCurableStatus({ ...mon, currentHp: Math.min(mon.maxHp, mon.currentHp + recovery.hp),
      currentMp: Math.min(mon.maxMp, mon.currentMp + recovery.mp) })
  }
  const choosePlayerAction = (active, enemyActive, scenario, potions, turnsSinceSwitch) => {
    const mon = state.party[active], enemy = state.enemies[enemyActive]
    const attack = bestAttack(mon, enemy, scenario.policy)
    const others = state.party.map((other, i) => ({ i, other })).filter(({ i, other }) => i !== active && other.currentHp > 0 && bestAttack(other, enemy).key)
    if (scenario.policy === 'type') {
      const statusDanger = ['sleep', 'freeze', 'paralysis', 'burn'].includes(mon.status) || mon.volatileStatuses?.confusion
      if (potions > 0 && (mon.currentHp <= mon.maxHp * 0.35 || mon.currentMp <= 10 || statusDanger)) return { type: 'potion' }
      const incoming = Math.max(...[enemy.type, enemy.type2].filter(Boolean).map(type => getTypeEffectiveness(type, mon)))
      const ranked = others.sort((a, b) => simpleMatchup(b.other, enemy) - simpleMatchup(a.other, enemy))
      if (ranked[0] && (!attack.key || (turnsSinceSwitch >= 2 && (incoming >= 2 || attack.typeScore < 1) &&
        simpleMatchup(ranked[0].other, enemy) > simpleMatchup(mon, enemy) * 1.5))) return { type: 'switch', index: ranked[0].i }
      return { type: 'move', key: attack.key }
    }
    const incoming = bestAttack(enemy, mon).damage
    const canFinishFirst = attack.damage >= enemy.currentHp &&
      (MOVES[attack.key]?.priority > 0 || resolveBattleStat(mon, 'spd') > resolveBattleStat(enemy, 'spd')) &&
      !['sleep', 'freeze'].includes(mon.status)
    const statusDanger = ['sleep', 'freeze', 'paralysis', 'burn'].includes(mon.status) || mon.volatileStatuses?.confusion
    const shouldHeal = potions > 0 && !canFinishFirst &&
      (mon.currentHp <= incoming * 1.1 || mon.currentHp < mon.maxHp * 0.35 || !attack.key || statusDanger) &&
      (mon.maxHp - mon.currentHp >= mon.maxHp * 0.25 || mon.currentMp < 15 || statusDanger) && incoming < mon.maxHp * 0.8
    if ((!canFinishFirst && turnsSinceSwitch >= 2) || !attack.key) {
      const ranked = others.map(({ i, other }) => ({ i, score: matchup(runtime.clearTemporaryBattleRuntime(other), enemy, true) })).sort((a, b) => b.score - a.score)
      const better = ranked[0]
      const healedScore = shouldHeal ? matchup(heal(mon), enemy, true) : 0
      if (better && (!attack.key || (better.score > Math.max(0.15, matchup(mon, enemy) * 1.35) &&
        (!shouldHeal || better.score >= healedScore)))) return { type: 'switch', index: better.i }
    }
    if (shouldHeal || (!attack.key && potions > 0 && mon.currentMp < mon.maxMp)) return { type: 'potion' }
    return { type: 'move', key: attack.key }
  }
  const attack = async (side, actorIndex, targetIndex, key, canTargetStillAct = false) => {
    const actors = side === 'player' ? 'party' : 'enemies', targets = side === 'player' ? 'enemies' : 'party'
    const actor = state[actors][actorIndex], target = state[targets][targetIndex]
    if (!key || actor.currentHp <= 0 || target.currentHp <= 0) return
    const turnStart = runtime.resolveTurnStart(actor, key)
    state[actors][actorIndex] = turnStart.mon
    for (const event of turnStart.events) state.logs.push(event.message)
    if (!turnStart.canAct || turnStart.fainted) { state.metrics[`${side}BlockedActions`]++; return }
    const move = MOVES[key]
    if (move.requiresUserStatus && turnStart.mon.status !== move.requiresUserStatus) return
    const releasing = turnStart.mon.volatileStatuses?.chargingMove === key
    assert(releasing || turnStart.mon.currentMp >= runtime.getMoveMpCost(move), 'Illegal MP spend')
    const paid = { ...turnStart.mon, currentMp: releasing ? turnStart.mon.currentMp : turnStart.mon.currentMp - runtime.getMoveMpCost(move) }
    state.logs.push(runtime.getBattleMoveUseMessage(`${side === 'enemy' ? '敌方 ' : ''}${actor.name}`, move.name, releasing))
    const result = await runtime.executeBattleMove({ attacker: paid, defender: target, moveKey: key, attackerSide: side, canTargetStillAct })
    state[actors][actorIndex] = result.attacker || paid
    state[targets][targetIndex] = result.defender || target
    assert(!result.escaped, 'Training battle must not escape')
  }
  const residual = (active, enemyActive) => {
    const order = runtime.determineBattleEndOfTurnSideOrder(state.party[active], state.enemies[enemyActive])
    for (const side of order) {
      const key = side === 'player' ? 'party' : 'enemies', index = side === 'player' ? active : enemyActive
      const mon = state[key][index]
      if (mon.currentHp <= 0) continue
      const result = runtime.resolveTurnEnd(mon)
      state[key][index] = result.mon
      state.metrics[side === 'player' ? 'residualDamagePlayer' : 'residualDamageEnemy'] += mon.currentHp - result.mon.currentHp
      state.logs.push(...result.events.map(event => event.message))
    }
  }
  const trackedAction = (type, active, nextActive) => {
    const environment = state.environment
    const before = { battleEnvironment: environment, battlePhase: 'active', turn: 'player', activePlayerId: `player-${active}`,
      playerInventory: [{ itemType: 'potion', quantity: 2 }] }
    const after = { ...before, turn: 'resolving' }
    if (type === 'potion') { after.turn = 'enemy'; after.playerInventory = [{ itemType: 'potion', quantity: 1 }] }
    if (type === 'switch') { before.turn = 'resolving'; before.pendingBattleSwitch = { forced: false }; after.activePlayerId = `player-${nextActive}`; after.pendingBattleSwitch = null }
    state.environment.timberLeague = trackTimberLeagueTransition(before, after).battleEnvironment.timberLeague
  }
  const run = async (scenario, sample, record = false) => {
    const teamIndex = TEAMS.indexOf(scenario.team), levelIndex = LEVELS.indexOf(scenario.level)
    const seed = (BASE_SEED + Math.imul(sample, 2246822519) + Math.imul(teamIndex + 1, 2654435761) + levelIndex * 3266489917) >>> 0
    const random = makeRandom(seed), variant = (sample - 1) % 3
    const rotation = Math.floor((sample - 1) / 3) % 6
    const levels = scenario.level.levels.map((_, i) => scenario.level.levels[(i + rotation) % 6])
    state.enemies = enemiesFor(variant, levels)
    state.party = scenario.team.species.map((id, i) => makeMonster(id, levels[i], `player-${i}`))
    const initialTeam = state.party.map(mon => ({ id: mon.baseId, level: mon.level }))
    state.metrics = { playerBlockedActions: 0, enemyBlockedActions: 0, residualDamagePlayer: 0, residualDamageEnemy: 0 }
    state.environment.timberLeague = { runId: `sim-${seed}`, routeKey: 'training', stage: 1, enemySwitches: 0, turns: 0, potions: 0, switches: 0 }
    let active = replacement(state.party, state.enemies[0], scenario.policy), enemyActive = 0
    const leadId = state.party[active].baseId
    state.logs = [`对手派出了 ${state.enemies[0].name}！`]
    let turns = 0, potions = scenario.potions, playerSwitches = 0, playerForcedSwitches = 0, enemySwitches = 0, enemyForcedSwitches = 0
    let enemyNoMoveTurns = 0, lastSwitchTurn = -10, outcome = null
    const trace = []
    const originalRandom = Math.random
    Math.random = random
    try {
      while (turns < MAX_TURNS && state.party.some(mon => mon.currentHp > 0) && state.enemies.some(mon => mon.currentHp > 0)) {
        const action = choosePlayerAction(active, enemyActive, scenario, potions, turns - lastSwitchTurn)
        if (action.type === 'move' && !action.key) {
          const hasAnyMove = state.party.some(mon => mon.currentHp > 0 && mon.moves.some(key => runtime.getMoveMpCost(MOVES[key]) <= mon.currentMp))
          outcome = hasAnyMove ? 'no_usable_damage_policy' : 'no_affordable_move'
          break
        }
        const logStart = state.logs.length
        turns++
        trackedAction(action.type, active, action.index)
        const entry = { turn: turns, player: state.party[active].baseId, playerHp: state.party[active].currentHp, playerMp: state.party[active].currentMp,
          enemy: state.enemies[enemyActive].baseId, enemyHp: state.enemies[enemyActive].currentHp, enemyMp: state.enemies[enemyActive].currentMp,
          playerAction: action.type, move: action.key || null, switchTo: action.type === 'switch' ? state.party[action.index].baseId : null }
        if (action.type === 'switch') {
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          active = action.index
          state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
          state.logs.push(`上吧，${state.party[active].name}！`)
          playerSwitches++; lastSwitchTurn = turns
        } else if (action.type === 'potion') {
          state.party[active] = heal(state.party[active]); potions--
          state.logs.push(`${state.party[active].name} 使用了 ${POTIONS.max_potion.name}！`)
        }
        const allowSwitch = !runtime.didPlayerJustSwitchOnLastBattleLog(state.logs, state.party[active]) &&
          (scenario.enemySwitchLimit === null || canTimberLeagueEnemySwitch(state.environment, state.logs))
        const enemyAction = chooseTrainerBattleAction({ enemyTeam: state.enemies, activeEnemyMon: state.enemies[enemyActive], targetMon: state.party[active],
          battleKind: 'trainer', trainerRole: 'minigame', trainerStyle, battleLogs: state.logs, allowSwitch, potionsRemaining: 0, random })
        assert.notEqual(enemyAction.type, 'item')
        entry.enemyAction = enemyAction.type; entry.enemyMove = enemyAction.moveKey || null
        if (enemyAction.type === 'switch') {
          const next = state.enemies.findIndex(mon => mon.id === enemyAction.target.id)
          assert(next >= 0 && next !== enemyActive)
          if (scenario.enemySwitchLimit !== null) assert(canTimberLeagueEnemySwitch(state.environment, state.logs))
          const message = runtime.getEnemyAiSwitchIntentMessage(enemyAction)
          if (message) state.logs.push(message)
          if (scenario.enemySwitchLimit !== null) state.environment.timberLeague = recordTimberLeagueEnemySwitch(state.environment, state.logs).timberLeague
          state.logs.push(`对手收回了 ${state.enemies[enemyActive].name}！`)
          enemyActive = next
          // Production enemy switching preserves temporary state; player switching clears it.
          state.logs.push(`对手派出了 ${state.enemies[enemyActive].name}！`)
          enemySwitches++; state.environment.timberLeague.enemySwitches = enemySwitches
          entry.enemySwitchTo = state.enemies[enemyActive].baseId
          if (action.type === 'move') await attack('player', active, enemyActive, action.key)
        } else if (action.type !== 'move') {
          if (!enemyAction.moveKey) { enemyNoMoveTurns++; state.logs.push(`敌方 ${state.enemies[enemyActive].name} 技能值不足，无法行动!`) }
          await attack('enemy', enemyActive, active, enemyAction.moveKey)
        } else if (!enemyAction.moveKey) {
          enemyNoMoveTurns++
          await attack('player', active, enemyActive, action.key)
          if (state.party[active].currentHp > 0 && state.enemies[enemyActive].currentHp > 0) state.logs.push(`敌方 ${state.enemies[enemyActive].name} 技能值不足，无法行动!`)
        } else {
          const order = runtime.determineBattleActionOrder(state.party[active], state.enemies[enemyActive], MOVES[action.key], MOVES[enemyAction.moveKey])
          state.logs.push(runtime.getBattleActionOrderReason(state.party[active], state.enemies[enemyActive], MOVES[action.key], MOVES[enemyAction.moveKey], order))
          for (const [index, side] of order.entries()) {
            if (state.party[active].currentHp <= 0 || state.enemies[enemyActive].currentHp <= 0) break
            await attack(side, side === 'player' ? active : enemyActive, side === 'player' ? enemyActive : active,
              side === 'player' ? action.key : enemyAction.moveKey, index === 0)
          }
        }
        // Match resolveEnemyTurn: a potion/switch response ticks residuals only if a combatant faints.
        if (action.type === 'move' || state.party[active].currentHp <= 0 || state.enemies[enemyActive].currentHp <= 0) residual(active, enemyActive)
        const playerFainted = state.party[active].currentHp <= 0, enemyFainted = state.enemies[enemyActive].currentHp <= 0
        if (playerFainted) state.logs.push(`${state.party[active].name} 倒下了！`)
        if (enemyFainted) state.logs.push(`${state.enemies[enemyActive].name} 倒下了！`)
        const playerAlive = state.party.some(mon => mon.currentHp > 0), enemyAlive = state.enemies.some(mon => mon.currentHp > 0)
        if (playerAlive && enemyAlive) {
          // Simultaneous faint: player must pick before the delayed enemy send-out is displayed.
          const nextEnemy = enemyFainted ? state.enemies.findIndex(mon => mon.currentHp > 0) : enemyActive
          if (playerFainted) {
            state.logs.push('请选择一只宝可梦继续战斗。')
            const previous = active
            active = replacement(state.party, state.enemies[enemyActive], scenario.policy)
            state.party[previous] = runtime.clearTemporaryBattleRuntime(state.party[previous])
            state.party[active] = runtime.clearTemporaryBattleRuntime(state.party[active])
            state.logs.push(`上吧，${state.party[active].name}！`); playerForcedSwitches++
          }
          if (enemyFainted) { enemyActive = nextEnemy; state.logs.push(`对手派出了 ${state.enemies[enemyActive].name}！`); enemyForcedSwitches++ }
        }
        if (record) trace.push({ ...entry, logs: state.logs.slice(logStart), playerRemaining: state.party.filter(mon => mon.currentHp > 0).length,
          enemyRemaining: state.enemies.filter(mon => mon.currentHp > 0).length })
      }
    } finally { Math.random = originalRandom }
    if (!outcome) outcome = !state.party.some(mon => mon.currentHp > 0) ? 'loss' : !state.enemies.some(mon => mon.currentHp > 0) ? 'win' : 'timeout'
    assert.equal(state.environment.timberLeague.turns, turns, 'Count player actions using the production transition helper')
    assert.equal(state.environment.timberLeague.potions, scenario.potions - potions)
    assert.equal(state.environment.timberLeague.switches, playerSwitches)
    assert.equal(getTimberLeagueEnemySwitchCount(state.environment.timberLeague, state.logs), enemySwitches)
    assert(scenario.enemySwitchLimit === null || enemySwitches <= scenario.enemySwitchLimit)
    assert(state.party.concat(state.enemies).every(mon => mon.currentHp >= 0 && mon.currentMp >= 0))
    return { scenario: scenario.key, sample, seed, variant, levelRotation: rotation, team: initialTeam, leadId, outcome, turns,
      potionsUsed: scenario.potions - potions, playerSwitches, playerForcedSwitches, enemySwitches, enemyForcedSwitches, enemyNoMoveTurns,
      ...state.metrics, finalParty: state.party.map(mon => ({ id: mon.baseId, hp: mon.currentHp, mp: mon.currentMp, status: mon.status })),
      finalEnemies: state.enemies.map(mon => ({ id: mon.baseId, hp: mon.currentHp, mp: mon.currentMp, status: mon.status })), ...(record ? { trace } : {}) }
  }

  // Focused fidelity checks, including invariants old simulations missed.
  for (const level of LEVELS) for (let variant = 0; variant < 3; variant++) {
    const team = lineup(variant, level.levels)
    assert.deepEqual(team.map(mon => mon.level), [...level.levels].sort((a, b) => b - a))
    assert.deepEqual(lineup(variant, level.levels.slice().reverse()).map(mon => mon.pokemonId), team.map(mon => mon.pokemonId))
    assert.deepEqual(team.map(mon => mon.pokemonId), lineup(variant, LEVELS[0].levels).map(mon => mon.pokemonId))
  }
  assert(canTimberLeagueEnemySwitch({ timberLeague: { runId: 'test', enemySwitches: 0 } }, []))
  assert(!canTimberLeagueEnemySwitch({ timberLeague: { runId: 'test', enemySwitches: 2 } }, []))
  assert(!canTimberLeagueEnemySwitch({ timberLeague: { runId: 'test' } }, ['对手收回了 甲！', '对手派出了 乙！', '对手收回了 乙！']))
  assert(canTimberLeagueEnemySwitch({ timberLeague: { runId: 'test' } }, ['对手派出了 甲！', '对手派出了 乙！']))
  const poisoned = { ...makeMonster(74, 80, 'test'), currentHp: 1, currentMp: 1, status: 'poison', volatileStatuses: { confusion: 3, flinch: 1 } }
  const healed = heal(poisoned)
  assert.equal(healed.currentHp, healed.maxHp); assert.equal(healed.currentMp, healed.maxMp); assert.equal(healed.status, null)
  assert(!healed.volatileStatuses.confusion && !healed.volatileStatuses.flinch)
  // Sleeping attempts do not spend MP, charge release does not spend twice, and the actual incoming member takes the reply.
  const originalRandom = Math.random
  Math.random = makeRandom(8192)
  try {
    state.metrics = { playerBlockedActions: 0, enemyBlockedActions: 0, residualDamagePlayer: 0, residualDamageEnemy: 0 }
    state.party = [makeMonster(76, 80, 'withdrawn'), makeMonster(76, 80, 'replacement')]
    state.enemies = [makeMonster(28, 80, 'attacker')]
    state.logs = []
    const hpBefore = state.party.map(mon => mon.currentHp)
    await attack('enemy', 0, 1, 'tackle')
    assert.equal(state.party[0].currentHp, hpBefore[0]); assert(state.party[1].currentHp < hpBefore[1])
    state.party[1] = { ...state.party[1], status: 'sleep', statusTurns: 3 }
    const mpBefore = state.party[1].currentMp
    await attack('player', 1, 0, 'tackle')
    assert.equal(state.party[1].currentMp, mpBefore); assert.equal(state.party[1].statusTurns, 2)
    const burning = { ...makeMonster(76, 80, 'residual-test'), status: 'poison' }
    assert.equal(runtime.resolveTurnEnd(burning).mon.currentHp, burning.maxHp - Math.floor(burning.maxHp / 8))
    const chargeMove = Object.keys(MOVES).find(key => MOVES[key].charge && MOVES[key].power > 0)
    assert(chargeMove)
    state.party[1] = makeMonster(76, 80, 'charging')
    state.enemies[0] = makeMonster(10, 100, 'durable')
    const chargeMp = state.party[1].currentMp
    await attack('player', 1, 0, chargeMove)
    assert.equal(state.party[1].currentMp, chargeMp - runtime.getMoveMpCost(MOVES[chargeMove]))
    const releasingMp = state.party[1].currentMp
    await attack('player', 1, 0, chargeMove)
    assert.equal(state.party[1].currentMp, releasingMp)
  } finally { Math.random = originalRandom }
  const replay = await run(SCENARIOS.find(s => s.policy === 'damage' && s.potions === 2), 37, true)
  assert.deepEqual(await run(SCENARIOS.find(s => s.policy === 'damage' && s.potions === 2), 37, true), replay)
  assert.equal(replay.trace.length, replay.turns)
  assert.equal(replay.trace.filter(t => t.playerAction === 'potion').length, replay.potionsUsed)
  assert.equal(replay.trace.filter(t => t.playerAction === 'switch').length, replay.playerSwitches)

  const sourceFiles = ['scripts/audit-timber-league-realistic.mjs', 'scripts/timber-league-runtime.mjs',
    'src/components/Game/OriginalGame.jsx', 'src/game/timberLeague.js', 'src/game/data/godotMaps/godot_region_maps.js',
    'src/utils/gameData.js', 'src/utils/pokemonStats.js', 'src/utils/battleDamage.js', 'src/utils/battleAi.js',
    'src/utils/inventoryItems.js', 'src/utils/gameBalance.js', 'src/utils/constants.js']
  const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(rootDir, file))).digest('hex')]))
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const results = [], records = [], examples = [replay]
  const startedAt = new Date().toISOString()
  for (const scenario of SCENARIOS) {
    const runs = []
    for (let sample = 1; sample <= SAMPLES; sample++) {
      const result = await run(scenario, sample)
      runs.push(result); records.push(result)
      if (examples.length < 7 && !examples.some(r => r.scenario === result.scenario) && result.sample < 100 && result.enemySwitches === 2 && result.playerForcedSwitches > 0) examples.push(await run(scenario, sample, true))
      if (sample % 250 === 0) console.error(`[realistic] ${scenario.key}: ${sample}/${SAMPLES}`)
    }
    const summary = { scenario: scenario.key, team: scenario.team.key, levels: scenario.level.key, policy: scenario.policy,
      potionLimit: scenario.potions, enemySwitchLimit: scenario.enemySwitchLimit, ...summarize(runs),
      byOpponent: [0, 1, 2].map(variant => ({ variant, ...summarize(runs.filter(r => r.variant === variant)) })),
      byLead: [...new Set(runs.map(r => r.leadId))].map(leadId => ({ leadId, ...summarize(runs.filter(r => r.leadId === leadId)) })),
    }
    results.push(summary)
    writeFileSync(resolve(OUTPUT_DIR, 'progress.json'), JSON.stringify({ startedAt, completedScenarios: results.length, totalScenarios: SCENARIOS.length,
      samplesPerScenario: SAMPLES, summaries: results.map(r => ({ scenario: r.scenario, wins: r.outcomes.win || 0, winPercent: r.winPercent, winningTurns: r.turns.wins })) }, null, 2))
    console.error(`[realistic] ${scenario.key}: ${summary.winPercent}% wins; win P50=${summary.turns.wins.p50}, P90=${summary.turns.wins.p90}`)
  }
  const grouped = (key, predicate = () => true) => [...new Set(SCENARIOS.filter(predicate).map(s => s[key]?.key ?? s[key]))].map(value => ({ key: value,
    ...summarize(records.filter(r => { const s = SCENARIOS.find(s => s.key === r.scenario); return predicate(s) && (s[key]?.key ?? s[key]) === value })) }))
  const speciesInfo = id => ({ id, name: species.get(id).name, types: [species.get(id).type, species.get(id).type2].filter(Boolean).map(type => TYPE_NAMES_CN[type] || type) })
  const report = { generatedAt: new Date().toISOString(), startedAt, samplesPerScenario: SAMPLES, totalBattles: records.length, baseSeed: BASE_SEED,
    sourceSha256, sourceFiles: sourceHashes, trainerStyle, trainerRole: 'minigame', thresholdsCompared: THRESHOLDS,
    teams: TEAMS.map(team => ({ ...team, members: team.species.map(speciesInfo) })), levels: LEVELS,
    opponents: LEVELS.map(level => ({ levelProfile: level.key, variants: [0, 1, 2].map(variant => ({ variant,
      members: enemiesFor(variant, level.levels).map(mon => ({ ...speciesInfo(mon.baseId), level: mon.level, moves: mon.moves, stats: { hp: mon.maxHp, mp: mon.maxMp, atk: mon.atk, def: mon.def, spAtk: mon.spAtk, spDef: mon.spDef, spd: mon.spd } })) })) })),
    model: {
      partySelection: 'Three fixed six-species ordinary coverage parties, selected before opponent sampling. No box counter-drafting. The same six species face every opponent. Level assignment rotates over six party slots independently of opponent variant. Lead is chosen only from those six after seeing enemy lead. The enemy lineup is always getTimberLeagueNextTeam; player order/levels cannot change enemy species.',
      typePolicy: 'Choose affordable damaging moves by type effectiveness × STAB, then listed power; no damage/speed prediction. Switch when the current member is type-disadvantaged and another is materially better, at least two actions apart except exhausted MP. Heal active member at HP<=35%, MP<=10, or disruptive status. Lead and forced replacement use type matchup × squared visible level ratio; no damage prediction, and levels are never reassigned to counter the enemy.',
      damagePolicy: 'Choose expected-damage moves using current stats, HP, MP, type, accuracy and speed. Compare current matchup, switching entry damage and healing. No enemy action/RNG lookahead. Switch at least two actions apart unless no damaging move. Forced replacement and lead use predicted matchup.',
      battleRuntime: 'Production executeBattleMove plus production turn-start/end, speed/priority, move message/order helpers, AI and its exact trainerStyle. Production transition helper counts every player move attempt, potion or voluntary switch once. Forced replacements are free. Enemy voluntary switch count comes from the shared helper and recall logs. Enemy send-outs, status logs and switch intention messages are retained for AI cooldown. Enemy switches preserve temporary state, matching production. Player switches clear temporary state.',
      items: 'Only max_potion (超级伤药), capped at 0 or 2 per simulated challenge; active-only recovery, no revival. This simulation cap is not a new game rule. Opponents have zero potions.',
      residuals: 'Match current production asymmetry: regular move turns tick residual statuses on surviving active members; potion/switch reply turns do so only when a member faints. This may merit a separate gameplay decision but was not changed for calibration.',
      limits: ['Headless deterministic decision policies, not human win rates or optimal play.', 'All teams start full HP/MP with default level moves and no permanent boosts, battle items, custom TM plans or Dynamax.', 'No strategy plans multi-turn setup/status combinations; a no_usable_damage_policy stop may still be legally playable via status moves or residual damage.', 'Advanced policy knows current opposing stats/moves as previous tactical audit did; type policy deliberately does not predict damage.', 'No animation, UI, cloud persistence, disconnect/retry or resource synchronization simulation.', 'No battle-time experience/level growth; league currently settles rewards on final victory.', 'One-high profile is explicitly 100/30/30/30/30/30; other low-level choices are not inferred.', 'Wilson intervals describe seeded random-battle uncertainty conditional on these fixed policies and parties, not player population uncertainty.'],
    },
    validation: { deterministicReplay: true, productionActionCounter: true, noNegativeMp: true, potionRecoveryAndCure: true, sleepingAttemptNoMp: true, chargePaysOnce: true, replacementTakesReply: true, poisonResidualDamage: true,
      sharedEnemySwitchCap: true, forcedSendoutsNotCountedAsSwitches: true, speciesInvariantUnderPlayerReorderAndLevelChange: true },
    aggregate: { capped: summarize(records.filter(r => r.scenario.endsWith('cap2'))),
      byTeam: grouped('team', s => s.enemySwitchLimit === 2), byLevel: grouped('level', s => s.enemySwitchLimit === 2),
      byPolicy: grouped('policy', s => s.enemySwitchLimit === 2) }, results,
  }
  const lines = records.map(r => JSON.stringify(r)).join('\n') + '\n'
  writeFileSync(resolve(OUTPUT_DIR, 'runs.jsonl.gz'), gzipSync(lines))
  writeFileSync(resolve(OUTPUT_DIR, 'examples.json'), JSON.stringify(examples, null, 2) + '\n')
  writeFileSync(resolve(OUTPUT_DIR, 'summary.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output: OUTPUT_DIR, totalBattles: records.length, samplesPerScenario: SAMPLES,
    results: results.map(r => ({ scenario: r.scenario, outcomes: r.outcomes, winPercent: r.winPercent, turns: r.turns.wins,
      medals: r.medals, meanEnemySwitches: r.actions.enemySwitches.mean })) }, null, 2))
})
