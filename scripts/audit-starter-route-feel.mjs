#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const STARTER_ROUTE_SCENARIOS = [
  {
    starterId: 1,
    starter: '妙蛙种子',
    routeLabel: '推荐混合路线',
    route: [
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_lake_shallows',
      'valley_lake_shallows',
      'valley_lake_shallows',
      'valley_training_thicket',
      'valley_training_thicket',
      'valley_training_thicket'
    ],
    thresholds: {
      maxAvgLosses: 0.5,
      minAtMostOneLossRate: 0.94,
      minAvgFinalLevel: 8.15
    }
  },
  {
    starterId: 2,
    starter: '小火龙',
    routeLabel: '推荐混合路线',
    route: [
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_lake_shallows',
      'valley_lake_shallows',
      'valley_lake_shallows',
      'valley_training_thicket',
      'valley_training_thicket',
      'valley_training_thicket'
    ],
    thresholds: {
      maxAvgLosses: 0.5,
      minAtMostOneLossRate: 0.94,
      minAvgFinalLevel: 8.15
    }
  },
  {
    starterId: 3,
    starter: '杰尼龟',
    routeLabel: '推荐混合路线',
    route: [
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_safe_grass',
      'valley_flower_meadow',
      'valley_flower_meadow',
      'valley_flower_meadow',
      'valley_training_thicket',
      'valley_training_thicket',
      'valley_training_thicket'
    ],
    thresholds: {
      maxAvgLosses: 0.5,
      minAtMostOneLossRate: 0.94,
      minAvgFinalLevel: 8.15
    }
  },
  {
    starterId: 1,
    starter: '妙蛙种子',
    routeLabel: '只刷阳光草坡',
    route: Array(10).fill('valley_safe_grass'),
    thresholds: {
      maxAvgLosses: 0.25,
      minAtMostOneLossRate: 0.97,
      minAvgFinalLevel: 7.7
    }
  },
  {
    starterId: 2,
    starter: '小火龙',
    routeLabel: '只刷阳光草坡',
    route: Array(10).fill('valley_safe_grass'),
    thresholds: {
      maxAvgLosses: 0.25,
      minAtMostOneLossRate: 0.97,
      minAvgFinalLevel: 7.7
    }
  },
  {
    starterId: 3,
    starter: '杰尼龟',
    routeLabel: '只刷阳光草坡',
    route: Array(10).fill('valley_safe_grass'),
    thresholds: {
      maxAvgLosses: 0.25,
      minAtMostOneLossRate: 0.97,
      minAvgFinalLevel: 7.7
    }
  }
]

const RUNS = 300
const POTION_ORDER = ['potion', 'super_potion', 'hyper_potion']
const STATUS_IMMUNITY_BY_TYPE = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  freeze: ['ice']
}

const weightedPick = (items, getWeight) => {
  const total = items.reduce((sum, item) => sum + getWeight(item), 0)
  let roll = Math.random() * total
  for (const item of items) {
    roll -= getWeight(item)
    if (roll <= 0) return item
  }
  return items[items.length - 1]
}

const rollChance = (chance = 100) => Math.random() * 100 < chance
const getMonsterTypes = (mon) => [mon?.type, mon?.type2].filter(Boolean)
const hasStatusImmunity = (mon, status) => {
  const immuneTypes = STATUS_IMMUNITY_BY_TYPE[status]
  if (!immuneTypes) return false
  return immuneTypes.some((type) => getMonsterTypes(mon).includes(type))
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { ENCOUNTER_TABLES },
    { MONSTERS, MOVES, POTIONS, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleRewards, getPlayerAverageLevel },
    { calculateBattleDamage, resolveBattleStat, rollDamageRandomFactor },
    { simulateMonsterExpGain },
    { chooseBattleEnemyMove },
  ] = await Promise.all([
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/battleDamage.js'),
    loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/battleAi.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const getBaseMonsterDefinition = (id) => monsterById.get(Number(id)) || null
  const getBaseStats = (monster) => (
    monster.stats
      ? {
          maxHp: monster.stats.hp,
          maxMp: Math.floor((monster.stats.sp_attack || 50) * 0.8) + 20,
          atk: monster.stats.attack,
          def: monster.stats.defense,
          spAtk: monster.stats.sp_attack,
          spDef: monster.stats.sp_defense,
          spd: monster.stats.speed,
        }
      : {
          maxHp: monster.maxHp,
          maxMp: monster.maxMp,
          atk: monster.atk,
          def: monster.def,
          spAtk: monster.spAtk,
          spDef: monster.spDef,
          spd: monster.spd,
        }
  )

  const makeMonster = (monsterId, level, id = `m_${monsterId}`) => {
    const base = getBaseMonsterDefinition(monsterId)
    const stats = calculateStatsForLevel(getBaseStats(base), level)
    return {
      ...base,
      ...stats,
      id,
      baseId: base.id,
      level,
      currentHp: stats.maxHp,
      currentMp: stats.maxMp,
      currentExp: 0,
      status: null,
      statusTurns: 0,
      volatileStatuses: {},
      statStages: {},
      moves: getBalancedMovesForLevel(base, level)
    }
  }

  const refreshForLevel = (mon) => {
    const base = getBaseMonsterDefinition(mon.baseId || mon.id)
    const stats = calculateStatsForLevel(getBaseStats(base), mon.level)
    return {
      ...mon,
      ...base,
      ...stats,
      baseId: base.id,
      moves: getBalancedMovesForLevel(base, mon.level),
      currentHp: Math.min(stats.maxHp, mon.currentHp),
      currentMp: Math.min(stats.maxMp, mon.currentMp),
    }
  }

  const getDamagingMoves = (mon, target) => (
    (Array.isArray(mon?.moves) ? mon.moves : [])
      .map((moveKey) => ({ moveKey, move: MOVES[moveKey] }))
      .filter(({ move }) => (
        move &&
        move.category !== 'status' &&
        Number(move.power) > 0 &&
        (Number(mon.currentMp) || 0) >= (Number(move.cost) || 0) &&
        (!move.requiresTargetStatus || target?.status === move.requiresTargetStatus) &&
        (!move.requiresUserStatus || mon?.status === move.requiresUserStatus)
      ))
  )

  const choosePlayerMove = (mon, target) => {
    const damagingMoves = getDamagingMoves(mon, target)
    if (damagingMoves.length === 0) return null
    return damagingMoves
      .map(({ moveKey, move }) => ({
        moveKey,
        move,
        outcome: calculateBattleDamage(mon, target, move, { randomFactor: 0.925 })
      }))
      .sort((left, right) => {
        const leftKo = left.outcome.damage >= target.currentHp ? 1 : 0
        const rightKo = right.outcome.damage >= target.currentHp ? 1 : 0
        return (
          rightKo - leftKo ||
          right.outcome.damage - left.outcome.damage ||
          right.outcome.effectiveness - left.outcome.effectiveness ||
          (Number(left.move.cost) || 0) - (Number(right.move.cost) || 0)
        )
      })[0]?.moveKey || null
  }

  const createStatusPayload = (status) => {
    if (status === 'sleep') return { status, statusTurns: 2 + Math.floor(Math.random() * 3) }
    if (status === 'freeze') return { status, statusTurns: 0 }
    return { status, statusTurns: 0 }
  }

  const getConfusionDurationTurns = () => 2 + Math.floor(Math.random() * 4)

  const calculateConfusionSelfHitDamage = (mon) => {
    const level = mon?.level || 50
    const attackStat = Math.max(1, resolveBattleStat(mon, 'atk'))
    const defenseStat = Math.max(1, resolveBattleStat(mon, 'def'))
    const randomFactor = (Math.floor(Math.random() * 16) + 85) / 100
    const damage = (((2 * level / 5 + 2) * 40 * (attackStat / defenseStat)) / 50 + 2) * randomFactor
    return Math.max(1, Math.floor(damage))
  }

  const resolveTurnStart = (mon, attemptedMoveKey = null) => {
    let nextMon = {
      ...mon,
      volatileStatuses: { ...(mon.volatileStatuses || {}) },
      statStages: { ...(mon.statStages || {}) }
    }
    let canAct = true
    const attemptedMove = attemptedMoveKey ? MOVES[attemptedMoveKey] : null
    const pendingConfusionTurns = Math.max(0, Number(nextMon.volatileStatuses.confusion) || 0)

    if (nextMon.volatileStatuses.flinch) {
      delete nextMon.volatileStatuses.flinch
      canAct = false
    }

    if (canAct && nextMon.status === 'sleep') {
      const nextTurns = Math.max(0, (nextMon.statusTurns || 1) - 1)
      if (nextTurns <= 0) {
        nextMon.status = null
        nextMon.statusTurns = 0
      } else {
        nextMon.statusTurns = nextTurns
        if (!attemptedMove?.usableWhileAsleep) canAct = false
      }
    }

    if (canAct && nextMon.status === 'freeze') {
      if (attemptedMove?.thawsUser || rollChance(20)) {
        nextMon.status = null
        nextMon.statusTurns = 0
      } else {
        canAct = false
      }
    }

    if (canAct && nextMon.status === 'paralysis' && rollChance(25)) {
      canAct = false
    }

    if (canAct && pendingConfusionTurns > 0) {
      const nextTurns = Math.max(0, pendingConfusionTurns - 1)
      if (nextTurns <= 0) {
        delete nextMon.volatileStatuses.confusion
      } else {
        nextMon.volatileStatuses.confusion = nextTurns
        if (rollChance(100 / 3)) {
          nextMon.currentHp = Math.max(0, nextMon.currentHp - calculateConfusionSelfHitDamage(nextMon))
          canAct = false
        }
      }
    }

    return { mon: nextMon, canAct }
  }

  const resolveTurnEnd = (mon) => {
    let nextMon = {
      ...mon,
      volatileStatuses: { ...(mon.volatileStatuses || {}) },
      statStages: { ...(mon.statStages || {}) }
    }
    if (nextMon.currentHp > 0 && (nextMon.status === 'poison' || nextMon.status === 'burn')) {
      const divisor = nextMon.status === 'poison' ? 8 : 16
      nextMon.currentHp = Math.max(0, nextMon.currentHp - Math.max(1, Math.floor(nextMon.maxHp / divisor)))
    }
    return { mon: nextMon }
  }

  const applyPrimaryStatusToMon = (target, status) => {
    if (!status || target.status || hasStatusImmunity(target, status)) return target
    return { ...target, ...createStatusPayload(status) }
  }

  const applyVolatileStatusToMon = (target, status) => {
    if (!status) return target
    const volatileStatuses = { ...(target.volatileStatuses || {}) }
    if (status === 'confusion') {
      if (volatileStatuses.confusion) return target
      volatileStatuses.confusion = getConfusionDurationTurns()
    } else if (status === 'flinch') {
      volatileStatuses.flinch = 1
    }
    return { ...target, volatileStatuses }
  }

  const clampStatStage = (value) => Math.max(-6, Math.min(6, value))
  const getMoveStatChanges = (move) => (
    Array.isArray(move?.statChanges)
      ? move.statChanges.filter(Boolean)
      : (move?.statChange ? [move.statChange] : [])
  )

  const applyStatChangeToMon = (target, statChange) => {
    if (!statChange?.stat || !statChange?.stages) return target
    const statStages = { ...(target.statStages || {}) }
    statStages[statChange.stat] = clampStatStage((statStages[statChange.stat] || 0) + statChange.stages)
    return { ...target, statStages }
  }

  const applyMove = (attacker, defender, moveKey) => {
    const move = MOVES[moveKey]
    let nextAttacker = {
      ...attacker,
      volatileStatuses: { ...(attacker.volatileStatuses || {}) },
      statStages: { ...(attacker.statStages || {}) }
    }
    let nextDefender = {
      ...defender,
      volatileStatuses: { ...(defender.volatileStatuses || {}) },
      statStages: { ...(defender.statStages || {}) }
    }
    if (!move) return { attacker: nextAttacker, defender: nextDefender }

    nextAttacker.currentMp = Math.max(0, nextAttacker.currentMp - (Number(move.cost) || 0))
    nextAttacker.volatileStatuses.lastMoveKey = moveKey

    const hit = move.alwaysHits || rollChance(typeof move.accuracy === 'number' ? move.accuracy : 100)
    if (!hit) return { attacker: nextAttacker, defender: nextDefender }

    if (move.category !== 'status' && Number(move.power) > 0) {
      const outcome = calculateBattleDamage(nextAttacker, nextDefender, move, {
        randomFactor: rollDamageRandomFactor()
      })
      nextDefender.currentHp = Math.max(0, nextDefender.currentHp - outcome.damage)
      if (move.effect === 'drain') {
        nextAttacker.currentHp = Math.min(
          nextAttacker.maxHp,
          nextAttacker.currentHp + Math.floor(outcome.damage * 0.5)
        )
      }
    } else if (move.effect === 'heal') {
      nextAttacker.currentHp = Math.min(
        nextAttacker.maxHp,
        nextAttacker.currentHp + Math.floor(nextAttacker.maxHp * 0.5)
      )
    }

    if (nextDefender.currentHp > 0) {
      if (move.status && rollChance(Number(move.statusChance ?? 100))) {
        nextDefender = applyPrimaryStatusToMon(nextDefender, move.status)
      }
      if (move.volatileStatus && rollChance(Number(move.volatileChance ?? 100))) {
        nextDefender = applyVolatileStatusToMon(nextDefender, move.volatileStatus)
      }
      for (const statChange of getMoveStatChanges(move)) {
        if (rollChance(Number(statChange.chance ?? move.statChangeChance ?? 100))) {
          if (statChange.target === 'attacker') nextAttacker = applyStatChangeToMon(nextAttacker, statChange)
          else nextDefender = applyStatChangeToMon(nextDefender, statChange)
        }
      }
    }

    return { attacker: nextAttacker, defender: nextDefender }
  }

  const choosePotionKey = (mon, inventory, { needHp = false, needMp = false } = {}) => {
    for (const key of POTION_ORDER) {
      if ((inventory[key] || 0) <= 0) continue
      const potion = POTIONS[key]
      if (needHp && mon.currentHp < mon.maxHp && (Number(potion.healAmount) || 0) > 0) return key
      if (needMp && mon.currentMp < mon.maxMp && (Number(potion.mpRestoreAmount) || 0) > 0) return key
    }
    return null
  }

  const usePotion = (mon, inventory, key) => {
    const potion = POTIONS[key]
    return {
      used: true,
      inventory: {
        ...inventory,
        [key]: Math.max(0, (inventory[key] || 0) - 1)
      },
      mon: {
        ...mon,
        currentHp: Math.min(mon.maxHp, mon.currentHp + (Number(potion.healAmount) || 0)),
        currentMp: Math.min(mon.maxMp, mon.currentMp + (Number(potion.mpRestoreAmount) || 0)),
        status: null,
        statusTurns: 0,
        volatileStatuses: {}
      }
    }
  }

  const prepareForBattle = (mon, inventory) => {
    let nextMon = {
      ...mon,
      volatileStatuses: { ...(mon.volatileStatuses || {}) },
      statStages: { ...(mon.statStages || {}) }
    }
    let nextInventory = { ...inventory }
    let used = 0
    for (let guard = 0; guard < 6; guard += 1) {
      const canAttack = getDamagingMoves(nextMon, nextMon).length > 0
      const needHp = nextMon.currentHp / Math.max(1, nextMon.maxHp) < 0.65
      const needMp = !canAttack
      const needCleanse = Boolean(nextMon.status || nextMon.volatileStatuses?.confusion)
      if (!needHp && !needMp && !needCleanse) break
      const key = choosePotionKey(nextMon, nextInventory, {
        needHp: needHp || needCleanse,
        needMp
      })
      if (!key) break
      const result = usePotion(nextMon, nextInventory, key)
      nextMon = result.mon
      nextInventory = result.inventory
      used += 1
      if (
        nextMon.currentHp / Math.max(1, nextMon.maxHp) >= 0.85 &&
        getDamagingMoves(nextMon, nextMon).length > 0 &&
        !nextMon.status
      ) break
    }
    return { mon: nextMon, inventory: nextInventory, used }
  }

  const determineOrder = (playerMon, enemyMon, playerMoveKey, enemyMoveKey) => {
    const playerMove = MOVES[playerMoveKey] || { priority: 0 }
    const enemyMove = MOVES[enemyMoveKey] || { priority: 0 }
    if ((playerMove.priority || 0) > (enemyMove.priority || 0)) return 'player'
    if ((enemyMove.priority || 0) > (playerMove.priority || 0)) return 'enemy'
    const playerSpeed = resolveBattleStat(playerMon, 'spd')
    const enemySpeed = resolveBattleStat(enemyMon, 'spd')
    if (playerSpeed > enemySpeed) return 'player'
    if (enemySpeed > playerSpeed) return 'enemy'
    return Math.random() < 0.5 ? 'player' : 'enemy'
  }

  const simulateBattle = (playerMon, enemyMon) => {
    let player = {
      ...playerMon,
      volatileStatuses: { ...(playerMon.volatileStatuses || {}) },
      statStages: { ...(playerMon.statStages || {}) }
    }
    let enemy = {
      ...enemyMon,
      volatileStatuses: { ...(enemyMon.volatileStatuses || {}) },
      statStages: { ...(enemyMon.statStages || {}) }
    }

    let turns = 0
    while (player.currentHp > 0 && enemy.currentHp > 0 && turns < 40) {
      turns += 1
      const playerMoveKey = choosePlayerMove(player, enemy)
      const enemyMoveKey = chooseBattleEnemyMove({
        enemyMon: enemy,
        targetMon: player,
        battleKind: 'wild'
      }) || choosePlayerMove(enemy, player)
      if (!playerMoveKey && !enemyMoveKey) break

      const order = determineOrder(player, enemy, playerMoveKey, enemyMoveKey)
      const sequence = order === 'player'
        ? [['player', playerMoveKey], ['enemy', enemyMoveKey]]
        : [['enemy', enemyMoveKey], ['player', playerMoveKey]]

      for (const [side, moveKey] of sequence) {
        if (player.currentHp <= 0 || enemy.currentHp <= 0) break
        const start = resolveTurnStart(side === 'player' ? player : enemy, moveKey)
        if (side === 'player') player = start.mon
        else enemy = start.mon
        if (!start.canAct || start.mon.currentHp <= 0 || !moveKey) continue

        const applied = side === 'player'
          ? applyMove(player, enemy, moveKey)
          : applyMove(enemy, player, moveKey)
        if (side === 'player') {
          player = applied.attacker
          enemy = applied.defender
        } else {
          enemy = applied.attacker
          player = applied.defender
        }
      }

      if (player.currentHp <= 0 || enemy.currentHp <= 0) break
      player = resolveTurnEnd(player).mon
      if (player.currentHp <= 0) break
      enemy = resolveTurnEnd(enemy).mon
    }

    return {
      won: enemy.currentHp <= 0 && player.currentHp > 0,
      player,
      enemy
    }
  }

  const pickEncounter = (tableId) => {
    const table = ENCOUNTER_TABLES[tableId]
    const entry = weightedPick(table.pokemon, (row) => Number(row.weight) || 0)
    const minLevel = Math.max(1, Number(entry.minLevel) || 1)
    const maxLevel = Math.max(minLevel, Number(entry.maxLevel) || minLevel)
    const level = minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1))
    return makeMonster(Number(entry.id), level, `${tableId}_${entry.id}_${level}`)
  }

  const simulateRouteScenario = (scenario) => {
    const rows = []
    for (let run = 0; run < RUNS; run += 1) {
      let mon = makeMonster(scenario.starterId, 5, `starter_${scenario.starterId}_${run}`)
      let inventory = { potion: 5, super_potion: 3, hyper_potion: 1 }
      let wins = 0
      let losses = 0
      let potionsUsed = 0

      for (const tableId of scenario.route) {
        const prepared = prepareForBattle(mon, inventory)
        mon = prepared.mon
        inventory = prepared.inventory
        potionsUsed += prepared.used

        const enemy = pickEncounter(tableId)
        const outcome = simulateBattle(mon, enemy)
        mon = outcome.player
        if (outcome.won) {
          wins += 1
          const reward = calculateBattleRewards({
            defeatedMon: enemy,
            playerAverageLevel: getPlayerAverageLevel([mon]),
            battleKind: 'wild',
            participants: 1
          })
          const growth = simulateMonsterExpGain(mon, reward.exp, getBaseMonsterDefinition, [])
          mon = refreshForLevel(growth.updatedMon)
        } else {
          losses += 1
          mon = {
            ...refreshForLevel(mon),
            currentHp: mon.maxHp,
            currentMp: mon.maxMp,
            status: null,
            statusTurns: 0,
            volatileStatuses: {},
            statStages: {}
          }
        }
      }

      rows.push({
        finalLevel: mon.level,
        wins,
        losses,
        potionsUsed
      })
    }

    const average = (key) => rows.reduce((sum, row) => sum + row[key], 0) / rows.length
    const atMostOneLossRate = rows.filter((row) => row.losses <= 1).length / rows.length
    return {
      starter: scenario.starter,
      routeLabel: scenario.routeLabel,
      avgFinalLevel: Number(average('finalLevel').toFixed(2)),
      avgWins: Number(average('wins').toFixed(2)),
      avgLosses: Number(average('losses').toFixed(2)),
      avgPotionsUsed: Number(average('potionsUsed').toFixed(2)),
      atMostOneLossRate: Number(atMostOneLossRate.toFixed(3))
    }
  }

  const issues = []
  const rows = STARTER_ROUTE_SCENARIOS.map((scenario) => {
    const result = simulateRouteScenario(scenario)
    if (result.avgLosses > scenario.thresholds.maxAvgLosses) {
      issues.push(
        `${scenario.starter} ${scenario.routeLabel} 平均阵亡过高: ${result.avgLosses} > ${scenario.thresholds.maxAvgLosses}`
      )
    }
    if (result.atMostOneLossRate < scenario.thresholds.minAtMostOneLossRate) {
      issues.push(
        `${scenario.starter} ${scenario.routeLabel} 前10战稳定性不足: ${(result.atMostOneLossRate * 100).toFixed(1)}% < ${(scenario.thresholds.minAtMostOneLossRate * 100).toFixed(1)}%`
      )
    }
    if (result.avgFinalLevel < scenario.thresholds.minAvgFinalLevel) {
      issues.push(
        `${scenario.starter} ${scenario.routeLabel} 升级偏慢: Lv.${result.avgFinalLevel} < Lv.${scenario.thresholds.minAvgFinalLevel}`
      )
    }
    return result
  })

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      scenarioCount: STARTER_ROUTE_SCENARIOS.length,
      runsPerScenario: RUNS,
      issueCount: issues.length
    },
    rows,
    issues
  }, null, 2))

  if (issues.length > 0) process.exitCode = 1
})
