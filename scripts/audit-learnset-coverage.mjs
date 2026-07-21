#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const AUDIT_LEVELS = Array.from({ length: 100 }, (_, index) => index + 1)
const sample = (items, limit = 20) => items.slice(0, limit)
const INTENTIONAL_SPARSE_SPECIES_IDS = new Set([16, 188]) // 鲤鱼王、百变怪保留少招的官方感

const getDesignMinimumMoveCount = (level) => {
  if (level >= 24) return 4
  if (level >= 16) return 3
  if (level >= 8) return 2
  return 1
}

await withViteAuditServer(async ({ loadModule }) => {
  const {
    MONSTERS,
    MOVES,
    getBalancedMovesForLevel,
    getMoveKeysAvailableForMonsterLevel,
    getOfficialLearnLevelByMove,
  } = await loadModule('/src/utils/gameData.js')

  const emptyGeneratedMoves = []
  const tooEarlyGeneratedMoves = []
  const sparseByOfficialLevel = []
  const officialLearnsetEmpty = []
  const earlyQuickAttackGeneratedMoves = []

  for (const monster of MONSTERS) {
    const officialLearnset = getOfficialLearnLevelByMove(monster)
    if (Object.keys(officialLearnset).length === 0) {
      officialLearnsetEmpty.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
      })
    }

    for (const level of AUDIT_LEVELS) {
      const generatedMoves = getBalancedMovesForLevel(monster, level)
      const availableMoveKeys = new Set(getMoveKeysAvailableForMonsterLevel(monster, level))
      const quickAttackUnlockLevel = Math.max(1, Math.trunc(Number(MOVES.quickattack?.unlockLevel) || 1))

      if (generatedMoves.length === 0) {
        emptyGeneratedMoves.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
        })
      }

      for (const moveKey of generatedMoves) {
        if (!availableMoveKeys.has(moveKey)) {
          tooEarlyGeneratedMoves.push({
            id: monster.id,
            dexNo: monster.dexNo,
            name: monster.name,
            level,
            moveKey,
            moves: generatedMoves,
          })
        }
      }

      if (
        level < quickAttackUnlockLevel &&
        generatedMoves.includes('quickattack') &&
        generatedMoves.includes('tackle')
      ) {
        earlyQuickAttackGeneratedMoves.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
          unlockLevel: quickAttackUnlockLevel,
          hasTackle: generatedMoves.includes('tackle'),
          moves: generatedMoves.map((moveKey) => ({
            moveKey,
            name: MOVES[moveKey]?.name || moveKey,
          })),
        })
      }

      const designMinimum = getDesignMinimumMoveCount(level)
      if (generatedMoves.length < designMinimum) {
        sparseByOfficialLevel.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
          moveCount: generatedMoves.length,
          designMinimum,
          moves: generatedMoves.map((moveKey) => ({
            moveKey,
            name: MOVES[moveKey]?.name || moveKey,
          })),
        })
      }
    }
  }

  const sparseSpecies = new Map()
  const intentionalSparseSpecies = new Map()
  for (const entry of sparseByOfficialLevel) {
    const key = `${entry.dexNo}:${entry.name}`
    const targetMap = INTENTIONAL_SPARSE_SPECIES_IDS.has(Number(entry.id))
      ? intentionalSparseSpecies
      : sparseSpecies
    const previous = targetMap.get(key)
    if (!previous || entry.level < previous.firstSparseLevel) {
      targetMap.set(key, {
        id: entry.id,
        dexNo: entry.dexNo,
        name: entry.name,
        firstSparseLevel: entry.level,
        moveCount: entry.moveCount,
        designMinimum: entry.designMinimum,
        moves: entry.moves,
      })
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: Object.keys(MOVES).length,
      auditedLevelCount: AUDIT_LEVELS.length,
      emptyGeneratedMoveCount: emptyGeneratedMoves.length,
      tooEarlyGeneratedMoveCount: tooEarlyGeneratedMoves.length,
      earlyQuickAttackGeneratedMoveCount: earlyQuickAttackGeneratedMoves.length,
      officialLearnsetEmptyCount: officialLearnsetEmpty.length,
      sparseByOfficialLevelCount: sparseByOfficialLevel.length,
      sparseSpeciesCount: sparseSpecies.size,
      intentionalSparseSpeciesCount: intentionalSparseSpecies.size,
    },
    samples: {
      emptyGeneratedMoves: sample(emptyGeneratedMoves),
      tooEarlyGeneratedMoves: sample(tooEarlyGeneratedMoves),
      earlyQuickAttackGeneratedMoves: sample(earlyQuickAttackGeneratedMoves),
      officialLearnsetEmpty: sample(officialLearnsetEmpty),
      sparseSpecies: sample([...sparseSpecies.values()]),
      intentionalSparseSpecies: sample([...intentionalSparseSpecies.values()]),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (emptyGeneratedMoves.length > 0 || tooEarlyGeneratedMoves.length > 0 || earlyQuickAttackGeneratedMoves.length > 0) {
    process.exitCode = 1
  }
})
