#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const errors = []
const LAUNCH_STARTER_POKEMON_IDS = [2, 1, 3, 4, 13]
const TEXT_LENGTH_LIMITS = {
  summary: 34,
  shortSummary: 24,
  detail: 22,
  availabilityLabel: 16
}
const VERBOSE_TERMS = [
  '%',
  '概率',
  '几率',
  '占比',
  '每步',
  '接管',
  '生态池',
  '整体约',
  '混入',
  '才会加入',
  '会触发遇敌',
  '基础草丛池',
  '隐藏生态池'
]

const toPokemonId = (entry) => {
  const id = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
  return Number.isInteger(id) ? id : null
}

const eventProps = (event) => (
  event?.properties && typeof event.properties === 'object' ? event.properties : {}
)

const formatLevelRange = (entry) => {
  const min = Math.trunc(Number(entry?.minLevel ?? entry?.level))
  const max = Math.trunc(Number(entry?.maxLevel ?? entry?.level ?? entry?.minLevel))
  if (!Number.isInteger(min) && !Number.isInteger(max)) return ''
  if (Number.isInteger(min) && Number.isInteger(max)) {
    return min === max ? `Lv.${min}` : `Lv.${Math.min(min, max)}-${Math.max(min, max)}`
  }
  return `Lv.${Number.isInteger(min) ? min : max}`
}

const createRouteKey = (route) => [
  route.type,
  route.mapId,
  route.zoneId,
  route.stage,
  route.sourceId,
  route.levelRange
].filter((part) => part !== undefined && part !== null && part !== '').join('|')

const addExpectedRoute = (index, pokemonId, route, monsterById) => {
  if (!Number.isInteger(pokemonId) || !monsterById.has(pokemonId)) return
  if (!index.has(pokemonId)) index.set(pokemonId, new Set())
  index.get(pokemonId).add(createRouteKey(route))
}

await withViteAuditServer(async ({ loadModule }) => {
  const { MONSTERS, OFFICIAL_DEX_MONSTERS } = await loadModule('/src/utils/gameData.js')
  const { getPokemonAcquisitionInfo } = await loadModule('/src/utils/pokemonAcquisition.js')
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { getChallengeBattleGroupSize, getChallengeRareUnlockBatch } = await loadModule('/src/utils/challengeRareUnlock.js')
  const { getEvolutionLevelForBranch } = await loadModule('/src/utils/pokemonGrowth.js')

  const missing = []
  const noDetail = []
  const routeIssues = []
  const sourceIssues = []
  const verbosityIssues = []
  const samples = []
  const routeTypeCounts = new Map()
  const expectedRouteKeysByPokemonId = new Map()
  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

  LAUNCH_STARTER_POKEMON_IDS.forEach((pokemonId, order) => {
    addExpectedRoute(expectedRouteKeysByPokemonId, pokemonId, {
      type: 'starter',
      sourceId: `launch-starter:${order}`
    }, monsterById)
  })

  const formatEvolutionCondition = (sourceMon, evolution) => {
    const level = getEvolutionLevelForBranch(sourceMon, evolution)
    return Number.isInteger(level) ? `Lv.${level} 进化` : '进化获得'
  }

  ADVENTURE_MAP_CHAIN.forEach((mapId) => {
    const mapInfo = getAdventureMapInfo(mapId)
    const config = getMapConfig(mapId)
    const mapMin = Math.max(1, Math.trunc(Number(config?.minLevel ?? 1)) || 1)
    const mapMax = Math.max(mapMin, Math.trunc(Number(config?.maxLevel ?? mapMin)) || mapMin)
    const zones = Array.isArray(mapInfo?.encounterZones) ? mapInfo.encounterZones : []
    const events = Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []

    zones.forEach((zone) => {
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
      entries.forEach((entry) => {
        addExpectedRoute(expectedRouteKeysByPokemonId, toPokemonId(entry), {
          type: 'wild',
          mapId,
          zoneId: zone.id,
          sourceId: zone.encounterTableId,
          levelRange: formatLevelRange(entry)
        }, monsterById)
      })
    })

    const boss = events.find((event) => event.type === 'boss')
    const bossProps = eventProps(boss)
    const bossTeam = Array.isArray(bossProps.team) ? bossProps.team : []
    bossTeam.slice(0, 2).forEach((entry, indexInTeam) => {
      addExpectedRoute(expectedRouteKeysByPokemonId, toPokemonId(entry), {
        type: 'progress',
        mapId,
        sourceId: `${boss?.id || 'boss'}:tier1:${indexInTeam}`,
        levelRange: `Lv.${mapMin}-${mapMax}`
      }, monsterById)
    })
    bossTeam.slice(0, 4).forEach((entry, indexInTeam) => {
      addExpectedRoute(expectedRouteKeysByPokemonId, toPokemonId(entry), {
        type: 'progress',
        mapId,
        sourceId: `${boss?.id || 'boss'}:tier2:${indexInTeam}`,
        levelRange: `Lv.${Math.min(mapMax, mapMin + 1)}-${mapMax}`
      }, monsterById)
    })

    const bossRarePokemon = bossProps.bossRarePokemon
    const bossRareId = toPokemonId(bossRarePokemon)
    if (bossRareId) {
      addExpectedRoute(expectedRouteKeysByPokemonId, bossRareId, {
        type: 'boss',
        mapId,
        sourceId: boss?.id || 'boss',
        levelRange: formatLevelRange({
          minLevel: bossRarePokemon?.minLevel ?? mapMin,
          maxLevel: bossRarePokemon?.maxLevel ?? mapMax
        })
      }, monsterById)
    }

    const challenge = events.find((event) => event.type === 'challenge')
    const challengeProps = eventProps(challenge)
    const pool = Array.isArray(challengeProps.challengeRarePool) ? challengeProps.challengeRarePool : []
    for (let stage = 0; stage < 4; stage += 1) {
      const batchIndex = stage + 1
      getChallengeRareUnlockBatch(pool, stage).forEach((entry, indexInBatch) => {
        addExpectedRoute(expectedRouteKeysByPokemonId, toPokemonId(entry), {
          type: 'challenge',
          mapId,
          sourceId: `${challenge?.id || 'challenge'}:stage${batchIndex}:${indexInBatch}`,
          stage: batchIndex,
          levelRange: formatLevelRange({
            minLevel: entry?.minLevel ?? mapMin,
            maxLevel: entry?.maxLevel ?? mapMax
          })
        }, monsterById)
      })
    }
  })

  MONSTERS.forEach((sourceMon) => {
    const branches = [
      sourceMon.evolvesTo,
      ...(Array.isArray(sourceMon.alternateEvolutions) ? sourceMon.alternateEvolutions : [])
    ].filter((branch) => branch && branch.disabled !== true)

    branches.forEach((branch) => {
      const targetId = Math.trunc(Number(branch.targetId))
      if (!monsterById.has(targetId)) return
      const condition = formatEvolutionCondition(sourceMon, branch)
      addExpectedRoute(expectedRouteKeysByPokemonId, targetId, {
        type: 'evolution',
        sourceId: `${sourceMon.id}->${targetId}:${condition}`
      }, monsterById)
    })
  })

  OFFICIAL_DEX_MONSTERS.forEach((monster) => {
    const info = getPokemonAcquisitionInfo(monster)
    const routes = Array.isArray(info?.routes) ? info.routes : []
    const allRoutes = Array.isArray(info?.allRoutes) ? info.allRoutes : routes
    const actualRouteKeys = new Set(allRoutes.map((route) => route?.key || createRouteKey(route)))
    const expectedRouteKeys = expectedRouteKeysByPokemonId.get(monster.id) || new Set()
    if (!info?.summary || info.summary.includes('暂无明确')) {
      missing.push(monster)
    }
    if (routes.length === 0) {
      noDetail.push(monster)
    }

    expectedRouteKeys.forEach((routeKey) => {
      if (!actualRouteKeys.has(routeKey)) {
        sourceIssues.push(`${monster.name} 缺少源数据路线 ${routeKey}`)
      }
    })

    actualRouteKeys.forEach((routeKey) => {
      if (!expectedRouteKeys.has(routeKey)) {
        sourceIssues.push(`${monster.name} 存在非当前正式源数据路线 ${routeKey}`)
      }
    })

    allRoutes.forEach((route) => {
      const detail = String(route?.detail || '')
      const summary = String(route?.summary || '')
      const shortSummary = String(route?.shortSummary || '')
      const availabilityLabel = String(route?.availabilityLabel || '')
      const routeText = `${summary} ${shortSummary} ${availabilityLabel} ${detail}`
      const routeLabel = `${monster.name} / ${route?.type || 'unknown'} / ${summary || detail}`
      routeTypeCounts.set(route.type, (routeTypeCounts.get(route.type) || 0) + 1)

      if (!summary || !detail) {
        routeIssues.push(`${routeLabel} 缺少摘要或明细`)
        return
      }

      Object.entries(TEXT_LENGTH_LIMITS).forEach(([field, limit]) => {
        const value = String(route?.[field] || '')
        if (value.length > limit) {
          verbosityIssues.push(`${routeLabel} ${field} 过长：${value}`)
        }
      })

      VERBOSE_TERMS.forEach((term) => {
        if (routeText.includes(term)) {
          verbosityIssues.push(`${routeLabel} 仍含繁琐机制词：${term}`)
        }
      })

      if (route.type === 'wild') {
        if (!route.mapName || !route.zoneName || !routeText.includes(route.mapName) || !routeText.includes(route.zoneName)) {
          routeIssues.push(`${routeLabel} 野区路线缺少地图或草地区域`)
        }
        if (!String(route.detail || '').includes('Lv.')) {
          routeIssues.push(`${routeLabel} 野区路线缺少等级范围`)
        }
        if (route.hiddenZone === true && (!routeText.includes('隐藏区') || !routeText.includes('开启隐藏入口'))) {
          routeIssues.push(`${routeLabel} 隐藏区路线缺少隐藏入口提示`)
        }
      } else if (route.type === 'challenge') {
        if (!Number.isInteger(route.stage) || !routeText.includes(`第${route.stage}批`) || !routeText.includes('连战') || !routeText.includes('草丛')) {
          routeIssues.push(`${routeLabel} 试炼路线缺少批次、连战或草丛说明`)
        }
      } else if (route.type === 'boss') {
        if (!routeText.includes('Boss') || !routeText.includes('击败') || !routeText.includes('草丛')) {
          routeIssues.push(`${routeLabel} Boss 路线缺少击败 Boss 或草丛说明`)
        }
      } else if (route.type === 'progress') {
        if (!routeText.includes('部下') || !routeText.includes('草丛')) {
          routeIssues.push(`${routeLabel} 进度路线缺少部下或草丛说明`)
        }
      } else if (route.type === 'evolution') {
        if (!route.sourcePokemonName || !routeText.includes(route.sourcePokemonName)) {
          routeIssues.push(`${routeLabel} 进化路线缺少来源宝可梦`)
        }
      } else if (route.type === 'starter') {
        if (!routeText.includes('开局') || !routeText.includes('选择')) {
          routeIssues.push(`${routeLabel} 初始路线缺少开局选择说明`)
        }
      } else {
        routeIssues.push(`${routeLabel} 未知路线类型`)
      }
    })

    if (samples.length < 12) {
      samples.push({
        id: monster.id,
        name: monster.name,
        summary: info?.summary || '',
        firstRoute: routes?.[0]?.detail || ''
      })
    }
  })

  if (missing.length > 0) {
    errors.push(`图鉴仍有 ${missing.length} 只宝可梦缺少获取摘要：${missing.map((monster) => monster.name).join('、')}`)
  }
  if (noDetail.length > 0) {
    errors.push(`图鉴仍有 ${noDetail.length} 只宝可梦缺少获取明细：${noDetail.map((monster) => monster.name).join('、')}`)
  }
  if (routeIssues.length > 0) {
    errors.push(`图鉴获取路线仍有 ${routeIssues.length} 条说明不准确：\n${routeIssues.slice(0, 24).map((issue) => `  - ${issue}`).join('\n')}`)
  }
  if (sourceIssues.length > 0) {
    errors.push(`图鉴获取路线与当前正式地图/进化/开局源数据不一致 ${sourceIssues.length} 处：\n${sourceIssues.slice(0, 32).map((issue) => `  - ${issue}`).join('\n')}`)
  }
  if (verbosityIssues.length > 0) {
    errors.push(`图鉴获取路线仍有 ${verbosityIssues.length} 处说明过长或过繁：\n${verbosityIssues.slice(0, 32).map((issue) => `  - ${issue}`).join('\n')}`)
  }

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    summary: {
      monsterCount: MONSTERS.length,
      officialDexMonsterCount: OFFICIAL_DEX_MONSTERS.length,
      missingSummaryCount: missing.length,
      missingDetailCount: noDetail.length,
      routeIssueCount: routeIssues.length,
      sourceIssueCount: sourceIssues.length,
      verbosityIssueCount: verbosityIssues.length,
      routeTypeCounts: Object.fromEntries([...routeTypeCounts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right)))),
    },
    samples
  }, null, 2))

  if (errors.length > 0) {
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('[audit-dex-acquisition] OK')
})
