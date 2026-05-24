#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const LOW_WEIGHT_RARE_THRESHOLD = 10
const TYPE_THEME_BY_MAP = {
  GodotMap: ['grass', 'water', 'normal', 'electric', 'psychic', 'ghost'],
  GodotMapV2: ['grass', 'normal', 'poison', 'flying'],
  GodotMapV2_MistLake: ['water'],
  GodotMapV2_FarmTown: ['grass', 'normal', 'fighting', 'rock'],
  GodotMapV2_PirateShore: ['water', 'rock'],
  GodotMapV2_Graveyard: ['ghost', 'poison', 'psychic', 'dark'],
  GodotMapV2_HexRuins: ['electric', 'rock', 'psychic', 'normal'],
  GodotMapV2_SurvivalRidge: ['fighting', 'rock', 'ground', 'steel', 'normal'],
  GodotMapV2_BossHighland: ['grass', 'fire', 'water', 'dragon', 'electric', 'rock']
}

const errors = []
const warnings = []

const addError = (message) => errors.push(message)
const addWarning = (message) => warnings.push(message)
const unique = (values) => [...new Set(values)]
const sortIds = (ids) => unique(Array.from(ids || []).map(Number).filter(Number.isInteger)).sort((a, b) => a - b)

function eventProps(event) {
  return event?.properties && typeof event.properties === 'object' ? event.properties : {}
}

function levelRangeText(entries) {
  const levels = entries.flatMap((entry) => [
    Number(entry.minLevel ?? entry.level),
    Number(entry.maxLevel ?? entry.level ?? entry.minLevel)
  ]).filter(Number.isFinite)
  if (levels.length === 0) return 'Lv.?'
  return `Lv.${Math.min(...levels)}-${Math.max(...levels)}`
}

function speciesTypes(monster) {
  return [monster?.type, monster?.type2].filter(Boolean)
}

function hasThemeType(speciesIds, monstersById, expectedTypes) {
  if (!expectedTypes?.length) return true
  return speciesIds.some((id) => speciesTypes(monstersById.get(id)).some((type) => expectedTypes.includes(type)))
}

function createEvolutionClosure(seedIds, monstersById) {
  const reachable = new Set(seedIds)
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...reachable]) {
      const monster = monstersById.get(id)
      const evolutions = [
        monster?.evolvesTo,
        ...(Array.isArray(monster?.alternateEvolutions) ? monster.alternateEvolutions : [])
      ].filter(Boolean)
      for (const evolution of evolutions) {
        const targetId = Math.trunc(Number(evolution.targetId))
        if (!Number.isInteger(targetId) || reachable.has(targetId)) continue
        reachable.add(targetId)
        changed = true
      }
    }
  }
  return reachable
}

function formatSpeciesList(ids, monstersById, max = 12) {
  const names = sortIds(ids).map((id) => monstersById.get(id)?.name || `#${id}`)
  const shown = names.slice(0, max).join('、')
  return names.length > max ? `${shown} 等 ${names.length} 种` : shown
}

function getRareCandidateEntries({ bossTeam, bossProps, mapMin, mapMax, pickLevelForSpecies }) {
  const tier1 = bossTeam.slice(0, 2).map((entry, index) => ({
    source: '击败 1 名部下后增强生态',
    chance: '12%',
    progressTier: 1,
    index,
    pokemonId: Math.trunc(Number(entry.pokemonId ?? entry.id)),
    minLevel: mapMin,
    maxLevel: mapMax
  }))

  const tier2 = bossTeam.slice(0, 4).map((entry, index) => ({
    source: '击败 3 名部下后增强生态',
    chance: '18%',
    progressTier: 2,
    index,
    pokemonId: Math.trunc(Number(entry.pokemonId ?? entry.id)),
    minLevel: Math.min(mapMax, mapMin + 1),
    maxLevel: mapMax
  }))

  const bossRareEntry = bossProps?.bossRarePokemon || null
  const tier3 = bossRareEntry ? [bossRareEntry].map((entry, index) => {
    return {
      source: '击败 Boss 后专属稀有生态',
      chance: `${Math.round((Number(bossProps.bossRareChance ?? 0.18) || 0.18) * 100)}%`,
      progressTier: 3,
      index,
      pokemonId: Math.trunc(Number(entry.pokemonId ?? entry.id ?? entry)),
      minLevel: Math.max(1, Math.trunc(Number(entry.minLevel ?? mapMin)) || mapMin),
      maxLevel: Math.max(mapMin, Math.trunc(Number(entry.maxLevel ?? mapMax)) || mapMax)
    }
  }) : []

  return [...tier1, ...tier2, ...tier3].map((entry) => ({
    ...entry,
    legal: Number.isInteger(entry.pokemonId) &&
      pickLevelForSpecies(entry.pokemonId, entry.minLevel, entry.maxLevel) !== null
  }))
}

function getChallengeRareEntries({ challenge, mapMin, mapMax, pickLevelForSpecies }) {
  const props = eventProps(challenge)
  const pool = Array.isArray(props.challengeRarePool) ? props.challengeRarePool : []
  return pool.map((entry, index) => {
    const pokemonId = Math.trunc(Number(entry?.pokemonId ?? entry?.id ?? entry))
    const minLevel = Math.max(1, Math.trunc(Number(entry?.minLevel ?? mapMin)) || mapMin)
    const maxLevel = Math.max(minLevel, Math.trunc(Number(entry?.maxLevel ?? mapMax)) || mapMax)
    return {
      source: '完成区域试炼后隐藏生态',
      chance: `${Math.round((Number(props.challengeRareChance ?? 0.3) || 0.3) * 100)}%`,
      progressTier: 4,
      index,
      pokemonId,
      minLevel,
      maxLevel,
      legal: Number.isInteger(pokemonId) &&
        pickLevelForSpecies(pokemonId, minLevel, maxLevel) !== null
    }
  })
}

await withViteAuditServer(async ({ loadModule }) => {
  const { ADVENTURE_MAP_CHAIN, getAdventureMapInfo } = await loadModule('/src/game/data/overworldMaps.js')
  const { getMapConfig } = await loadModule('/src/data/maps/mapConfig.js')
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const { MONSTERS } = await loadModule('/src/utils/gameData.js')
  const { TYPE_NAMES_CN } = await loadModule('/src/utils/constants.js')
  const { pickLevelForSpecies } = await loadModule('/src/utils/wildEncounterRules.js')

  const monstersById = new Map(MONSTERS.map((monster) => [monster.id, monster]))
  const allDirectSpecies = new Set()
  const allLowWeightSpecies = new Set()
  const allUnlockRareSpecies = new Set()
  const allBattleOnlySpecies = new Set()
  const bossRareOccurrences = []
  const challengeRareOccurrences = []
  const activeEncounterTableIds = new Set()
  const mapRows = []
  const rareRows = []

  for (const mapId of ADVENTURE_MAP_CHAIN) {
    const map = getAdventureMapInfo(mapId)
    const config = getMapConfig(mapId)
    const zones = Array.isArray(map.encounterZones) ? map.encounterZones : []
    const events = Array.isArray(map.runtimeEvents) ? map.runtimeEvents : []
    const signs = Object.values(map.signs || {}).filter((message) => typeof message === 'string' && message.trim().length > 0)
    const expectedTypes = TYPE_THEME_BY_MAP[mapId] || []
    const directSpecies = new Set()
    const lowWeightSpecies = new Set()
    const zoneTableIds = new Set()
    const zoneSummaries = []

    for (const zone of zones) {
      const tableId = zone.encounterTableId
      zoneTableIds.add(tableId)
      activeEncounterTableIds.add(tableId)
      const table = ENCOUNTER_TABLES[tableId]
      if (!table) {
        addError(`${mapId}/${zone.id} 缺少遇敌表 ${tableId}`)
        continue
      }
      const entries = Array.isArray(table.pokemon) ? table.pokemon : []
      entries.forEach((entry) => {
        const pokemonId = Math.trunc(Number(entry.id))
        if (!monstersById.has(pokemonId)) {
          addError(`${mapId}/${zone.id}/${tableId} 引用了不存在的宝可梦 ID ${entry.id}`)
          return
        }
        if (pickLevelForSpecies(pokemonId, entry.minLevel, entry.maxLevel) === null) {
          addError(`${mapId}/${zone.id}/${tableId} ${monstersById.get(pokemonId).name} 等级 ${entry.minLevel}-${entry.maxLevel} 与形态阶段不匹配`)
        }
        directSpecies.add(pokemonId)
        allDirectSpecies.add(pokemonId)
        if (Number(entry.weight) <= LOW_WEIGHT_RARE_THRESHOLD) {
          lowWeightSpecies.add(pokemonId)
          allLowWeightSpecies.add(pokemonId)
        }
      })
      zoneSummaries.push({
        id: zone.id,
        name: zone.name,
        tableId,
        levelRange: levelRangeText(entries),
        speciesIds: sortIds(entries.map((entry) => entry.id)),
        tallGrassRate: zone.tallGrassRate ?? table.tallGrassRate
      })
    }

    if (zones.length > 1 && zoneTableIds.size === 1 && mapId !== 'GodotMap') {
      addWarning(`${config.displayName} 的 ${zones.length} 个草丛区域共用同一遇敌表，区域位置有名字差异但物种分布没有差异`)
    }

    if (!hasThemeType([...directSpecies], monstersById, expectedTypes)) {
      const themeText = expectedTypes.map((type) => TYPE_NAMES_CN[type] || type).join('/')
      addWarning(`${config.displayName} 基础遇敌物种没有命中预期主题属性：${themeText}`)
    }

    const signText = signs.join(' ')
    if (signs.length === 0) {
      addError(`${config.displayName} 缺少路牌文本`)
    }
    if (!/(Lv\.|等级|Lv)/i.test(signText)) {
      addWarning(`${config.displayName} 路牌没有明确等级范围提示`)
    }
    if (mapId.startsWith('GodotMapV2') && !/(部下|首领|Boss|试炼)/i.test(signText)) {
      addWarning(`${config.displayName} 路牌没有说明部下/首领/试炼机制`)
    }
    if (expectedTypes.length > 0) {
      const expectedTypeNames = expectedTypes.map((type) => TYPE_NAMES_CN[type] || type)
      if (!expectedTypeNames.some((name) => signText.includes(name))) {
        addWarning(`${config.displayName} 路牌没有写出主要生态属性：${expectedTypeNames.join('/')}`)
      }
    }

    const battleEvents = events.filter((event) => ['trainer', 'boss', 'challenge'].includes(event.type))
    battleEvents.forEach((event) => {
      ;(eventProps(event).team || []).forEach((member) => {
        const pokemonId = Math.trunc(Number(member.pokemonId ?? member.id))
        if (Number.isInteger(pokemonId) && !directSpecies.has(pokemonId)) {
          allBattleOnlySpecies.add(pokemonId)
        }
      })
    })

    const boss = events.find((event) => event.type === 'boss')
    const challenge = events.find((event) => event.type === 'challenge')
    const bossProps = eventProps(boss)
    const bossTeam = Array.isArray(bossProps.team) ? bossProps.team : []
    const progressRareEntries = boss
      ? getRareCandidateEntries({
        bossTeam,
        bossProps,
        mapMin: Math.max(1, Math.trunc(Number(config.minLevel ?? 1)) || 1),
        mapMax: Math.max(1, Math.trunc(Number(config.maxLevel ?? 1)) || 1),
        pickLevelForSpecies
      })
      : []

    const bossRareId = Math.trunc(Number(bossProps?.bossRarePokemon?.pokemonId ?? bossProps?.bossRarePokemon?.id))
    if (boss && mapId.startsWith('GodotMapV2')) {
      if (!Number.isInteger(bossRareId)) {
        addError(`${config.displayName} Boss 缺少专属稀有宝可梦 bossRarePokemon`)
      } else {
        bossRareOccurrences.push({ mapId, displayName: config.displayName, pokemonId: bossRareId })
        const bossRareEntry = progressRareEntries.find((entry) => entry.progressTier === 3 && entry.pokemonId === bossRareId)
        if (!bossRareEntry?.legal) {
          addError(`${config.displayName} Boss 专属稀有 ${monstersById.get(bossRareId)?.name || bossRareId} 无法在 Lv.${config.minLevel}-${config.maxLevel} 合法出现`)
        }
        if (!bossTeam.some((member) => Math.trunc(Number(member?.pokemonId ?? member?.id)) === bossRareId)) {
          addError(`${config.displayName} Boss 队伍没有带出专属稀有 ${monstersById.get(bossRareId)?.name || bossRareId}`)
        }
        if (directSpecies.has(bossRareId)) {
          addError(`${config.displayName} Boss 专属稀有 ${monstersById.get(bossRareId)?.name || bossRareId} 已在本地图基础草丛出现，无法体现击败 Boss 后解锁`)
        }
      }
    }

    const challengeRareEntries = challenge
      ? getChallengeRareEntries({
        challenge,
        mapMin: Math.max(1, Math.trunc(Number(config.minLevel ?? 1)) || 1),
        mapMax: Math.max(1, Math.trunc(Number(config.maxLevel ?? 1)) || 1),
        pickLevelForSpecies
      })
      : []

    challengeRareEntries.forEach((entry) => {
      if (Number.isInteger(entry.pokemonId)) {
        challengeRareOccurrences.push({ mapId, displayName: config.displayName, pokemonId: entry.pokemonId })
      }
    })

    if (Number.isInteger(bossRareId) && challengeRareEntries.some((entry) => entry.pokemonId === bossRareId)) {
      addError(`${config.displayName} Boss 专属稀有 ${monstersById.get(bossRareId)?.name || bossRareId} 不应同时出现在本地图试炼隐藏生态池`)
    }

    for (const entry of [...progressRareEntries, ...challengeRareEntries]) {
      if (!entry.legal) {
        addError(`${config.displayName}/${entry.source} ${monstersById.get(entry.pokemonId)?.name || entry.pokemonId} 无法在 Lv.${entry.minLevel}-${entry.maxLevel} 合法出现`)
        continue
      }
      allUnlockRareSpecies.add(entry.pokemonId)
    }

    const bossRareSpecies = sortIds(progressRareEntries
      .filter((entry) => entry.progressTier === 3 && entry.legal)
      .map((entry) => entry.pokemonId))
    const challengeRareSpecies = sortIds(challengeRareEntries
      .filter((entry) => entry.legal)
      .map((entry) => entry.pokemonId))

    rareRows.push({
      mapId,
      displayName: config.displayName,
      lowWeightSpecies: sortIds(lowWeightSpecies),
      bossRareSpecies,
      challengeRareSpecies,
      rareText: boss ? eventProps(boss).rareUnlockText || '' : ''
    })

    mapRows.push({
      mapId,
      displayName: config.displayName,
      levelRange: `Lv.${config.minLevel}-${config.maxLevel}`,
      zoneCount: zones.length,
      encounterTableCount: zoneTableIds.size,
      directSpecies: sortIds([...directSpecies]),
      lowWeightSpecies: sortIds([...lowWeightSpecies]),
      signCount: signs.length,
      zones: zoneSummaries
    })
  }

  const directAndUnlockSpecies = new Set([...allDirectSpecies, ...allUnlockRareSpecies])
  const evolutionReachableSpecies = createEvolutionClosure(directAndUnlockSpecies, monstersById)
  const battleOnlySpecies = new Set([...allBattleOnlySpecies].filter((id) => !directAndUnlockSpecies.has(id)))
  const directUnlockMissingSpecies = MONSTERS
    .map((monster) => monster.id)
    .filter((id) => !directAndUnlockSpecies.has(id))
  const uncoveredSpecies = MONSTERS
    .map((monster) => monster.id)
    .filter((id) => !evolutionReachableSpecies.has(id))
  const unusedEncounterTables = Object.keys(ENCOUNTER_TABLES).filter((tableId) => !activeEncounterTableIds.has(tableId))
  const duplicateBossRareSpecies = [...bossRareOccurrences.reduce((map, occurrence) => {
    const list = map.get(occurrence.pokemonId) || []
    list.push(occurrence)
    map.set(occurrence.pokemonId, list)
    return map
  }, new Map()).entries()].filter(([, occurrences]) => occurrences.length > 1)
  duplicateBossRareSpecies.forEach(([pokemonId, occurrences]) => {
    addError(`Boss 专属稀有重复：${monstersById.get(pokemonId)?.name || pokemonId} 被 ${occurrences.map((item) => item.displayName).join('、')} 同时使用`)
  })
  const bossRareSpeciesIds = new Set(bossRareOccurrences.map((occurrence) => occurrence.pokemonId))
  bossRareSpeciesIds.forEach((pokemonId) => {
    if (allDirectSpecies.has(pokemonId)) {
      addError(`Boss 专属稀有 ${monstersById.get(pokemonId)?.name || pokemonId} 不应出现在任意基础草丛中`)
    }
  })
  challengeRareOccurrences
    .filter((occurrence) => bossRareSpeciesIds.has(occurrence.pokemonId))
    .forEach((occurrence) => {
      addError(`${occurrence.displayName} 试炼隐藏生态不应包含 Boss 专属稀有 ${monstersById.get(occurrence.pokemonId)?.name || occurrence.pokemonId}`)
    })
  if (directUnlockMissingSpecies.length > 0) {
    addError(`仍有 ${directUnlockMissingSpecies.length} 种宝可梦没有基础草丛或解锁后野生获得路径：${formatSpeciesList(directUnlockMissingSpecies, monstersById, 24)}`)
  }
  if (uncoveredSpecies.length > 0) {
    addError(`仍有 ${uncoveredSpecies.length} 种宝可梦无法通过地图野生/解锁/进化覆盖：${formatSpeciesList(uncoveredSpecies, monstersById, 24)}`)
  }

  console.log('Map Pokemon coverage audit')
  console.log(`- maps: ${ADVENTURE_MAP_CHAIN.length}`)
  console.log(`- active encounter tables: ${activeEncounterTableIds.size}`)
  console.log(`- active encounter zones: ${mapRows.reduce((sum, row) => sum + row.zoneCount, 0)}`)
  console.log(`- defined Pokemon: ${MONSTERS.length}`)
  console.log(`- directly wild on active maps: ${allDirectSpecies.size}`)
  console.log(`- low-weight wild species (weight <= ${LOW_WEIGHT_RARE_THRESHOLD}): ${allLowWeightSpecies.size}`)
  console.log(`- progress/Boss/challenge-derived wild candidates: ${allUnlockRareSpecies.size}`)
  console.log(`- direct + unlock wild coverage: ${directAndUnlockSpecies.size}`)
  console.log(`- not directly wild/unlock candidates: ${directUnlockMissingSpecies.length}`)
  console.log(`- reachable through evolution from map wild coverage: ${evolutionReachableSpecies.size}`)
  console.log(`- not covered by map wild/unlock/evolution paths: ${uncoveredSpecies.length}`)
  console.log(`- battle-only species not currently wild candidates: ${battleOnlySpecies.size}`)
  console.log(`- unused encounter tables: ${unusedEncounterTables.length > 0 ? unusedEncounterTables.join(', ') : 'none'}`)

  console.log('\nPer-map coverage')
  mapRows.forEach((row) => {
    console.log(`- ${row.displayName} (${row.mapId}) ${row.levelRange}: zones=${row.zoneCount}, tables=${row.encounterTableCount}, wild=${row.directSpecies.length}, signs=${row.signCount}`)
    console.log(`  wild: ${formatSpeciesList(row.directSpecies, monstersById)}`)
    if (row.lowWeightSpecies.length > 0) {
      console.log(`  low-weight: ${formatSpeciesList(row.lowWeightSpecies, monstersById)}`)
    }
  })

  console.log('\nRare acquisition paths')
  rareRows.forEach((row) => {
    const low = row.lowWeightSpecies.length > 0 ? formatSpeciesList(row.lowWeightSpecies, monstersById) : '无低权重野生'
    const bossRare = row.bossRareSpecies.length > 0
      ? `${formatSpeciesList(row.bossRareSpecies, monstersById)}（击败 Boss 后专属解锁）`
      : '无 Boss 专属稀有'
    const challengeRare = row.challengeRareSpecies.length > 0
      ? `${formatSpeciesList(row.challengeRareSpecies, monstersById)}（完成区域试炼后隐藏生态）`
      : '无挑战隐藏生态'
    console.log(`- ${row.displayName}: 低权重野生=${low}; Boss 后=${bossRare}; 挑战后=${challengeRare}`)
  })

  if (directUnlockMissingSpecies.length > 0) {
    console.log(`\nNot directly wild/unlock candidates: ${formatSpeciesList(directUnlockMissingSpecies, monstersById, 24)}`)
  }

  if (warnings.length > 0) {
    console.warn('\nWarnings:')
    warnings.forEach((warning) => console.warn(`- ${warning}`))
  }

  if (errors.length > 0) {
    console.error('\nErrors:')
    errors.forEach((error) => console.error(`- ${error}`))
    process.exitCode = 1
    return
  }

  console.log('\nMap Pokemon coverage audit passed.')
})
