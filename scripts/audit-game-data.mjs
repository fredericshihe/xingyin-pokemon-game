#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { withViteAuditServer } from './load-vite-module.mjs'

const MONSTER_STAT_KEYS = ['maxHp', 'maxMp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
const MOVE_CATEGORIES = new Set(['physical', 'special', 'status'])
const PRIMARY_STATUSES = new Set(['sleep', 'poison', 'burn', 'paralysis', 'freeze'])
const VOLATILE_STATUSES = new Set(['flinch', 'confusion'])
const MOVE_EFFECTS = new Set(['heal', 'drain', 'mimic', 'nothing', 'teleport'])
const STAT_CHANGE_KEYS = new Set(['atk', 'def', 'spAtk', 'spDef', 'spd', 'accuracy', 'evasion'])
const STAT_CHANGE_TARGETS = new Set(['attacker', 'defender'])
const POKEMON_PLACEHOLDER_PATH = '/assets/pokemon/placeholder.svg'
const MOVE_LEVEL_AUDIT_LEVELS = [1, 5, 10, 16, 24, 30, 40, 50, 70, 100]

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0
const isIntegerInRange = (value, min, max) => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max
const sample = (items, limit = 12) => items.slice(0, limit)

const resolveAssetPath = (rootDir, assetPath) => {
  if (!assetPath || typeof assetPath !== 'string') return null
  const relative = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath
  return path.join(rootDir, 'public', relative)
}

await withViteAuditServer(async ({ rootDir, loadModule }) => {
  const [
    {
      MONSTERS,
      MOVES,
      POKEBALLS,
      POTIONS,
      EXP_POTIONS,
      EVOLUTION_ITEMS,
      getBalancedMovesForLevel,
      getMoveKeysAvailableForMonsterLevel,
    },
    { MAP_CONFIG },
    { TYPES },
  ] = await Promise.all([
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/data/maps/mapConfig.js'),
    loadModule('/src/utils/constants.js'),
  ])

  const validTypes = new Set(Object.values(TYPES))
  const monsterIds = new Set()
  const moveKeys = new Set(Object.keys(MOVES))
  const itemKeys = new Set([
    ...Object.keys(POKEBALLS),
    ...Object.keys(POTIONS),
    ...Object.keys(EXP_POTIONS),
    ...Object.keys(EVOLUTION_ITEMS),
  ])
  const duplicateMonsterIds = []
  const missingMonsterFields = []
  const invalidMonsterTypes = []
  const invalidMonsterStats = []
  const invalidMonsterMoves = []
  const generatedMoveLevelIssues = []
  const missingZeroCostCoverage = []
  const missingAffordableDamagingCoverage = []
  const missingMonsterAssets = []
  const placeholderMonsterAssets = []
  const invalidLearnsets = []
  const invalidMoveDefinitions = []
  const moveRuntimeContractIssues = []
  const invalidMoveAssets = []
  const invalidItems = []
  const invalidEvolutions = []
  const nonLevelEvolutions = []
  const nonLevelEvolutionSpecies = new Set()
  const disabledEvolutions = []
  const missingEvolutionMoveDefinitions = []
  const missingEvolutionItemDefinitions = []
  const invalidMapEntries = []

  for (const monster of MONSTERS) {
    if (monsterIds.has(monster.id)) duplicateMonsterIds.push(monster.id)
    monsterIds.add(monster.id)

    if (!monster.name || !monster.id || !monster.dexNo) {
      missingMonsterFields.push({
        id: monster.id,
        name: monster.name || null,
        dexNo: monster.dexNo ?? null,
      })
    }

    for (const typeKey of [monster.type, monster.type2].filter(Boolean)) {
      if (!validTypes.has(typeKey)) {
        invalidMonsterTypes.push({ id: monster.id, name: monster.name, type: typeKey })
      }
    }

    for (const statKey of MONSTER_STAT_KEYS) {
      if (!isPositiveNumber(monster[statKey])) {
        invalidMonsterStats.push({
          id: monster.id,
          name: monster.name,
          stat: statKey,
          value: monster[statKey],
        })
      }
    }

    const moves = Array.isArray(monster.moves) ? monster.moves : []
    if (moves.length > 4) {
      invalidMonsterMoves.push({
        id: monster.id,
        name: monster.name,
        issue: 'more_than_four_moves',
        moves,
      })
    }

    for (const moveKey of moves) {
      if (!moveKeys.has(moveKey)) {
        invalidMonsterMoves.push({
          id: monster.id,
          name: monster.name,
          issue: 'unknown_move',
          moveKey,
        })
      }
    }

    const levelOneMoves = getBalancedMovesForLevel(monster, 1)
    if (!levelOneMoves.some((moveKey) => MOVES[moveKey]?.cost === 0)) {
      missingZeroCostCoverage.push({
        id: monster.id,
        name: monster.name,
        moves: levelOneMoves,
      })
    }
    if (!levelOneMoves.some((moveKey) => {
      const move = MOVES[moveKey]
      return move && (Number(move.power) || 0) > 0 && move.category !== 'status' && (Number(move.cost) || 0) <= 5
    })) {
      missingAffordableDamagingCoverage.push({
        id: monster.id,
        name: monster.name,
        moves: levelOneMoves,
      })
    }

    for (const level of MOVE_LEVEL_AUDIT_LEVELS) {
      const generatedMoves = getBalancedMovesForLevel(monster, level)
      const availableMoveKeys = new Set(getMoveKeysAvailableForMonsterLevel(monster, level))
      if (generatedMoves.length > 4) {
        generatedMoveLevelIssues.push({
          id: monster.id,
          name: monster.name,
          level,
          issue: 'more_than_four_generated_moves',
          moves: generatedMoves,
        })
      }
      if (new Set(generatedMoves).size !== generatedMoves.length) {
        generatedMoveLevelIssues.push({
          id: monster.id,
          name: monster.name,
          level,
          issue: 'duplicate_generated_moves',
          moves: generatedMoves,
        })
      }
      for (const moveKey of generatedMoves) {
        if (!availableMoveKeys.has(moveKey)) {
          generatedMoveLevelIssues.push({
            id: monster.id,
            name: monster.name,
            level,
            issue: 'generated_move_not_available_at_level',
            moveKey,
            moves: generatedMoves,
          })
        }
      }
    }

    for (const assetKey of ['sprite', 'backSprite', 'fallbackSprite']) {
      const assetPath = resolveAssetPath(rootDir, monster[assetKey])
      if (assetPath && !fs.existsSync(assetPath)) {
        missingMonsterAssets.push({
          id: monster.id,
          name: monster.name,
          assetKey,
          assetPath: monster[assetKey],
        })
      }
      if (assetKey !== 'fallbackSprite' && monster[assetKey] === POKEMON_PLACEHOLDER_PATH) {
        placeholderMonsterAssets.push({
          id: monster.id,
          name: monster.name,
          dexNo: monster.dexNo,
          assetKey,
          assetPath: monster[assetKey],
        })
      }
    }

    for (const [levelKey, moveKey] of Object.entries(monster.learnset || {})) {
      if (!isIntegerInRange(levelKey, 1, 100)) {
        invalidLearnsets.push({
          id: monster.id,
          name: monster.name,
          issue: 'invalid_level',
          level: levelKey,
          moveKey,
        })
      }
      if (!moveKeys.has(moveKey)) {
        invalidLearnsets.push({
          id: monster.id,
          name: monster.name,
          issue: 'unknown_move',
          level: Number(levelKey),
          moveKey,
        })
      }
    }

    if (monster.evolvesTo) {
      const evo = monster.evolvesTo
      if (!monsterIds.has(evo.targetId) && !MONSTERS.some((candidate) => candidate.id === evo.targetId)) {
        invalidEvolutions.push({
          id: monster.id,
          name: monster.name,
          issue: 'missing_target',
          evolution: evo,
        })
      }
      if (!Object.prototype.hasOwnProperty.call(evo, 'level')) {
        nonLevelEvolutions.push({
          id: monster.id,
          name: monster.name,
          evolution: evo,
        })
        nonLevelEvolutionSpecies.add(monster.id)
        if (evo.disabled === true) {
          disabledEvolutions.push({
            id: monster.id,
            name: monster.name,
            evolution: evo,
          })
        }
        if (evo.move && !moveKeys.has(evo.move)) {
          missingEvolutionMoveDefinitions.push({
            id: monster.id,
            name: monster.name,
            moveKey: evo.move,
            targetId: evo.targetId,
            method: evo.method || null,
          })
        }
        if (evo.item && !itemKeys.has(evo.item)) {
          missingEvolutionItemDefinitions.push({
            id: monster.id,
            name: monster.name,
            itemKey: evo.item,
            targetId: evo.targetId,
            method: evo.method || null,
          })
        }
      } else if (!isIntegerInRange(evo.level, 1, 100)) {
        invalidEvolutions.push({
          id: monster.id,
          name: monster.name,
          issue: 'invalid_level',
          evolution: evo,
        })
      }
    }

    for (const evo of monster.alternateEvolutions || []) {
      if (!MONSTERS.some((candidate) => candidate.id === evo.targetId)) {
        invalidEvolutions.push({
          id: monster.id,
          name: monster.name,
          issue: 'missing_alternate_target',
          evolution: evo,
        })
      }
      if (!Object.prototype.hasOwnProperty.call(evo, 'level')) {
        nonLevelEvolutions.push({
          id: monster.id,
          name: monster.name,
          evolution: evo,
          alternate: true,
        })
        nonLevelEvolutionSpecies.add(monster.id)
        if (evo.disabled === true) {
          disabledEvolutions.push({
            id: monster.id,
            name: monster.name,
            evolution: evo,
            alternate: true,
          })
        }
        if (evo.move && !moveKeys.has(evo.move)) {
          missingEvolutionMoveDefinitions.push({
            id: monster.id,
            name: monster.name,
            moveKey: evo.move,
            targetId: evo.targetId,
            method: evo.method || null,
            alternate: true,
          })
        }
        if (evo.item && !itemKeys.has(evo.item)) {
          missingEvolutionItemDefinitions.push({
            id: monster.id,
            name: monster.name,
            itemKey: evo.item,
            targetId: evo.targetId,
            method: evo.method || null,
            alternate: true,
          })
        }
      } else if (!isIntegerInRange(evo.level, 1, 100)) {
        invalidEvolutions.push({
          id: monster.id,
          name: monster.name,
          issue: 'invalid_alternate_level',
          evolution: evo,
        })
      }
    }
  }

  const nonLevelEvolutionByMethod = nonLevelEvolutions.reduce((acc, entry) => {
    const method = entry.evolution?.method || 'unknown'
    acc[method] = (acc[method] || 0) + 1
    return acc
  }, {})
  const missingEvolutionItemKeyCount = new Set(
    missingEvolutionItemDefinitions.map((entry) => entry.itemKey)
  ).size
  const moveRuntimeContractByIssue = {}

  for (const [moveKey, move] of Object.entries(MOVES)) {
    if (!move.name || !move.type || !MOVE_CATEGORIES.has(move.category)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'missing_or_invalid_core_fields',
        move,
      })
    }
    if (!validTypes.has(move.type)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'invalid_type',
        type: move.type,
      })
    }
    if (!isIntegerInRange(move.accuracy, 1, 100)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'invalid_accuracy',
        accuracy: move.accuracy,
      })
    }
    if (!(Number(move.power) >= 0)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'invalid_power',
        power: move.power,
      })
    }
    if (!(Number(move.cost) >= 0)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'invalid_cost',
        cost: move.cost,
      })
    }
    if (!isIntegerInRange(move.unlockLevel, 1, 100)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'invalid_unlock_level',
        unlockLevel: move.unlockLevel,
      })
    }
    if (move.status && !PRIMARY_STATUSES.has(move.status)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'unsupported_primary_status',
        status: move.status,
      })
    }
    if (move.volatileStatus && !VOLATILE_STATUSES.has(move.volatileStatus)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'unsupported_volatile_status',
        volatileStatus: move.volatileStatus,
      })
    }
    if (move.effect && !MOVE_EFFECTS.has(move.effect)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'unsupported_effect',
        effect: move.effect,
      })
    }
    if (move.requiresTargetStatus && !PRIMARY_STATUSES.has(move.requiresTargetStatus)) {
      invalidMoveDefinitions.push({
        moveKey,
        issue: 'unsupported_required_status',
        requiresTargetStatus: move.requiresTargetStatus,
      })
    }
    const moveStatChanges = [
      ...(move.statChange ? [move.statChange] : []),
      ...(Array.isArray(move.statChanges) ? move.statChanges : []),
    ]
    for (const statChange of moveStatChanges) {
      if (statChange?.stat && !STAT_CHANGE_KEYS.has(statChange.stat)) {
        invalidMoveDefinitions.push({
          moveKey,
          issue: 'unsupported_stat_change',
          statChange,
        })
      }
    }

    if (move.priority !== undefined && !isIntegerInRange(move.priority, -7, 7)) {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'invalid_priority_range',
        priority: move.priority,
      })
    }

    if (move.charge !== undefined && typeof move.charge !== 'boolean') {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'invalid_charge_flag',
        charge: move.charge,
      })
    }

    if (move.statusChance !== undefined) {
      if (!move.status) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'orphan_status_chance',
          statusChance: move.statusChance,
        })
      } else if (!isIntegerInRange(move.statusChance, 1, 100)) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'invalid_status_chance',
          statusChance: move.statusChance,
          status: move.status,
        })
      }
    }

    if (move.volatileChance !== undefined) {
      if (!move.volatileStatus) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'orphan_volatile_chance',
          volatileChance: move.volatileChance,
        })
      } else if (!isIntegerInRange(move.volatileChance, 1, 100)) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'invalid_volatile_chance',
          volatileChance: move.volatileChance,
          volatileStatus: move.volatileStatus,
        })
      }
    }

    for (const statChange of moveStatChanges) {
      if (statChange.target !== undefined && !STAT_CHANGE_TARGETS.has(statChange.target)) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'invalid_stat_change_target',
          statChange,
        })
      }
      if (!Number.isInteger(statChange.stages) || statChange.stages === 0 || statChange.stages < -6 || statChange.stages > 6) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'invalid_stat_change_stages',
          statChange,
        })
      }
      if (statChange.chance !== undefined && !isIntegerInRange(statChange.chance, 1, 100)) {
        moveRuntimeContractIssues.push({
          moveKey,
          issue: 'invalid_stat_change_chance',
          statChange,
        })
      }
    }

    if (move.effect === 'drain' && (move.category === 'status' || !(Number(move.power) > 0))) {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'drain_without_damage',
        move,
      })
    }

    if (move.category !== 'status' && !(Number(move.power) > 0)) {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'damaging_category_without_power',
        move,
      })
    }

    if (Number(move.power) > 0 && move.category === 'status') {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'status_category_with_power',
        move,
      })
    }

    if (
      move.category === 'status' &&
      !(Number(move.power) > 0) &&
      !move.status &&
      !move.volatileStatus &&
      !move.effect &&
      !move.statChange &&
      !move.statChanges &&
      !move.charge
    ) {
      moveRuntimeContractIssues.push({
        moveKey,
        issue: 'no_runtime_effect_status_move',
        move,
      })
    }
  }

  for (const entry of moveRuntimeContractIssues) {
    moveRuntimeContractByIssue[entry.issue] = (moveRuntimeContractByIssue[entry.issue] || 0) + 1
  }

  const itemGroups = [
    ['pokeball', POKEBALLS, 'catchRateMultiplier'],
    ['potion', POTIONS, 'healAmount'],
    ['expPotion', EXP_POTIONS, 'expAmount'],
    ['evolutionItem', EVOLUTION_ITEMS, 'price'],
  ]

  for (const [itemType, items, requiredValueKey] of itemGroups) {
    for (const [itemKey, item] of Object.entries(items)) {
      if (!item.name || !isPositiveNumber(item.price) || !isPositiveNumber(item[requiredValueKey])) {
        invalidItems.push({
          itemType,
          itemKey,
          item,
        })
      }
      const assetPath = resolveAssetPath(rootDir, item.sprite)
      if (assetPath && !fs.existsSync(assetPath)) {
        invalidMoveAssets.push({
          itemType,
          itemKey,
          assetPath: item.sprite,
        })
      }
    }
  }

  for (const [mapName, mapConfig] of Object.entries(MAP_CONFIG)) {
    if (!isPositiveNumber(mapConfig.minLevel) || !isPositiveNumber(mapConfig.maxLevel) || Number(mapConfig.minLevel) > Number(mapConfig.maxLevel)) {
      invalidMapEntries.push({
        mapName,
        issue: 'invalid_level_range',
        minLevel: mapConfig.minLevel,
        maxLevel: mapConfig.maxLevel,
      })
    }
    for (const row of mapConfig.wildPokemon || []) {
      if (!MONSTERS.some((monster) => monster.id === row.id)) {
        invalidMapEntries.push({
          mapName,
          issue: 'unknown_wild_pokemon',
          row,
        })
      }
      if (!isPositiveNumber(row.weight)) {
        invalidMapEntries.push({
          mapName,
          issue: 'invalid_weight',
          row,
        })
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      moveCount: Object.keys(MOVES).length,
      pokeballCount: Object.keys(POKEBALLS).length,
      potionCount: Object.keys(POTIONS).length,
      expPotionCount: Object.keys(EXP_POTIONS).length,
      evolutionItemCount: Object.keys(EVOLUTION_ITEMS).length,
      duplicateMonsterIdCount: duplicateMonsterIds.length,
      missingMonsterFieldCount: missingMonsterFields.length,
      invalidMonsterTypeCount: invalidMonsterTypes.length,
      invalidMonsterStatCount: invalidMonsterStats.length,
      invalidMonsterMoveCount: invalidMonsterMoves.length,
      generatedMoveLevelIssueCount: generatedMoveLevelIssues.length,
      missingZeroCostCoverageCount: missingZeroCostCoverage.length,
      missingAffordableDamagingCoverageCount: missingAffordableDamagingCoverage.length,
      missingMonsterAssetCount: missingMonsterAssets.length,
      placeholderMonsterAssetCount: placeholderMonsterAssets.length,
      invalidLearnsetCount: invalidLearnsets.length,
      invalidMoveDefinitionCount: invalidMoveDefinitions.length,
      moveRuntimeContractIssueCount: moveRuntimeContractIssues.length,
      moveRuntimeContractByIssue,
      invalidItemCount: invalidItems.length,
      missingItemAssetCount: invalidMoveAssets.length,
      invalidEvolutionCount: invalidEvolutions.length,
      nonLevelEvolutionCount: nonLevelEvolutions.length,
      nonLevelEvolutionSpeciesCount: nonLevelEvolutionSpecies.size,
      nonLevelEvolutionByMethod,
      disabledEvolutionCount: disabledEvolutions.length,
      missingEvolutionMoveDefinitionCount: missingEvolutionMoveDefinitions.length,
      missingEvolutionItemDefinitionCount: missingEvolutionItemDefinitions.length,
      missingEvolutionItemKeyCount,
      invalidMapEntryCount: invalidMapEntries.length,
    },
    samples: {
      duplicateMonsterIds: sample(duplicateMonsterIds),
      missingMonsterFields: sample(missingMonsterFields),
      invalidMonsterTypes: sample(invalidMonsterTypes),
      invalidMonsterStats: sample(invalidMonsterStats),
      invalidMonsterMoves: sample(invalidMonsterMoves),
      generatedMoveLevelIssues: sample(generatedMoveLevelIssues),
      missingZeroCostCoverage: sample(missingZeroCostCoverage),
      missingAffordableDamagingCoverage: sample(missingAffordableDamagingCoverage),
      missingMonsterAssets: sample(missingMonsterAssets),
      placeholderMonsterAssets: sample(placeholderMonsterAssets),
      invalidLearnsets: sample(invalidLearnsets),
      invalidMoveDefinitions: sample(invalidMoveDefinitions),
      moveRuntimeContractIssues: sample(moveRuntimeContractIssues),
      invalidItems: sample(invalidItems),
      missingItemAssets: sample(invalidMoveAssets),
      invalidEvolutions: sample(invalidEvolutions),
      nonLevelEvolutions: sample(nonLevelEvolutions),
      disabledEvolutions: sample(disabledEvolutions),
      missingEvolutionMoveDefinitions: sample(missingEvolutionMoveDefinitions),
      missingEvolutionItemDefinitions: sample(missingEvolutionItemDefinitions),
      invalidMapEntries: sample(invalidMapEntries),
    },
  }

  console.log(JSON.stringify(report, null, 2))

  const criticalIssueCount =
    duplicateMonsterIds.length +
    missingMonsterFields.length +
    invalidMonsterTypes.length +
    invalidMonsterStats.length +
    invalidMonsterMoves.length +
    generatedMoveLevelIssues.length +
    missingMonsterAssets.length +
    placeholderMonsterAssets.length +
    invalidLearnsets.length +
    invalidMoveDefinitions.length +
    moveRuntimeContractIssues.length +
    invalidItems.length +
    invalidMoveAssets.length +
    invalidEvolutions.length +
    missingEvolutionMoveDefinitions.length +
    missingEvolutionItemDefinitions.length +
    invalidMapEntries.length

  if (criticalIssueCount > 0) {
    process.exitCode = 1
  }
})
