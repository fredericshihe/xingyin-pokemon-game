#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const STARTER_IDS = [1, 2, 3]
const SCENARIOS = [
  {
    key: 'gate',
    label: '只打部下+Boss',
    includeNormalTrainers: false,
    includeChallenge: false,
  },
  {
    key: 'full_first_clear',
    label: '清完普通+试炼首通',
    includeNormalTrainers: true,
    includeChallenge: true,
  },
  {
    key: 'full_first_clear_with_exp_items',
    label: '清完并把经验药水全给主力',
    includeNormalTrainers: true,
    includeChallenge: true,
    usePickupExpPotions: true,
    useRewardExpPotions: true,
  },
]

const median = (values) => {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted[Math.floor(sorted.length / 2)]
}

const getProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const getPokemonId = (entry) => Math.trunc(Number(entry?.pokemonId ?? entry?.id))
const getLevel = (entry) => Math.max(1, Math.min(100, Math.trunc(Number(entry?.level)) || 1))

const formatLevels = (levels) => {
  const safe = levels.filter(Number.isFinite)
  if (safe.length === 0) return ''
  const min = Math.min(...safe)
  const max = Math.max(...safe)
  return min === max ? `Lv.${min}` : `Lv.${min}-${max}`
}

await withViteAuditServer(async ({ loadModule }) => {
  const [
    { MAP_CHAIN, getMapConfigData, getMapInfo },
    { EXP_POTIONS, MONSTERS, getBalancedMovesForLevel },
    { calculateStatsForLevel },
    { calculateBattleRewards, getPlayerAverageLevel },
    { getOfficialExpToNextLevel },
    { simulateMonsterExpGain },
    { resolveTrainerBattleTeamConfig },
  ] = await Promise.all([
    loadModule('/src/game/data/mapCatalog.js'),
    loadModule('/src/utils/gameData.js'),
    loadModule('/src/utils/pokemonStats.js'),
    loadModule('/src/utils/gameBalance.js'),
    loadModule('/src/utils/officialExperience.js'),
    loadModule('/src/utils/pokemonProgress.js'),
    loadModule('/src/utils/trainerBattleScaling.js'),
  ])

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const mapOrderById = new Map(MAP_CHAIN.map((mapId, index) => [mapId, index]))
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
        dailyRefreshKey: 'map-level-progression-audit',
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

  const buildFightsForMap = ({ mapId, scenario, worldCounts }) => {
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
    ]
    if (boss) {
      const selectedIds = new Set(selected.map((event) => event.id))
      const requiredIds = Array.isArray(getProps(boss).requiredTrainerIds)
        ? getProps(boss).requiredTrainerIds.filter((id) => typeof id === 'string' && id.length > 0)
        : []
      requiredIds.forEach((id) => {
        if (selectedIds.has(id)) return
        const prerequisiteEvent = events.find((event) => event.id === id)
        if (!prerequisiteEvent) return
        selected.push(prerequisiteEvent)
        selectedIds.add(id)
      })
      selected.push(boss)
    }
    return selected.map((event) => {
      const props = getProps(event)
      const role = event.type === 'boss' ? 'boss' : (props.role || event.type || 'normal')
      const teamConfig = resolveEventTeam({ event, mapId, mapConfig, worldCounts })
      return {
        mapId,
        eventId: event.id,
        eventType: event.type,
        role,
        teamConfig,
        enemyMons: teamConfig
          .map((member, index) => makeMonster(getPokemonId(member), getLevel(member), `${event.id}_${index}`))
          .filter(Boolean),
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
        gold: sum.gold + (Number(reward.gold) || 0),
      }
    }, { exp: 0, gold: 0 })
    const result = simulateMonsterExpGain(
      playerTeam[0],
      totals.exp,
      getBaseMonsterDefinition,
      []
    )
    return {
      playerTeam: [result.updatedMon],
      exp: totals.exp,
      levelsGained: result.levelUps.length,
    }
  }

  const getExpPotionAmount = (reward) => {
    if (reward?.itemType !== 'expPotion') return 0
    const item = EXP_POTIONS[reward.itemKey]
    if (!item) return 0
    const quantity = Math.max(1, Math.trunc(Number(reward.quantity ?? 1)) || 1)
    return Math.max(0, Math.trunc(Number(item.expAmount) || 0)) * quantity
  }

  const applyDirectExp = ({ playerTeam, expAmount }) => {
    const safeExpAmount = Math.max(0, Math.trunc(Number(expAmount) || 0))
    if (safeExpAmount <= 0) return { playerTeam, levelsGained: 0 }
    const result = simulateMonsterExpGain(
      playerTeam[0],
      safeExpAmount,
      getBaseMonsterDefinition,
      []
    )
    return {
      playerTeam: [result.updatedMon],
      levelsGained: result.levelUps.length,
    }
  }

  const getMapPickupExp = (mapId) => {
    const events = Array.isArray(getMapInfo(mapId).runtimeEvents) ? getMapInfo(mapId).runtimeEvents : []
    return events
      .filter((event) => event.type === 'item' || event.type === 'pickup')
      .reduce((sum, event) => sum + getExpPotionAmount(getProps(event)), 0)
  }

  const getMapEntryFloorLevel = (mapId) => {
    const targetOrder = mapOrderById.get(mapId)
    if (!Number.isInteger(targetOrder) || targetOrder <= 0) return 0

    const candidateFloors = MAP_CHAIN
      .slice(0, targetOrder)
      .flatMap((sourceMapId) => {
        const events = Array.isArray(getMapInfo(sourceMapId).runtimeEvents) ? getMapInfo(sourceMapId).runtimeEvents : []
        return events
          .filter((event) => event.type === 'warp' && event?.target?.mapName === mapId)
          .map((event) => Math.max(0, Math.trunc(Number(getProps(event).requiredAverageLevel) || 0)))
          .filter((level) => level > 0)
      })

    return candidateFloors.length > 0 ? Math.min(...candidateFloors) : 0
  }

  const clampPlayerTeamToEntryFloor = ({ playerTeam, requiredLevel }) => {
    const floorLevel = Math.max(0, Math.trunc(Number(requiredLevel) || 0))
    const activeMon = playerTeam[0]
    const activeLevel = Math.max(1, Math.trunc(Number(activeMon?.level) || 1))
    if (floorLevel <= 0 || activeLevel >= floorLevel) {
      return {
        playerTeam,
        entryFloorLevel: floorLevel,
        entryFloorAppliedLevels: 0
      }
    }

    const rebuilt = makeMonster(
      Math.trunc(Number(activeMon?.baseId ?? activeMon?.id)),
      floorLevel,
      activeMon?.id || `starter_floor_${floorLevel}`
    )

    return {
      playerTeam: rebuilt ? [rebuilt] : playerTeam,
      entryFloorLevel: floorLevel,
      entryFloorAppliedLevels: rebuilt ? floorLevel - activeLevel : 0
    }
  }

  const runScenarioForStarter = ({ scenario, starterId }) => {
    let playerTeam = [makeMonster(starterId, 5, `starter_${starterId}`)]
    const worldCounts = new Map()
    const rows = []
    for (const mapId of MAP_CHAIN) {
      const mapConfig = getMapConfigData(mapId)
      const recommendedLevel = Math.max(1, Math.trunc(Number(mapConfig.recommendedLevel)) || 1)
      const mapInfo = getMapInfo(mapId)
      const events = Array.isArray(mapInfo.runtimeEvents) ? mapInfo.runtimeEvents : []
      const boss = events.find((event) => event.type === 'boss')
      const bossLevels = (Array.isArray(getProps(boss).team) ? getProps(boss).team : [])
        .map(getLevel)
        .filter(Number.isFinite)
      const bossMaxLevel = bossLevels.length > 0 ? Math.max(...bossLevels) : null
      const entryFloorLevel = getMapEntryFloorLevel(mapId)
      const entryFloorResult = clampPlayerTeamToEntryFloor({ playerTeam, requiredLevel: entryFloorLevel })
      playerTeam = entryFloorResult.playerTeam
      const activeBefore = playerTeam[0]?.level || 1
      const pickupExp = scenario.usePickupExpPotions ? getMapPickupExp(mapId) : 0
      const pickupResult = applyDirectExp({ playerTeam, expAmount: pickupExp })
      playerTeam = pickupResult.playerTeam
      const activeAfterPickup = playerTeam[0]?.level || activeBefore
      const entryDelta = activeBefore - recommendedLevel
      const fights = buildFightsForMap({ mapId, scenario, worldCounts })
      let gainedExp = 0
      let gainedLevels = 0
      let itemExp = pickupExp
      let itemLevels = pickupResult.levelsGained
      for (const fight of fights) {
        const reward = grantFightExp({ playerTeam, fight })
        playerTeam = reward.playerTeam
        gainedExp += reward.exp
        gainedLevels += reward.levelsGained
        if (scenario.useRewardExpPotions) {
          const event = events.find((candidate) => candidate.id === fight.eventId)
          const eventItemExp = (Array.isArray(getProps(event).rewardItems) ? getProps(event).rewardItems : [])
            .reduce((sum, item) => sum + getExpPotionAmount(item), 0)
          const eventItemResult = applyDirectExp({ playerTeam, expAmount: eventItemExp })
          playerTeam = eventItemResult.playerTeam
          itemExp += eventItemExp
          itemLevels += eventItemResult.levelsGained
        }
        if (fight.eventType === 'challenge' || (fight.eventType === 'trainer' && fight.role === 'normal')) {
          worldCounts.set(`${mapId}:${fight.eventId}`, (worldCounts.get(`${mapId}:${fight.eventId}`) || 0) + 1)
        }
      }
      const fightLevels = fights.flatMap((fight) => fight.teamConfig.map(getLevel))
      const medianEnemyLevel = median(fightLevels)
      rows.push({
        mapId,
        displayName: mapConfig.displayName || mapId,
        recommendedLevel,
        levelRange: `Lv.${mapConfig.minLevel}-${mapConfig.maxLevel}`,
        activeBefore,
        entryFloorLevel,
        entryFloorAppliedLevels: entryFloorResult.entryFloorAppliedLevels,
        activeAfterPickup,
        activeAfter: playerTeam[0]?.level || activeBefore,
        entryDelta,
        gainedLevels,
        gainedExp,
        itemExp,
        itemLevels,
        fightCount: fights.length,
        enemyCount: fights.reduce((sum, fight) => sum + fight.enemyMons.length, 0),
        enemyLevels: formatLevels(fightLevels),
        medianEnemyLevel,
        medianEnemyDeltaFromEntry: Number.isFinite(medianEnemyLevel) ? medianEnemyLevel - activeBefore : null,
        bossLevels: formatLevels(bossLevels),
        bossMaxLevel,
        bossDeltaFromEntry: Number.isFinite(bossMaxLevel) ? bossMaxLevel - activeBefore : null,
      })
    }
    return {
      starterId,
      starterName: getBaseMonsterDefinition(starterId)?.name || `#${starterId}`,
      finalLevel: playerTeam[0]?.level || 1,
      rows,
    }
  }

  const scenarioReports = SCENARIOS.map((scenario) => {
    const starterRuns = STARTER_IDS.map((starterId) => runScenarioForStarter({ scenario, starterId }))
    const rows = MAP_CHAIN.map((mapId, index) => {
      const perStarter = starterRuns.map((run) => run.rows[index])
      const first = perStarter[0]
      const beforeLevels = perStarter.map((row) => row.activeBefore)
      const afterLevels = perStarter.map((row) => row.activeAfter)
      const entryDeltas = perStarter.map((row) => row.entryDelta)
      const bossDeltas = perStarter.map((row) => row.bossDeltaFromEntry).filter(Number.isFinite)
      const medianEnemyDeltas = perStarter.map((row) => row.medianEnemyDeltaFromEntry).filter(Number.isFinite)
      return {
        mapId,
        displayName: first.displayName,
        recommendedLevel: first.recommendedLevel,
        levelRange: first.levelRange,
        beforeRange: `${Math.min(...beforeLevels)}-${Math.max(...beforeLevels)}`,
        afterRange: `${Math.min(...afterLevels)}-${Math.max(...afterLevels)}`,
        maxEntryDelta: Math.max(...entryDeltas),
        minEntryDelta: Math.min(...entryDeltas),
        bossDeltaRange: bossDeltas.length > 0 ? `${Math.min(...bossDeltas)}-${Math.max(...bossDeltas)}` : '',
        medianEnemyDeltaRange: medianEnemyDeltas.length > 0 ? `${Math.min(...medianEnemyDeltas)}-${Math.max(...medianEnemyDeltas)}` : '',
        fightCount: first.fightCount,
        enemyCount: first.enemyCount,
        enemyLevels: first.enemyLevels,
        bossLevels: first.bossLevels,
      }
    })
    const riskRows = rows.filter((row) => row.maxEntryDelta >= 4)
    const bossBelowEntryRows = rows.filter((row) => {
      const values = String(row.bossDeltaRange || '').match(/-?\d+/g)?.map(Number) || []
      return values.length > 0 && Math.max(...values) < 0
    })
    return {
      key: scenario.key,
      label: scenario.label,
      starterFinalLevels: starterRuns.map((run) => ({
        starter: run.starterName,
        finalLevel: run.finalLevel,
      })),
      rows,
      summary: {
        mapCount: rows.length,
        overRecommendedBy4PlusCount: riskRows.length,
        bossBelowEntryCount: bossBelowEntryRows.length,
        maxEntryDelta: Math.max(...rows.map((row) => row.maxEntryDelta)),
      },
    }
  })

  const report = {
    generatedAt: new Date().toISOString(),
    assumptions: [
      '地图进入条件按当前规则处理：新手山谷前往星音草径需要平均 Lv.6，之后的主线地图按 Boss 通关链解锁；带硬性等级门槛的入口会先按最低可进入等级做一次入图校正。',
      '模拟只保留一只初始宝可梦，并假设它始终作为首发参与，得到最容易出现“主力等级过高”的上界。',
      '只打部下+Boss场景会自动补入 Boss 的必需前置训练师；清完普通+试炼首通场景额外包含普通训练师与试炼首通，不包含野外刷级和每日重复试炼。',
    ],
    scenarios: scenarioReports,
  }

  console.log(JSON.stringify(report, null, 2))
})
