#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { withViteAuditServer } from './load-vite-module.mjs'
import { GODOT_REGION_MAPS } from '../src/game/data/godotMaps/godot_region_maps.js'
import { TYPES } from '../src/utils/constants.js'

// Exercise the actual rule normalizer and damage hook without mounting the cloud-backed UI.
const source = fs.readFileSync(new URL('../src/components/Game/OriginalGame.jsx', import.meta.url), 'utf8')
const between = (start, end) => {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert(from >= 0 && to > from, `Missing battle hook: ${start}`)
  return source.slice(from, to)
}
const hooks = vm.runInNewContext([
  between('const toBattleEnvironmentText =', 'const toBattleEnvironmentNumber ='),
  between('const SPECIAL_BATTLE_RULE_STAT_KEYS =', 'const getActiveSpecialBattleRule ='),
  between('const specialBattleRuleMoveTypeMatches =', 'const applySpecialBattleOpeningToSnapshot ='),
  between('const getSpecialBattleDamageMultiplier =', 'const resolveSpecialBattleEnemyTurnAfterAction ='),
  '({ normalizeSpecialBattleRule, getSpecialBattleDamageMultiplier, consumeSpecialBattleEnemyDamageBoosts })'
].join('\n'), {
  TYPES,
  getMonsterMaxHp: (mon) => mon?.maxHp || 1,
  getMonsterCurrentHp: (mon) => mon?.currentHp ?? mon?.maxHp ?? 1,
  withBattleRuntimeDefaults: (mon) => ({ ...mon, volatileStatuses: { ...mon?.volatileStatuses } })
})

const getBoss = (map) => map.runtimeEvents.find((event) => event.type === 'boss')
const ironMap = GODOT_REGION_MAPS.GodotMapV2_IronDojo
const dragonMap = GODOT_REGION_MAPS.GodotMapV2_DragonDojo
const ironRule = hooks.normalizeSpecialBattleRule(getBoss(ironMap).properties.specialBattleRule)
const dragonRule = hooks.normalizeSpecialBattleRule(getBoss(dragonMap).properties.specialBattleRule)
const multiplier = (rule, enemyTurns, category = 'physical', enemyAttacks = false, attacker = {}) => (
  hooks.getSpecialBattleDamageMultiplier({
    rule, state: { enemyTurnCount: enemyTurns }, attacker,
    defender: { maxHp: 100, currentHp: 100 },
    move: { category, type: TYPES.NORMAL },
    attackerSide: enemyAttacks ? 'enemy' : 'player',
    defenderSide: enemyAttacks ? 'player' : 'enemy'
  })
)

assert(!ironRule.openingEnemyStatStages, 'Iron boss must not stack permanent defense with its timed shield')
assert.equal(multiplier(ironRule, 0), 0.8)
assert.equal(multiplier(ironRule, 3), 0.8)
assert.equal(multiplier(ironRule, 4), 1, 'Iron shield must expire after the fourth enemy turn')
assert.equal(multiplier(ironRule, 20), 1, 'Later opponents must not restart the opening shield')
assert.equal(multiplier(ironRule, 0, 'special'), 1, 'Special attackers must bypass the shield')
const chargedFoe = { volatileStatuses: { eliteCriticalDamageBoostTurns: 1 } }
assert.equal(multiplier(ironRule, 4, 'physical', true, chargedFoe), 1.2)
const spentFoe = hooks.consumeSpecialBattleEnemyDamageBoosts(chargedFoe, 30)
assert.equal(multiplier(ironRule, 4, 'physical', true, spentFoe), 1)
assert.equal(multiplier(dragonRule, 4, 'special', true), 1)
assert.equal(multiplier(dragonRule, 5, 'special', true), 1.1)
assert.equal(multiplier(dragonRule, 100, 'special', true), 1.1, 'Dragon pressure must never accumulate each turn')

await withViteAuditServer(async ({ loadModule }) => {
  const [data, stats, damage, scaling] = await Promise.all([
    loadModule('/src/utils/gameData.js'), loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/battleDamage.js'), loadModule('/src/utils/trainerBattleScaling.js')
  ])
  const makeMon = (id, level) => {
    const base = data.MONSTERS.find((mon) => mon.id === id)
    assert(base, `Missing species ${id}`)
    return { ...base, ...stats.calculateStatsForLevel(base, level), level, moves: data.getBalancedMovesForLevel(base, level) }
  }
  const hit = (attacker, defender, move) => damage.calculateBattleDamage(attacker, defender, move, { randomFactor: 0.925 })
  const samples = [
    { attacker: 208, defender: 139, move: 'earthquake' },
    { attacker: 205, defender: 139, move: 'close_combat' },
    { attacker: 198, defender: 204, move: 'crunch' },
    { attacker: 74, defender: 204, move: 'heat_wave' }
  ].map(({ attacker: id, defender: foeId, move: key }) => {
    const player = makeMon(id, 95)
    assert(player.moves.includes(key), `${player.name} must actually learn ${key}`)
    const member = getBoss(ironMap).properties.team.find((entry) => entry.pokemonId === foeId)
    const foe = makeMon(foeId, member.level)
    const move = data.MOVES[key]
    const before = hit(player, { ...foe, statStages: { def: 1 } }, move).damage
    const baseDamage = hit(player, foe, move).damage
    const duringShield = Math.floor(baseDamage * multiplier(ironRule, 0, move.category))
    const afterShield = Math.floor(baseDamage * multiplier(ironRule, 4, move.category))
    return { attacker: player.name, playerLevel: player.level, defender: foe.name, enemyLevel: foe.level, hp: foe.maxHp,
      move: move.name, category: move.category, before, duringShield, afterShield,
      hitsBefore: Math.ceil(foe.maxHp / before), hitsAfterShield: Math.ceil(foe.maxHp / afterShield) }
  })
  assert(samples.filter((row) => row.category === 'physical').every((row) => row.afterShield > row.before))
  assert(samples.filter((row) => row.category === 'special').every((row) => row.before === row.duringShield && row.before === row.afterShield))

  const maps = [ironMap, dragonMap].map((map) => {
    assert.equal(map.encounterZones.length, 0, 'Elite routes must not add random-battle attrition')
    assert(map.runtimeEvents.some((event) => event.type === 'heal' && event.properties.fullRestore && event.properties.reusable && event.properties.goldCost <= 1))
    const encounters = map.runtimeEvents.filter((event) => event.type === 'boss' || event.properties?.role === 'lieutenant')
    let previousAce = 0
    const rows = encounters.map((event, index) => {
      const props = event.properties
      const levels = props.team.map((member) => member.level)
      const ace = Math.max(...levels)
      assert(ace >= previousAce && (index === 0 || ace - previousAce <= 3), `${event.id}: abrupt level step`)
      assert(ace <= 100 && props.recommendedLevel >= ace)
      assert.equal(props.requiredTrainerIds.length, index)
      assert.equal(scaling.getTrainerCatchUpBonus({ role: props.role, mapConfig: map, playerLevel: 100 }), 0)
      previousAce = ace
      return { event: props.name, size: levels.length, levels, recommendedLevel: props.recommendedLevel, rule: props.specialBattleRule.description }
    })
    // This is a matchup check, not a full battle win-rate model: ordinary evolved species,
    // their real learned moves, no stat stones, no legendary roster and no invented coverage.
    const coverage = getBoss(map).properties.team.map((member) => {
      const foe = makeMon(member.pokemonId, getBoss(map).properties.recommendedLevel)
      const counters = [74, 76, 72, 28, 6, 9, 134, 144, 34, 208].flatMap((id) => {
        const player = makeMon(id, foe.level)
        return player.moves.map((key) => ({ player, move: data.MOVES[key] })).filter(({ move }) => move?.power > 0 && move.category !== 'status')
          .map(({ player, move }) => ({ pokemon: player.name, move: move.name, ...hit(player, foe, move) }))
      }).filter((row) => row.effectiveness > 1).sort((a, b) => b.damage - a.damage)
      assert(counters.length > 0, `${foe.name}: no ordinary evolved counter in the sample pool`)
      return { enemy: foe.name, counters: counters.slice(0, 2).map(({ pokemon, move, effectiveness }) => ({ pokemon, move, effectiveness })) }
    })
    return { map: map.displayName, unlockLevel: map.unlockLevel, encounters: rows, bossCoverage: coverage }
  })
  console.log(JSON.stringify({ model: 'Actual runtime rule boundaries and damage formula; no RNG/status/AI switching/potion battle simulation.', samples, maps }, null, 2))
})
console.log('[audit-elite-endgame-balance] OK: finite Iron shield, stable Dragon pressure, gradual levels and recoverable routes.')
