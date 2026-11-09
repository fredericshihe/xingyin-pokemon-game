import { getSpeciesLevelBounds } from './wildEncounterRules.js'

export const POKEMON_BREEDER_MAP_ID = 'GodotMapV2_BossHighland'
export const POKEMON_BREEDER_OFFER_COUNT = 3
export const POKEMON_BREEDER_MIN_LEVEL = 75
export const POKEMON_BREEDER_MAX_LEVEL = 85
export const POKEMON_BREEDER_MIN_PRICE = 50000
export const POKEMON_BREEDER_MAX_PRICE = 100000
export const POKEMON_BREEDER_PRICE_LEVEL_BASE = 52000
export const POKEMON_BREEDER_PRICE_LEVEL_STEP = 4600
export const POKEMON_BREEDER_PRICE_VARIATION = 2000

const randomInteger = (min, max, random) => min + Math.floor(random() * (max - min + 1))

export function getPokemonBreederState(world, dayKey, dexProgress = null, monsters = []) {
  const state = world?.pokemonBreeder
  if (!state || state.dayKey !== dayKey || !Array.isArray(state.offers)) return null
  if (dexProgress !== null && dexProgress !== undefined && Array.isArray(monsters) && monsters.length > 0) {
    const allOffersUnlocked = state.offers.every((offer) => {
      const monster = monsters.find((entry) => entry?.id === offer?.pokemonId)
      return monster && isPokemonBreederSpeciesUnlocked(monster, dexProgress)
    })
    if (!allOffersUnlocked) return null
  }
  return state
}

const getRegisteredSpeciesKeys = (dexProgress) => {
  if (dexProgress === null || dexProgress === undefined) return null
  const registeredSpeciesKeys = Array.isArray(dexProgress)
    ? dexProgress
    : dexProgress?.registeredSpeciesKeys
  return new Set(
    (Array.isArray(registeredSpeciesKeys) ? registeredSpeciesKeys : [])
      .filter((key) => typeof key === 'string' && key.length > 0)
  )
}

const getBreederSpeciesKey = (monster) => {
  const dexNo = Number(monster?.dexNo ?? monster?.pokedexId)
  if (Number.isFinite(dexNo) && dexNo > 0 && dexNo < Number.MAX_SAFE_INTEGER) return `dex:${Math.trunc(dexNo)}`
  const baseId = Number(monster?.baseId ?? monster?.speciesId ?? monster?.pokemonId ?? monster?.id)
  return Number.isFinite(baseId) && baseId > 0 ? `species:${Math.trunc(baseId)}` : null
}

export function isPokemonBreederSpeciesUnlocked(monster, dexProgress) {
  const registeredKeys = getRegisteredSpeciesKeys(dexProgress)
  if (!registeredKeys) return true
  const speciesKey = getBreederSpeciesKey(monster)
  return Boolean(speciesKey && registeredKeys.has(speciesKey))
}

export function getPokemonBreederRefreshPrice(state) {
  const count = Math.max(0, Math.trunc(Number(state?.refreshCount) || 0))
  const price = 200 * (2 ** count)
  return Number.isSafeInteger(price) && price <= 2147483647 ? price : null
}

// Higher-level consignments cost more, with a deterministic small daily-roll variation.
export function getPokemonBreederOfferPrice(level, random = Math.random) {
  const safeLevel = Math.max(POKEMON_BREEDER_MIN_LEVEL,
    Math.min(POKEMON_BREEDER_MAX_LEVEL, Math.trunc(Number(level) || POKEMON_BREEDER_MIN_LEVEL)))
  const base = POKEMON_BREEDER_PRICE_LEVEL_BASE +
    (safeLevel - POKEMON_BREEDER_MIN_LEVEL) * POKEMON_BREEDER_PRICE_LEVEL_STEP
  const variation = randomInteger(-POKEMON_BREEDER_PRICE_VARIATION, POKEMON_BREEDER_PRICE_VARIATION, random)
  return Math.max(POKEMON_BREEDER_MIN_PRICE,
    Math.min(POKEMON_BREEDER_MAX_PRICE, base + variation))
}

export function createPokemonBreederState(dayKey, monsters, refreshCount = 0, random = Math.random, retainedOffers = [], dexProgress = null) {
  const candidates = monsters
    .filter((monster) => Number.isInteger(monster?.id) && monster.id > 0)
    .filter((monster) => isPokemonBreederSpeciesUnlocked(monster, dexProgress))
    .map((monster) => {
      const bounds = getSpeciesLevelBounds(monster.id)
      return {
        pokemonId: monster.id,
        minLevel: Math.max(POKEMON_BREEDER_MIN_LEVEL, bounds.min),
        maxLevel: Math.min(POKEMON_BREEDER_MAX_LEVEL, bounds.max)
      }
    })
    .filter((candidate) => candidate.minLevel <= candidate.maxLevel)

  if (candidates.length < POKEMON_BREEDER_OFFER_COUNT) return null

  const retainedIds = new Set(retainedOffers.filter(Boolean).map((offer) => offer.pokemonId))
  const pool = candidates.filter((candidate) => !retainedIds.has(candidate.pokemonId))
  const neededOffers = POKEMON_BREEDER_OFFER_COUNT - retainedOffers.filter(Boolean).length
  if (pool.length < neededOffers) return null
  const offers = Array.from({ length: POKEMON_BREEDER_OFFER_COUNT }, (_, slot) => {
    if (retainedOffers[slot]) return { ...retainedOffers[slot] }
    const index = randomInteger(0, pool.length - 1, random)
    const candidate = pool.splice(index, 1)[0]
    const level = randomInteger(candidate.minLevel, candidate.maxLevel, random)
    return {
      id: `${dayKey}:${refreshCount}:${slot}`,
      pokemonId: candidate.pokemonId,
      level,
      price: getPokemonBreederOfferPrice(level, random),
      purchased: false,
      locked: false
    }
  })

  return { dayKey, refreshCount, offers }
}

export function refreshPokemonBreederDailyState(state, dayKey, monsters, random = Math.random, dexProgress = null) {
  const currentState = getPokemonBreederState({ pokemonBreeder: state }, dayKey, dexProgress, monsters)
  if (currentState && currentState.offers.every((offer) => {
    const monster = monsters.find((entry) => entry?.id === offer?.pokemonId)
    return monster && isPokemonBreederSpeciesUnlocked(monster, dexProgress)
  })) return currentState
  const retainedOffers = (Array.isArray(state?.offers) ? state.offers : [])
    .slice(0, POKEMON_BREEDER_OFFER_COUNT)
    .map((offer) => {
      const monster = monsters.find((entry) => entry?.id === offer?.pokemonId)
      return offer?.locked === true && !offer.purchased && monster && isPokemonBreederSpeciesUnlocked(monster, dexProgress)
        ? offer
        : null
    })
  return createPokemonBreederState(dayKey, monsters, 0, random, retainedOffers, dexProgress)
}

export function setPokemonBreederOfferLock(state, offerId, locked) {
  const offer = state?.offers?.find((entry) => entry.id === offerId)
  if (!offer || offer.purchased || typeof locked !== 'boolean') return null
  return {
    ...state,
    offers: state.offers.map((entry) => entry.id === offerId ? { ...entry, locked } : entry)
  }
}
