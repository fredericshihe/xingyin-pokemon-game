#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const EARLY_ZONE_RULES = [
  { tableId: 'valley_safe_grass', maxDamageRatio: 0.45, minAvgExpLv5: 26, maxBattlesLv6: 2.5 },
  { tableId: 'valley_flower_meadow', maxDamageRatio: 0.48, minAvgExpLv5: 38, maxBattlesLv6: 1.8 },
  { tableId: 'valley_lake_shallows', maxDamageRatio: 0.48, minAvgExpLv5: 31, maxBattlesLv6: 2.1 },
  { tableId: 'valley_training_thicket', maxDamageRatio: 0.5, minAvgExpLv5: 48, maxBattlesLv6: 1.3 }
]

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { ENCOUNTER_TABLES },
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateBattleRewards, getExpToNextLevelOfficial, BATTLE_REWARD_BALANCE },
    { calculateStatsForLevel },
    { calculateBattleDamage },
  ] = await Promise.all([
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/battleDamage.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const starterSpeciesIds = [1, 2, 3]
  const issues = []
  const rows = []

  const createInstance = (monster, level) => {
    const stats = calculateStatsForLevel(monster, level)
    return {
      ...monster,
      ...stats,
      currentHp: stats.maxHp,
      currentMp: stats.maxMp,
      statStages: {},
      volatileStatuses: {},
      level,
      moves: getBalancedMovesForLevel(monster, level)
    }
  }

  const starters = starterSpeciesIds.map((id) => createInstance(monsterById.get(id), 5))

  const weightedAverage = (items, getValue) => {
    const totalWeight = items.reduce((sum, item) => sum + (Number(item.weight) || 0), 0)
    if (totalWeight <= 0) return 0
    return items.reduce((sum, item) => sum + (Number(item.weight) || 0) * getValue(item), 0) / totalWeight
  }

  const getBestDamage = (attacker, defender) => {
    const outcomes = (Array.isArray(attacker.moves) ? attacker.moves : [])
      .map((moveKey) => {
        const move = MOVES[moveKey]
        if (!move || !(Number(move.power) > 0) || move.category === 'status') return null
        const result = calculateBattleDamage(attacker, defender, move, { randomFactor: 0.925 })
        return { moveKey, damage: result.damage }
      })
      .filter(Boolean)
      .sort((left, right) => right.damage - left.damage)
    return outcomes[0] || { moveKey: null, damage: 0 }
  }

  for (const rule of EARLY_ZONE_RULES) {
    const table = ENCOUNTER_TABLES[rule.tableId]
    if (!table) {
      issues.push(`${rule.tableId} encounter table missing`)
      continue
    }

    const populatedRows = table.pokemon.map((entry) => {
      const monster = monsterById.get(Number(entry.id))
      const level = Math.round((Number(entry.minLevel) + Number(entry.maxLevel)) / 2)
      const defeatedMon = { ...monster, ...calculateStatsForLevel(monster, level), level }
      const rewardLv5 = calculateBattleRewards({
        defeatedMon,
        playerAverageLevel: 5,
        battleKind: 'wild',
        participants: 1
      })
      const rewardLv6 = calculateBattleRewards({
        defeatedMon,
        playerAverageLevel: 6,
        battleKind: 'wild',
        participants: 1
      })
      const wildInstance = createInstance(monster, level)
      const maxStarterDamageRatio = Math.max(...starters.map((starter) => {
        const best = getBestDamage(wildInstance, starter)
        return best.damage / Math.max(1, starter.maxHp)
      }))

      return {
        ...entry,
        level,
        rewardLv5,
        rewardLv6,
        maxStarterDamageRatio
      }
    })

    const avgExpLv5 = weightedAverage(populatedRows, (row) => Number(row.rewardLv5.exp) || 0)
    const avgExpLv6 = weightedAverage(populatedRows, (row) => Number(row.rewardLv6.exp) || 0)
    const lv6To7 = getExpToNextLevelOfficial(6, monsterById.get(1))
    const battlesLv6 = avgExpLv6 > 0 ? lv6To7 / avgExpLv6 : Infinity
    const worstDamageRatio = Math.max(...populatedRows.map((row) => row.maxStarterDamageRatio))

    rows.push({
      tableId: rule.tableId,
      avgExpLv5: Number(avgExpLv5.toFixed(2)),
      avgExpLv6: Number(avgExpLv6.toFixed(2)),
      battlesLv6To7: Number(battlesLv6.toFixed(2)),
      worstDamageRatio: Number(worstDamageRatio.toFixed(3))
    })

    if (avgExpLv5 < rule.minAvgExpLv5) {
      issues.push(`${rule.tableId} Lv.5 平均经验过低: ${avgExpLv5.toFixed(2)} < ${rule.minAvgExpLv5}`)
    }
    if (battlesLv6 > rule.maxBattlesLv6) {
      issues.push(`${rule.tableId} Lv.6 -> Lv.7 升级节奏过慢: ${battlesLv6.toFixed(2)} 场 > ${rule.maxBattlesLv6}`)
    }
    if (worstDamageRatio > rule.maxDamageRatio) {
      issues.push(`${rule.tableId} 存在对初始伙伴伤害过高的野怪: ${Math.round(worstDamageRatio * 100)}% > ${Math.round(rule.maxDamageRatio * 100)}%`)
    }
  }

  if (
    !(BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel5 > 1) ||
    !(BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel7 > 1) ||
    !(BATTLE_REWARD_BALANCE.earlyWildExpBoostLevel9 > 1)
  ) {
    issues.push('early wild exp boost is missing')
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      checkCount: EARLY_ZONE_RULES.length + 1,
      issueCount: issues.length
    },
    rows,
    issues
  }, null, 2))

  if (issues.length > 0) process.exitCode = 1
})
