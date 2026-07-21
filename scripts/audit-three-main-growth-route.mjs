#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const STARTER_MAIN_IDS = [1, 2, 3]
const STARTING_MAIN_LEVEL = 8
const WILD_FIGHTS_PER_MAP = 5
const CHALLENGE_RUNS_PER_MAP = 2

const getProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const getPokemonId = (entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id))
const getLevel = (entry) => Math.max(1, Math.min(100, Math.trunc(Number(entry?.level)) || 1))

const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.floor(sorted.length / 2)]
}

const formatLevels = (levels) => {
  const safe = levels.filter(Number.isFinite)
  if (safe.length === 0) return ''
  const min = Math.min(...safe)
  const max = Math.max(...safe)
  return min === max ? `Lv.${min}` : `Lv.${min}-${max}`
}

const formatTeam = (team) => team
  .map((mon) => `${mon.name || mon.baseId}:Lv.${mon.level}`)
  .join(' / ')

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MAP_CHAIN, getMapConfigData, getMapInfo, resolveMapEncounterTableId },
    { EXP_POTIONS, MONSTERS, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleRewards, getPlayerAverageLevel },
    { getOfficialExpToNextLevel },
    { simulateMonsterExpGain },
    { resolveTrainerBattleTeamConfig },
    { getEncounterTable },
    { buildEcologySurveyRewardPlan, MAIN_ROUTE_TARGET_EXIT_LEVEL_BY_MAP },
  ] = await Promise.all([
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/officialExperience.js'),
    loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/trainerBattleScaling.js'),
    loadModule('/src/game/data/encounterTables.js'),
    loadModule('/src/utils/ecologySurveyBalance.js'),
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

  const makeMonster = (pokemonId, level, id = `m${pokemonId}_${level}`) => {
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

  const applyExpToMon = (mon, expAmount) => (
    simulateMonsterExpGain(
      mon,
      Math.max(0, Math.trunc(Number(expAmount)) || 0),
      getBaseMonsterDefinition,
      []
    ).updatedMon
  )

  const applySharedExp = (team, totalExp) => {
    const safeTeam = Array.isArray(team) ? team : []
    if (safeTeam.length === 0) return team
    const splitExp = Math.max(0, Math.round((Number(totalExp) || 0) / safeTeam.length))
    if (splitExp <= 0) return safeTeam
    return safeTeam.map((mon) => applyExpToMon(mon, splitExp))
  }

  const pickLowestGrowthTargetIndex = (team) => {
    let selectedIndex = 0
    let selectedScore = Infinity
    team.forEach((mon, index) => {
      const expToNext = Math.max(1, Number(mon.expToNextLevel) || 1)
      const score = (Number(mon.level) || 1) + (Number(mon.currentExp) || 0) / expToNext
      if (score < selectedScore) {
        selectedScore = score
        selectedIndex = index
      }
    })
    return selectedIndex
  }

  const applyItemExpRewards = (team, rewardItems = []) => {
    let nextTeam = team
    ;(Array.isArray(rewardItems) ? rewardItems : []).forEach((reward) => {
      if (reward?.itemType !== 'expPotion') return
      const expPotion = EXP_POTIONS[reward.itemKey]
      if (!expPotion) return
      const quantity = Math.max(1, Math.trunc(Number(reward.quantity ?? 1)) || 1)
      for (let index = 0; index < quantity; index += 1) {
        const targetIndex = pickLowestGrowthTargetIndex(nextTeam)
        const targetMon = nextTeam[targetIndex]
        nextTeam = nextTeam.map((mon, monIndex) => (
          monIndex === targetIndex ? applyExpToMon(targetMon, expPotion.expAmount) : mon
        ))
      }
    })
    return nextTeam
  }

  const getExpPotionRewardsFromEvent = (event) => {
    const props = getProps(event)
    if (Array.isArray(props.rewardItems)) return props.rewardItems
    if (props.itemType === 'expPotion') {
      return [{
        itemType: props.itemType,
        itemKey: props.itemKey,
        quantity: props.quantity
      }]
    }
    return []
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
        dailyRefreshKey: 'three-main-growth-route-audit',
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

  const buildEnemyMons = (teamConfig, eventId) => teamConfig
    .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `${eventId}_${index}`))
    .filter(Boolean)

  const grantBattleExp = ({ playerTeam, enemyMons, battleKind, role }) => {
    const totals = enemyMons.reduce((sum, enemy) => {
      const reward = calculateBattleRewards({
        defeatedMon: enemy,
        playerAverageLevel: getPlayerAverageLevel(playerTeam),
        battleKind,
        participants: playerTeam.length,
        trainerRole: role,
      })
      return {
        exp: sum.exp + (Number(reward.exp) || 0),
        gold: sum.gold + (Number(reward.gold) || 0),
      }
    }, { exp: 0, gold: 0 })

    return {
      playerTeam: applySharedExp(playerTeam, totals.exp),
      exp: totals.exp,
      gold: totals.gold,
    }
  }

  const getRepresentativeWildEncounters = (mapId, count) => {
    const mapConfig = getMapConfigData(mapId)
    const table = getEncounterTable(resolveMapEncounterTableId(mapId))
    const candidates = (Array.isArray(table?.pokemon) ? table.pokemon : [])
      .slice()
      .sort((left, right) => (Number(right.weight) || 0) - (Number(left.weight) || 0))
    const fallback = Array.isArray(mapConfig?.wildPokemon) ? mapConfig.wildPokemon : []
    const pool = candidates.length > 0 ? candidates : fallback
    return Array.from({ length: count }, (_, index) => {
      const entry = pool[index % Math.max(1, pool.length)] || { id: 1 }
      const minLevel = Math.max(1, Math.trunc(Number(entry.minLevel ?? mapConfig.minLevel)) || 1)
      const maxLevel = Math.max(minLevel, Math.trunc(Number(entry.maxLevel ?? mapConfig.maxLevel ?? minLevel)) || minLevel)
      return {
        pokemonId: getPokemonId(entry),
        level: Math.round((minLevel + maxLevel) / 2)
      }
    }).filter((entry) => Number.isInteger(entry.pokemonId))
  }

  const applyEcologySurveyReward = ({ mapId, playerTeam }) => {
    const mapConfig = getMapConfigData(mapId)
    const plan = buildEcologySurveyRewardPlan({
      mapName: mapId,
      playerTeam,
      getBaseMonsterDefinition,
      fallbackTargetLevel: mapConfig?.recommendedLevel || 5
    })
    let nextTeam = playerTeam
    plan.expByPokemon.forEach((entry) => {
      nextTeam = nextTeam.map((mon) => (
        mon.id === entry.monId ? applyExpToMon(mon, entry.exp) : mon
      ))
    })
    return {
      playerTeam: nextTeam,
      totalExp: plan.totalExp,
      targetLevel: plan.targetLevel
    }
  }

  const runMap = ({ mapId, playerTeam, worldCounts }) => {
    const mapConfig = getMapConfigData(mapId)
    const mapInfo = getMapInfo(mapId)
    const events = Array.isArray(mapInfo.runtimeEvents) ? mapInfo.runtimeEvents : []
    const startTeam = playerTeam
    let nextTeam = applyItemExpRewards(
      playerTeam,
      events
        .filter((event) => event.type === 'item' || event.type === 'pickup')
        .flatMap(getExpPotionRewardsFromEvent)
    )
    const afterPickupsTeam = nextTeam

    let wildExp = 0
    for (const encounter of getRepresentativeWildEncounters(mapId, WILD_FIGHTS_PER_MAP)) {
      const enemy = makeMonster(encounter.pokemonId, encounter.level, `${mapId}_wild_${wildExp}`)
      if (!enemy) continue
      const result = grantBattleExp({
        playerTeam: nextTeam,
        enemyMons: [enemy],
        battleKind: 'wild',
        role: 'wild'
      })
      nextTeam = result.playerTeam
      wildExp += result.exp
    }
    const ecologyResult = applyEcologySurveyReward({ mapId, playerTeam: nextTeam })
    nextTeam = ecologyResult.playerTeam
    const afterPrepTeam = nextTeam

    const normalTrainers = events.filter((event) => event.type === 'trainer' && (getProps(event).role || 'normal') === 'normal')
    const lieutenants = events.filter((event) => event.type === 'trainer' && getProps(event).role === 'lieutenant')
    const challenge = events.find((event) => event.type === 'challenge')
    const boss = events.find((event) => event.type === 'boss')
    const fightSummaries = []
    const fightEvent = (event) => {
      const props = getProps(event)
      const role = event.type === 'boss' ? 'boss' : (props.role || event.type || 'normal')
      const teamConfig = resolveEventTeam({ event, mapId, mapConfig, worldCounts })
      const enemyMons = buildEnemyMons(teamConfig, event.id)
      const beforeAverage = getPlayerAverageLevel(nextTeam)
      const result = grantBattleExp({
        playerTeam: nextTeam,
        enemyMons,
        battleKind: 'trainer',
        role
      })
      nextTeam = result.playerTeam
      nextTeam = applyItemExpRewards(nextTeam, getExpPotionRewardsFromEvent(event))
      if (event.type === 'challenge' || (event.type === 'trainer' && role === 'normal')) {
        worldCounts.set(`${mapId}:${event.id}`, (worldCounts.get(`${mapId}:${event.id}`) || 0) + 1)
      }
      fightSummaries.push({
        eventId: event.id,
        type: event.type,
        role,
        beforeAverage,
        enemyLevels: teamConfig.map(getLevel),
        enemyCount: enemyMons.length,
        exp: result.exp
      })
    }

    normalTrainers.forEach(fightEvent)
    lieutenants.forEach(fightEvent)
    for (let run = 0; run < CHALLENGE_RUNS_PER_MAP; run += 1) {
      if (challenge) fightEvent(challenge)
    }
    const beforeBossTeam = nextTeam
    if (boss) fightEvent(boss)

    const allEnemyLevels = fightSummaries.flatMap((fight) => fight.enemyLevels)
    const bossLevels = boss
      ? (Array.isArray(getProps(boss).team) ? getProps(boss).team : []).map(getLevel)
      : []
    const bossMax = bossLevels.length > 0 ? Math.max(...bossLevels) : null
    const beforeBossAverage = getPlayerAverageLevel(beforeBossTeam)
    const exitAverage = getPlayerAverageLevel(nextTeam)
    const targetExitLevel = Math.max(1, Math.trunc(Number(MAIN_ROUTE_TARGET_EXIT_LEVEL_BY_MAP[mapId] ?? mapConfig.recommendedLevel)) || 1)

    return {
      playerTeam: nextTeam,
      row: {
        mapId,
        displayName: mapConfig.displayName || mapId,
        recommendedLevel: mapConfig.recommendedLevel,
        targetExitLevel,
        entryAverage: getPlayerAverageLevel(startTeam),
        afterPickupsAverage: getPlayerAverageLevel(afterPickupsTeam),
        afterPrepAverage: getPlayerAverageLevel(afterPrepTeam),
        beforeBossAverage,
        exitAverage,
        startTeam: formatTeam(startTeam),
        beforeBossTeam: formatTeam(beforeBossTeam),
        exitTeam: formatTeam(nextTeam),
        wildExp,
        ecologyExp: ecologyResult.totalExp,
        ecologyTargetLevel: ecologyResult.targetLevel,
        fightCount: fightSummaries.length,
        enemyCount: fightSummaries.reduce((sum, fight) => sum + fight.enemyCount, 0),
        enemyLevelRange: formatLevels(allEnemyLevels),
        medianEnemyLevel: median(allEnemyLevels),
        bossLevelRange: formatLevels(bossLevels),
        bossMax,
        bossDeltaFromBefore: Number.isFinite(bossMax) ? bossMax - beforeBossAverage : null,
        exitDeltaFromTarget: exitAverage - targetExitLevel
      }
    }
  }

  let playerTeam = STARTER_MAIN_IDS
    .map((starterId) => makeMonster(starterId, STARTING_MAIN_LEVEL, `main_${starterId}`))
    .filter(Boolean)
  const worldCounts = new Map()
  const rows = []

  for (const mapId of MAP_CHAIN.filter((id) => id !== 'GodotMap')) {
    const result = runMap({ mapId, playerTeam, worldCounts })
    playerTeam = result.playerTeam
    rows.push(result.row)
  }

  const riskRows = rows.filter((row) => (
    row.bossDeltaFromBefore > 4 ||
    row.exitDeltaFromTarget < -2
  ))

  const report = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      startingMainPokemon: STARTER_MAIN_IDS,
      startingMainLevel: STARTING_MAIN_LEVEL,
      wildFightsPerMap: WILD_FIGHTS_PER_MAP,
      challengeRunsPerMap: CHALLENGE_RUNS_PER_MAP,
      route: '每图宝箱 + 5 次野怪 + 生态调查 + 所有普通 NPC/部下 + 2 次试炼 + Boss',
      expDistribution: '战斗经验三主力平分；经验药水优先给当前最低成长进度的主力。'
    },
    rows,
    summary: {
      finalTeam: formatTeam(playerTeam),
      riskCount: riskRows.length,
      riskMaps: riskRows.map((row) => ({
        mapId: row.mapId,
        displayName: row.displayName,
        bossDeltaFromBefore: Number(row.bossDeltaFromBefore?.toFixed?.(2) ?? row.bossDeltaFromBefore),
        exitDeltaFromTarget: Number(row.exitDeltaFromTarget?.toFixed?.(2) ?? row.exitDeltaFromTarget)
      }))
    }
  }

  console.log(JSON.stringify(report, null, 2))

  if (riskRows.length > 0) {
    process.exitCode = 1
  }
})
