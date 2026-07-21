#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const STARTER_IDS = [1, 2, 3]
const SCENARIOS = [
  {
    key: 'gate',
    includeNormalTrainers: false,
    includeChallenge: false
  },
  {
    key: 'boss_ready',
    includeNormalTrainers: true,
    includeChallenge: false
  },
  {
    key: 'full_first_clear',
    includeNormalTrainers: true,
    includeChallenge: true
  }
]

const ROLE_TARGETS = {
  normal: {
    scenarioKey: 'full_first_clear',
    difficultyLabel: '稍有难度',
    minTeamSize: 2,
    maxTeamSize: 3,
    minAvgDelta: -4,
    maxAvgDelta: 1,
    minAceDelta: -4,
    maxAceDelta: 3,
    minSoloMedianTurnSwing: -3,
    maxSoloMedianTurnSwing: 0
  },
  lieutenant: {
    scenarioKey: 'full_first_clear',
    difficultyLabel: '有一定难度',
    minTeamSize: 3,
    maxTeamSize: 5,
    minAvgDelta: -2,
    maxAvgDelta: 4,
    minAceDelta: -2,
    maxAceDelta: 5,
    minSoloMedianTurnSwing: -1,
    maxSoloMedianTurnSwing: 1
  },
  boss: {
    scenarioKey: 'boss_ready',
    difficultyLabel: '很有难度',
    minTeamSize: 4,
    maxTeamSize: 6,
    minAvgDelta: -1,
    maxAvgDelta: 10,
    minAceDelta: -1,
    maxAceDelta: 14,
    minSoloMedianTurnSwing: -1,
    maxSoloMedianTurnSwing: 2
  }
}

const FULL_PARTY_TARGETS = {
  normal: {
    minClearRate: 1,
    minLossRatio: 0.03,
    maxLossRatio: 0.34
  },
  lieutenant: {
    minClearRate: 0.66,
    minLossRatio: 0.03,
    maxLossRatio: 0.48
  },
  boss: {
    minClearRate: 0.33,
    minLossRatio: 0.14,
    maxLossRatio: 0.84
  }
}

const errors = []
const warnings = []

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)

const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.floor(sorted.length / 2)]
}

const round1 = (value) => (
  Number.isFinite(value) ? Math.round(value * 10) / 10 : null
)

const round3 = (value) => (
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null
)

const average = (values) => {
  const safe = values.filter(Number.isFinite)
  if (safe.length === 0) return null
  return safe.reduce((sum, value) => sum + value, 0) / safe.length
}

const clampLevel = (value, fallback = 1) => {
  const normalized = Math.trunc(Number(value))
  return Math.max(1, Math.min(100, Number.isFinite(normalized) ? normalized : fallback))
}

const getProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const getPokemonId = (entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id))
const getLevel = (entry) => clampLevel(entry?.level, 1)

const formatRange = (values) => {
  const safe = values.filter(Number.isFinite)
  if (safe.length === 0) return ''
  const min = Math.min(...safe)
  const max = Math.max(...safe)
  return min === max ? String(min) : `${min}-${max}`
}

const FIRST_REGION_MAP_ID = 'GodotMapV2'
const FINAL_REGION_MAP_ID = 'GodotMapV2_BossHighland'

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MAP_CHAIN, getMapConfigData, getMapInfo },
    { MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleRewards, getPlayerAverageLevel, getTrainerRoleBalance },
    { getOfficialExpToNextLevel },
    { simulateMonsterExpGain },
    {
      getTrainerBattlePressureLevel,
      getTrainerCatchUpBonus,
      rebalanceTrainerBattleTeamLevels,
      resolveTrainerBattleTeamConfig
    },
    { calculateBattleDamage },
    { ENCOUNTER_TABLES },
    { getEvolutionFamilyIds, getEvolutionFamilyKey },
    { isLevelValidForSpecies },
  ] = await Promise.all([
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/officialExperience.js'),
    loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/trainerBattleScaling.js'),
    loadModule('/src/utils/battleDamage.js'),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/pokemonFamilyVariety.js'),
    loadModule('/src/utils/wildEncounterRules.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const mapOrderById = new Map(MAP_CHAIN.map((mapId, index) => [mapId, index]))
  const getBaseMonsterDefinition = (monsterId) => monsterById.get(Number(monsterId)) || null
  const getTeamSizeTargetForRow = (row, target) => {
    const roleBalance = getTrainerRoleBalance(row.role)
    if (!roleBalance) return target
    return {
      ...target,
      minTeamSize: roleBalance.minTeamSize,
      maxTeamSize: roleBalance.maxTeamSize
    }
  }
  const getFullPartyTargetForRow = (row) => {
    const base = FULL_PARTY_TARGETS[row.role] || FULL_PARTY_TARGETS.normal
    const mapOrder = mapOrderById.get(row.mapId) ?? 0

    if (row.role === 'normal') {
      if (row.mapId === 'GodotMap') {
        return {
          ...base,
          minClearRate: 0.33,
          minLossRatio: 0.35,
          maxLossRatio: 0.8
        }
      }
      if (row.mapId === FIRST_REGION_MAP_ID) {
        return {
          ...base,
          minClearRate: 1,
          minLossRatio: 0.05,
          maxLossRatio: 0.42
        }
      }
      if (mapOrder >= 6) {
        return {
          ...base,
          minClearRate: 1,
          minLossRatio: 0.02,
          maxLossRatio: 0.26
        }
      }
      return base
    }

    if (row.role === 'lieutenant') {
      if (row.mapId === FIRST_REGION_MAP_ID) {
        return {
          ...base,
          minClearRate: 0.66,
          minLossRatio: 0.08,
          maxLossRatio: 0.56
        }
      }
      if (row.mapId === 'GodotMapV2_PirateShore') {
        return {
          ...base,
          maxLossRatio: 0.64
        }
      }
      if (row.mapId === FINAL_REGION_MAP_ID) {
        return {
          ...base,
          minClearRate: 1,
          minLossRatio: 0.08,
          maxLossRatio: 0.44
        }
      }
      return {
        ...base,
        maxLossRatio: 0.53
      }
    }

    if (row.role === 'boss') {
      if (row.mapId === FIRST_REGION_MAP_ID) {
        return {
          ...base,
          minClearRate: 0.33,
          minLossRatio: 0.18,
          maxLossRatio: 0.82
        }
      }
      if (row.mapId === 'GodotMapV2_PirateShore') {
        return {
          ...base,
          maxLossRatio: 0.92
        }
      }
      if (row.mapId === FINAL_REGION_MAP_ID) {
        return {
          ...base,
          minClearRate: 0.33,
          minLossRatio: 0.28,
          maxLossRatio: 0.9
        }
      }
      return base
    }

    return base
  }
  const getBaseStats = (monster = {}) => (
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

  const getMonsterStatTotal = (monster = {}) => {
    const stats = monster.stats || {}
    return [
      stats.hp ?? monster.maxHp,
      stats.attack ?? monster.atk,
      stats.defense ?? monster.def,
      stats.sp_attack ?? monster.spAtk,
      stats.sp_defense ?? monster.spDef,
      stats.speed ?? monster.spd,
    ].reduce((sum, value) => sum + (Number(value) || 0), 0)
  }

  const makeMonster = (pokemonId, level, id = `m${pokemonId}`) => {
    const base = getBaseMonsterDefinition(pokemonId)
    if (!base) return null
    const stats = calculateStatsForLevel(getBaseStats(base), level)
    return {
      ...base,
      ...stats,
      id,
      baseId: base.id,
      level,
      moves: getBalancedMovesForLevel(base, level),
      currentHp: stats.maxHp,
      currentMp: stats.maxMp,
      currentExp: 0,
      expToNextLevel: level >= 100 ? Infinity : getOfficialExpToNextLevel(level, base),
    }
  }

  const cloneBattleMon = (monster, id = monster?.id) => (
    monster
      ? {
          ...monster,
          id,
          currentHp: Math.max(0, Number(monster.currentHp ?? monster.maxHp) || 0),
          currentMp: Math.max(0, Number(monster.currentMp ?? monster.maxMp) || 0),
        }
      : null
  )

  const getBattleHp = (monster) => Math.max(0, Number(monster?.currentHp ?? monster?.maxHp) || 0)
  const hasBattleHp = (monster) => getBattleHp(monster) > 0

  const resolveEventTeam = ({ event, mapId, mapConfig, worldCounts }) => {
    const props = getProps(event)
    const team = Array.isArray(props.team) ? props.team : []
    const role = event.type === 'boss' ? 'boss' : (props.role || event.type || 'normal')
    const boss = (getMapInfo(mapId).runtimeEvents || []).find((candidate) => candidate.type === 'boss')
    const bossTeam = Array.isArray(getProps(boss).team) ? getProps(boss).team : []
    if (event.type === 'challenge' || (event.type === 'trainer' && role === 'normal')) {
      return resolveTrainerBattleTeamConfig(team, {
        role,
        eventType: event.type,
        eventId: event.id,
        mapName: mapId,
        dailyRefreshKey: 'trainer-role-difficulty-audit',
        victoryCount: worldCounts.get(`${mapId}:${event.id}`) || 0,
        mapConfig,
        mapWildPokemon: mapConfig?.wildPokemon,
        dailyVariantSpeciesIds: props.dailyVariantSpeciesIds,
        dailyVariantLevelJitter: props.dailyVariantLevelJitter,
        bossTeamConfig: bossTeam,
        challengeRarePool: props.challengeRarePool,
        challengeBattleGroups: props.challengeBattleGroups,
        enableDailyVariant: true,
      })
    }
    return team.map((member) => ({
      pokemonId: getPokemonId(member),
      level: getLevel(member),
    })).filter((member) => Number.isInteger(member.pokemonId))
  }

  const buildEventsForMap = ({ mapId, scenario, worldCounts }) => {
    const mapInfo = getMapInfo(mapId)
    const mapConfig = getMapConfigData(mapId)
    const events = Array.isArray(mapInfo.runtimeEvents) ? mapInfo.runtimeEvents : []
    const normalTrainers = events.filter((event) => event.type === 'trainer' && (getProps(event).role || 'normal') === 'normal')
    const lieutenants = events.filter((event) => event.type === 'trainer' && getProps(event).role === 'lieutenant')
    const challenge = events.find((event) => event.type === 'challenge')
    const boss = events.find((event) => event.type === 'boss')
    const selected = [
      ...(scenario.includeNormalTrainers ? normalTrainers : []),
      ...lieutenants,
      ...(scenario.includeChallenge && challenge ? [challenge] : []),
      ...(boss ? [boss] : []),
    ]
    return selected.map((event) => {
      const props = getProps(event)
      const role = event.type === 'boss' ? 'boss' : (props.role || event.type || 'normal')
      return {
        mapId,
        mapConfig,
        eventId: event.id,
        eventType: event.type,
        role,
        teamConfig: resolveEventTeam({ event, mapId, mapConfig, worldCounts }),
      }
    })
  }

  const grantLeadExp = ({ playerTeam, fight }) => {
    const participantIds = [playerTeam[0]?.id].filter(Boolean)
    const totals = fight.enemyMons.reduce((sum, enemy) => {
      const reward = calculateBattleRewards({
        defeatedMon: enemy,
        playerAverageLevel: getPlayerAverageLevel(playerTeam),
        battleKind: 'trainer',
        participants: participantIds.length || 1,
        trainerRole: fight.role,
      })
      return {
        exp: sum.exp + (Number(reward.exp) || 0),
      }
    }, { exp: 0 })
    const result = simulateMonsterExpGain(
      playerTeam[0],
      totals.exp,
      getBaseMonsterDefinition,
      []
    )
    return {
      playerTeam: [result.updatedMon],
    }
  }

  const getMoveDamageOutcome = (attacker, defender, moveKey) => {
    const move = MOVES[moveKey]
    if (!move || !(Number(move.power) > 0) || move.category === 'status') {
      return { damage: 0, effectiveness: 1 }
    }
    return calculateBattleDamage(attacker, defender, move, { randomFactor: 0.925 })
  }

  const getBestDamage = (attacker, defender) => {
    const moves = Array.isArray(attacker?.moves) ? attacker.moves : []
    return moves
      .map((moveKey) => ({ moveKey, ...getMoveDamageOutcome(attacker, defender, moveKey) }))
      .filter((entry) => entry.damage > 0 && entry.effectiveness > 0)
      .sort((left, right) => right.damage - left.damage || right.effectiveness - left.effectiveness)[0] || null
  }

  const getTurnsToKo = (attacker, defender) => {
    const best = getBestDamage(attacker, defender)
    if (!best || best.damage <= 0) return null
    return Math.ceil((Number(defender?.maxHp) || 1) / best.damage)
  }

  const getSoloMedianTurnSwing = ({ teamConfig, playerLevel }) => {
    const starters = STARTER_IDS
      .map((starterId) => makeMonster(starterId, playerLevel, `starter_${starterId}_${playerLevel}`))
      .filter(Boolean)
    const enemies = teamConfig
      .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `enemy_${index}`))
      .filter(Boolean)
    const enemySwings = enemies.map((enemy) => {
      const swings = starters
        .map((starter) => {
          const playerTurns = getTurnsToKo(starter, enemy)
          const enemyTurns = getTurnsToKo(enemy, starter)
          if (!Number.isFinite(playerTurns) || !Number.isFinite(enemyTurns)) return null
          return playerTurns - enemyTurns
        })
        .filter(Number.isFinite)
      return median(swings)
    }).filter(Number.isFinite)
    return round1(median(enemySwings))
  }

  const accessibleWildFamiliesByMap = new Map()
  const cumulativeFamilyMap = new Map()
  MAP_CHAIN.forEach((mapId, mapOrder) => {
    const zones = Array.isArray(getMapInfo(mapId)?.encounterZones) ? getMapInfo(mapId).encounterZones : []
    zones.forEach((zone) => {
      if (!zone?.encounterTableId || zone?.depth === 'deep' || zone?.minEncounterTier) return
      const tableEntries = Array.isArray(ENCOUNTER_TABLES[zone.encounterTableId]?.pokemon)
        ? ENCOUNTER_TABLES[zone.encounterTableId].pokemon
        : []
      tableEntries.forEach((entry) => {
        const pokemonId = getPokemonId(entry)
        if (!Number.isInteger(pokemonId) || !monsterById.has(pokemonId)) return
        const familyKey = getEvolutionFamilyKey(pokemonId, MONSTERS)
        if (!familyKey) return
        const existing = cumulativeFamilyMap.get(familyKey)
        if (!existing) {
          cumulativeFamilyMap.set(familyKey, {
            familyKey,
            seedId: pokemonId,
            firstMapOrder: mapOrder,
            speciesIds: new Set([pokemonId]),
          })
          return
        }
        existing.speciesIds.add(pokemonId)
        existing.firstMapOrder = Math.min(existing.firstMapOrder, mapOrder)
      })
    })
    accessibleWildFamiliesByMap.set(
      mapId,
      [...cumulativeFamilyMap.values()].map((record) => ({
        familyKey: record.familyKey,
        seedId: record.seedId,
        firstMapOrder: record.firstMapOrder,
        speciesIds: [...record.speciesIds],
      }))
    )
  })

  const getExpectedPartySize = (mapId) => {
    const mapOrder = mapOrderById.get(mapId) ?? 0
    if (mapOrder <= 0) return 1
    if (mapOrder === 1) return 4
    if (mapOrder === 2) return 5
    return 6
  }

  const buildPartyLevelTemplate = (leadLevel, partySize) => {
    const lead = clampLevel(leadLevel, 5)
    const averageLevel = clampLevel(
      lead - (partySize > 1 ? 1 : 0),
      lead
    )
    const bySize = {
      1: [lead],
      2: [lead, averageLevel],
      3: [lead, averageLevel, averageLevel],
      4: [lead, averageLevel, averageLevel, averageLevel - 1],
      5: [lead, averageLevel, averageLevel, averageLevel - 1, averageLevel - 1],
      6: [lead, averageLevel, averageLevel, averageLevel - 1, averageLevel - 1, averageLevel - 2],
    }
    return (bySize[partySize] || bySize[6]).map((value) => clampLevel(value, lead))
  }

  const resolveBestFamilySpeciesAtLevel = (seedId, level) => {
    const familyIds = [...getEvolutionFamilyIds(seedId, MONSTERS)]
      .filter((candidateId) => Number.isInteger(candidateId) && monsterById.has(candidateId))
    const validIds = familyIds.filter((candidateId) => isLevelValidForSpecies(candidateId, level))
    const preferredIds = validIds.length > 0 ? validIds : familyIds
    return preferredIds
      .map((candidateId) => monsterById.get(candidateId))
      .filter(Boolean)
      .sort((left, right) => (
        getMonsterStatTotal(right) - getMonsterStatTotal(left) ||
        (Number(right?.dexNo ?? right?.id) || 0) - (Number(left?.dexNo ?? left?.id) || 0)
      ))[0]?.id ?? null
  }

  const getFamilySelectionScore = (record, level, chosenTypes) => {
    const resolvedSpeciesId = resolveBestFamilySpeciesAtLevel(record.seedId, level)
    const monster = monsterById.get(resolvedSpeciesId)
    if (!monster) return Number.NEGATIVE_INFINITY
    const types = [monster.type, monster.type2].filter(Boolean)
    const newTypes = types.filter((type) => !chosenTypes.has(type))
    const moveTypes = new Set(
      (getBalancedMovesForLevel(monster, level) || [])
        .map((moveKey) => MOVES[moveKey]?.type)
        .filter(Boolean)
    )
    const stabMoveTypes = [...moveTypes].filter((type) => types.includes(type))
    return (
      newTypes.length * 28 +
      stabMoveTypes.length * 8 +
      moveTypes.size * 2 +
      getMonsterStatTotal(monster) / 18 +
      Math.max(0, 6 - (record.firstMapOrder ?? 6))
    )
  }

  const buildSyntheticParty = ({ starterId, mapId, leadLevel }) => {
    const partySize = getExpectedPartySize(mapId)
    const levelTemplate = buildPartyLevelTemplate(leadLevel, partySize)
    const evaluationLevel = clampLevel(Math.round(average(levelTemplate) || leadLevel), leadLevel)
    const starterFamilyKey = getEvolutionFamilyKey(starterId, MONSTERS)
    const accessibleFamilies = accessibleWildFamiliesByMap.get(mapId) || []
    const starterRecord = {
      familyKey: starterFamilyKey,
      seedId: starterId,
      firstMapOrder: -1,
      speciesIds: [starterId],
    }
    const candidates = [
      starterRecord,
      ...accessibleFamilies.filter((record) => record.familyKey !== starterFamilyKey),
    ]
    const chosenRecords = [starterRecord]
    const chosenFamilyKeys = new Set([starterFamilyKey])
    const chosenTypes = new Set()
    const starterSpeciesId = resolveBestFamilySpeciesAtLevel(starterId, evaluationLevel) || starterId
    const starterMonster = monsterById.get(starterSpeciesId)
    ;[starterMonster?.type, starterMonster?.type2].filter(Boolean).forEach((type) => chosenTypes.add(type))

    while (chosenRecords.length < partySize) {
      const nextRecord = candidates
        .filter((record) => !chosenFamilyKeys.has(record.familyKey))
        .map((record) => ({
          record,
          score: getFamilySelectionScore(record, evaluationLevel, chosenTypes)
        }))
        .sort((left, right) => right.score - left.score || left.record.firstMapOrder - right.record.firstMapOrder)[0]
      if (!nextRecord) break
      chosenRecords.push(nextRecord.record)
      chosenFamilyKeys.add(nextRecord.record.familyKey)
      const speciesId = resolveBestFamilySpeciesAtLevel(nextRecord.record.seedId, evaluationLevel)
      const monster = monsterById.get(speciesId)
      ;[monster?.type, monster?.type2].filter(Boolean).forEach((type) => chosenTypes.add(type))
    }

    return chosenRecords
      .slice(0, partySize)
      .map((record, index) => {
        const level = levelTemplate[index] ?? levelTemplate[levelTemplate.length - 1] ?? leadLevel
        const speciesId = resolveBestFamilySpeciesAtLevel(record.seedId, level) || record.seedId
        return makeMonster(speciesId, level, `player_${starterId}_${mapId}_${index}_${speciesId}_${level}`)
      })
      .filter(Boolean)
  }

  const performAttack = (attacker, defender) => {
    const best = getBestDamage(attacker, defender)
    if (!best || best.damage <= 0) return { damage: 0, effectiveness: 1 }
    defender.currentHp = Math.max(0, getBattleHp(defender) - best.damage)
    return best
  }

  const simulateDuel = ({ playerMon, enemyMon, maxTurns = 40 }) => {
    const player = cloneBattleMon(playerMon, playerMon?.id)
    const enemy = cloneBattleMon(enemyMon, enemyMon?.id)
    let turns = 0
    let winner = 'stalemate'

    while (hasBattleHp(player) && hasBattleHp(enemy) && turns < maxTurns) {
      turns += 1
      const playerActsFirst = (Number(player?.spd) || 0) >= (Number(enemy?.spd) || 0)
      let playerDamage = 0
      let enemyDamage = 0

      if (playerActsFirst) {
        playerDamage = performAttack(player, enemy).damage
        if (!hasBattleHp(enemy)) {
          winner = 'player'
          break
        }
        enemyDamage = performAttack(enemy, player).damage
        if (!hasBattleHp(player)) {
          winner = 'enemy'
          break
        }
      } else {
        enemyDamage = performAttack(enemy, player).damage
        if (!hasBattleHp(player)) {
          winner = 'enemy'
          break
        }
        playerDamage = performAttack(player, enemy).damage
        if (!hasBattleHp(enemy)) {
          winner = 'player'
          break
        }
      }

      if (playerDamage <= 0 && enemyDamage <= 0) break
    }

    if (winner === 'stalemate') {
      if (hasBattleHp(player) && !hasBattleHp(enemy)) winner = 'player'
      else if (!hasBattleHp(player) && hasBattleHp(enemy)) winner = 'enemy'
    }

    return {
      winner,
      turns,
      playerMon: player,
      enemyMon: enemy,
    }
  }

  const previewMatchup = ({ playerMon, enemyMon, entryDamage = 0 }) => {
    const previewPlayer = cloneBattleMon(playerMon, playerMon?.id)
    const previewEnemy = cloneBattleMon(enemyMon, enemyMon?.id)
    previewPlayer.currentHp = Math.max(0, getBattleHp(previewPlayer) - Math.max(0, Number(entryDamage) || 0))
    if (!hasBattleHp(previewPlayer)) {
      return {
        win: false,
        score: Number.NEGATIVE_INFINITY,
        duel: null,
        playerRemainingHpRatio: 0,
        enemyRemainingHpRatio: 1,
      }
    }
    const duel = simulateDuel({ playerMon: previewPlayer, enemyMon: previewEnemy })
    const playerRemainingHpRatio = Math.max(0, getBattleHp(duel.playerMon)) / Math.max(1, Number(duel.playerMon?.maxHp) || 1)
    const enemyRemainingHpRatio = Math.max(0, getBattleHp(duel.enemyMon)) / Math.max(1, Number(duel.enemyMon?.maxHp) || 1)
    const win = duel.winner === 'player' && !hasBattleHp(duel.enemyMon)
    const score = win
      ? 1000 + playerRemainingHpRatio * 120 - duel.turns * 4
      : (1 - enemyRemainingHpRatio) * 140 + playerRemainingHpRatio * 20 - duel.turns * 4
    return {
      win,
      score,
      duel,
      playerRemainingHpRatio,
      enemyRemainingHpRatio,
    }
  }

  const pickBestAliveIndex = (team, enemyMon, excludedIndex = null) => {
    return team
      .map((monster, index) => ({ monster, index }))
      .filter(({ monster, index }) => hasBattleHp(monster) && index !== excludedIndex)
      .map(({ monster, index }) => ({
        index,
        preview: previewMatchup({ playerMon: monster, enemyMon }),
      }))
      .sort((left, right) => right.preview.score - left.preview.score)[0]?.index ?? -1
  }

  const simulateFullPartyBattle = ({ playerTeam, enemyTeam }) => {
    const party = (Array.isArray(playerTeam) ? playerTeam : []).map((monster, index) => cloneBattleMon(monster, monster?.id || `player_${index}`))
    const foes = (Array.isArray(enemyTeam) ? enemyTeam : []).map((monster, index) => cloneBattleMon(monster, monster?.id || `enemy_${index}`))
    const usedMonIds = new Set()
    let activeIndex = party.findIndex(hasBattleHp)
    if (activeIndex >= 0) usedMonIds.add(party[activeIndex].id)
    let swapCount = 0
    let enemyDefeated = 0

    for (const foeTemplate of foes) {
      let enemyMon = cloneBattleMon(foeTemplate, foeTemplate.id)
      while (hasBattleHp(enemyMon)) {
        if (!party.some(hasBattleHp)) {
          enemyMon.currentHp = Math.max(1, getBattleHp(enemyMon))
          break
        }

        if (activeIndex < 0 || !hasBattleHp(party[activeIndex])) {
          activeIndex = pickBestAliveIndex(party, enemyMon)
          if (activeIndex < 0) break
          usedMonIds.add(party[activeIndex].id)
        } else {
          const activePreview = previewMatchup({ playerMon: party[activeIndex], enemyMon })
          const proactiveSwitch = party
            .map((monster, index) => ({ monster, index }))
            .filter(({ monster, index }) => index !== activeIndex && hasBattleHp(monster))
            .map(({ monster, index }) => {
              const entryDamage = getBestDamage(enemyMon, monster)?.damage || 0
              return {
                index,
                entryDamage,
                preview: previewMatchup({ playerMon: monster, enemyMon, entryDamage })
              }
            })
            .sort((left, right) => right.preview.score - left.preview.score)[0] || null

          if (
            proactiveSwitch &&
            (
              (!activePreview.win && proactiveSwitch.preview.win) ||
              (
                proactiveSwitch.preview.score > activePreview.score + 18 &&
                proactiveSwitch.preview.playerRemainingHpRatio > activePreview.playerRemainingHpRatio + 0.12
              )
            )
          ) {
            const switchedMon = party[proactiveSwitch.index]
            switchedMon.currentHp = Math.max(0, getBattleHp(switchedMon) - proactiveSwitch.entryDamage)
            swapCount += 1
            activeIndex = proactiveSwitch.index
            usedMonIds.add(switchedMon.id)
            if (!hasBattleHp(switchedMon)) {
              activeIndex = -1
              continue
            }
          }
        }

        const duel = simulateDuel({
          playerMon: party[activeIndex],
          enemyMon
        })
        party[activeIndex] = duel.playerMon
        enemyMon = duel.enemyMon

        if (!hasBattleHp(enemyMon)) {
          enemyDefeated += 1
          activeIndex = -1
          break
        }

        if (!hasBattleHp(party[activeIndex])) {
          activeIndex = -1
          continue
        }

        if (duel.winner === 'stalemate') {
          const replacementIndex = pickBestAliveIndex(party, enemyMon, activeIndex)
          if (replacementIndex < 0) break
          activeIndex = replacementIndex
          usedMonIds.add(party[activeIndex].id)
          swapCount += 1
        }
      }

      if (hasBattleHp(enemyMon)) break
    }

    const totalMaxHp = party.reduce((sum, monster) => sum + Math.max(1, Number(monster?.maxHp) || 1), 0)
    const totalCurrentHp = party.reduce((sum, monster) => sum + Math.max(0, getBattleHp(monster)), 0)
    const remainingMons = party.filter(hasBattleHp).length
    const faintCount = Math.max(0, party.length - remainingMons)
    const clear = enemyDefeated === foes.length

    return {
      clear,
      enemyDefeated,
      playerPartySize: party.length,
      remainingMons,
      faintCount,
      usedMons: usedMonIds.size,
      swapCount,
      remainingHpRatio: totalMaxHp > 0 ? totalCurrentHp / totalMaxHp : 0,
      lossRatio: totalMaxHp > 0 ? 1 - (totalCurrentHp / totalMaxHp) : 1,
    }
  }

  const runScenarioForStarter = ({ scenario, starterId }) => {
    let playerTeam = [makeMonster(starterId, 5, `starter_${starterId}`)]
    const worldCounts = new Map()
    const rows = []

    for (const mapId of MAP_CHAIN) {
      const fights = buildEventsForMap({ mapId, scenario, worldCounts })
      for (const fight of fights) {
        rows.push({
          scenarioKey: scenario.key,
          starterId,
          mapId,
          eventId: fight.eventId,
          eventType: fight.eventType,
          role: fight.role,
          beforeLeadLevel: playerTeam[0]?.level || 1,
          teamConfig: fight.teamConfig,
        })
        const enemyMons = fight.teamConfig
          .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `${fight.eventId}_${index}`))
          .filter(Boolean)
        const reward = grantLeadExp({ playerTeam, fight: { ...fight, enemyMons } })
        playerTeam = reward.playerTeam
        if (fight.eventType === 'challenge' || (fight.eventType === 'trainer' && fight.role === 'normal')) {
          worldCounts.set(`${mapId}:${fight.eventId}`, (worldCounts.get(`${mapId}:${fight.eventId}`) || 0) + 1)
        }
      }
    }

    return rows
  }

  const runsByScenario = new Map(
    SCENARIOS.map((scenario) => [
      scenario.key,
      STARTER_IDS.map((starterId) => runScenarioForStarter({ scenario, starterId }))
    ])
  )

  const rows = []
  for (const [role, target] of Object.entries(ROLE_TARGETS)) {
    const scenarioRuns = runsByScenario.get(target.scenarioKey) || []
    const eventRows = scenarioRuns.flatMap((run) => run.filter((row) => row.role === role))
    const grouped = new Map()
    for (const row of eventRows) {
      const key = `${row.mapId}:${row.eventId}`
      const existing = grouped.get(key) || {
        mapId: row.mapId,
        eventId: row.eventId,
        role,
        eventType: row.eventType,
        starterRuns: []
      }
      existing.starterRuns.push(row)
      grouped.set(key, existing)
    }

    for (const event of grouped.values()) {
      const mapConfig = getMapConfigData(event.mapId)
      const mapInfo = getMapInfo(event.mapId)
      const boss = (mapInfo.runtimeEvents || []).find((candidate) => candidate.type === 'boss')
      const bossTeam = Array.isArray(getProps(boss).team) ? getProps(boss).team : []
      const bossLevelCap = bossTeam.length > 0
        ? Math.max(...bossTeam.map(getLevel))
        : Math.max(1, Math.trunc(Number(mapConfig.maxLevel || mapConfig.recommendedLevel || 1)) || 1)

      const metricsByStarter = event.starterRuns.map((starterRun) => {
        const syntheticParty = buildSyntheticParty({
          starterId: starterRun.starterId,
          mapId: event.mapId,
          leadLevel: starterRun.beforeLeadLevel
        })
        const playerAverageLevel = round1(average(syntheticParty.map((monster) => monster.level)) || starterRun.beforeLeadLevel)
        const pressureLevel = getTrainerBattlePressureLevel({
          playerAverageLevel,
          leadLevel: starterRun.beforeLeadLevel
        })
        const adjustedTeam = rebalanceTrainerBattleTeamLevels(starterRun.teamConfig, {
          role,
          mapConfig,
          bossLevelCap,
          playerLevel: pressureLevel
        })
        const enemyMons = adjustedTeam
          .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `${starterRun.eventId}_${starterRun.starterId}_${index}`))
          .filter(Boolean)
        const levels = adjustedTeam.map(getLevel)
        const avgLevel = average(levels)
        const aceLevel = levels.length > 0 ? Math.max(...levels) : null
        const catchUpBonus = getTrainerCatchUpBonus({
          role,
          mapConfig,
          bossLevelCap,
          playerLevel: pressureLevel
        })
        const soloMedianTurnSwing = getSoloMedianTurnSwing({
          teamConfig: adjustedTeam,
          playerLevel: pressureLevel
        })
        const fullParty = simulateFullPartyBattle({
          playerTeam: syntheticParty,
          enemyTeam: enemyMons
        })
        return {
          leadLevel: starterRun.beforeLeadLevel,
          playerAverageLevel,
          playerPartySize: syntheticParty.length,
          playerPartyLevels: syntheticParty.map((monster) => monster.level),
          pressureLevel,
          adjustedTeam,
          catchUpBonus,
          avgDelta: round1((avgLevel || 0) - pressureLevel),
          aceDelta: round1((aceLevel || 0) - pressureLevel),
          soloMedianTurnSwing,
          fullParty,
        }
      })

      const levelValues = metricsByStarter.flatMap((metric) => metric.adjustedTeam.map(getLevel))
      rows.push({
        scenarioKey: target.scenarioKey,
        mapId: event.mapId,
        displayName: mapConfig.displayName || event.mapId,
        eventId: event.eventId,
        role,
        difficultyLabel: target.difficultyLabel,
        playerLeadLevel: round1(average(metricsByStarter.map((metric) => metric.leadLevel))),
        playerAverageLevel: round1(average(metricsByStarter.map((metric) => metric.playerAverageLevel))),
        playerPartySize: round1(average(metricsByStarter.map((metric) => metric.playerPartySize))),
        playerPartyLevelRange: formatRange(metricsByStarter.flatMap((metric) => metric.playerPartyLevels)),
        pressureLevel: round1(average(metricsByStarter.map((metric) => metric.pressureLevel))),
        teamSize: median(metricsByStarter.map((metric) => metric.adjustedTeam.length)),
        catchUpBonus: round1(average(metricsByStarter.map((metric) => metric.catchUpBonus))),
        levelRange: formatRange(levelValues),
        avgDelta: round1(average(metricsByStarter.map((metric) => metric.avgDelta))),
        aceDelta: round1(average(metricsByStarter.map((metric) => metric.aceDelta))),
        soloMedianTurnSwing: round1(median(metricsByStarter.map((metric) => metric.soloMedianTurnSwing))),
        fullPartyClearRate: round3(average(metricsByStarter.map((metric) => (metric.fullParty.clear ? 1 : 0))) || 0),
        fullPartyLossRatio: round3(average(metricsByStarter.map((metric) => metric.fullParty.lossRatio)) || 0),
        fullPartyRemainingMons: round1(average(metricsByStarter.map((metric) => metric.fullParty.remainingMons))),
        fullPartyFaintCount: round1(average(metricsByStarter.map((metric) => metric.fullParty.faintCount))),
        fullPartyUsedMons: round1(average(metricsByStarter.map((metric) => metric.fullParty.usedMons))),
        fullPartySwapCount: round1(average(metricsByStarter.map((metric) => metric.fullParty.swapCount))),
        fullPartyEnemyDefeated: round1(average(metricsByStarter.map((metric) => metric.fullParty.enemyDefeated))),
      })
    }
  }

  for (const row of rows) {
    const target = ROLE_TARGETS[row.role]
    const teamSizeTarget = getTeamSizeTargetForRow(row, target)
    const fullPartyTarget = getFullPartyTargetForRow(row)
    if (row.teamSize < teamSizeTarget.minTeamSize || row.teamSize > teamSizeTarget.maxTeamSize) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 队伍数量 ${row.teamSize} 不在目标范围 ${teamSizeTarget.minTeamSize}-${teamSizeTarget.maxTeamSize}`)
    }
    if (row.avgDelta < target.minAvgDelta) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 平均等级差过低: ${row.avgDelta}`)
    } else if (row.avgDelta > target.maxAvgDelta) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 平均等级差过高: ${row.avgDelta}`)
    }
    if (row.aceDelta < target.minAceDelta) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 王牌等级差过低: ${row.aceDelta}`)
    } else if (row.aceDelta > target.maxAceDelta) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 王牌等级差过高: ${row.aceDelta}`)
    }
    if (row.fullPartyClearRate < fullPartyTarget.minClearRate) {
      addWarning(`${row.mapId}/${row.eventId} ${row.role} 整队清场率偏低: ${Math.round(row.fullPartyClearRate * 100)}%`)
    } else if (row.fullPartyLossRatio < fullPartyTarget.minLossRatio) {
      addWarning(`${row.mapId}/${row.eventId} ${row.role} 整队消耗偏低: ${row.fullPartyLossRatio}`)
    } else if (row.fullPartyLossRatio > fullPartyTarget.maxLossRatio) {
      addWarning(`${row.mapId}/${row.eventId} ${row.role} 整队消耗偏高: ${row.fullPartyLossRatio}`)
    }
  }

  const farmTownOrder = mapOrderById.get('GodotMapV2_FarmTown') ?? -1
  const lieutenantRowsByMap = new Map()
  for (const row of rows) {
    const mapOrder = mapOrderById.get(row.mapId) ?? -1
    if (row.role !== 'lieutenant' || mapOrder <= farmTownOrder) continue
    const group = lieutenantRowsByMap.get(row.mapId) || []
    group.push(row)
    lieutenantRowsByMap.set(row.mapId, group)
  }

  for (const [mapId, lieutenantRows] of lieutenantRowsByMap) {
    for (let index = 1; index < lieutenantRows.length; index += 1) {
      const previous = lieutenantRows[index - 1]
      const current = lieutenantRows[index]
      if (current.fullPartyLossRatio <= previous.fullPartyLossRatio) {
        addError(
          `${mapId} 风车农庄之后部下难度未递进: ` +
          `${previous.eventId}=${previous.fullPartyLossRatio}, ${current.eventId}=${current.fullPartyLossRatio}`
        )
      }
    }
  }

  const summaryByRole = Object.keys(ROLE_TARGETS).map((role) => {
    const roleRows = rows.filter((row) => row.role === role)
    return {
      role,
      difficultyLabel: ROLE_TARGETS[role].difficultyLabel,
      scenarioKey: ROLE_TARGETS[role].scenarioKey,
      count: roleRows.length,
      catchUpBonusRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.catchUpBonus))
        : '',
      avgDeltaRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.avgDelta))
        : '',
      aceDeltaRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.aceDelta))
        : '',
      soloMedianTurnSwingRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.soloMedianTurnSwing))
        : '',
      fullPartyClearRateRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.fullPartyClearRate))
        : '',
      fullPartyLossRatioRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.fullPartyLossRatio))
        : '',
      fullPartyRemainingMonsRange: roleRows.length > 0
        ? formatRange(roleRows.map((row) => row.fullPartyRemainingMons))
        : '',
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
      model: {
        progression: 'single-carry lead for map-order overlevel estimate',
        party: 'synthetic full-party with accessible wild families, level spread, switching, carry-over HP'
      },
      summaryByRole
    },
    samples: rows
  }

  console.log(JSON.stringify(report, null, 2))
  if (warnings.length > 0) {
    console.warn('[audit-trainer-role-difficulty] WARNINGS')
    warnings.forEach((warning) => console.warn(`- ${warning}`))
  }
  if (errors.length > 0) {
    console.error('[audit-trainer-role-difficulty] FAILED')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }
  console.log('[audit-trainer-role-difficulty] OK')
})
