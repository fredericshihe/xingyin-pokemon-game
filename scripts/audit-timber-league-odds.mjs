#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const SAMPLES = Number(process.env.TIMBER_AUDIT_SAMPLES) || 400
const LEVEL_BIAS = Number(process.env.TIMBER_AUDIT_LEVEL_BIAS) || 0
const SCENARIO_FILTER = process.env.TIMBER_AUDIT_SCENARIO || ''
const PLAYER_SPECIES = [72, 74, 76, 28, 17, 6]
const SCENARIOS = [
  { name: 'three-lv47-no-items', level: 47, partySize: 3, potions: 0 },
  { name: 'six-lv47-two-items', level: 47, partySize: 6, potions: 2 },
  { name: 'six-lv52-two-items', level: 52, partySize: 6, potions: 2 },
  { name: 'six-lv50-average-two-items', level: 50, partySize: 6, potions: 2, variedParty: true },
  { name: 'six-lv60-average-two-items', level: 60, partySize: 6, potions: 2, variedParty: true },
  { name: 'six-lv70-average-two-items', level: 70, partySize: 6, potions: 2, variedParty: true },
  { name: 'six-lv80-average-no-items', level: 80, partySize: 6, potions: 0, variedParty: true },
  { name: 'six-lv80-average-two-items', level: 80, partySize: 6, potions: 2, variedParty: true },
  { name: 'six-lv90-average-two-items', level: 90, partySize: 6, potions: 2, variedParty: true },
  { name: 'six-lv100-average-two-items', level: 100, partySize: 6, potions: 2, variedParty: true },
  ...[1, 2, 3, 4, 5].map((partySize) => ({ name: `${partySize}-lv80-average-two-items`, level: 80, partySize, potions: 2, variedParty: true })),
  { name: 'six-mixed-levels-two-items', level: 80, levels: [90, 80, 70, 60, 50, 40], partySize: 6, potions: 2, variedParty: true },
  { name: 'three-mixed-levels-two-items', level: 80, levels: [80, 60, 40], partySize: 3, potions: 2, variedParty: true },
  { name: 'one-lv100-five-lv20-no-items', level: 100, levels: [100, 20, 20, 20, 20, 20], partySize: 6, potions: 0, variedParty: true },
]

const makeRandom = (seed) => {
  let state = seed >>> 0
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4294967296
  }
}

const median = (numbers) => {
  if (numbers.length === 0) return null
  const sorted = numbers.slice().sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

const percentile = (numbers, portion) => {
  if (numbers.length === 0) return null
  const sorted = numbers.slice().sort((a, b) => a - b)
  return sorted[Math.floor((sorted.length - 1) * portion)]
}

await withViteAuditServer(async ({ loadModule }) => {
  const { MONSTERS, MOVES, POTIONS, getBalancedMovesForLevel } = await loadModule('/src/utils/gameData.js')
  const { calculateStatsForLevel } = await loadModule('/src/utils/pokemonStats.js')
  const { calculateBattleDamage } = await loadModule('/src/utils/battleDamage.js')
  const { chooseTrainerBattleAction } = await loadModule('/src/utils/battleAi.js')
  const { TIMBER_LEAGUE_ROUTES, calculateTimberLeagueStageGold, getTimberLeagueNextTeam, getTimberLeagueLevelOffset } = await loadModule('/src/game/timberLeague.js')
  const species = new Map(MONSTERS.map((monster) => [monster.id, monster]))
  const averageFinalSpecies = MONSTERS.filter((monster) => {
    const total = ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
      .reduce((sum, key) => sum + (Number(monster[key]) || 0), 0)
    return !monster.evolvesTo && total >= 440 && total <= 560 &&
      getBalancedMovesForLevel(monster, 80).some((key) => MOVES[key]?.power > 0)
  })
  if (averageFinalSpecies.length < 6) throw new Error('Not enough average final species for the level-80 audit')

  const makeMonster = (id, level) => {
    const base = species.get(id)
    if (!base) throw new Error(`Unknown monster ${id}`)
    const stats = calculateStatsForLevel({
      maxHp: base.maxHp, maxMp: base.maxMp, atk: base.atk, def: base.def,
      spAtk: base.spAtk, spDef: base.spDef, spd: base.spd,
    }, level)
    return {
      ...base, ...stats, level, currentHp: stats.maxHp, currentMp: stats.maxMp,
      moves: getBalancedMovesForLevel(base, level),
    }
  }

  const expectedDamage = (attacker, defender, moveKey) => {
    const move = MOVES[moveKey]
    if (!move || move.category === 'status' || move.power <= 0 || move.charge || move.requiresTargetStatus) return 0
    return calculateBattleDamage(attacker, defender, move, { randomFactor: 0.925 }).damage * (move.accuracy ?? 100) / 100
  }

  const choosePlayerMove = (player, enemy) => {
    const candidates = player.moves
      .filter((key) => MOVES[key] && (MOVES[key].cost || 0) <= player.currentMp)
      .map((key) => ({ key, damage: expectedDamage(player, enemy, key), cost: MOVES[key].cost || 0 }))
      .filter((entry) => entry.damage > 0)
    const finishers = candidates.filter((entry) => entry.damage >= enemy.currentHp)
    if (finishers.length > 0) return finishers.sort((a, b) => a.cost - b.cost || b.damage - a.damage)[0].key
    return candidates.sort((a, b) => b.damage - a.damage || a.cost - b.cost)[0]?.key || null
  }

  const rollAttack = (attacker, defender, moveKey, random) => {
    const move = MOVES[moveKey]
    if (!move || attacker.currentHp <= 0 || (move.cost || 0) > attacker.currentMp) return
    attacker.currentMp -= move.cost || 0
    if (random() * 100 >= (move.accuracy ?? 100)) return
    const damage = calculateBattleDamage(attacker, defender, move, {
      randomFactor: (85 + Math.floor(random() * 16)) / 100,
      forceCrit: random() < 1 / 16,
    }).damage
    defender.currentHp = Math.max(0, defender.currentHp - damage)
  }

  const chooseEnemyAction = (enemyTeam, enemy, player, battleLogs, random) => {
    const originalRandom = Math.random
    Math.random = random
    try {
      return chooseTrainerBattleAction({
        enemyTeam, activeEnemyMon: enemy, targetMon: player,
        battleKind: 'trainer', trainerRole: 'minigame',
        battleLogs, potionsRemaining: 0, random,
      })
    } finally {
      Math.random = originalRandom
    }
  }

  const simulate = (route, scenario, seed, restoreBetweenStages) => {
    const random = makeRandom(seed * 2654435761 + 1013904223)
    const partyIds = scenario.variedParty
      ? averageFinalSpecies
        .map((monster) => ({ id: monster.id, sort: random() }))
        .sort((a, b) => a.sort - b.sort)
        .slice(0, scenario.partySize)
        .map((entry) => entry.id)
      : PLAYER_SPECIES.slice(0, scenario.partySize)
    const party = partyIds.map((id, index) => makeMonster(id, scenario.levels?.[index] ?? scenario.level))
    let activeIndex = 0
    let turns = 0
    let potions = scenario.potions
    let gold = 0
    for (let stage = 1; stage <= route.stages; stage += 1) {
      if (restoreBetweenStages && stage > 1) {
        party.forEach((mon) => { mon.currentHp = mon.maxHp; mon.currentMp = mon.maxMp })
      }
      const enemyTeam = getTimberLeagueNextTeam(route.key, stage, {
        clearedStageIds: Array.from({ length: seed % route.teamVariants[stage - 1].length }, (_, index) => `${route.key}:${stage}:odds-${index}`),
      }, party).map((entry, index) => ({
        ...makeMonster(entry.pokemonId, Math.max(1, entry.level - LEVEL_BIAS)), id: `enemy-${index}`,
      }))
      const battleLogs = []
      let enemyIndex = 0
      let safety = 0
      while (enemyTeam.some((mon) => mon.currentHp > 0) && safety++ < 160) {
          if (enemyTeam[enemyIndex].currentHp <= 0) {
            enemyIndex = enemyTeam.findIndex((mon) => mon.currentHp > 0)
          }
          const enemy = enemyTeam[enemyIndex]
          if (party.every((mon) => mon.currentHp <= 0)) return { won: false, turns, gold }
          if (party[activeIndex].currentHp <= 0) {
            activeIndex = party.findIndex((mon) => mon.currentHp > 0)
          }
          const player = party[activeIndex]
          const moveKey = choosePlayerMove(player, enemy)
          const predictedHit = moveKey ? expectedDamage(player, enemy, moveKey) : 0
          const shouldHeal = potions > 0 && (!moveKey || enemy.currentHp > predictedHit) && (
            player.currentHp <= player.maxHp * 0.35 ||
            (player.currentMp < 13 && player.maxMp - player.currentMp >= 30) || !moveKey
          )
          if (!moveKey && !shouldHeal) return { won: false, turns, gold }
          const enemyAction = chooseEnemyAction(enemyTeam, enemy, player, battleLogs, random)
          const switched = enemyAction.type === 'switch' && enemyAction.target
          const defendingEnemy = switched ? enemyAction.target : enemy
          if (switched) {
            enemyIndex = enemyTeam.findIndex((mon) => mon.id === defendingEnemy.id)
            battleLogs.push(`对手收回了 ${enemy.name}`)
          } else {
            battleLogs.push(`对手行动：${enemyAction.moveKey || '无技能'}`)
          }
          const enemyMove = switched ? null : enemyAction.moveKey
          const enemyPriority = MOVES[enemyMove]?.priority || 0
          const playerPriority = shouldHeal || switched ? 6 : (MOVES[moveKey]?.priority || 0)
          const playerFirst = playerPriority > enemyPriority || (
            playerPriority === enemyPriority && player.spd >= defendingEnemy.spd
          )
          turns += 1
          const actPlayer = () => {
            if (player.currentHp <= 0) return
            if (shouldHeal) {
              player.currentHp = Math.min(player.maxHp, player.currentHp + POTIONS.super_potion.healAmount)
              player.currentMp = Math.min(player.maxMp, player.currentMp + POTIONS.super_potion.mpRestoreAmount)
              potions -= 1
            } else {
              rollAttack(player, defendingEnemy, moveKey, random)
            }
          }
          const actEnemy = () => {
            if (enemy.currentHp > 0 && enemyMove) rollAttack(enemy, player, enemyMove, random)
          }
          if (playerFirst) { actPlayer(); actEnemy() } else { actEnemy(); actPlayer() }
      }
      if (enemyTeam.some((mon) => mon.currentHp > 0)) return { won: false, turns, gold }
      gold += calculateTimberLeagueStageGold(enemyTeam)
    }
    return { won: true, turns, gold }
  }

  const results = []
  for (const scenario of SCENARIOS.filter(({ name }) => !SCENARIO_FILTER || name.includes(SCENARIO_FILTER))) {
    for (const route of Object.values(TIMBER_LEAGUE_ROUTES)) {
      for (const restoreBetweenStages of route.stages > 1 ? [false, true] : [false]) {
        const runs = Array.from({ length: SAMPLES }, (_, index) => simulate(route, scenario, index + 1, restoreBetweenStages))
        const wins = runs.filter((run) => run.won)
        results.push({
          scenario: scenario.name,
          route: route.key,
          opponentLevelOffset: Math.max(0, getTimberLeagueLevelOffset([{ level: scenario.level }], route.key) - LEVEL_BIAS),
          betweenStages: restoreBetweenStages ? 'full-restore-counterfactual' : 'actual-carry',
          runs: SAMPLES,
          winPercent: Math.round(wins.length * 1000 / SAMPLES) / 10,
          averageGoldPerAttempt: Math.round(runs.reduce((total, run) => total + run.gold, 0) / SAMPLES),
          goldOnFullClear: wins[0]?.gold ?? 0,
          goldPercent: Math.round(wins.filter((run) => run.turns <= route.thresholds.gold).length * 1000 / SAMPLES) / 10,
          medianWinningTurns: median(wins.map((run) => run.turns)),
          winningTurnsP25: percentile(wins.map((run) => run.turns), 0.25),
          winningTurnsP35: percentile(wins.map((run) => run.turns), 0.35),
          winningTurnsP75: percentile(wins.map((run) => run.turns), 0.75),
          winningTurnsP90: percentile(wins.map((run) => run.turns), 0.9),
          winningTurnCounts: wins.reduce((counts, run) => {
            counts[run.turns] = (counts[run.turns] || 0) + 1
            return counts
          }, {}),
          silverPercent: Math.round(wins.filter((run) => run.turns <= route.thresholds.silver).length * 1000 / SAMPLES) / 10,
          goldThreshold: route.thresholds.gold,
          silverThreshold: route.thresholds.silver,
          opponentLevels: getTimberLeagueNextTeam(route.key, 1, {}, scenario.levels || Array(scenario.partySize).fill(scenario.level)).map((entry) => Math.max(1, entry.level - LEVEL_BIAS)),
          medalDistribution: {
            gold: wins.filter((run) => run.turns <= route.thresholds.gold).length,
            silver: wins.filter((run) => run.turns > route.thresholds.gold && run.turns <= route.thresholds.silver).length,
            bronze: wins.filter((run) => run.turns > route.thresholds.silver).length,
          },
          averageVouchersPerAttempt: Math.round(wins.reduce((total, run) => total + (run.turns <= route.thresholds.gold ? route.rewards.gold : run.turns <= route.thresholds.silver ? route.rewards.silver : route.rewards.bronze), 0) * 100 / SAMPLES) / 100,
        })
      }
    }
  }
  const report = {
    model: 'Seeded approximate battle simulation using actual species, level stats, move sets, damage, accuracy, critical hits, MP costs and minigame trainer AI (including switches, no opponent potions). One match against six opponents; sorted opponent levels match each party member exactly, repeating ranks evenly for parties smaller than six. Average parties sample distinct final species with base-stat totals from 440 to 560. Does not model statuses, experience gains or manual tactical switching. Player super potions restore 50 HP/30 MP and are used automatically at low HP/MP.',
    averageFinalSpeciesCount: averageFinalSpecies.length,
    levelBias: LEVEL_BIAS,
    results,
  }
  if (process.env.TIMBER_AUDIT_OUTPUT) {
    mkdirSync(dirname(process.env.TIMBER_AUDIT_OUTPUT), { recursive: true })
    writeFileSync(process.env.TIMBER_AUDIT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`)
  }
  console.log(JSON.stringify(report, null, 2))
})
