#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const AUDIT_LEVELS = Array.from({ length: 100 }, (_, index) => index + 1)
const sample = (items, limit = 20) => items.slice(0, limit)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    {
      MONSTERS,
      MOVES,
      getBalancedMovesForLevel,
      getEmergencyFallbackMoveForPokemonLevel,
      getEvolutionCarryoverMovesForPokemonLevel,
      getHiddenExclusiveZeroCostFallbackMove,
      getMoveKeysAvailableForMonsterLevel,
      getOfficialLearnLevelByMove,
      normalizeMovesForPokemonLevel,
      getSupplementalLearnLevelByMove,
    },
    { getMovesLearnedAtLevel },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonGrowth.js'),
  ])

  const runtimeMismatches = []
  const growthMismatches = []
  const normalizedKnownMoveMismatches = []
  const missingRuntimeMovePools = []

  const getAllowedMoveKeys = (monster, level = 1) => {
    const officialLearnset = getOfficialLearnLevelByMove(monster)
    const supplementalLearnset = getSupplementalLearnLevelByMove(monster)
    const hasOfficialLearnset = Object.keys(officialLearnset).length > 0
    const localLearnset = {}

    if (!hasOfficialLearnset) {
      for (const moveEntry of Object.values(monster?.learnset || {})) {
        const moveKeys = Array.isArray(moveEntry) ? moveEntry : [moveEntry]
        for (const moveKey of moveKeys) {
          if (MOVES[moveKey]) localLearnset[moveKey] = true
        }
      }
    }

    return {
      hasOfficialLearnset,
      allowedMoveKeys: new Set([
        ...Object.keys(officialLearnset),
        ...Object.keys(supplementalLearnset),
        ...Object.keys(localLearnset),
        ...getEvolutionCarryoverMovesForPokemonLevel(monster, level),
        getEmergencyFallbackMoveForPokemonLevel(monster, level),
        getHiddenExclusiveZeroCostFallbackMove(monster),
      ].filter(Boolean)),
    }
  }

  for (const monster of MONSTERS) {
    const { hasOfficialLearnset, allowedMoveKeys: baseAllowedMoveKeys } = getAllowedMoveKeys(monster)
    if (!hasOfficialLearnset && baseAllowedMoveKeys.size === 0) {
      missingRuntimeMovePools.push({
        id: monster.id,
        dexNo: monster.dexNo,
        name: monster.name,
        issue: 'no_official_or_local_learnset',
      })
      continue
    }

    for (const level of AUDIT_LEVELS) {
      const { allowedMoveKeys } = getAllowedMoveKeys(monster, level)
      const runtimeMoves = new Set([
        ...getBalancedMovesForLevel(monster, level),
        ...getMoveKeysAvailableForMonsterLevel(monster, level),
      ])

      if (runtimeMoves.size === 0) {
        missingRuntimeMovePools.push({
          id: monster.id,
          dexNo: monster.dexNo,
          name: monster.name,
          level,
          issue: 'empty_runtime_move_pool',
        })
      }

      for (const moveKey of runtimeMoves) {
        if (!allowedMoveKeys.has(moveKey)) {
          runtimeMismatches.push({
            id: monster.id,
            dexNo: monster.dexNo,
            name: monster.name,
            level,
            moveKey,
            moveName: MOVES[moveKey]?.name || moveKey,
          })
        }
      }

      for (const moveKey of getMovesLearnedAtLevel(monster, level)) {
        if (!allowedMoveKeys.has(moveKey)) {
          growthMismatches.push({
            id: monster.id,
            dexNo: monster.dexNo,
            name: monster.name,
            level,
            moveKey,
            moveName: MOVES[moveKey]?.name || moveKey,
          })
        }
      }

      const wrongKnownMoves = Object.keys(MOVES)
        .filter((moveKey) => !allowedMoveKeys.has(moveKey))
        .slice(0, 4)
      if (wrongKnownMoves.length > 0) {
        const normalizedKnownMoves = normalizeMovesForPokemonLevel(monster, wrongKnownMoves, level, {
          backfill: false,
          preferBalancedWhenInvalid: true,
        })
        for (const moveKey of normalizedKnownMoves) {
          if (!allowedMoveKeys.has(moveKey)) {
            normalizedKnownMoveMismatches.push({
              id: monster.id,
              dexNo: monster.dexNo,
              name: monster.name,
              level,
              injectedMoves: wrongKnownMoves,
              moveKey,
              moveName: MOVES[moveKey]?.name || moveKey,
            })
          }
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: Object.keys(MOVES).length,
      auditedLevelCount: AUDIT_LEVELS.length,
      runtimeMismatchCount: runtimeMismatches.length,
      growthMismatchCount: growthMismatches.length,
      normalizedKnownMoveMismatchCount: normalizedKnownMoveMismatches.length,
      missingRuntimeMovePoolCount: missingRuntimeMovePools.length,
    },
    samples: {
      runtimeMismatches: sample(runtimeMismatches),
      growthMismatches: sample(growthMismatches),
      normalizedKnownMoveMismatches: sample(normalizedKnownMoveMismatches),
      missingRuntimeMovePools: sample(missingRuntimeMovePools),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (
    runtimeMismatches.length > 0 ||
    growthMismatches.length > 0 ||
    normalizedKnownMoveMismatches.length > 0 ||
    missingRuntimeMovePools.length > 0
  ) {
    process.exitCode = 1
  }
})
