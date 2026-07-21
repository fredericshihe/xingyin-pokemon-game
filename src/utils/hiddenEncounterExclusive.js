import { ENCOUNTER_TABLES } from '../game/data/encounterTables.js'

export const DEFAULT_HIDDEN_EXCLUSIVE_RARE_COUNT = 3
export const HIDDEN_EXCLUSIVE_RARITY_TIER = 'mythic'
export const HIDDEN_EXCLUSIVE_RARITY_LABEL = '秘境专属'
export const HIDDEN_EXCLUSIVE_RARITY_HEADLINE = '专属强者现身!'

const toPositiveInteger = (value) => {
  const numeric = Math.trunc(Number(value))
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

const toPositiveNumber = (value, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback
}

export const isPremiumHiddenEncounterZone = (zone) => (
  zone?.depth === 'deep' && zone?.premiumHiddenZone === true
)

const getExplicitExclusivePokemonIds = (zone = {}) => (
  Array.isArray(zone?.exclusivePokemonIds)
    ? Array.from(new Set(zone.exclusivePokemonIds.map(toPositiveInteger).filter(Boolean)))
    : []
)

export const getHiddenEncounterExclusiveCount = (zone = {}) => (
  getExplicitExclusivePokemonIds(zone).length ||
  toPositiveInteger(zone?.exclusiveRareCount ?? zone?.hiddenRareCount) ||
  DEFAULT_HIDDEN_EXCLUSIVE_RARE_COUNT
)

const normalizeEncounterEntry = (entry, index) => {
  const pokemonId = toPositiveInteger(entry?.pokemonId ?? entry?.id)
  if (!pokemonId) return null
  return {
    ...entry,
    pokemonId,
    sourceIndex: index,
    weight: toPositiveNumber(entry?.weight, 1)
  }
}

export function getHiddenEncounterExclusiveEntries({
  zone,
  encounterTableId = zone?.encounterTableId
} = {}) {
  if (!isPremiumHiddenEncounterZone(zone)) return []
  if (typeof encounterTableId !== 'string' || encounterTableId.length === 0) return []

  const table = ENCOUNTER_TABLES[encounterTableId]
  const entries = Array.isArray(table?.pokemon)
    ? table.pokemon.map(normalizeEncounterEntry).filter(Boolean)
    : []
  const explicitIds = getExplicitExclusivePokemonIds(zone)
  if (explicitIds.length > 0) {
    const explicitIdSet = new Set(explicitIds)
    return entries.filter((entry) => explicitIdSet.has(entry.pokemonId))
  }

  const count = getHiddenEncounterExclusiveCount(zone)
  if (entries.length <= count) return []

  const sortedByWeight = [...entries].sort((left, right) => (
    right.weight - left.weight ||
    left.sourceIndex - right.sourceIndex
  ))
  const exclusiveEntries = sortedByWeight.slice(0, count)
  const exclusiveIds = new Set(exclusiveEntries.map((entry) => entry.pokemonId))
  const ordinaryMaxWeight = entries.reduce((maxWeight, entry) => (
    exclusiveIds.has(entry.pokemonId) ? maxWeight : Math.max(maxWeight, entry.weight)
  ), 0)
  const exclusiveMinWeight = exclusiveEntries.reduce((minWeight, entry) => (
    Math.min(minWeight, entry.weight)
  ), Number.POSITIVE_INFINITY)

  if (!Number.isFinite(exclusiveMinWeight) || exclusiveMinWeight <= ordinaryMaxWeight) {
    return []
  }

  return exclusiveEntries.sort((left, right) => left.sourceIndex - right.sourceIndex)
}

export const getHiddenEncounterExclusivePokemonIds = (options = {}) => (
  getHiddenEncounterExclusiveEntries(options).map((entry) => entry.pokemonId)
)

export function getHiddenEncounterExclusiveMeta({
  zone,
  encounterTableId = zone?.encounterTableId,
  pokemonId,
  encounterRate
} = {}) {
  const id = toPositiveInteger(pokemonId)
  if (!id) return null

  const exclusiveEntries = getHiddenEncounterExclusiveEntries({ zone, encounterTableId })
  const exclusiveEntry = exclusiveEntries.find((entry) => entry.pokemonId === id)
  if (!exclusiveEntry) return null

  const table = ENCOUNTER_TABLES[encounterTableId]
  const entries = Array.isArray(table?.pokemon)
    ? table.pokemon.map(normalizeEncounterEntry).filter(Boolean)
    : []
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0)
  const sourceChance = totalWeight > 0 ? exclusiveEntry.weight / totalWeight : 0
  const stepRate = toPositiveNumber(encounterRate, toPositiveNumber(zone?.tallGrassRate, toPositiveNumber(table?.tallGrassRate, 0)))
  const sourceStepChance = stepRate > 0 && sourceChance > 0 ? stepRate * sourceChance : 0

  return {
    pokemonId: id,
    zoneId: zone?.id || null,
    zoneName: zone?.name || '隐藏遭遇区',
    encounterTableId,
    hiddenZone: true,
    hiddenExclusive: true,
    rare: true,
    sourceChance,
    sourceStepChance,
    rarityTier: HIDDEN_EXCLUSIVE_RARITY_TIER,
    rarityLabel: HIDDEN_EXCLUSIVE_RARITY_LABEL,
    rarityHeadline: HIDDEN_EXCLUSIVE_RARITY_HEADLINE
  }
}
