#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const REQUIRED_CHAIN_KOS = 3
const MIN_CLEAR_RATE = 0.55
const MIN_MEDIAN_CHAIN_KOS = 3
const RUNS_PER_MATCHUP = 48
const MAX_TURNS_PER_DUEL = 40

const HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE = {
  meadow_hidden_grove: [189, 190, 191],
  lake_hidden_path: [192, 193, 194],
  farm_windmill_top: [195, 196, 197],
  shore_wreck_inner: [198, 199, 200],
  grave_deep_forest: [201, 202, 203],
  hex_sealed_chamber: [204, 205, 206],
  peak_starwatch_path: [207, 208, 209],
}

const STATUS_IMMUNITY_BY_TYPE = {
  poison: ['poison', 'steel'],
  burn: ['fire'],
  paralysis: ['electric'],
  freeze: ['ice'],
}

const errors = []
const rows = []

const round3 = (value) => Math.round(value * 1000) / 1000

const median = (values = []) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.floor(sorted.length / 2)]
}

const createSeededRandom = (seed) => {
  let state = Math.trunc(Number(seed)) >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const hashString = (value = '') => {
  let hash = 2166136261
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const rollChance = (random, chance = 100) => random() * 100 < chance
const rollDamageRandomFactor = (random) => ((Math.floor(random() * 16) + 85) / 100)
const getMonsterTypes = (mon) => [mon?.type, mon?.type2].filter(Boolean)

const hasStatusImmunity = (mon, status) => {
  const immuneTypes = STATUS_IMMUNITY_BY_TYPE[status]
  if (!immuneTypes) return false
  return immuneTypes.some((type) => getMonsterTypes(mon).includes(type))
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    maps,
    { ENCOUNTER_TABLES },
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleDamage, resolveBattleStat },
    { scoreEnemyMove },
  ] = await Promise.all([
    loadModule('/src/game/data/godotMaps/godot_region_maps.js').then((module) => module.default),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/battleDamage.js'),
    loadModule('/src/utils/battleAi.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

  const createBattleMon = (pokemonId, level, overrides = {}) => {
    const base = monsterById.get(Number(pokemonId))
    if (!base) return null
    const safeLevel = Math.max(1, Math.min(100, Math.trunc(Number(level)) || 1))
    const stats = calculateStatsForLevel(base, safeLevel)
    return {
      ...base,
      ...stats,
      level: safeLevel,
      moves: getBalancedMovesForLevel(base, safeLevel),
      currentHp: stats.maxHp,
      currentMp: stats.maxMp,
      status: null,
      statusTurns: 0,
      volatileStatuses: {},
      statStages: {},
      ...overrides,
    }
  }

  const cloneBattleMon = (mon) => ({
    ...mon,
    moves: Array.isArray(mon?.moves) ? [...mon.moves] : [],
    volatileStatuses: { ...(mon?.volatileStatuses || {}) },
    statStages: { ...(mon?.statStages || {}) },
  })

  const getCandidateMoves = (attacker, defender) => {
    const moves = Array.isArray(attacker?.moves) ? attacker.moves : []
    return moves.filter((moveKey) => {
      const move = MOVES[moveKey]
      if (!move) return false
      if ((Number(attacker?.currentMp) || 0) < (Number(move.cost) || 0)) return false
      if (move.requiresTargetStatus && defender?.status !== move.requiresTargetStatus) return false
      if (move.requiresUserStatus && attacker?.status !== move.requiresUserStatus) return false
      return true
    })
  }

  const chooseStrategicMove = ({ attacker, defender }) => {
    const chargingMove = attacker?.volatileStatuses?.chargingMove
    if (chargingMove && MOVES[chargingMove]) return chargingMove

    const candidates = getCandidateMoves(attacker, defender)
    if (candidates.length === 0) return null
    if (candidates.length === 1) return candidates[0]

    return candidates
      .map((moveKey) => ({
        moveKey,
        score: scoreEnemyMove({
          moveKey,
          enemyMon: attacker,
          targetMon: defender,
          battleKind: 'trainer',
          trainerRole: 'boss',
          candidates,
        }),
      }))
      .sort((left, right) => right.score - left.score)[0]?.moveKey || null
  }

  const createStatusPayload = (status, random) => {
    if (status === 'sleep') return { status, statusTurns: 2 + Math.floor(random() * 3) }
    if (status === 'freeze') return { status, statusTurns: 0 }
    return { status, statusTurns: 0 }
  }

  const getConfusionDurationTurns = (random) => 2 + Math.floor(random() * 4)

  const calculateConfusionSelfHitDamage = (mon, random) => {
    const level = mon?.level || 50
    const attackStat = Math.max(1, resolveBattleStat(mon, 'atk'))
    const defenseStat = Math.max(1, resolveBattleStat(mon, 'def'))
    const damage = (((2 * level / 5 + 2) * 40 * (attackStat / defenseStat)) / 50 + 2) * rollDamageRandomFactor(random)
    return Math.max(1, Math.floor(damage))
  }

  const resolveTurnStart = (mon, attemptedMoveKey, random) => {
    const nextMon = cloneBattleMon(mon)
    let canAct = true
    const attemptedMove = attemptedMoveKey ? MOVES[attemptedMoveKey] : null
    const pendingConfusionTurns = Math.max(0, Number(nextMon?.volatileStatuses?.confusion) || 0)

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
      if (attemptedMove?.thawsUser || rollChance(random, 20)) {
        nextMon.status = null
        nextMon.statusTurns = 0
      } else {
        canAct = false
      }
    }

    if (canAct && nextMon.status === 'paralysis' && rollChance(random, 25)) {
      canAct = false
    }

    if (canAct && pendingConfusionTurns > 0) {
      const nextTurns = Math.max(0, pendingConfusionTurns - 1)
      if (nextTurns <= 0) {
        delete nextMon.volatileStatuses.confusion
      } else {
        nextMon.volatileStatuses.confusion = nextTurns
        if (rollChance(random, 100 / 3)) {
          nextMon.currentHp = Math.max(0, nextMon.currentHp - calculateConfusionSelfHitDamage(nextMon, random))
          canAct = false
        }
      }
    }

    return { mon: nextMon, canAct }
  }

  const resolveTurnEnd = (mon) => {
    const nextMon = cloneBattleMon(mon)
    if (nextMon.currentHp > 0 && (nextMon.status === 'poison' || nextMon.status === 'burn')) {
      const divisor = nextMon.status === 'poison' ? 8 : 16
      nextMon.currentHp = Math.max(0, nextMon.currentHp - Math.max(1, Math.floor(nextMon.maxHp / divisor)))
    }
    return nextMon
  }

  const applyPrimaryStatusToMon = (target, status, random) => {
    if (!status || target?.status || hasStatusImmunity(target, status)) return target
    return { ...target, ...createStatusPayload(status, random) }
  }

  const applyVolatileStatusToMon = (target, status, random) => {
    if (!status) return target
    const volatileStatuses = { ...(target?.volatileStatuses || {}) }
    if (status === 'confusion') {
      if (volatileStatuses.confusion) return target
      volatileStatuses.confusion = getConfusionDurationTurns(random)
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
    const statStages = { ...(target?.statStages || {}) }
    statStages[statChange.stat] = clampStatStage((statStages[statChange.stat] || 0) + statChange.stages)
    return { ...target, statStages }
  }

  const applyMove = (attacker, defender, moveKey, random) => {
    const move = MOVES[moveKey]
    let nextAttacker = cloneBattleMon(attacker)
    let nextDefender = cloneBattleMon(defender)
    if (!move) return { attacker: nextAttacker, defender: nextDefender }

    const isChargeRelease = nextAttacker?.volatileStatuses?.chargingMove === moveKey
    if (move.charge && !isChargeRelease) {
      nextAttacker.currentMp = Math.max(0, nextAttacker.currentMp - (Number(move.cost) || 0))
      nextAttacker.volatileStatuses = {
        ...(nextAttacker.volatileStatuses || {}),
        chargingMove: moveKey,
        lastMoveKey: moveKey,
      }
      return { attacker: nextAttacker, defender: nextDefender }
    }

    if (isChargeRelease) {
      delete nextAttacker.volatileStatuses.chargingMove
    } else {
      nextAttacker.currentMp = Math.max(0, nextAttacker.currentMp - (Number(move.cost) || 0))
    }
    nextAttacker.volatileStatuses.lastMoveKey = moveKey

    const hit = move.alwaysHits || rollChance(random, typeof move.accuracy === 'number' ? move.accuracy : 100)
    if (!hit) return { attacker: nextAttacker, defender: nextDefender }

    let damage = 0
    if (move.category !== 'status' && Number(move.power) > 0) {
      const outcome = calculateBattleDamage(nextAttacker, nextDefender, move, {
        randomFactor: rollDamageRandomFactor(random),
        allowCrit: false,
        forceCrit: rollChance(random, 6.25),
      })
      damage = Math.max(0, outcome.damage)
      nextDefender.currentHp = Math.max(0, nextDefender.currentHp - damage)
      if (move.effect === 'drain' && damage > 0) {
        nextAttacker.currentHp = Math.min(nextAttacker.maxHp, nextAttacker.currentHp + Math.max(1, Math.floor(damage / 2)))
      }
      if (move.recoilPercent && damage > 0) {
        nextAttacker.currentHp = Math.max(0, nextAttacker.currentHp - Math.max(1, Math.floor(damage * (Number(move.recoilPercent) || 0) / 100)))
      }
      if (move.selfDestruct) {
        nextAttacker.currentHp = 0
      }
    } else if (move.effect === 'heal') {
      nextAttacker.currentHp = Math.min(nextAttacker.maxHp, nextAttacker.currentHp + Math.max(1, Math.floor(nextAttacker.maxHp / 2)))
    }

    const canApplySecondaryEffect = move.category === 'status' || move.power <= 0 || damage > 0
    if (canApplySecondaryEffect && nextDefender.currentHp > 0 && move.status && rollChance(random, Number(move.statusChance ?? 100))) {
      nextDefender = applyPrimaryStatusToMon(nextDefender, move.status, random)
    }
    if (canApplySecondaryEffect && nextDefender.currentHp > 0 && move.volatileStatus && rollChance(random, Number(move.volatileChance ?? 100))) {
      nextDefender = applyVolatileStatusToMon(nextDefender, move.volatileStatus, random)
    }
    if (canApplySecondaryEffect) {
      for (const statChange of getMoveStatChanges(move)) {
        if (rollChance(random, Number(statChange.chance ?? move.statChangeChance ?? 100))) {
          if (statChange.target === 'attacker') nextAttacker = applyStatChangeToMon(nextAttacker, statChange)
          else nextDefender = applyStatChangeToMon(nextDefender, statChange)
        }
      }
    }

    return { attacker: nextAttacker, defender: nextDefender }
  }

  const determineOrder = (playerMon, enemyMon, playerMoveKey, enemyMoveKey, random) => {
    const playerMove = MOVES[playerMoveKey] || { priority: 0 }
    const enemyMove = MOVES[enemyMoveKey] || { priority: 0 }
    if ((playerMove.priority || 0) > (enemyMove.priority || 0)) return 'player'
    if ((enemyMove.priority || 0) > (playerMove.priority || 0)) return 'enemy'
    const playerSpeed = resolveBattleStat(playerMon, 'spd')
    const enemySpeed = resolveBattleStat(enemyMon, 'spd')
    if (playerSpeed > enemySpeed) return 'player'
    if (enemySpeed > playerSpeed) return 'enemy'
    return random() < 0.5 ? 'player' : 'enemy'
  }

  const simulateDuel = (playerMon, enemyMon, random) => {
    let player = cloneBattleMon(playerMon)
    let enemy = cloneBattleMon(enemyMon)
    let turns = 0

    while (player.currentHp > 0 && enemy.currentHp > 0 && turns < MAX_TURNS_PER_DUEL) {
      turns += 1
      const playerMoveKey = chooseStrategicMove({ attacker: player, defender: enemy })
      const enemyMoveKey = chooseStrategicMove({ attacker: enemy, defender: player })
      if (!playerMoveKey && !enemyMoveKey) break

      const order = determineOrder(player, enemy, playerMoveKey, enemyMoveKey, random)
      const sequence = order === 'player'
        ? [['player', playerMoveKey], ['enemy', enemyMoveKey]]
        : [['enemy', enemyMoveKey], ['player', playerMoveKey]]

      for (const [side, moveKey] of sequence) {
        if (player.currentHp <= 0 || enemy.currentHp <= 0) break
        const actor = side === 'player' ? player : enemy
        const start = resolveTurnStart(actor, moveKey, random)
        if (side === 'player') player = start.mon
        else enemy = start.mon
        if (!start.canAct || start.mon.currentHp <= 0 || !moveKey) continue

        const applied = side === 'player'
          ? applyMove(player, enemy, moveKey, random)
          : applyMove(enemy, player, moveKey, random)
        if (side === 'player') {
          player = applied.attacker
          enemy = applied.defender
        } else {
          enemy = applied.attacker
          player = applied.defender
        }
      }

      if (player.currentHp <= 0 || enemy.currentHp <= 0) break
      player = resolveTurnEnd(player)
      if (player.currentHp <= 0) break
      enemy = resolveTurnEnd(enemy)
    }

    return {
      won: enemy.currentHp <= 0 && player.currentHp > 0,
      player,
      enemy,
      turns,
    }
  }

  const simulateGauntlet = ({ playerTemplate, enemyTemplates, seed }) => {
    const random = createSeededRandom(seed)
    let player = cloneBattleMon(playerTemplate)
    let defeated = 0

    for (const enemyTemplate of enemyTemplates) {
      const duel = simulateDuel(player, enemyTemplate, random)
      player = duel.player
      if (!duel.won) {
        return {
          defeated,
          cleared: false,
          player,
        }
      }
      defeated += 1
    }

    return {
      defeated,
      cleared: defeated >= enemyTemplates.length,
      player,
    }
  }

  const getBossTriplet = (map, mapId, zoneId) => {
    const bossEvent = (map?.runtimeEvents || []).find((event) => event?.type === 'boss')
    const team = Array.isArray(bossEvent?.properties?.team) ? bossEvent.properties.team : []
    if (team.length < REQUIRED_CHAIN_KOS) {
      errors.push(`${mapId}/${zoneId} boss team must have at least ${REQUIRED_CHAIN_KOS} members, got ${team.length}`)
      return []
    }
    return team.slice(0, REQUIRED_CHAIN_KOS)
  }

  for (const [mapId, map] of Object.entries(maps)) {
    const deepZones = (map?.encounterZones || []).filter((zone) => zone?.depth === 'deep')
    for (const zone of deepZones) {
      const expectedExclusiveIds = HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE[zone.id] || []
      if (expectedExclusiveIds.length === 0) continue

      const bossTripletConfig = getBossTriplet(map, mapId, zone.id)
      if (bossTripletConfig.length < REQUIRED_CHAIN_KOS) continue

      const bossTriplet = bossTripletConfig
        .map((member, index) => {
          const enemyMon = createBattleMon(member?.pokemonId, member?.level)
          if (!enemyMon) {
            errors.push(`${mapId}/${zone.id} missing boss triplet member ${member?.pokemonId || 'unknown'} at slot ${index + 1}`)
          }
          return enemyMon
        })
        .filter(Boolean)
      if (bossTriplet.length < REQUIRED_CHAIN_KOS) continue

      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
      const zoneRow = {
        mapId,
        zoneId: zone.id,
        zoneName: zone.name,
        bossTriplet: bossTriplet.map((mon) => `${mon.name} Lv.${mon.level}`),
        results: [],
      }

      for (const pokemonId of expectedExclusiveIds) {
        const encounterEntry = entries.find((entry) => Math.trunc(Number(entry?.id)) === pokemonId)
        const level = Math.max(
          1,
          Math.trunc(Number(encounterEntry?.maxLevel)) ||
          Math.trunc(Number(encounterEntry?.minLevel)) ||
          Math.trunc(Number(map?.levelRange?.[1])) ||
          1
        )
        const playerTemplate = createBattleMon(pokemonId, level)
        if (!playerTemplate) {
          errors.push(`${mapId}/${zone.id} missing hidden-exclusive Pokemon ${pokemonId}`)
          continue
        }

        const gauntletRuns = Array.from({ length: RUNS_PER_MATCHUP }, (_, runIndex) => (
          simulateGauntlet({
            playerTemplate,
            enemyTemplates: bossTriplet,
            seed: hashString(`${mapId}:${zone.id}:${pokemonId}:${runIndex}`),
          })
        ))

        const clearRate = gauntletRuns.filter((result) => result.cleared).length / gauntletRuns.length
        const defeatedCounts = gauntletRuns.map((result) => result.defeated)
        const medianChainKos = median(defeatedCounts)
        const averageChainKos = defeatedCounts.reduce((sum, value) => sum + value, 0) / defeatedCounts.length
        const medianRemainingHpRatio = median(gauntletRuns.map((result) => (
          Math.max(0, Number(result?.player?.currentHp) || 0) / Math.max(1, Number(result?.player?.maxHp) || 1)
        )))

        zoneRow.results.push({
          pokemon: `${playerTemplate.name}#${pokemonId}`,
          level,
          clearRate: round3(clearRate),
          medianChainKos,
          averageChainKos: round3(averageChainKos),
          medianRemainingHpRatio: round3(medianRemainingHpRatio ?? 0),
        })

        if (clearRate < MIN_CLEAR_RATE || medianChainKos < MIN_MEDIAN_CHAIN_KOS) {
          errors.push(
            `${mapId}/${zone.id} ${playerTemplate.name}#${pokemonId} only clears boss opening ${round3(clearRate * 100)}% of runs `
            + `(median KOs ${medianChainKos}, avg KOs ${round3(averageChainKos)}); expected at least ${REQUIRED_CHAIN_KOS} KOs with clear rate >= ${round3(MIN_CLEAR_RATE * 100)}%`
          )
        }
      }

      rows.push(zoneRow)
    }
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      zoneCount: rows.length,
      runsPerMatchup: RUNS_PER_MATCHUP,
      requiredChainKos: REQUIRED_CHAIN_KOS,
      minClearRate: MIN_CLEAR_RATE,
      minMedianChainKos: MIN_MEDIAN_CHAIN_KOS,
      errorCount: errors.length,
    },
    rows,
    errors,
  }, null, 2))

  if (errors.length > 0) process.exitCode = 1
})
