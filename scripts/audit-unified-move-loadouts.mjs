#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const SPECIAL_SPARSE_MONSTER_IDS = new Set([16, 188])
const BASIC_NORMAL_FILLER_MOVES = new Set(['tackle', 'scratch', 'quickattack', 'pound'])

const sample = (items, limit = 24) => items.slice(0, limit)

const levelRange = (min, max) => (
  Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index)
)

await withViteAuditServer(async ({ loadModule }) => {
  const [
    {
      MONSTERS,
      MOVES,
      getBalancedMovesForLevel,
      getMoveKeysAvailableForMonsterLevel,
      getUnifiedMoveSourceKeysForPokemonLevel,
      getWildMovesForPokemonLevel,
    },
    { ENCOUNTER_TABLES },
    { MAP_CONFIG },
    { MAP_CHAIN, getMapRuntimeEvents },
    { isLevelValidForSpecies, pickLevelForSpecies },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/data/maps/mapConfig.js'),
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const moveNames = (moves = []) => moves.map((moveKey) => MOVES[moveKey]?.name || moveKey)
  const getMoves = (mode, monster, level) => (
    mode === 'wild'
      ? getWildMovesForPokemonLevel(monster, level)
      : getBalancedMovesForLevel(monster, level)
  )

  const duplicateBasicViolations = []
  const sourceViolations = []
  const earlyLearnViolations = []
  const trainerEventAudits = []
  const encounterAudits = []
  const legacyMapAudits = []

  const auditMoveSet = ({
    monster,
    level,
    mode,
    source,
    mapId = null,
    eventId = null,
    encounterTableId = null,
  }) => {
    if (!monster || !Number.isInteger(Number(level))) return
    const safeLevel = Math.max(1, Math.min(100, Math.trunc(Number(level) || 1)))
    if (!isLevelValidForSpecies(monster.id, safeLevel)) return

    const moves = getMoves(mode, monster, safeLevel)
    const availableMoveKeys = new Set(getMoveKeysAvailableForMonsterLevel(monster, safeLevel))
    const sourceMoveKeys = new Set(getUnifiedMoveSourceKeysForPokemonLevel(monster, safeLevel))
    const outsideSourceMoves = moves.filter((moveKey) => !sourceMoveKeys.has(moveKey))
    const tooEarlyMoves = moves.filter((moveKey) => !availableMoveKeys.has(moveKey))
    const basicMoves = moves.filter((moveKey) => BASIC_NORMAL_FILLER_MOVES.has(moveKey))

    const entry = {
      source,
      mode,
      mapId,
      eventId,
      encounterTableId,
      id: monster.id,
      name: monster.name,
      level: safeLevel,
      moveCount: moves.length,
      moves: moveNames(moves),
    }

    if (basicMoves.length > 1) {
      duplicateBasicViolations.push({
        ...entry,
        duplicateBasicMoves: moveNames(basicMoves),
      })
    }

    if (tooEarlyMoves.length > 0) {
      earlyLearnViolations.push({
        ...entry,
        tooEarlyMoves: moveNames(tooEarlyMoves),
        availableMoves: moveNames([...availableMoveKeys]),
      })
    }

    if (outsideSourceMoves.length > 0) {
      sourceViolations.push({
        ...entry,
        outsideSourceMoves: moveNames(outsideSourceMoves),
      })
    }
  }

  for (const monster of MONSTERS) {
    for (const level of levelRange(1, 100)) {
      auditMoveSet({ monster, level, mode: 'balanced', source: 'all-generated-balanced' })
      auditMoveSet({ monster, level, mode: 'wild', source: 'all-generated-wild' })
    }
  }

  for (const [encounterTableId, table] of Object.entries(ENCOUNTER_TABLES)) {
    for (const row of table?.pokemon || []) {
      const monster = monsterById.get(Number(row.id))
      if (!monster) continue
      const minLevel = Math.max(1, Number(row.minLevel ?? row.level ?? 1))
      const maxLevel = Number(row.maxLevel ?? row.level ?? row.minLevel ?? minLevel)
      for (const level of levelRange(minLevel, maxLevel)) {
        encounterAudits.push({ encounterTableId, id: monster.id, level })
        auditMoveSet({
          monster,
          level,
          mode: 'wild',
          source: 'encounter-table',
          encounterTableId,
        })
      }
    }
  }

  for (const [mapId, config] of Object.entries(MAP_CONFIG)) {
    for (const row of config?.wildPokemon || []) {
      const monster = monsterById.get(Number(row.id))
      if (!monster) continue
      const minLevel = Math.max(1, Number(config.minLevel ?? 1))
      const maxLevel = Number(config.maxLevel ?? minLevel)
      for (const level of levelRange(minLevel, maxLevel)) {
        const legalLevel = pickLevelForSpecies(monster.id, level, level)
        if (legalLevel == null) continue
        legacyMapAudits.push({ mapId, id: monster.id, level: legalLevel })
        auditMoveSet({
          monster,
          level: legalLevel,
          mode: 'wild',
          source: 'legacy-map-config',
          mapId,
        })
      }
    }
  }

  for (const mapId of MAP_CHAIN) {
    for (const event of getMapRuntimeEvents(mapId)) {
      const team = event?.properties?.team || event?.team
      if (!Array.isArray(team) || team.length === 0) continue
      for (const member of team) {
        const pokemonId = Math.trunc(Number(member?.pokemonId ?? member?.id))
        const level = Math.max(1, Math.min(100, Math.trunc(Number(member?.level)) || 1))
        const monster = monsterById.get(pokemonId)
        if (!monster) continue
        trainerEventAudits.push({ mapId, eventId: event.id, id: pokemonId, level })
        auditMoveSet({
          monster,
          level,
          mode: 'balanced',
          source: `map-event-${event.type || 'unknown'}`,
          mapId,
          eventId: event.id,
        })
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    rule: {
      specialSparseMonsters: [...SPECIAL_SPARSE_MONSTER_IDS].map((id) => ({
        id,
        name: monsterById.get(id)?.name || String(id),
      })),
      basicNormalFillerMoves: moveNames([...BASIC_NORMAL_FILLER_MOVES]),
    },
    coverage: {
      generatedSpecies: MONSTERS.length,
      generatedLevelModesChecked: MONSTERS.length * 100 * 2,
      encounterRowsChecked: encounterAudits.length,
      legacyMapRowsChecked: legacyMapAudits.length,
      trainerEventMembersChecked: trainerEventAudits.length,
    },
    summary: {
      earlyLearnViolationCount: earlyLearnViolations.length,
      duplicateBasicObservationCount: duplicateBasicViolations.length,
      sourceViolationCount: sourceViolations.length,
    },
    samples: {
      earlyLearnViolations: sample(earlyLearnViolations),
      duplicateBasicViolations: sample(duplicateBasicViolations),
      sourceViolations: sample(sourceViolations),
      trainerEventAudits: sample(trainerEventAudits),
      encounterAudits: sample(encounterAudits),
      legacyMapAudits: sample(legacyMapAudits),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  if (
    earlyLearnViolations.length > 0 ||
    sourceViolations.length > 0
  ) {
    process.exitCode = 1
  }
})
