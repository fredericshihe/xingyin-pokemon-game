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
    minMedianTurnSwing: -3,
    maxMedianTurnSwing: 0
  },
  lieutenant: {
    scenarioKey: 'full_first_clear',
    difficultyLabel: '有一定难度',
    minTeamSize: 3,
    maxTeamSize: 4,
    minAvgDelta: -1,
    maxAvgDelta: 4,
    minAceDelta: -1,
    maxAceDelta: 5,
    minMedianTurnSwing: -1,
    maxMedianTurnSwing: 1
  },
  boss: {
    scenarioKey: 'gate',
    difficultyLabel: '很有难度',
    minTeamSize: 5,
    maxTeamSize: 6,
    minAvgDelta: 0,
    maxAvgDelta: 10,
    minAceDelta: 0,
    maxAceDelta: 14,
    minMedianTurnSwing: -1,
    maxMedianTurnSwing: 2
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

const average = (values) => {
  const safe = values.filter(Number.isFinite)
  if (safe.length === 0) return null
  return safe.reduce((sum, value) => sum + value, 0) / safe.length
}

const getProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const getPokemonId = (entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id))
const getLevel = (entry) => Math.max(1, Math.min(100, Math.trunc(Number(entry?.level)) || 1))

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MAP_CHAIN, getMapConfigData, getMapInfo },
    { EXP_POTIONS, MONSTERS, MOVES, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleRewards, getPlayerAverageLevel },
    { getOfficialExpToNextLevel },
    { simulateMonsterExpGain },
    {
      getTrainerBattlePressureLevel,
      getTrainerCatchUpBonus,
      rebalanceTrainerBattleTeamLevels,
      resolveTrainerBattleTeamConfig
    },
    { calculateBattleDamage },
  ] = await Promise.all([
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/officialExperience.js'),
    loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/trainerBattleScaling.js'),
    loadModule('/src/utils/battleDamage.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const getBaseMonsterDefinition = (monsterId) => monsterById.get(Number(monsterId)) || null
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

  const grantFightExp = ({ playerTeam, fight }) => {
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

  const getEventMedianTurnSwing = ({ teamConfig, playerLevel }) => {
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

  const runScenarioForStarter = ({ scenario, starterId }) => {
    let playerTeam = [makeMonster(starterId, 5, `starter_${starterId}`)]
    const worldCounts = new Map()
    const rows = []

    for (const mapId of MAP_CHAIN) {
      const fights = buildEventsForMap({ mapId, scenario, worldCounts })
      for (const fight of fights) {
        rows.push({
          scenarioKey: scenario.key,
          mapId,
          eventId: fight.eventId,
          eventType: fight.eventType,
          role: fight.role,
          beforeLevel: playerTeam[0]?.level || 1,
          teamConfig: fight.teamConfig,
        })
        const enemyMons = fight.teamConfig
          .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `${fight.eventId}_${index}`))
          .filter(Boolean)
        const reward = grantFightExp({ playerTeam, fight: { ...fight, enemyMons } })
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
        beforeLevels: [],
        teamConfig: row.teamConfig
      }
      existing.beforeLevels.push(row.beforeLevel)
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
      const beforeLevel = Math.max(1, Math.round(average(event.beforeLevels) || 1))
      const pressureLevel = getTrainerBattlePressureLevel({
        playerAverageLevel: beforeLevel,
        leadLevel: beforeLevel
      })
      const adjustedTeam = rebalanceTrainerBattleTeamLevels(event.teamConfig, {
        role,
        mapConfig,
        bossLevelCap,
        playerLevel: pressureLevel
      })
      const levels = adjustedTeam.map(getLevel)
      const avgLevel = average(levels)
      const aceLevel = levels.length > 0 ? Math.max(...levels) : null
      const catchUpBonus = getTrainerCatchUpBonus({
        role,
        mapConfig,
        bossLevelCap,
        playerLevel: pressureLevel
      })
      const medianTurnSwing = getEventMedianTurnSwing({
        teamConfig: adjustedTeam,
        playerLevel: pressureLevel
      })
      rows.push({
        scenarioKey: target.scenarioKey,
        mapId: event.mapId,
        displayName: mapConfig.displayName || event.mapId,
        eventId: event.eventId,
        role,
        difficultyLabel: target.difficultyLabel,
        playerLevel: pressureLevel,
        teamSize: adjustedTeam.length,
        catchUpBonus,
        levelRange: levels.length > 0 ? `${Math.min(...levels)}-${Math.max(...levels)}` : '',
        avgDelta: round1((avgLevel || 0) - pressureLevel),
        aceDelta: round1((aceLevel || 0) - pressureLevel),
        medianTurnSwing
      })
    }
  }

  for (const row of rows) {
    const target = ROLE_TARGETS[row.role]
    if (row.teamSize < target.minTeamSize || row.teamSize > target.maxTeamSize) {
      addError(`${row.mapId}/${row.eventId} ${row.role} 队伍数量 ${row.teamSize} 不在目标范围 ${target.minTeamSize}-${target.maxTeamSize}`)
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
    if (Number.isFinite(row.medianTurnSwing) && row.medianTurnSwing < target.minMedianTurnSwing) {
      addWarning(`${row.mapId}/${row.eventId} ${row.role} 单体换血偏软: ${row.medianTurnSwing}`)
    } else if (Number.isFinite(row.medianTurnSwing) && row.medianTurnSwing > target.maxMedianTurnSwing) {
      addWarning(`${row.mapId}/${row.eventId} ${row.role} 单体换血偏硬: ${row.medianTurnSwing}`)
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
        ? `${Math.min(...roleRows.map((row) => row.catchUpBonus))}-${Math.max(...roleRows.map((row) => row.catchUpBonus))}`
        : '',
      avgDeltaRange: roleRows.length > 0
        ? `${Math.min(...roleRows.map((row) => row.avgDelta))}-${Math.max(...roleRows.map((row) => row.avgDelta))}`
        : '',
      aceDeltaRange: roleRows.length > 0
        ? `${Math.min(...roleRows.map((row) => row.aceDelta))}-${Math.max(...roleRows.map((row) => row.aceDelta))}`
        : '',
      medianTurnSwingRange: roleRows
        .map((row) => row.medianTurnSwing)
        .filter(Number.isFinite)
        .reduce((range, value, index, values) => (
          values.length === 0
            ? ''
            : `${Math.min(...values)}-${Math.max(...values)}`
        ), '')
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      errorCount: errors.length,
      warningCount: warnings.length,
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
