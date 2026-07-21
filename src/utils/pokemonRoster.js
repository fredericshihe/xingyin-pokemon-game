export const MAX_PARTY_SIZE = 6
export const MAX_STORAGE_SIZE = 100
export const MIN_PARTY_SIZE = 1

const asArray = (value) => (Array.isArray(value) ? value : [])

const normalizeSpeciesIdentity = (value) => {
  if (value === undefined || value === null || value === '') return null
  const numericValue = Number(value)
  if (Number.isSafeInteger(numericValue) && numericValue > 0) {
    return String(numericValue)
  }
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export const getMonsterSpeciesKey = (monster) => {
  if (!monster || typeof monster !== 'object') return null

  const baseSpeciesId = [
    monster.baseId,
    monster.speciesId,
    monster.templateId,
    monster.monsterId,
  ]
    .map(normalizeSpeciesIdentity)
    .find(Boolean)
  if (baseSpeciesId) return `base:${baseSpeciesId}`

  const dexNumber = [monster.dexNo, monster.pokedexId]
    .map(normalizeSpeciesIdentity)
    .find(Boolean)
  return dexNumber ? `dex:${dexNumber}` : null
}

export const getPartySpeciesClauseViolation = (playerTeam = []) => {
  const firstMonsterBySpecies = new Map()

  for (const monster of asArray(playerTeam)) {
    const speciesKey = getMonsterSpeciesKey(monster)
    if (!speciesKey) continue
    const firstMonster = firstMonsterBySpecies.get(speciesKey)
    if (firstMonster) {
      return {
        speciesKey,
        speciesName: firstMonster.name || monster?.name || '该物种',
        monsterIds: [firstMonster.id, monster?.id].filter((id) => id !== undefined && id !== null),
      }
    }
    firstMonsterBySpecies.set(speciesKey, monster)
  }

  return null
}

export const isMonsterSpeciesInParty = (playerTeam = [], monster, excludedMonsterId = null) => {
  const speciesKey = getMonsterSpeciesKey(monster)
  if (!speciesKey) return false
  return asArray(playerTeam).some((partyMonster) => (
    String(partyMonster?.id) !== String(excludedMonsterId) &&
    getMonsterSpeciesKey(partyMonster) === speciesKey
  ))
}

const uniqueById = (items, seen = new Set()) => {
  const result = []
  asArray(items).forEach((item) => {
    if (!item || item.id === undefined || item.id === null) return
    const key = String(item.id)
    if (seen.has(key)) return
    seen.add(key)
    result.push(item)
  })
  return result
}

const resolveActiveId = (party, activeId) => (
  party.some((monster) => monster.id === activeId)
    ? activeId
    : party[0]?.id ?? null
)

export function sanitizeRoster(playerTeam = [], storageBox = [], activePlayerId = null) {
  const partySeen = new Set()
  const rawParty = uniqueById(playerTeam, partySeen)
  const storageSeen = new Set(rawParty.map((monster) => String(monster.id)))
  const rawStorage = uniqueById(storageBox, storageSeen)
  const party = []
  const displacedParty = []
  const partySpecies = new Set()

  rawParty.forEach((monster) => {
    const speciesKey = getMonsterSpeciesKey(monster)
    const duplicatesPartySpecies = speciesKey && partySpecies.has(speciesKey)
    if (party.length < MAX_PARTY_SIZE && !duplicatesPartySpecies) {
      party.push(monster)
      if (speciesKey) partySpecies.add(speciesKey)
      return
    }
    displacedParty.push(monster)
  })

  // Never partially repair a legacy roster: if every displaced member cannot fit,
  // keep the original party intact so no Pokemon is truncated or overwritten.
  const canMoveEveryDisplacedMonster = rawStorage.length + displacedParty.length <= MAX_STORAGE_SIZE
  const normalizedParty = canMoveEveryDisplacedMonster ? party : rawParty
  const normalizedStorage = canMoveEveryDisplacedMonster
    ? [...displacedParty, ...rawStorage]
    : rawStorage
  const speciesClauseViolation = getPartySpeciesClauseViolation(normalizedParty)

  return {
    playerTeam: normalizedParty,
    storageBox: normalizedStorage,
    activePlayerId: resolveActiveId(normalizedParty, activePlayerId),
    speciesClauseViolation,
    requiresRosterRepair: Boolean(
      speciesClauseViolation ||
      normalizedParty.length > MAX_PARTY_SIZE ||
      normalizedStorage.length > MAX_STORAGE_SIZE
    ),
    movedToStorageIds: canMoveEveryDisplacedMonster
      ? displacedParty.map((monster) => monster.id)
      : [],
  }
}

export function updateRosterMonster(ctx, monsterId, updater) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  const partyIndex = roster.playerTeam.findIndex((monster) => monster.id === monsterId)
  const storageIndex = roster.storageBox.findIndex((monster) => monster.id === monsterId)
  if (partyIndex < 0 && storageIndex < 0) {
    return { success: false, error: 'not_found', ...roster }
  }

  const source = partyIndex >= 0 ? 'party' : 'storage'
  const currentMonster = source === 'party'
    ? roster.playerTeam[partyIndex]
    : roster.storageBox[storageIndex]
  const nextMonster = typeof updater === 'function'
    ? updater(currentMonster, { from: source })
    : updater

  if (!nextMonster || typeof nextMonster !== 'object') {
    return { success: false, error: 'invalid_monster', ...roster }
  }

  const playerTeam = [...roster.playerTeam]
  const storageBox = [...roster.storageBox]
  if (source === 'party') {
    playerTeam[partyIndex] = { ...nextMonster }
  } else {
    storageBox[storageIndex] = { ...nextMonster }
  }

  const normalizedRoster = sanitizeRoster(playerTeam, storageBox, roster.activePlayerId)
  const normalizedSource = normalizedRoster.playerTeam.some((monster) => monster.id === nextMonster.id)
    ? 'party'
    : 'storage'

  return {
    success: true,
    ...normalizedRoster,
    updatedMonster: { ...nextMonster },
    from: normalizedSource,
  }
}

export function acquireMonster(ctx, monster) {
  const cleanMonster = monster ? { ...monster } : null
  if (!cleanMonster) {
    return { success: false, error: 'invalid_monster' }
  }

  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (isMonsterSpeciesInParty(roster.playerTeam, cleanMonster)) {
    if (roster.storageBox.length < MAX_STORAGE_SIZE) {
      return {
        success: true,
        outcome: 'storage',
        reason: 'duplicate_species',
        playerTeam: roster.playerTeam,
        storageBox: [...roster.storageBox, cleanMonster],
        activePlayerId: roster.activePlayerId,
      }
    }
    return {
      success: true,
      needsDecision: true,
      reason: 'duplicate_species',
      monster: cleanMonster,
      options: ['release'],
    }
  }
  if (roster.playerTeam.length < MAX_PARTY_SIZE) {
    const playerTeam = [...roster.playerTeam, cleanMonster]
    return {
      success: true,
      outcome: 'party',
      playerTeam,
      storageBox: roster.storageBox,
      activePlayerId: roster.activePlayerId || cleanMonster.id
    }
  }

  return {
    success: true,
    needsDecision: true,
    monster: cleanMonster,
    options: roster.storageBox.length < MAX_STORAGE_SIZE
      ? ['replace', 'storage', 'release']
      : ['replace', 'release']
  }
}

export function addToStorage(ctx, monster) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }
  return {
    success: true,
    outcome: 'storage',
    playerTeam: roster.playerTeam,
    storageBox: [...roster.storageBox, { ...monster }],
    activePlayerId: roster.activePlayerId
  }
}

export function depositToStorage(ctx, partyId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.playerTeam.length <= MIN_PARTY_SIZE) {
    return { success: false, error: 'min_party', ...roster }
  }
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }

  const target = roster.playerTeam.find((monster) => monster.id === partyId)
  if (!target) return { success: false, error: 'not_found', ...roster }

  const playerTeam = roster.playerTeam.filter((monster) => monster.id !== partyId)
  return {
    success: true,
    playerTeam,
    storageBox: [...roster.storageBox, target],
    activePlayerId: resolveActiveId(playerTeam, roster.activePlayerId)
  }
}

export function withdrawToParty(ctx, storageId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (roster.playerTeam.length >= MAX_PARTY_SIZE) {
    return { success: false, error: 'party_full', ...roster }
  }

  const target = roster.storageBox.find((monster) => monster.id === storageId)
  if (!target) return { success: false, error: 'not_found', ...roster }
  if (isMonsterSpeciesInParty(roster.playerTeam, target)) {
    return { success: false, error: 'duplicate_species', monster: target, ...roster }
  }

  const playerTeam = [...roster.playerTeam, target]
  return {
    success: true,
    playerTeam,
    storageBox: roster.storageBox.filter((monster) => monster.id !== storageId),
    activePlayerId: roster.activePlayerId || target.id
  }
}

export function swapPartyAndStorage(ctx, partyId, storageId) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  const partyIndex = roster.playerTeam.findIndex((monster) => monster.id === partyId)
  const storageIndex = roster.storageBox.findIndex((monster) => monster.id === storageId)
  if (partyIndex < 0 || storageIndex < 0) {
    return { success: false, error: 'not_found', ...roster }
  }

  const incomingMonster = roster.storageBox[storageIndex]
  if (isMonsterSpeciesInParty(roster.playerTeam, incomingMonster, partyId)) {
    return { success: false, error: 'duplicate_species', monster: incomingMonster, ...roster }
  }

  const playerTeam = [...roster.playerTeam]
  const storageBox = [...roster.storageBox]
  const oldPartyMonster = playerTeam[partyIndex]
  playerTeam[partyIndex] = storageBox[storageIndex]
  storageBox[storageIndex] = oldPartyMonster

  return {
    success: true,
    playerTeam,
    storageBox,
    activePlayerId: roster.activePlayerId === oldPartyMonster.id ? playerTeam[partyIndex].id : roster.activePlayerId
  }
}

export function replacePartyMember(ctx, partyId, incomingMonster) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  const partyIndex = roster.playerTeam.findIndex((monster) => monster.id === partyId)
  if (partyIndex < 0 || !incomingMonster) {
    return { success: false, error: 'not_found', ...roster }
  }
  if (roster.storageBox.length >= MAX_STORAGE_SIZE) {
    return { success: false, error: 'storage_full', ...roster }
  }
  if (isMonsterSpeciesInParty(roster.playerTeam, incomingMonster, partyId)) {
    return { success: false, error: 'duplicate_species', monster: incomingMonster, ...roster }
  }

  const playerTeam = [...roster.playerTeam]
  const replacedMonster = playerTeam[partyIndex]
  playerTeam[partyIndex] = { ...incomingMonster }

  return {
    success: true,
    playerTeam,
    storageBox: [...roster.storageBox, replacedMonster],
    activePlayerId: roster.activePlayerId === replacedMonster.id ? incomingMonster.id : roster.activePlayerId,
    replacedMonster
  }
}

export function releaseMonster(ctx, id, { from } = {}) {
  const roster = sanitizeRoster(ctx?.playerTeam, ctx?.storageBox, ctx?.activePlayerId)
  if (from === 'party') {
    if (roster.playerTeam.length <= MIN_PARTY_SIZE) {
      return { success: false, error: 'min_party', ...roster }
    }
    const target = roster.playerTeam.find((monster) => monster.id === id)
    if (!target) return { success: false, error: 'not_found', ...roster }
    const playerTeam = roster.playerTeam.filter((monster) => monster.id !== id)
    return {
      success: true,
      playerTeam,
      storageBox: roster.storageBox,
      activePlayerId: resolveActiveId(playerTeam, roster.activePlayerId),
      releasedMonster: target
    }
  }

  const target = roster.storageBox.find((monster) => monster.id === id)
  if (!target) return { success: false, error: 'not_found', ...roster }
  const normalizedRoster = sanitizeRoster(
    roster.playerTeam,
    roster.storageBox.filter((monster) => monster.id !== id),
    roster.activePlayerId
  )
  return {
    success: true,
    ...normalizedRoster,
    releasedMonster: target
  }
}
