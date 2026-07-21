#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const AUDIT_MIN_WILD_MOVE_LEVEL = 1
const SPECIAL_SPARSE_MONSTER_IDS = new Set([16, 188])
const sample = (items, limit = 20) => items.slice(0, limit)

const levelRange = (min, max) => (
  Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index)
)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    {
      MONSTERS,
      MOVES,
      getEvolutionCarryoverMovesForPokemonLevel,
      getLocalLearnLevelByMove,
      getMoveKeysAvailableForMonsterLevel,
      getOfficialLearnLevelByMove,
      getSupplementalLearnLevelByMove,
      getWildMovesForPokemonLevel,
    },
    { ENCOUNTER_TABLES },
    { MAP_CONFIG },
    { isLevelValidForSpecies, pickLevelForSpecies },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/data/maps/mapConfig.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const moveNames = (moves = []) => moves.map((moveKey) => MOVES[moveKey]?.name || moveKey)

  const getExplicitLearnsetMoveKeys = (monster) => new Set([
    ...Object.keys(getOfficialLearnLevelByMove(monster)),
    ...Object.keys(getSupplementalLearnLevelByMove(monster)),
    ...Object.keys(getLocalLearnLevelByMove(monster)),
  ])

  const getSourceMoveKeys = (monster, level) => new Set([
    ...getExplicitLearnsetMoveKeys(monster),
    ...(monster?.moves || []),
    ...getEvolutionCarryoverMovesForPokemonLevel(monster, level),
    ...getMoveKeysAvailableForMonsterLevel(monster, level),
  ])

  const earlyLearnViolations = []
  const sourceViolations = []
  const encounterEarlyLearnViolations = []
  const encounterSourceViolations = []
  const legacyMapEarlyLearnViolations = []
  const legacyMapSourceViolations = []
  const baseOnlyUsages = []
  const zeroCostMissing = []

  const auditMoveSet = ({ monster, level, source = 'all-levels', encounterTableId = null }) => {
    if (!monster || !Number.isInteger(Number(level)) || !isLevelValidForSpecies(monster.id, level)) return

    const safeLevel = Math.max(1, Math.min(100, Math.trunc(Number(level) || 1)))
    const moves = getWildMovesForPokemonLevel(monster, safeLevel)
    const availableMoveKeys = new Set(getMoveKeysAvailableForMonsterLevel(monster, safeLevel))
    const sourceMoveKeys = getSourceMoveKeys(monster, safeLevel)
    const explicitMoveKeys = getExplicitLearnsetMoveKeys(monster)
    const tooEarlyMoves = moves.filter((moveKey) => !availableMoveKeys.has(moveKey))
    const outsideSourceMoves = moves.filter((moveKey) => !sourceMoveKeys.has(moveKey))
    const baseOnlyMoves = moves.filter((moveKey) => (
      (monster?.moves || []).includes(moveKey) &&
      !explicitMoveKeys.has(moveKey) &&
      !getEvolutionCarryoverMovesForPokemonLevel(monster, safeLevel).includes(moveKey)
    ))
    const hasZeroCostMove = moves.some((moveKey) => MOVES[moveKey]?.cost === 0)

    const entry = {
      source,
      encounterTableId,
      id: monster.id,
      name: monster.name,
      level: safeLevel,
      moveCount: moves.length,
      moves: moveNames(moves),
    }

    if (tooEarlyMoves.length > 0) {
      const violation = {
        ...entry,
        tooEarlyMoves: moveNames(tooEarlyMoves),
        availableMoves: moveNames([...availableMoveKeys]),
      }
      if (source === 'encounter-table') encounterEarlyLearnViolations.push(violation)
      else if (source === 'legacy-map-config') legacyMapEarlyLearnViolations.push(violation)
      else earlyLearnViolations.push(violation)
    }
    if (outsideSourceMoves.length > 0) {
      const violation = {
        ...entry,
        outsideSourceMoves: moveNames(outsideSourceMoves),
      }
      if (source === 'encounter-table') encounterSourceViolations.push(violation)
      else if (source === 'legacy-map-config') legacyMapSourceViolations.push(violation)
      else sourceViolations.push(violation)
    }
    if (baseOnlyMoves.length > 0) {
      baseOnlyUsages.push({
        ...entry,
        baseOnlyMoves: moveNames(baseOnlyMoves),
      })
    }
    if (safeLevel >= AUDIT_MIN_WILD_MOVE_LEVEL && !hasZeroCostMove) {
      zeroCostMissing.push(entry)
    }
  }

  for (const monster of MONSTERS) {
    for (const level of levelRange(AUDIT_MIN_WILD_MOVE_LEVEL, 100)) {
      auditMoveSet({ monster, level })
    }
  }

  for (const [encounterTableId, table] of Object.entries(ENCOUNTER_TABLES)) {
    for (const row of table?.pokemon || []) {
      const monster = monsterById.get(Number(row.id))
      if (!monster) continue
      const minLevel = Math.max(AUDIT_MIN_WILD_MOVE_LEVEL, Number(row.minLevel ?? row.level ?? 1))
      const maxLevel = Number(row.maxLevel ?? row.level ?? row.minLevel ?? minLevel)
      for (const level of levelRange(minLevel, maxLevel)) {
        auditMoveSet({ monster, level, source: 'encounter-table', encounterTableId })
      }
    }
  }

  for (const [mapName, config] of Object.entries(MAP_CONFIG)) {
    for (const row of config?.wildPokemon || []) {
      const monster = monsterById.get(Number(row.id))
      if (!monster) continue
      const minLevel = Math.max(AUDIT_MIN_WILD_MOVE_LEVEL, Number(config.minLevel ?? 1))
      const maxLevel = Number(config.maxLevel ?? minLevel)
      for (const level of levelRange(minLevel, maxLevel)) {
        const legalLevel = pickLevelForSpecies(monster.id, level, level)
        if (legalLevel == null) continue
        auditMoveSet({ monster, level: legalLevel, source: 'legacy-map-config', encounterTableId: mapName })
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rule: {
      auditMinWildMoveLevel: AUDIT_MIN_WILD_MOVE_LEVEL,
      specialSparseMonsters: [...SPECIAL_SPARSE_MONSTER_IDS].map((id) => ({
        id,
        name: monsterById.get(id)?.name || String(id),
      })),
    },
    summary: {
      earlyLearnViolationCount: earlyLearnViolations.length,
      sourceViolationCount: sourceViolations.length,
      encounterEarlyLearnViolationCount: encounterEarlyLearnViolations.length,
      encounterSourceViolationCount: encounterSourceViolations.length,
      legacyMapEarlyLearnViolationCount: legacyMapEarlyLearnViolations.length,
      legacyMapSourceViolationCount: legacyMapSourceViolations.length,
      baseOnlyUsageCount: baseOnlyUsages.length,
      zeroCostMissingCount: zeroCostMissing.length,
    },
    samples: {
      earlyLearnViolations: sample(earlyLearnViolations),
      sourceViolations: sample(sourceViolations),
      encounterEarlyLearnViolations: sample(encounterEarlyLearnViolations),
      encounterSourceViolations: sample(encounterSourceViolations),
      legacyMapEarlyLearnViolations: sample(legacyMapEarlyLearnViolations),
      legacyMapSourceViolations: sample(legacyMapSourceViolations),
      baseOnlyUsages: sample(baseOnlyUsages),
      zeroCostMissing: sample(zeroCostMissing),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (
    encounterEarlyLearnViolations.length > 0 ||
    encounterSourceViolations.length > 0 ||
    legacyMapEarlyLearnViolations.length > 0 ||
    legacyMapSourceViolations.length > 0
  ) {
    process.exitCode = 1
  }
})
