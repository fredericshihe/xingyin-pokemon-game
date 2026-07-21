#!/usr/bin/env node
import { withViteAuditServer } from './load-vite-module.mjs'

const MIN_HIDDEN_TREASURE_VALUE = 500
const MIN_HIDDEN_EXCLUSIVE_SHARE = 0.6
const HIDDEN_EXCLUSIVE_SHARE_BOUNDS_BY_ZONE = {
  peak_starwatch_path: { min: 0.10, max: 0.15 }
}
const HIDDEN_GATE_COST_BY_ZONE = {
  meadow_hidden_grove: 100,
  lake_hidden_path: 200,
  farm_windmill_top: 300,
  shore_wreck_inner: 400,
  grave_deep_forest: 500,
  hex_sealed_chamber: 600,
  peak_starwatch_path: 700
}
// Hidden-exclusive Pokemon now use official base stats. Some official final forms
// such as Breloom and Sharpedo have 460 total, so the audit floor follows that.
const MIN_HIDDEN_EXCLUSIVE_POWER_TOTAL = 460

const HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE = {
  meadow_hidden_grove: [189, 190, 191],
  lake_hidden_path: [192, 193, 194],
  farm_windmill_top: [195, 196, 197],
  shore_wreck_inner: [198, 199, 200],
  grave_deep_forest: [201, 202, 203],
  hex_sealed_chamber: [204, 205, 206],
  peak_starwatch_path: [207, 208, 209]
}

const HIDDEN_EXCLUSIVE_IDS = new Set(Object.values(HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE).flat())

const statTotal = (monster) => (
  ['maxHp', 'atk', 'def', 'spAtk', 'spDef', 'spd']
    .reduce((sum, key) => sum + (Number(monster?.[key]) || 0), 0)
)

const isInsideZone = (zone, event) => {
  const x = Math.trunc(Number(event?.position?.x))
  const y = Math.trunc(Number(event?.position?.y))
  return (
    Number.isSafeInteger(x) &&
    Number.isSafeInteger(y) &&
    x >= zone.x &&
    x < zone.x + zone.width &&
    y >= zone.y &&
    y < zone.y + zone.height
  )
}

const getItemAuditValue = (event, catalogs) => {
  const props = event?.properties || {}
  const itemKey = props.itemKey
  const itemType = props.itemType
  const quantity = Math.max(1, Math.trunc(Number(props.quantity)) || 1)
  const entry = catalogs.map((catalog) => catalog?.[itemKey]).find(Boolean)
  const price = Math.trunc(Number(entry?.price))
  if (Number.isFinite(price) && price > 0) return price * quantity
  if (itemType === 'statBoost' || catalogs.some((catalog) => catalog?.[itemKey]?.effect === 'stat_boost')) return 1200 * quantity
  if (itemKey === 'pokeball_master') return 3000 * quantity
  return 0
}

const errors = []
const summary = []

await withViteAuditServer(async ({ loadModule }) => {
  const maps = (await loadModule('/src/game/data/godotMaps/godot_region_maps.js')).default
  const { ENCOUNTER_TABLES } = await loadModule('/src/game/data/encounterTables.js')
  const {
    EXP_POTIONS,
    MONSTERS,
    POKEBALLS,
    POTIONS,
    STAT_BOOST_ITEMS
  } = await loadModule('/src/utils/gameData.js')
  const { getPokemonAcquisitionInfo } = await loadModule('/src/utils/pokemonAcquisition.js')
  const { getSpeciesLevelBounds } = await loadModule('/src/utils/wildEncounterRules.js')
  const { normalizeChallengeRarePool } = await loadModule('/src/utils/challengeRareUnlock.js')

  const monsterById = new Map(MONSTERS.map((monster) => [Number(monster.id), monster]))
  const itemCatalogs = [POTIONS, POKEBALLS, EXP_POTIONS, STAT_BOOST_ITEMS]
  const hiddenExclusiveOccurrences = new Map()
  const challengeRareIdsByMap = new Map(
    Object.entries(maps).map(([mapId, map]) => {
      const challengeEvent = (map.runtimeEvents || []).find((event) => event?.type === 'challenge')
      return [
        mapId,
        new Set(
          normalizeChallengeRarePool(challengeEvent?.properties?.challengeRarePool || [])
            .map((entry) => entry.pokemonId)
            .filter(Number.isInteger)
        )
      ]
    })
  )
  const globalChallengeRareIds = new Set(
    Array.from(challengeRareIdsByMap.values()).flatMap((idSet) => Array.from(idSet))
  )
  const globalBossRareIds = new Set(
    Object.values(maps)
      .map((map) => (map.runtimeEvents || []).find((event) => event?.type === 'boss'))
      .map((bossEvent) => Math.trunc(Number(
        bossEvent?.properties?.bossRarePokemon?.pokemonId ??
        bossEvent?.properties?.bossRarePokemon?.id
      )))
      .filter(Number.isInteger)
  )

  HIDDEN_EXCLUSIVE_IDS.forEach((pokemonId) => {
    const monster = monsterById.get(pokemonId)
    if (!monster) {
      errors.push(`missing hidden-exclusive Pokemon id ${pokemonId}`)
      return
    }
    const total = statTotal(monster)
    if (total < MIN_HIDDEN_EXCLUSIVE_POWER_TOTAL) {
      errors.push(`${monster.name}#${pokemonId} hidden-exclusive stat total ${total} is below ${MIN_HIDDEN_EXCLUSIVE_POWER_TOTAL}`)
    }
  })

  for (const [mapId, map] of Object.entries(maps)) {
    ;(map.encounterZones || []).forEach((zone) => {
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
      entries.forEach((entry) => {
        const pokemonId = Math.trunc(Number(entry.id))
        if (!HIDDEN_EXCLUSIVE_IDS.has(pokemonId)) return
        if (!hiddenExclusiveOccurrences.has(pokemonId)) hiddenExclusiveOccurrences.set(pokemonId, [])
        hiddenExclusiveOccurrences.get(pokemonId).push({
          mapId,
          zoneId: zone.id,
          tableId: zone.encounterTableId,
          hidden: zone.depth === 'deep'
        })
      })
    })

    const deepZones = (map.encounterZones || []).filter((zone) => zone?.depth === 'deep')
    for (const zone of deepZones) {
      const table = ENCOUNTER_TABLES[zone.encounterTableId]
      const entries = Array.isArray(table?.pokemon) ? table.pokemon : []
      if (!table || entries.length === 0) {
        errors.push(`${mapId}/${zone.id} missing hidden encounter table ${zone.encounterTableId}`)
        continue
      }

      const expectedExclusiveIds = HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE[zone.id] || []
      const entryIds = entries.map((entry) => Math.trunc(Number(entry.id))).filter(Number.isInteger)
      const gateEvent = (map.runtimeEvents || []).find((event) => event?.properties?.hiddenZoneId === zone.id)
      const expectedGateCost = HIDDEN_GATE_COST_BY_ZONE[zone.id]
      if (!gateEvent) {
        errors.push(`${mapId}/${zone.id} missing hidden gate event`)
      } else if (Number(gateEvent.properties?.goldCost) !== expectedGateCost) {
        errors.push(`${mapId}/${zone.id} hidden gate should cost ${expectedGateCost}, got ${gateEvent.properties?.goldCost}`)
      }
      if (zone.id === 'peak_starwatch_path' && gateEvent?.properties?.requiresMapBossDefeated !== true) {
        errors.push(`${mapId}/${zone.id} must require the current-region boss before unlock`)
      }

      const explicitExclusiveIds = Array.isArray(zone.exclusivePokemonIds)
        ? zone.exclusivePokemonIds.map((pokemonId) => Math.trunc(Number(pokemonId))).filter(Number.isInteger)
        : []
      if (
        explicitExclusiveIds.length > 0 &&
        (
          explicitExclusiveIds.length !== expectedExclusiveIds.length ||
          expectedExclusiveIds.some((pokemonId) => !explicitExclusiveIds.includes(pokemonId))
        )
      ) {
        errors.push(`${mapId}/${zone.id} explicit hidden-exclusive ids must be ${expectedExclusiveIds.join(', ')}, got ${explicitExclusiveIds.join(', ')}`)
      }
      const overlappingChallengeIds = Array.from(new Set(
        entryIds.filter((pokemonId) => globalChallengeRareIds.has(pokemonId))
      ))
      if (overlappingChallengeIds.length > 0) {
        errors.push(
          `${mapId}/${zone.id} hidden table must not include any challenge-unlock Pokemon: ${overlappingChallengeIds.map((pokemonId) => `${monsterById.get(pokemonId)?.name || pokemonId}#${pokemonId}`).join(', ')}`
        )
      }
      const overlappingBossRareIds = Array.from(new Set(
        entryIds.filter((pokemonId) => globalBossRareIds.has(pokemonId))
      ))
      if (overlappingBossRareIds.length > 0) {
        errors.push(
          `${mapId}/${zone.id} hidden table must not include any boss-rare Pokemon: ${overlappingBossRareIds.map((pokemonId) => `${monsterById.get(pokemonId)?.name || pokemonId}#${pokemonId}`).join(', ')}`
        )
      }
      expectedExclusiveIds.forEach((pokemonId) => {
        if (!entryIds.includes(pokemonId)) {
          errors.push(`${mapId}/${zone.id} missing expected hidden-exclusive Pokemon ${monsterById.get(pokemonId)?.name || pokemonId}#${pokemonId}`)
        }
      })
      const unexpectedExclusiveIds = entryIds.filter((pokemonId) => (
        HIDDEN_EXCLUSIVE_IDS.has(pokemonId) && !expectedExclusiveIds.includes(pokemonId)
      ))
      if (unexpectedExclusiveIds.length > 0) {
        errors.push(`${mapId}/${zone.id} includes hidden-exclusive Pokemon assigned to other zones: ${unexpectedExclusiveIds.join(', ')}`)
      }

      const hiddenMinLevel = Math.trunc(Number(zone?.levelRange?.[0]))
      const hiddenMaxLevel = Math.trunc(Number(zone?.levelRange?.[1]))
      if (!Number.isSafeInteger(hiddenMinLevel) || !Number.isSafeInteger(hiddenMaxLevel) || hiddenMaxLevel < hiddenMinLevel) {
        errors.push(`${mapId}/${zone.id} missing hidden-zone levelRange for hidden encounter audit`)
      } else {
        entries.forEach((entry) => {
          const pokemonId = Math.trunc(Number(entry.id))
          const minLevel = Math.trunc(Number(entry.minLevel))
          const maxLevel = Math.trunc(Number(entry.maxLevel))
          const monster = monsterById.get(pokemonId)
          const bounds = getSpeciesLevelBounds(pokemonId)
          if (
            !Number.isSafeInteger(minLevel) ||
            !Number.isSafeInteger(maxLevel) ||
            minLevel < hiddenMinLevel ||
            maxLevel > hiddenMaxLevel ||
            maxLevel < minLevel
          ) {
            errors.push(`${mapId}/${zone.id} ${monster?.name || pokemonId}#${pokemonId} level ${entry.minLevel}-${entry.maxLevel} must stay in hidden-zone range ${hiddenMinLevel}-${hiddenMaxLevel}`)
          }
          if (minLevel < bounds.min || maxLevel > bounds.max) {
            errors.push(`${mapId}/${zone.id} ${monster?.name || pokemonId}#${pokemonId} level ${minLevel}-${maxLevel} does not match evolution-stage bounds ${bounds.min}-${bounds.max}`)
          }
        })
      }

      const treasures = (map.runtimeEvents || [])
        .filter((event) => ['item', 'pickup'].includes(event?.type))
        .filter((event) => isInsideZone(zone, event))
        .map((event) => ({
          id: event.id,
          itemKey: event.properties?.itemKey,
          quantity: Math.max(1, Math.trunc(Number(event.properties?.quantity)) || 1),
          value: getItemAuditValue(event, itemCatalogs)
        }))
        .sort((left, right) => right.value - left.value)

      if (treasures.length === 0 || treasures[0].value < MIN_HIDDEN_TREASURE_VALUE) {
        errors.push(`${mapId}/${zone.id} needs a better hidden treasure worth at least ${MIN_HIDDEN_TREASURE_VALUE}, got ${treasures[0]?.value || 0}`)
      }

      const exclusiveEntries = entries.filter((entry) => expectedExclusiveIds.includes(Math.trunc(Number(entry.id))))
      const ordinaryEntries = entries.filter((entry) => !expectedExclusiveIds.includes(Math.trunc(Number(entry.id))))
      const totalWeight = entries.reduce((sum, entry) => sum + (Number(entry.weight) || 0), 0)
      const exclusiveWeight = exclusiveEntries.reduce((sum, entry) => sum + (Number(entry.weight) || 0), 0)
      const ordinaryMaxWeight = ordinaryEntries.reduce((max, entry) => Math.max(max, Number(entry.weight) || 0), 0)
      const exclusiveMinWeight = exclusiveEntries.reduce((min, entry) => Math.min(min, Number(entry.weight) || 0), Number.POSITIVE_INFINITY)
      const exclusiveShare = totalWeight > 0 ? exclusiveWeight / totalWeight : 0
      const shareBounds = HIDDEN_EXCLUSIVE_SHARE_BOUNDS_BY_ZONE[zone.id] || {
        min: MIN_HIDDEN_EXCLUSIVE_SHARE,
        max: 1
      }

      if (exclusiveShare < shareBounds.min || exclusiveShare > shareBounds.max) {
        errors.push(`${mapId}/${zone.id} hidden-exclusive total share ${(exclusiveShare * 100).toFixed(1)}% must stay within ${(shareBounds.min * 100).toFixed(0)}%-${(shareBounds.max * 100).toFixed(0)}%`)
      }
      if (explicitExclusiveIds.length === 0 && (!Number.isFinite(exclusiveMinWeight) || exclusiveMinWeight <= ordinaryMaxWeight)) {
        errors.push(`${mapId}/${zone.id} every hidden-exclusive Pokemon must have weight greater than ordinary max weight ${ordinaryMaxWeight}, got min ${exclusiveMinWeight}`)
      }

      entries.forEach((entry) => {
        const pokemonId = Math.trunc(Number(entry.id))
        const monster = monsterById.get(pokemonId)
        const routes = getPokemonAcquisitionInfo(pokemonId)?.routes || []
        const hiddenRoute = routes.find((route) => (
          route?.type === 'wild' &&
          route.sourceId === zone.encounterTableId &&
          route.zoneId === zone.id &&
          route.hiddenZone === true &&
          String(`${route.summary || ''} ${route.detail || ''}`).includes('隐藏区')
        ))
        if (!hiddenRoute) {
          errors.push(`${mapId}/${zone.id} hidden Pokedex route missing for ${monster?.name || pokemonId}`)
        }
      })

      summary.push({
        mapId,
        zoneId: zone.id,
        zoneName: zone.name,
        treasure: treasures[0] || null,
        exclusive: expectedExclusiveIds
          .map((pokemonId) => `${monsterById.get(pokemonId)?.name || pokemonId}#${pokemonId}`)
          .join(', '),
        exclusiveShare,
        ordinaryMaxWeight,
        rareStrong: exclusiveEntries
          .map((entry) => {
            const monster = monsterById.get(Number(entry.id))
            return `${monster?.name || entry.id}#${entry.id}(w${entry.weight}, total${statTotal(monster)})`
          })
      })
    }
  }

  HIDDEN_EXCLUSIVE_IDS.forEach((pokemonId) => {
    const expectedZoneId = Object.entries(HIDDEN_EXCLUSIVE_POKEMON_BY_ZONE)
      .find(([, ids]) => ids.includes(pokemonId))?.[0]
    const occurrences = hiddenExclusiveOccurrences.get(pokemonId) || []
    if (occurrences.length !== 1 || occurrences[0]?.zoneId !== expectedZoneId || occurrences[0]?.hidden !== true) {
      errors.push(`${monsterById.get(pokemonId)?.name || pokemonId}#${pokemonId} must appear only in hidden zone ${expectedZoneId}, got ${occurrences.map((entry) => `${entry.mapId}/${entry.zoneId}`).join(', ') || 'none'}`)
    }
  })
})

console.log('=== 隐藏区奖励与图鉴路线审计 ===')
summary.forEach((entry) => {
  console.log(`${entry.mapId}/${entry.zoneId}: treasure=${entry.treasure?.id || 'none'}:${entry.treasure?.itemKey || 'none'}x${entry.treasure?.quantity || 0}=${entry.treasure?.value || 0}; exclusiveShare=${(entry.exclusiveShare * 100).toFixed(1)}%; ordinaryMaxWeight=${entry.ordinaryMaxWeight}; exclusive=${entry.exclusive}; rare=${entry.rareStrong.join(', ')}`)
})

if (errors.length > 0) {
  console.error(`\n发现 ${errors.length} 个隐藏区奖励/图鉴问题：`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nOK: 每个隐藏区都有高价值宝箱、3只专属强力宝可梦、Boss等级段遭遇，并且图鉴捕获途径包含隐藏区解锁路线。')
