#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const errors = []
const summary = []

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const maps = (await loadModule('/src/game/data/godotMaps/godot_region_maps.js')).default
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { MONSTERS, MOVES, getWildMovesForPokemonLevel } = await loadModule('/src/utils/gameData.js')
  const {
    DEFAULT_HIDDEN_EXCLUSIVE_RARE_COUNT,
    HIDDEN_EXCLUSIVE_RARITY_TIER,
    getHiddenEncounterExclusiveEntries,
    getHiddenEncounterExclusiveMeta,
    getHiddenEncounterExclusivePokemonIds,
    getHiddenEncounterExclusiveCount,
    isPremiumHiddenEncounterZone
  } = await loadModule('/src/utils/hiddenEncounterExclusive.js')

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

  for (const [mapId, map] of Object.entries(maps)) {
    const zones = Array.isArray(map?.encounterZones) ? map.encounterZones : []
    zones
      .filter(isPremiumHiddenEncounterZone)
      .forEach((zone) => {
        const expectedCount = getHiddenEncounterExclusiveCount(zone) || DEFAULT_HIDDEN_EXCLUSIVE_RARE_COUNT
        const exclusiveEntries = getHiddenEncounterExclusiveEntries({ zone })
        const exclusiveIds = getHiddenEncounterExclusivePokemonIds({ zone })

        if (exclusiveEntries.length !== expectedCount) {
          errors.push(`${mapId}/${zone.id} should identify ${expectedCount} hidden-exclusive Pokemon, got ${exclusiveEntries.length}`)
        }
        if (exclusiveIds.length !== new Set(exclusiveIds).size) {
          errors.push(`${mapId}/${zone.id} has duplicate hidden-exclusive ids: ${exclusiveIds.join(', ')}`)
        }
        const exclusiveIdSet = new Set(exclusiveIds)

        exclusiveEntries.forEach((entry) => {
          const meta = getHiddenEncounterExclusiveMeta({
            zone,
            pokemonId: entry.pokemonId,
            encounterRate: zone.tallGrassRate
          })
          const monster = monsterById.get(entry.pokemonId)

          if (!monster) {
            errors.push(`${mapId}/${zone.id} hidden-exclusive Pokemon #${entry.pokemonId} is missing from MONSTERS`)
          }
          if (!meta?.hiddenExclusive || !meta?.rare) {
            errors.push(`${mapId}/${zone.id} ${monster?.name || entry.pokemonId} must produce hiddenExclusive rare encounter meta`)
          }
          if (meta?.rarityTier !== HIDDEN_EXCLUSIVE_RARITY_TIER) {
            errors.push(`${mapId}/${zone.id} ${monster?.name || entry.pokemonId} should use ${HIDDEN_EXCLUSIVE_RARITY_TIER} rarity tier, got ${meta?.rarityTier || 'none'}`)
          }
          if (!(Number(meta?.sourceChance) > 0) || !(Number(meta?.sourceStepChance) > 0)) {
            errors.push(`${mapId}/${zone.id} ${monster?.name || entry.pokemonId} should expose positive pool and per-step chance`)
          }

          if (monster) {
            const rowMinLevel = Math.trunc(Number(entry.minLevel ?? entry.level ?? zone.levelRange?.[0] ?? 1))
            const rowMaxLevel = Math.trunc(Number(entry.maxLevel ?? entry.level ?? zone.levelRange?.[1] ?? rowMinLevel))
            const minLevel = Math.max(1, Number.isSafeInteger(rowMinLevel) ? rowMinLevel : 1)
            const maxLevel = Math.max(minLevel, Number.isSafeInteger(rowMaxLevel) ? rowMaxLevel : minLevel)
            const noZeroCostLevels = []
            for (let level = minLevel; level <= maxLevel; level += 1) {
              const moves = getWildMovesForPokemonLevel(monster, level)
              const hasZeroCostAttack = moves.some((moveKey) => (
                MOVES[moveKey] &&
                Number(MOVES[moveKey].power) > 0 &&
                MOVES[moveKey].category !== 'status' &&
                MOVES[moveKey].cost === 0
              ))
              if (!hasZeroCostAttack) {
                noZeroCostLevels.push({
                  level,
                  moves: moves.map((moveKey) => `${MOVES[moveKey]?.name || moveKey}(${MOVES[moveKey]?.cost ?? '?'})`)
                })
              }
            }
            if (noZeroCostLevels.length > 0) {
              errors.push(`${mapId}/${zone.id} ${monster.name}#${monster.id} hidden-exclusive wild moves need a 0 MP damaging fallback; failing levels: ${noZeroCostLevels.slice(0, 4).map((row) => `Lv.${row.level} ${row.moves.join('/')}`).join('; ')}`)
            }
          }
        })

        const tableEntries = Array.isArray(ENCOUNTER_TABLES[zone.encounterTableId]?.pokemon)
          ? ENCOUNTER_TABLES[zone.encounterTableId].pokemon
          : []
        tableEntries
          .map((entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id)))
          .filter((pokemonId) => Number.isSafeInteger(pokemonId) && !exclusiveIdSet.has(pokemonId))
          .forEach((pokemonId) => {
            const meta = getHiddenEncounterExclusiveMeta({
              zone,
              pokemonId,
              encounterRate: zone.tallGrassRate
            })
            if (meta?.hiddenExclusive) {
              errors.push(`${mapId}/${zone.id} ordinary Pokemon ${monsterById.get(pokemonId)?.name || pokemonId} was incorrectly marked hiddenExclusive`)
            }
          })

        summary.push({
          mapId,
          zoneId: zone.id,
          zoneName: zone.name,
          tableId: zone.encounterTableId,
          exclusive: exclusiveEntries.map((entry) => {
            const monster = monsterById.get(entry.pokemonId)
            const meta = getHiddenEncounterExclusiveMeta({
              zone,
              pokemonId: entry.pokemonId,
              encounterRate: zone.tallGrassRate
            })
            return `${monster?.name || entry.pokemonId}#${entry.pokemonId}(tier=${meta?.rarityTier || 'none'}, pool=${((meta?.sourceChance || 0) * 100).toFixed(1)}%)`
          })
        })
      })
  }

  const originalGameSource = readFileSync(path.join(rootDir, 'src/components/Game/OriginalGame.jsx'), 'utf8')
  const gameCssSource = readFileSync(path.join(rootDir, 'src/game.css'), 'utf8')

  const requiredRuntimeMarkers = [
    'rareEncounter?.hiddenExclusive',
    'battle-intro-overlay--wild-${encounterRarityTier}',
    'battle-intro-rarity-card--${encounterRarityTier}',
    'isHiddenEncounterGateBossRequirementMet(interactionWorld, currentMapName, mapEvent)',
    'isHiddenEncounterGateBossRequirementMet(worldRef.current, currentMapName, gateEvent)'
  ]
  requiredRuntimeMarkers.forEach((marker) => {
    if (!originalGameSource.includes(marker)) {
      errors.push(`OriginalGame.jsx missing encounter rarity runtime marker: ${marker}`)
    }
  })
  if (!/const isHiddenEncounterGateUnlocked = \(world, mapName, gateEvent\) => \([\s\S]*?getWorldFlagValue\(world, getHiddenEncounterGateFlagKey\(mapName, gateEvent\)\) &&[\s\S]*?isHiddenEncounterGateBossRequirementMet\(world, mapName, gateEvent\)/.test(originalGameSource)) {
    errors.push('legacy paid hidden gates must remain sealed until their configured map-boss requirement is met')
  }
  if (!/const buildEncounterZoneLocks = \(mapName, world, playerTeam = \[\]\) => \{[\s\S]*?reason: !isHiddenEncounterGateBossRequirementMet\(world, mapName, event\)[\s\S]*?getHiddenEncounterGateBossLockedReason\(props\)/.test(originalGameSource)) {
    errors.push('hidden encounter-zone locks must explain the configured map-boss requirement before showing payment instructions')
  }

  const requiredCssMarkers = [
    'battle-intro-overlay--wild-mythic',
    'battle-intro-rarity-card--mythic',
    'battle-intro-overlay--rare-encounter',
    'battle-intro-rare-burst--${encounterRarityTier}'
  ]
  requiredCssMarkers.forEach((marker) => {
    const source = marker.includes('${encounterRarityTier}') ? originalGameSource : gameCssSource
    if (!source.includes(marker)) {
      errors.push(`missing encounter rarity style marker: ${marker}`)
    }
  })
})

console.log('=== 隐藏区专属遭遇稀有度审计 ===')
summary.forEach((entry) => {
  console.log(`${entry.mapId}/${entry.zoneId} ${entry.zoneName}: table=${entry.tableId}; ${entry.exclusive.join(', ')}`)
})

if (summary.length === 0) {
  errors.push('No premium hidden encounter zones found')
}

if (errors.length > 0) {
  console.error(`\n发现 ${errors.length} 个隐藏区专属遭遇稀有度问题：`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nOK: 所有隐藏区专属宝可梦都会被识别为 hiddenExclusive，并在遭遇开场使用 mythic 稀有度样式。')
