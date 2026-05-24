#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const CHECK_LEVELS = [5, 10, 15, 20, 30, 50, 70, 100]
const SAMPLE_LIMIT = 24
const EARLY_PAID_MOVE_MIN_USES = 2

const numeric = (value, fallback = 0) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

const percentile = (values, p) => {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[index]
}

const summarize = (values) => ({
  min: percentile(values, 0),
  p10: percentile(values, 0.1),
  median: percentile(values, 0.5),
  p90: percentile(values, 0.9),
  max: percentile(values, 1),
})

const moveWeight = (move) => (
  numeric(move?.power) +
  (move?.status || move?.volatileStatus || move?.statChange || move?.effect ? 18 : 0) +
  numeric(move?.priority) * 8 -
  Math.max(0, numeric(move?.cost) - 12)
)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { OFFICIAL_MOVE_META_BY_KEY },
    { calculateStatsForLevel },
    { isLevelValidForSpecies },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/officialMoveMeta.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
  ])

  const levelRows = []
  const criticalIssues = []
  const advisoryIssues = []

  for (const level of CHECK_LEVELS) {
    const rows = MONSTERS.map((monster) => {
      const stats = calculateStatsForLevel(monster, level)
      const moveKeys = getBalancedMovesForLevel(monster, level)
      const moves = moveKeys
        .map((moveKey) => {
          const move = MOVES[moveKey]
          const officialMeta = OFFICIAL_MOVE_META_BY_KEY[moveKey]
          if (!move) return null
          return {
            moveKey,
            name: move.name,
            cost: numeric(move.cost),
            power: numeric(move.power),
            officialPp: officialMeta?.pp ?? null,
            uses: move.cost > 0 ? Math.floor(stats.maxMp / move.cost) : Infinity,
            highImpact: officialMeta?.pp <= 5 || numeric(move.power) >= 110,
            recovery: move.effect === 'heal',
            weight: moveWeight(move),
          }
        })
        .filter(Boolean)
      const paidMoves = moves.filter((move) => move.cost > 0)
      const cheapestPaidUses = paidMoves.length
        ? Math.max(...paidMoves.map((move) => move.uses))
        : Infinity
      const strongestPaid = paidMoves
        .slice()
        .sort((a, b) => b.weight - a.weight)[0] || null
      const fullPaidRotationUses = paidMoves.length
        ? Math.floor(stats.maxMp / (paidMoves.reduce((sum, move) => sum + move.cost, 0) / paidMoves.length))
        : Infinity

      return {
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        level,
        validForLevel: isLevelValidForSpecies(monster.id, level),
        maxMp: stats.maxMp,
        moves,
        paidMoveCount: paidMoves.length,
        cheapestPaidUses,
        strongestPaidUses: strongestPaid?.uses ?? Infinity,
        strongestPaidMove: strongestPaid ? strongestPaid.name : null,
        fullPaidRotationUses,
      }
    })

    for (const row of rows) {
      const unusableMoves = row.moves.filter((move) => move.cost > 0 && move.uses < 1)
      if (unusableMoves.length > 0) {
        criticalIssues.push({
          issue: 'paid_move_unusable',
          id: row.id,
          dexNo: row.dexNo,
          name: row.name,
          level,
          maxMp: row.maxMp,
          moves: unusableMoves.map(({ moveKey, name, cost, uses }) => ({ moveKey, name, cost, uses })),
        })
      }

      if (level <= 10 && row.paidMoveCount > 0 && row.cheapestPaidUses < EARLY_PAID_MOVE_MIN_USES) {
        criticalIssues.push({
          issue: 'early_paid_move_pool_too_small',
          id: row.id,
          dexNo: row.dexNo,
          name: row.name,
          level,
          maxMp: row.maxMp,
          cheapestPaidUses: row.cheapestPaidUses,
        })
      }

      for (const move of row.moves) {
        if (move.cost <= 0) continue
        if (move.highImpact && move.uses > 6) {
          advisoryIssues.push({
            issue: 'high_impact_move_many_uses',
            id: row.id,
            dexNo: row.dexNo,
            name: row.name,
            level,
            maxMp: row.maxMp,
            moveKey: move.moveKey,
            moveName: move.name,
            cost: move.cost,
            officialPp: move.officialPp,
            uses: move.uses,
          })
        }
        if (move.recovery && level <= 70 && move.uses > 4) {
          advisoryIssues.push({
            issue: 'recovery_move_many_uses',
            id: row.id,
            dexNo: row.dexNo,
            name: row.name,
            level,
            maxMp: row.maxMp,
            moveKey: move.moveKey,
            moveName: move.name,
            cost: move.cost,
            officialPp: move.officialPp,
            uses: move.uses,
          })
        }
      }
    }

    const validRows = rows.filter((row) => row.validForLevel)
    levelRows.push({
      level,
      allSpecies: {
        maxMp: summarize(rows.map((row) => row.maxMp)),
        cheapestPaidUses: summarize(rows.filter((row) => row.paidMoveCount > 0).map((row) => row.cheapestPaidUses)),
        strongestPaidUses: summarize(rows.filter((row) => row.paidMoveCount > 0).map((row) => row.strongestPaidUses)),
        fullPaidRotationUses: summarize(rows.filter((row) => row.paidMoveCount > 0).map((row) => row.fullPaidRotationUses)),
        paidMoveUnderTwoCount: rows.filter((row) => row.paidMoveCount > 0 && row.cheapestPaidUses < EARLY_PAID_MOVE_MIN_USES).length,
      },
      validSpecies: {
        count: validRows.length,
        maxMp: summarize(validRows.map((row) => row.maxMp)),
        cheapestPaidUses: summarize(validRows.filter((row) => row.paidMoveCount > 0).map((row) => row.cheapestPaidUses)),
        strongestPaidUses: summarize(validRows.filter((row) => row.paidMoveCount > 0).map((row) => row.strongestPaidUses)),
        fullPaidRotationUses: summarize(validRows.filter((row) => row.paidMoveCount > 0).map((row) => row.fullPaidRotationUses)),
        paidMoveUnderTwoCount: validRows.filter((row) => row.paidMoveCount > 0 && row.cheapestPaidUses < EARLY_PAID_MOVE_MIN_USES).length,
      },
      samples: rows
        .filter((row) => row.paidMoveCount > 0)
        .sort((a, b) => a.cheapestPaidUses - b.cheapestPaidUses || a.maxMp - b.maxMp)
        .slice(0, 8)
        .map(({ id, dexNo, name, maxMp, cheapestPaidUses, strongestPaidUses, strongestPaidMove, moves }) => ({
          id,
          dexNo,
          name,
          maxMp,
          cheapestPaidUses,
          strongestPaidUses,
          strongestPaidMove,
          moves: moves.map(({ moveKey, name: moveName, cost, uses, officialPp }) => ({
            moveKey,
            name: moveName,
            cost,
            uses: uses === Infinity ? 'unlimited' : uses,
            officialPp,
          })),
        })),
    })
  }

  const report = {
    generatedAt: new Date().toISOString(),
    formula: 'max(18, floor(18 + baseMp*0.18 + level*(0.35 + baseMp/320)))',
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: Object.keys(MOVES).length,
      checkedLevels: CHECK_LEVELS,
      earlyPaidMoveMinUses: EARLY_PAID_MOVE_MIN_USES,
      criticalIssueCount: criticalIssues.length,
      advisoryIssueCount: advisoryIssues.length,
    },
    byLevel: levelRows,
    criticalIssues: criticalIssues.slice(0, SAMPLE_LIMIT),
    advisoryIssues: advisoryIssues.slice(0, SAMPLE_LIMIT),
  }

  console.log(JSON.stringify(report, null, 2))
  if (criticalIssues.length > 0) {
    process.exitCode = 1
  }
})
