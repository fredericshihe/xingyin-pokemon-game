import { ENCOUNTER_TABLES } from '../game/data/encounterTables'
import { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } from '../game/data/overworldMaps'
import { getMapConfig } from '../data/maps/mapConfig'
import { MONSTERS } from './gameData'
import { getChallengeBattleGroupSize, getChallengeRareUnlockBatch } from './challengeRareUnlock'
import { getEvolutionLevelForBranch } from './pokemonGrowth'

const MAX_ROUTES_PER_CATEGORY = 4
const LAUNCH_STARTER_POKEMON_IDS = [2, 1, 3, 4, 13]

const ACQUISITION_CATEGORY_META = {
  starter: {
    label: '初始',
    icon: 'fa-house',
    priority: 5
  },
  wild: {
    label: '野区',
    icon: 'fa-seedling',
    priority: 10
  },
  challenge: {
    label: '试炼',
    icon: 'fa-gem',
    priority: 20
  },
  boss: {
    label: 'Boss',
    icon: 'fa-crown',
    priority: 30
  },
  progress: {
    label: '进度',
    icon: 'fa-route',
    priority: 40
  },
  evolution: {
    label: '进化',
    icon: 'fa-arrow-up-right-dots',
    priority: 50
  }
}

const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))

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

const formatEvolutionCondition = (sourceMon, evolution) => {
  const level = getEvolutionLevelForBranch(sourceMon, evolution)
  if (Number.isInteger(level)) return `Lv.${level} 进化`
  return '进化获得'
}

const getMapName = (mapId) => {
  const config = getMapConfig(mapId)
  return config?.displayName || getAdventureMapInfo(mapId)?.displayName || mapId
}

const getMapOrder = (mapId) => {
  const index = ADVENTURE_MAP_CHAIN.indexOf(mapId)
  return index >= 0 ? index : 999
}

const createRouteKey = (route) => [
  route.type,
  route.mapId,
  route.zoneId,
  route.stage,
  route.sourceId,
  route.levelRange
].filter((part) => part !== undefined && part !== null && part !== '').join('|')

const createEmptyInfo = (monsterId) => ({
  monsterId,
  routes: [],
  allRoutes: [],
  summary: '暂无明确获得途径',
  shortSummary: '暂无明确途径',
  routeCount: 0
})

const joinDetailParts = (parts = []) => parts.filter(Boolean).join(' · ')

const simplifyZoneName = (zoneName) => (
  String(zoneName || '草丛')
    .replace(/\s*Lv\.?\s*\d+(?:\s*[-~]\s*\d+)?/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || '草丛'
)

const isHiddenEncounterZone = (zone) => zone?.depth === 'deep'

const getHiddenGateForZone = (mapInfo, zone) => {
  if (!isHiddenEncounterZone(zone)) return null
  return (Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : [])
    .find((event) => event?.properties?.hiddenZoneId === zone.id) || null
}

const getHiddenZoneAvailabilityLabel = (mapInfo, zone) => {
  const gate = getHiddenGateForZone(mapInfo, zone)
  const cost = Math.max(0, Math.trunc(Number(gate?.properties?.goldCost)) || 0)
  return cost > 0
    ? `${cost}金币开启隐藏入口`
    : '开启隐藏入口'
}

const addRoute = (index, pokemonId, route) => {
  if (!Number.isInteger(pokemonId) || !monsterById.has(pokemonId)) return
  const normalized = {
    ...route,
    key: route.key || createRouteKey(route),
    category: ACQUISITION_CATEGORY_META[route.type]?.label || route.type,
    icon: ACQUISITION_CATEGORY_META[route.type]?.icon || 'fa-location-dot',
    priority: ACQUISITION_CATEGORY_META[route.type]?.priority ?? 99,
    mapOrder: getMapOrder(route.mapId)
  }
  if (!index.has(pokemonId)) index.set(pokemonId, [])
  const existing = index.get(pokemonId)
  if (existing.some((candidate) => candidate.key === normalized.key)) return
  existing.push(normalized)
}

const buildStarterRoutes = (index) => {
  LAUNCH_STARTER_POKEMON_IDS.forEach((pokemonId, order) => {
    addRoute(index, pokemonId, {
      type: 'starter',
      sourceId: `launch-starter:${order}`,
      summary: '开局可选',
      shortSummary: '开局可选',
      detail: '创建角色时选择'
    })
  })
}

const buildWildRoutes = (index) => {
  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const mapName = getMapName(mapId)
    const zones = Array.isArray(mapInfo?.encounterZones) ? mapInfo.encounterZones : []

    zones.forEach((zone) => {
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []

      entries.forEach((entry) => {
        const pokemonId = toPokemonId(entry)
        const levelRange = formatLevelRange(entry)
        const zoneName = simplifyZoneName(zone.name || zone.id || '草丛')
        const hiddenZone = isHiddenEncounterZone(zone)
        const displayZoneName = hiddenZone ? `${zoneName}（隐藏区）` : zoneName
        const availabilityLabel = hiddenZone
          ? getHiddenZoneAvailabilityLabel(mapInfo, zone)
          : ''
        addRoute(index, pokemonId, {
          type: 'wild',
          mapId,
          zoneId: zone.id,
          sourceId: zone.encounterTableId,
          hiddenZone,
          mapName,
          zoneName: displayZoneName,
          levelRange,
          availabilityLabel,
          summary: `${mapName} · ${displayZoneName}`,
          shortSummary: `${mapName} · ${displayZoneName}`,
          detail: joinDetailParts([
            levelRange,
            hiddenZone ? '隐藏区草丛' : '草丛遇到'
          ])
        })
      })
    })
  }
}

const buildProgressAndBossRoutes = (index) => {
  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const mapName = getMapName(mapId)
    const config = getMapConfig(mapId)
    const mapMin = Math.max(1, Math.trunc(Number(config?.minLevel ?? 1)) || 1)
    const mapMax = Math.max(mapMin, Math.trunc(Number(config?.maxLevel ?? mapMin)) || mapMin)
    const events = Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []
    const boss = events.find((event) => event.type === 'boss')
    const props = eventProps(boss)
    const team = Array.isArray(props.team) ? props.team : []

    team.slice(0, 2).forEach((entry, indexInTeam) => {
      const pokemonId = toPokemonId(entry)
      addRoute(index, pokemonId, {
        type: 'progress',
        mapId,
        sourceId: `${boss?.id || 'boss'}:tier1:${indexInTeam}`,
        mapName,
        levelRange: `Lv.${mapMin}-${mapMax}`,
        availabilityLabel: '击败1名部下',
        summary: `${mapName} · 部下进度`,
        shortSummary: `${mapName} · 部下解锁`,
        detail: `Lv.${mapMin}-${mapMax} · 草丛遇到`
      })
    })

    team.slice(0, 4).forEach((entry, indexInTeam) => {
      const pokemonId = toPokemonId(entry)
      addRoute(index, pokemonId, {
        type: 'progress',
        mapId,
        sourceId: `${boss?.id || 'boss'}:tier2:${indexInTeam}`,
        mapName,
        levelRange: `Lv.${Math.min(mapMax, mapMin + 1)}-${mapMax}`,
        availabilityLabel: '击败3名部下',
        summary: `${mapName} · 部下进度`,
        shortSummary: `${mapName} · 部下解锁`,
        detail: `Lv.${Math.min(mapMax, mapMin + 1)}-${mapMax} · 草丛遇到`
      })
    })

    const bossRarePokemon = props.bossRarePokemon
    const bossRareId = toPokemonId(bossRarePokemon)
    if (bossRareId) {
      const levelRange = formatLevelRange({
        minLevel: bossRarePokemon?.minLevel ?? mapMin,
        maxLevel: bossRarePokemon?.maxLevel ?? mapMax
      })
      addRoute(index, bossRareId, {
        type: 'boss',
        mapId,
        sourceId: boss?.id || 'boss',
        mapName,
        levelRange,
        availabilityLabel: '击败Boss',
        summary: `${mapName} · Boss稀有`,
        shortSummary: `${mapName} · Boss解锁`,
        detail: joinDetailParts([levelRange, '草丛遇到'])
      })
    }
  }
}

const buildChallengeRoutes = (index) => {
  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const mapInfo = getAdventureMapInfo(mapId)
    const mapName = getMapName(mapId)
    const config = getMapConfig(mapId)
    const mapMin = Math.max(1, Math.trunc(Number(config?.minLevel ?? 1)) || 1)
    const mapMax = Math.max(mapMin, Math.trunc(Number(config?.maxLevel ?? mapMin)) || mapMin)
    const events = Array.isArray(mapInfo?.runtimeEvents) ? mapInfo.runtimeEvents : []
    const challenge = events.find((event) => event.type === 'challenge')
    const props = eventProps(challenge)
    const pool = Array.isArray(props.challengeRarePool) ? props.challengeRarePool : []
    if (pool.length === 0) continue

    for (let stage = 0; stage < 4; stage += 1) {
      const batchIndex = stage + 1
      const battleCount = getChallengeBattleGroupSize(stage)
      getChallengeRareUnlockBatch(pool, stage).forEach((entry, indexInBatch) => {
        const pokemonId = toPokemonId(entry)
        const levelRange = formatLevelRange({
          minLevel: entry?.minLevel ?? mapMin,
          maxLevel: entry?.maxLevel ?? mapMax
        })
        addRoute(index, pokemonId, {
          type: 'challenge',
          mapId,
          sourceId: `${challenge?.id || 'challenge'}:stage${batchIndex}:${indexInBatch}`,
          stage: batchIndex,
          mapName,
          levelRange,
          availabilityLabel: `完成${battleCount}连战`,
          summary: `${mapName} · 试炼第${batchIndex}批`,
          shortSummary: `${mapName} · 试炼第${batchIndex}批`,
          detail: joinDetailParts([levelRange, '草丛遇到'])
        })
      })
    }
  }
}

const buildEvolutionRoutes = (index) => {
  MONSTERS.forEach((sourceMon) => {
    const branches = [
      sourceMon.evolvesTo,
      ...(Array.isArray(sourceMon.alternateEvolutions) ? sourceMon.alternateEvolutions : [])
    ].filter((branch) => branch && branch.disabled !== true)

    branches.forEach((branch) => {
      const targetId = Math.trunc(Number(branch.targetId))
      const target = monsterById.get(targetId)
      if (!target) return
      const condition = formatEvolutionCondition(sourceMon, branch)
      addRoute(index, targetId, {
        type: 'evolution',
        sourceId: `${sourceMon.id}->${targetId}:${condition}`,
        sourcePokemonId: sourceMon.id,
        sourcePokemonName: sourceMon.name,
        condition,
        availabilityLabel: '进化获得',
        summary: `由${sourceMon.name}进化`,
        shortSummary: `${sourceMon.name}进化`,
        detail: condition
      })
    })
  })
}

const rankRoute = (route) => {
  const directBonus = route.type === 'wild' ? -2 : 0
  const stage = Number.isInteger(route.stage) ? route.stage : 99
  const hiddenZoneBonus = route.hiddenZone ? -1 : 0
  return [
    route.priority + directBonus,
    route.mapOrder,
    hiddenZoneBonus,
    stage,
    route.zoneName || '',
    route.sourceId || ''
  ]
}

const sortRoutes = (routes) => routes.slice().sort((left, right) => {
  const leftRank = rankRoute(left)
  const rightRank = rankRoute(right)
  for (let index = 0; index < leftRank.length; index += 1) {
    const leftValue = leftRank[index]
    const rightValue = rightRank[index]
    if (typeof leftValue === 'number' && typeof rightValue === 'number' && leftValue !== rightValue) {
      return leftValue - rightValue
    }
    const textCompare = String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN')
    if (textCompare !== 0) return textCompare
  }
  return 0
})

const trimRoutesForDisplay = (routes) => {
  const counts = new Map()
  return routes.filter((route) => {
    const count = counts.get(route.type) || 0
    if (route.hiddenZone) {
      counts.set(route.type, count + 1)
      return true
    }
    if (count >= MAX_ROUTES_PER_CATEGORY) return false
    counts.set(route.type, count + 1)
    return true
  })
}

const createInfo = (monsterId, rawRoutes = []) => {
  const allRoutes = sortRoutes(rawRoutes)
  const routes = trimRoutesForDisplay(allRoutes)
  if (routes.length === 0) return createEmptyInfo(monsterId)
  const primary = routes[0]
  const extraCount = Math.max(0, allRoutes.length - 1)
  return {
    monsterId,
    routes,
    allRoutes,
    summary: `${primary.summary}${extraCount > 0 ? `，另有${extraCount}种途径` : ''}`,
    shortSummary: primary.shortSummary || primary.summary,
    routeCount: allRoutes.length
  }
}

export function buildPokemonAcquisitionIndex() {
  const routeIndex = new Map()
  buildStarterRoutes(routeIndex)
  buildWildRoutes(routeIndex)
  buildChallengeRoutes(routeIndex)
  buildProgressAndBossRoutes(routeIndex)
  buildEvolutionRoutes(routeIndex)
  return new Map(MONSTERS.map((monster) => [
    monster.id,
    createInfo(monster.id, routeIndex.get(monster.id) || [])
  ]))
}

export const POKEMON_ACQUISITION_INDEX = buildPokemonAcquisitionIndex()

export function getPokemonAcquisitionInfo(monsterOrId) {
  const pokemonId = Number.isInteger(monsterOrId)
    ? monsterOrId
    : toPokemonId(monsterOrId)
  if (!Number.isInteger(pokemonId)) return createEmptyInfo(null)
  return POKEMON_ACQUISITION_INDEX.get(pokemonId) || createEmptyInfo(pokemonId)
}
